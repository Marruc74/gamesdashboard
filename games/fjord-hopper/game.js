(() => {
  const CELL = 36;
  const COLS = 13;
  const ROWS = 13;
  const SLOT_COLS = [1, 4, 7, 10];
  const START_ROW = 11;
  const START_COL = 6;
  const GOAL_ROW = 1;
  const ROAD_ROWS = [10, 9, 8, 7];
  const WATER_ROWS = [5, 4, 3, 2];

  const canvas = document.getElementById('board');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  const ctx = canvas.getContext('2d');

  const levelEl = document.getElementById('level');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const slotsEl = document.getElementById('slots');
  const timeEl = document.getElementById('time');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');
  const restartBtn = document.getElementById('restart');

  // Lane definitions — base speeds in tiles/sec; gaps in tiles
  const LANE_DEFS = [
    { row: 10, type: 'road',  dir: -1, speed: 2.8, gap: 3, w: 1, kind: 'raider' },
    { row: 9,  type: 'road',  dir:  1, speed: 1.7, gap: 4, w: 2, kind: 'wagon'  },
    { row: 8,  type: 'road',  dir: -1, speed: 3.6, gap: 4, w: 1, kind: 'wolf'   },
    { row: 7,  type: 'road',  dir:  1, speed: 2.2, gap: 3, w: 1, kind: 'raider' },
    { row: 5,  type: 'water', dir: -1, speed: 1.5, gap: 4, w: 4, kind: 'longship' },
    { row: 4,  type: 'water', dir:  1, speed: 2.4, gap: 4, w: 2, kind: 'icefloe'  },
    { row: 3,  type: 'water', dir: -1, speed: 1.1, gap: 3, w: 3, kind: 'raft'     },
    { row: 2,  type: 'water', dir:  1, speed: 1.9, gap: 5, w: 5, kind: 'longship' },
  ];

  let lanes;       // active lanes with level-adjusted speeds
  let obstacles;   // {lane, x, w, kind, speed}
  let player;      // {col, row, px}
  let slots;       // bool[4]
  let lives, score, levelNum, timeLeft;
  let gameStatus;  // 'menu' | 'playing' | 'dying' | 'won' | 'gameover' | 'levelWon'
  let statusTimer;
  let deathPos;    // {col, row} for death animation
  let lastTime;
  let levelStartTime;

  function setupLevel(n) {
    levelNum = n;
    const speedMult = 1 + (n - 1) * 0.15;
    lanes = LANE_DEFS.map(l => ({ ...l, speed: l.speed * speedMult }));
    obstacles = [];
    for (const lane of lanes) {
      prefillLane(lane);
    }
    slots = [false, false, false, false];
    resetPlayer();
    timeLeft = 60;
    gameStatus = 'playing';
    statusTimer = 0;
    levelStartTime = performance.now();
    updateHud();
  }

  function prefillLane(lane) {
    const stride = lane.w + lane.gap;
    // Spawn obstacles across the visible width plus some offscreen buffer
    const start = lane.dir > 0 ? -lane.w - stride * 2 : COLS + stride * 2;
    const end = lane.dir > 0 ? COLS + lane.w : -lane.w * 2;
    const step = lane.dir > 0 ? stride : -stride;
    for (let x = start; lane.dir > 0 ? x < end : x > end; x += step) {
      const jitter = (Math.random() - 0.5) * 0.6;
      obstacles.push({
        lane,
        x: x + jitter,
        w: lane.w,
        kind: lane.kind,
        speed: lane.speed * lane.dir,
      });
    }
  }

  function resetPlayer() {
    player = { col: START_COL, row: START_ROW, px: START_COL };
  }

  function fullReset() {
    score = 0;
    lives = 3;
    setupLevel(1);
    hideOverlay();
  }

  function nextLifeOrGameOver() {
    if (lives <= 0) {
      gameStatus = 'gameover';
      if (window.GD) window.GD.record('fjord-hopper', score, 'score');
      showOverlay('Game Over', `Final score: ${score}`, 'Play Again', fullReset);
      return;
    }
    resetPlayer();
    timeLeft = 60;
    gameStatus = 'playing';
    updateHud();
  }

  function die(reason) {
    if (gameStatus !== 'playing') return;
    lives--;
    deathPos = { col: Math.round(player.px), row: player.row };
    gameStatus = 'dying';
    statusTimer = 0;
    updateHud();
  }

  function reachGoalCol(col) {
    const slotIdx = SLOT_COLS.indexOf(col);
    if (slotIdx < 0 || slots[slotIdx]) {
      die('wall');
      return;
    }
    slots[slotIdx] = true;
    const timeBonus = Math.max(0, Math.floor(timeLeft) * 10);
    score += 200 + timeBonus;
    updateHud();

    if (slots.every(s => s)) {
      gameStatus = 'levelWon';
      statusTimer = 0;
      score += 1000;
      updateHud();
    } else {
      resetPlayer();
      timeLeft = 60;
    }
  }

  function updateHud() {
    levelEl.textContent = levelNum;
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    slotsEl.textContent = slots.filter(s => s).length;
    timeEl.textContent = Math.max(0, Math.ceil(timeLeft));
  }

  function showOverlay(title, msg, btnText, onBtn) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlayBtn.textContent = btnText;
    overlayBtn.onclick = onBtn;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // ─── Update loop ─────────────────────────────────────────────────────────

  function updateObstacles(dt) {
    for (const o of obstacles) {
      o.x += o.speed * dt;
    }
    obstacles = obstacles.filter(o => {
      if (o.speed > 0 && o.x > COLS + 1) return false;
      if (o.speed < 0 && o.x + o.w < -1) return false;
      return true;
    });

    for (const lane of lanes) {
      const stride = lane.w + lane.gap;
      const ones = obstacles.filter(o => o.lane === lane);
      if (lane.dir > 0) {
        const leftmost = ones.length ? Math.min(...ones.map(o => o.x)) : Infinity;
        if (leftmost > -lane.w + stride * 0.8) {
          obstacles.push({
            lane,
            x: leftmost - stride + (Math.random() - 0.5) * 0.4,
            w: lane.w,
            kind: lane.kind,
            speed: lane.speed * lane.dir,
          });
        }
      } else {
        const rightmost = ones.length ? Math.max(...ones.map(o => o.x)) : -Infinity;
        if (rightmost < COLS - stride * 0.8) {
          obstacles.push({
            lane,
            x: rightmost + stride + (Math.random() - 0.5) * 0.4,
            w: lane.w,
            kind: lane.kind,
            speed: lane.speed * lane.dir,
          });
        }
      }
    }
  }

  function updatePlayer(dt) {
    if (WATER_ROWS.includes(player.row)) {
      const ride = obstacles.find(o =>
        o.lane.row === player.row &&
        player.px + 0.5 >= o.x + 0.1 &&
        player.px + 0.5 <= o.x + o.w - 0.1
      );
      if (ride) {
        player.px += ride.speed * dt;
        player.col = Math.round(player.px);
        if (player.px < -0.5 || player.px > COLS - 0.5) die('drift');
      } else {
        die('water');
      }
    }
  }

  function checkRoadCollisions() {
    if (!ROAD_ROWS.includes(player.row)) return;
    const hit = obstacles.find(o =>
      o.lane.row === player.row &&
      player.px + 0.5 > o.x + 0.15 &&
      player.px + 0.5 < o.x + o.w - 0.15
    );
    if (hit) die('hit');
  }

  function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (gameStatus === 'playing') {
      updateObstacles(dt);
      updatePlayer(dt);
      checkRoadCollisions();
      timeLeft -= dt;
      if (timeLeft <= 0) die('time');
      updateHud();
    } else if (gameStatus === 'dying') {
      statusTimer += dt;
      // Keep obstacles drifting for visual continuity
      updateObstacles(dt);
      if (statusTimer >= 1.0) {
        nextLifeOrGameOver();
      }
    } else if (gameStatus === 'levelWon') {
      statusTimer += dt;
      updateObstacles(dt);
      if (statusTimer >= 1.5) {
        setupLevel(levelNum + 1);
      }
    } else {
      updateObstacles(dt);
    }

    draw();
    requestAnimationFrame(loop);
  }

  // ─── Input ───────────────────────────────────────────────────────────────

  function hopPlayer(dx, dy) {
    if (gameStatus !== 'playing') return;
    const newCol = Math.round(player.px) + dx;
    const newRow = player.row + dy;
    if (newCol < 0 || newCol >= COLS) return;
    if (newRow < 0 || newRow >= ROWS) return;
    if (newRow === GOAL_ROW) {
      reachGoalCol(newCol);
      return;
    }
    player.col = newCol;
    player.row = newRow;
    player.px = newCol;
    if (dy < 0) score += 10;
    updateHud();
  }

  document.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') hopPlayer(0, -1);
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') hopPlayer(0, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') hopPlayer(-1, 0);
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') hopPlayer(1, 0);
  });

  restartBtn.addEventListener('click', fullReset);

  // ─── Rendering ───────────────────────────────────────────────────────────

  function draw() {
    drawBackground();
    drawObstacles();
    drawSlots();
    drawPlayer();
    if (gameStatus === 'levelWon') drawLevelWon();
  }

  function drawBackground() {
    // Top snow band (rows 0-1)
    ctx.fillStyle = '#1f2942';
    ctx.fillRect(0, 0, canvas.width, CELL);
    // Goal row 1 — handled by drawSlots()
    ctx.fillStyle = '#5b3a8a'; // night sky strip behind slots
    ctx.fillRect(0, GOAL_ROW * CELL, canvas.width, CELL);
    // Water rows 2-5
    ctx.fillStyle = '#1a4878';
    ctx.fillRect(0, 2 * CELL, canvas.width, 4 * CELL);
    // Mid bank row 6
    ctx.fillStyle = '#3a6033';
    ctx.fillRect(0, 6 * CELL, canvas.width, CELL);
    // Road rows 7-10
    ctx.fillStyle = '#2a2520';
    ctx.fillRect(0, 7 * CELL, canvas.width, 4 * CELL);
    // Start row 11
    ctx.fillStyle = '#3a6033';
    ctx.fillRect(0, 11 * CELL, canvas.width, CELL);
    // Row 12 — bottom strip
    ctx.fillStyle = '#2c4a26';
    ctx.fillRect(0, 12 * CELL, canvas.width, CELL);

    // Lane dividers and decoration
    drawWaterCaps();
    drawRoadStripes();
    drawStartGrassTexture();
    drawTopMountains();
  }

  function drawWaterCaps() {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let r = 2; r <= 5; r++) {
      for (let i = 0; i < 12; i++) {
        const x = ((i * 47 + r * 31) % canvas.width);
        const y = r * CELL + ((i * 13) % CELL);
        ctx.fillRect(x, y, 3, 2);
      }
    }
  }

  function drawRoadStripes() {
    ctx.fillStyle = 'rgba(180, 140, 90, 0.25)';
    for (let r = 7; r <= 10; r++) {
      ctx.fillRect(0, r * CELL + CELL - 1, canvas.width, 2);
    }
  }

  function drawStartGrassTexture() {
    ctx.fillStyle = '#2c4a26';
    for (let i = 0; i < 18; i++) {
      const x = ((i * 71) % canvas.width);
      const y = 11 * CELL + ((i * 13) % CELL);
      ctx.fillRect(x, y, 2, 3);
    }
  }

  function drawTopMountains() {
    ctx.fillStyle = '#2d3854';
    for (let i = 0; i < 4; i++) {
      const cx = i * (canvas.width / 4) + canvas.width / 8;
      ctx.beginPath();
      ctx.moveTo(cx - 28, CELL);
      ctx.lineTo(cx, 6);
      ctx.lineTo(cx + 28, CELL);
      ctx.closePath();
      ctx.fill();
    }
    // Snow caps
    ctx.fillStyle = '#dfe6f5';
    for (let i = 0; i < 4; i++) {
      const cx = i * (canvas.width / 4) + canvas.width / 8;
      ctx.beginPath();
      ctx.moveTo(cx - 8, 16);
      ctx.lineTo(cx, 6);
      ctx.lineTo(cx + 8, 16);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawObstacles() {
    for (const o of obstacles) {
      const px = o.x * CELL;
      const py = o.lane.row * CELL;
      const pw = o.w * CELL;
      switch (o.kind) {
        case 'raider': drawRaider(px, py, pw, o.speed < 0); break;
        case 'wagon':  drawWagon(px, py, pw); break;
        case 'wolf':   drawWolf(px, py, pw, o.speed < 0); break;
        case 'longship': drawLongship(px, py, pw, o.speed < 0); break;
        case 'icefloe':  drawIceFloe(px, py, pw); break;
        case 'raft':     drawRaft(px, py, pw); break;
      }
    }
  }

  function drawRaider(x, y, w, faceLeft) {
    // dark cloaked figure with spear
    ctx.fillStyle = '#3a2a20';
    ctx.fillRect(x + 6, y + 10, w - 12, 18);
    // head
    ctx.fillStyle = '#d9b58a';
    ctx.fillRect(x + 10, y + 6, w - 20, 8);
    // helmet
    ctx.fillStyle = '#666';
    ctx.fillRect(x + 9, y + 4, w - 18, 4);
    // spear
    ctx.fillStyle = '#8a6438';
    if (faceLeft) ctx.fillRect(x + 2, y + 4, 2, 24);
    else ctx.fillRect(x + w - 4, y + 4, 2, 24);
    // spear tip
    ctx.fillStyle = '#cfcfcf';
    if (faceLeft) ctx.fillRect(x + 1, y + 3, 4, 3);
    else ctx.fillRect(x + w - 5, y + 3, 4, 3);
  }

  function drawWagon(x, y, w) {
    // wooden wagon, two wheels
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(x + 4, y + 8, w - 8, 18);
    ctx.fillStyle = '#5a3e22';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + 4 + i * (w / 4), y + 8, 2, 18);
    }
    // wheels
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x + 10, y + CELL - 6, 5, 0, Math.PI * 2);
    ctx.arc(x + w - 10, y + CELL - 6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b4a2a';
    ctx.beginPath();
    ctx.arc(x + 10, y + CELL - 6, 2, 0, Math.PI * 2);
    ctx.arc(x + w - 10, y + CELL - 6, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWolf(x, y, w, faceLeft) {
    ctx.fillStyle = '#666b73';
    ctx.fillRect(x + 4, y + 16, w - 8, 10);
    // head
    if (faceLeft) {
      ctx.fillRect(x + 2, y + 14, 10, 8);
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 1, y + 12, 4, 3);
      ctx.fillRect(x + 7, y + 12, 4, 3);
      ctx.fillStyle = '#ffea66';
      ctx.fillRect(x + 4, y + 17, 2, 2);
    } else {
      ctx.fillRect(x + w - 12, y + 14, 10, 8);
      ctx.fillStyle = '#444';
      ctx.fillRect(x + w - 5, y + 12, 4, 3);
      ctx.fillRect(x + w - 11, y + 12, 4, 3);
      ctx.fillStyle = '#ffea66';
      ctx.fillRect(x + w - 6, y + 17, 2, 2);
    }
    // legs
    ctx.fillStyle = '#4a4e54';
    ctx.fillRect(x + 6, y + 26, 3, 6);
    ctx.fillRect(x + w - 9, y + 26, 3, 6);
  }

  function drawLongship(x, y, w, faceLeft) {
    // hull
    ctx.fillStyle = '#6a3f1f';
    ctx.fillRect(x + 4, y + 16, w - 8, 14);
    // hull shadow
    ctx.fillStyle = '#4a2a14';
    ctx.fillRect(x + 4, y + 26, w - 8, 4);
    // shields along side
    const shieldColors = ['#c92a2a', '#f0c040', '#2a7060', '#d97020'];
    for (let i = 0; i < Math.floor((w - 16) / 8); i++) {
      ctx.fillStyle = shieldColors[i % shieldColors.length];
      ctx.beginPath();
      ctx.arc(x + 10 + i * 8, y + 22, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // mast + sail
    const mx = x + w / 2;
    ctx.fillStyle = '#5c4020';
    ctx.fillRect(mx - 1, y + 2, 2, 18);
    ctx.fillStyle = '#e8d8b8';
    ctx.fillRect(mx - w / 4, y + 4, w / 2, 12);
    ctx.fillStyle = '#c92a2a';
    ctx.fillRect(mx - w / 4, y + 6, w / 2, 2);
    ctx.fillRect(mx - w / 4, y + 11, w / 2, 2);
    // dragon prow
    ctx.fillStyle = '#3a2010';
    if (faceLeft) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 16);
      ctx.lineTo(x - 4, y + 8);
      ctx.lineTo(x - 2, y + 18);
      ctx.lineTo(x + 4, y + 22);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + w - 4, y + 16);
      ctx.lineTo(x + w + 4, y + 8);
      ctx.lineTo(x + w + 2, y + 18);
      ctx.lineTo(x + w - 4, y + 22);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawIceFloe(x, y, w) {
    ctx.fillStyle = '#d8e9f6';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 14);
    ctx.lineTo(x + 8, y + 8);
    ctx.lineTo(x + w - 6, y + 10);
    ctx.lineTo(x + w - 2, y + 22);
    ctx.lineTo(x + w - 10, y + 30);
    ctx.lineTo(x + 6, y + 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a8c5dc';
    ctx.fillRect(x + 8, y + 24, w - 18, 3);
    ctx.fillRect(x + 6, y + 12, 4, 3);
  }

  function drawRaft(x, y, w) {
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(x + 2, y + 10, w - 4, 20);
    ctx.fillStyle = '#4d331a';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(x + 2, y + 11 + i * 4, w - 4, 1);
    }
    ctx.fillStyle = '#3a2614';
    ctx.fillRect(x + 4, y + 10, w - 8, 2);
    ctx.fillRect(x + 4, y + 28, w - 8, 2);
  }

  function drawSlots() {
    // walls between slots
    ctx.fillStyle = '#3a2614';
    for (let c = 0; c < COLS; c++) {
      if (SLOT_COLS.includes(c)) continue;
      ctx.fillRect(c * CELL, GOAL_ROW * CELL, CELL, CELL);
      ctx.fillStyle = '#2a1a08';
      ctx.fillRect(c * CELL, GOAL_ROW * CELL, CELL, 4);
      ctx.fillStyle = '#3a2614';
    }
    // slots
    for (let i = 0; i < SLOT_COLS.length; i++) {
      const c = SLOT_COLS[i];
      const px = c * CELL;
      const py = GOAL_ROW * CELL;
      // arch
      ctx.fillStyle = '#1a0e08';
      ctx.fillRect(px + 6, py + 4, CELL - 12, CELL - 6);
      ctx.beginPath();
      ctx.arc(px + CELL / 2, py + 8, CELL / 2 - 6, Math.PI, 0);
      ctx.fill();
      // rune
      ctx.fillStyle = '#ffd066';
      ctx.fillRect(px + CELL / 2 - 1, py + 14, 2, 10);
      ctx.fillRect(px + CELL / 2 - 5, py + 16, 10, 2);
      // filled marker
      if (slots[i]) {
        drawViking(px + 4, py + 6, CELL - 8, true);
      }
    }
  }

  function drawPlayer() {
    if (gameStatus === 'dying') {
      drawDeath(deathPos.col * CELL, deathPos.row * CELL);
      return;
    }
    drawViking(player.px * CELL, player.row * CELL, CELL, false);
  }

  function drawViking(x, y, size, dim) {
    const cx = x + size / 2;
    // shadow
    if (!dim) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx, y + size - 3, size / 3, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // tunic
    ctx.fillStyle = dim ? '#5a3a22' : '#8a4a22';
    ctx.fillRect(x + 8, y + 14, size - 16, 14);
    // belt
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x + 8, y + 22, size - 16, 2);
    // head + beard
    ctx.fillStyle = '#e6c39a';
    ctx.fillRect(x + 10, y + 6, size - 20, 8);
    ctx.fillStyle = '#c87a30';
    ctx.fillRect(x + 10, y + 12, size - 20, 4);
    // helmet
    ctx.fillStyle = '#888';
    ctx.fillRect(x + 9, y + 4, size - 18, 4);
    // horns
    ctx.fillStyle = '#f0e0b8';
    ctx.fillRect(x + 6, y + 4, 3, 4);
    ctx.fillRect(x + size - 9, y + 4, 3, 4);
    // axe (right hand)
    if (!dim) {
      ctx.fillStyle = '#6a4020';
      ctx.fillRect(x + size - 10, y + 14, 2, 10);
      ctx.fillStyle = '#c0c0c8';
      ctx.fillRect(x + size - 14, y + 14, 6, 4);
    }
    // eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 12, y + 9, 2, 2);
    ctx.fillRect(x + size - 14, y + 9, 2, 2);
  }

  function drawDeath(x, y) {
    // splash/explosion frames based on statusTimer
    const t = Math.min(statusTimer, 1.0);
    const r = 6 + t * 22;
    const alpha = 1 - t * 0.7;
    ctx.fillStyle = `rgba(255, 240, 200, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x + CELL / 2, y + CELL / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(220, 120, 50, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + CELL / 2, y + CELL / 2, r * 1.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawLevelWon() {
    ctx.fillStyle = 'rgba(20, 30, 50, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffd066';
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Level ${levelNum} cleared`, canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '14px -apple-system, sans-serif';
    ctx.fillStyle = '#e6e8ee';
    ctx.fillText('Sailing on…', canvas.width / 2, canvas.height / 2 + 16);
  }

  // ─── Boot ────────────────────────────────────────────────────────────────

  fullReset();
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
