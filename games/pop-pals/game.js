(() => {
  // ─── Constants ───────────────────────────────────────────────────────────
  const TILE = 32;
  const COLS = 16;
  const ROWS = 14;
  const W = COLS * TILE;
  const H = ROWS * TILE;

  const GRAVITY = 1100;
  const MOVE_SPEED = 160;
  const JUMP_SPEED = 560;
  const FRICTION = 0.82;
  const BUBBLE_FWD_SPEED = 260;
  const BUBBLE_FLOAT_SPEED = -22;
  const BUBBLE_FWD_TIME = 0.35;
  const BUBBLE_LIFE = 7.0;
  const ENEMY_SPEED = 60;
  const RESPAWN_INVULN = 2.0;
  const SHOOT_COOLDOWN = 0.35;

  // ─── DOM ─────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('board');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const levelEl = document.getElementById('level');
  const scoreEl = document.getElementById('score');
  const lives1El = document.getElementById('lives-1');
  const lives2El = document.getElementById('lives-2');
  const p2hudEl = document.getElementById('p2hud');
  const freeEl = document.getElementById('free');
  const trappedEl = document.getElementById('trapped');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');
  const restartBtn = document.getElementById('restart');

  // ─── Levels ──────────────────────────────────────────────────────────────
  // '#' solid, '=' jump-through platform, '.' empty, 'P' p1 spawn, 'p' p2 spawn, 'E' enemy spawn
  const LEVELS = [
    [
      '################',
      '#..............#',
      '#..............#',
      '#..============#',
      '#..............#',
      '#..............#',
      '#======..======#',
      '#..............#',
      '#..............#',
      '#==============#',
      '#..............#',
      '#..E........E..#',
      '#.P..........p.#',
      '################',
    ],
    [
      '################',
      '#..............#',
      '#====......====#',
      '#..............#',
      '#..============#',
      '#..............#',
      '#=========.....#',
      '#.....=========#',
      '#..E........E..#',
      '#==============#',
      '#..............#',
      '#..E........E..#',
      '#.P..........p.#',
      '################',
    ],
    [
      '################',
      '#..............#',
      '#..============#',
      '#..............#',
      '#===..======...#',
      '#..............#',
      '#...======..===#',
      '#..............#',
      '#==.======.====#',
      '#..E........E..#',
      '#..............#',
      '#.E..........E.#',
      '#.P..........p.#',
      '################',
    ],
  ];

  let grid;            // 2D array of tile codes
  let players;         // [Player, Player?]
  let enemies;         // [Enemy]
  let bubbles;         // [Bubble]
  let particles;       // [Particle] (visual only)
  let gems;            // [Gem]
  let level;
  let score;
  let gameStatus;      // 'playing' | 'gameover' | 'levelWon'
  let statusTimer;
  let lastTime;
  let p2Active;

  // ─── Input ───────────────────────────────────────────────────────────────
  const keys = {};
  document.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys[e.key.toLowerCase()] = true;
    // Auto-activate P2 on any P2 key press
    if (!p2Active && ['a', 'd', 'w', 'f', 'g'].includes(e.key.toLowerCase())) {
      activateP2();
    }
  });
  document.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  function p1Input() {
    return {
      left: keys['arrowleft'],
      right: keys['arrowright'],
      jump: keys['arrowup'] || keys['z'],
      down: keys['arrowdown'],
      shoot: keys['x'],
    };
  }
  function p2Input() {
    return {
      left: keys['a'],
      right: keys['d'],
      jump: keys['w'] || keys['f'],
      down: keys['s'],
      shoot: keys['g'],
    };
  }

  // ─── Level loading ───────────────────────────────────────────────────────
  function loadLevel(n) {
    const layout = LEVELS[(n - 1) % LEVELS.length];
    grid = [];
    enemies = [];
    bubbles = [];
    particles = [];
    gems = [];
    let p1Spawn = null;
    let p2Spawn = null;
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const ch = layout[r][c];
        if (ch === '#') row.push(1);
        else if (ch === '=') row.push(2);
        else row.push(0);

        if (ch === 'P') p1Spawn = { x: c * TILE + 4, y: r * TILE };
        if (ch === 'p') p2Spawn = { x: c * TILE + 4, y: r * TILE };
        if (ch === 'E') {
          enemies.push(makeEnemy(c * TILE + 4, r * TILE));
        }
      }
      grid.push(row);
    }

    // Add extra enemies based on level number (cap at 8)
    const extraCount = Math.min(Math.floor((n - 1) / 3), 4);
    for (let i = 0; i < extraCount; i++) {
      enemies.push(makeEnemy((2 + i * 3) * TILE, 1 * TILE));
    }

    // Scale enemy speed with level
    const speedMul = 1 + (n - 1) * 0.1;
    for (const e of enemies) e.speed *= speedMul;

    if (!players) {
      players = [makePlayer(p1Spawn.x, p1Spawn.y, 1)];
      if (p2Active) players.push(makePlayer(p2Spawn.x, p2Spawn.y, 2));
    } else {
      players[0].x = p1Spawn.x;
      players[0].y = p1Spawn.y;
      players[0].vx = 0;
      players[0].vy = 0;
      players[0].invuln = RESPAWN_INVULN;
      if (players[1]) {
        players[1].x = p2Spawn.x;
        players[1].y = p2Spawn.y;
        players[1].vx = 0;
        players[1].vy = 0;
        players[1].invuln = RESPAWN_INVULN;
      }
    }

    level = n;
    gameStatus = 'playing';
    statusTimer = 0;
    updateHud();
  }

  function activateP2() {
    p2Active = true;
    p2hudEl.classList.remove('hidden');
    if (players && !players[1]) {
      // Find a safe spawn — center of bottom row near p1
      const sx = players[0].x + 64;
      const sy = players[0].y;
      players.push(makePlayer(sx, sy, 2));
    }
  }

  // ─── Entities ────────────────────────────────────────────────────────────
  function makePlayer(x, y, num) {
    return {
      kind: 'player', num,
      x, y, w: 24, h: 26,
      vx: 0, vy: 0,
      onGround: false,
      facing: num === 1 ? 1 : -1,
      lives: 3,
      invuln: RESPAWN_INVULN,
      shootTimer: 0,
      dead: false,
      respawnTimer: 0,
      blinkPhase: 0,
      dropping: 0,
    };
  }

  function makeEnemy(x, y) {
    return {
      kind: 'enemy',
      x, y, w: 24, h: 24,
      vx: -ENEMY_SPEED, vy: 0,
      speed: ENEMY_SPEED,
      onGround: false,
      facing: -1,
      animPhase: Math.random() * 6,
      alarm: 0,
    };
  }

  function makeBubble(x, y, dir) {
    return {
      kind: 'bubble',
      x, y, w: 22, h: 22,
      vx: dir * BUBBLE_FWD_SPEED, vy: 0,
      life: 0,
      trapped: null,  // Enemy reference if trapped
      popping: false,
      popTimer: 0,
    };
  }

  function makeGem(x, y) {
    return {
      kind: 'gem',
      x, y, w: 16, h: 16,
      vx: 0, vy: -200,
      life: 0,
    };
  }

  function makeParticle(x, y, color) {
    return {
      x, y,
      vx: (Math.random() - 0.5) * 200,
      vy: -Math.random() * 200 - 50,
      life: 0.6,
      color,
      size: 3 + Math.random() * 3,
    };
  }

  // ─── Physics ─────────────────────────────────────────────────────────────
  function tileAt(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return 1;
    return grid[r][c];
  }

  function solidAt(c, r) {
    return tileAt(c, r) === 1;
  }
  function platformAt(c, r) {
    return tileAt(c, r) === 2;
  }

  function moveBody(b, dt) {
    // Apply gravity
    b.vy += GRAVITY * dt;
    if (b.vy > 720) b.vy = 720;

    // X movement
    let nx = b.x + b.vx * dt;
    {
      const left = Math.floor(nx / TILE);
      const right = Math.floor((nx + b.w - 1) / TILE);
      const top = Math.floor((b.y + 2) / TILE);
      const bot = Math.floor((b.y + b.h - 1) / TILE);
      let blocked = false;
      for (let r = top; r <= bot; r++) {
        if (b.vx > 0 && solidAt(right, r)) {
          nx = right * TILE - b.w;
          blocked = true;
          break;
        }
        if (b.vx < 0 && solidAt(left, r)) {
          nx = (left + 1) * TILE;
          blocked = true;
          break;
        }
      }
      if (blocked) b.vx = 0;
    }
    b.x = nx;

    // Y movement
    let ny = b.y + b.vy * dt;
    b.onGround = false;
    {
      const left = Math.floor((b.x + 2) / TILE);
      const right = Math.floor((b.x + b.w - 3) / TILE);
      if (b.vy > 0) {
        const bot = Math.floor((ny + b.h) / TILE);
        for (let c = left; c <= right; c++) {
          if (solidAt(c, bot) || platformAt(c, bot)) {
            // For platform, must have been above
            const oldBot = Math.floor((b.y + b.h - 1) / TILE);
            if (platformAt(c, bot) && oldBot >= bot) continue;
            if (platformAt(c, bot) && b.dropping > 0) continue;
            ny = bot * TILE - b.h;
            b.vy = 0;
            b.onGround = true;
            break;
          }
        }
      } else if (b.vy < 0) {
        const top = Math.floor(ny / TILE);
        for (let c = left; c <= right; c++) {
          if (solidAt(c, top)) {
            ny = (top + 1) * TILE;
            b.vy = 0;
            break;
          }
        }
      }
    }
    b.y = ny;
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  function updatePlayer(p, input, dt) {
    if (p.dead) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0 && p.lives > 0) {
        // Respawn
        const layout = LEVELS[(level - 1) % LEVELS.length];
        const ch = p.num === 1 ? 'P' : 'p';
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (layout[r][c] === ch) {
              p.x = c * TILE + 4;
              p.y = r * TILE;
            }
          }
        }
        p.vx = 0;
        p.vy = 0;
        p.dead = false;
        p.invuln = RESPAWN_INVULN;
      }
      return;
    }

    if (input.left) {
      p.vx = -MOVE_SPEED;
      p.facing = -1;
    } else if (input.right) {
      p.vx = MOVE_SPEED;
      p.facing = 1;
    } else {
      p.vx *= FRICTION;
      if (Math.abs(p.vx) < 5) p.vx = 0;
    }

    if (input.jump && p.onGround) {
      p.vy = -JUMP_SPEED;
      p.onGround = false;
    }

    if (input.down && p.onGround && p.dropping <= 0) {
      // Only drop through if standing on a jump-through platform (not solid floor)
      const c = Math.floor((p.x + p.w / 2) / TILE);
      const r = Math.floor((p.y + p.h) / TILE);
      if (platformAt(c, r)) {
        p.dropping = 0.18;
        p.y += 2;
        p.vy = 120;
        p.onGround = false;
      }
    }
    if (p.dropping > 0) p.dropping -= dt;

    if (input.shoot && p.shootTimer <= 0) {
      bubbles.push(makeBubble(p.x + p.w / 2 - 11 + p.facing * 12, p.y + 2, p.facing));
      p.shootTimer = SHOOT_COOLDOWN;
    }
    p.shootTimer -= dt;
    if (p.invuln > 0) {
      p.invuln -= dt;
      p.blinkPhase += dt * 18;
    }

    moveBody(p, dt);

    // Bounce off bottom/top walls
    if (p.y > H) p.y = -p.h;
    if (p.y < -p.h) p.y = H - p.h - 1;
  }

  function updateEnemy(e, dt) {
    e.animPhase += dt * 4;
    if (e.alarm > 0) e.alarm -= dt;
    e.vx = e.facing * e.speed;

    // Look ahead one tile in walk direction at foot height; turn if edge or wall
    moveBody(e, dt);

    if (e.onGround) {
      const aheadC = Math.floor((e.x + (e.facing > 0 ? e.w + 2 : -2)) / TILE);
      const footR = Math.floor((e.y + e.h) / TILE);
      const aheadFloor = solidAt(aheadC, footR) || platformAt(aheadC, footR);
      const aheadWall = solidAt(aheadC, footR - 1);
      if (!aheadFloor || aheadWall) {
        e.facing *= -1;
      }
    }

    if (e.y > H) e.y = -e.h;
    if (e.y < -e.h) e.y = H - e.h - 1;
  }

  function updateBubble(b, dt) {
    b.life += dt;
    if (b.life < BUBBLE_FWD_TIME) {
      // Forward phase: keep vx, no gravity
    } else {
      // Float phase
      b.vx *= 0.9;
      b.vy = BUBBLE_FLOAT_SPEED;
    }

    // Move without gravity (custom path)
    let nx = b.x + b.vx * dt;
    let ny = b.y + b.vy * dt;

    // Bounce off walls
    const leftCol = Math.floor(nx / TILE);
    const rightCol = Math.floor((nx + b.w - 1) / TILE);
    const topRow = Math.floor(ny / TILE);
    const botRow = Math.floor((ny + b.h - 1) / TILE);
    const midRow = Math.floor((b.y + b.h / 2) / TILE);

    if (b.vx > 0 && solidAt(rightCol, midRow)) {
      nx = rightCol * TILE - b.w;
      b.vx = 0;
    } else if (b.vx < 0 && solidAt(leftCol, midRow)) {
      nx = (leftCol + 1) * TILE;
      b.vx = 0;
    }
    const midCol = Math.floor((b.x + b.w / 2) / TILE);
    if (b.vy < 0 && solidAt(midCol, topRow)) {
      ny = (topRow + 1) * TILE;
      b.vy = 0;
    }
    b.x = nx;
    b.y = ny;

    // Trap any nearby free enemy
    if (!b.trapped && b.life > 0.1) {
      for (const en of enemies) {
        if (en.trapped) continue;
        if (aabb(b, en)) {
          b.trapped = en;
          en.trapped = b;
          en.vx = 0;
          en.vy = 0;
          break;
        }
      }
    }

    // Trapped enemy rides the bubble
    if (b.trapped) {
      b.trapped.x = b.x + (b.w - b.trapped.w) / 2;
      b.trapped.y = b.y + (b.h - b.trapped.h) / 2;
    }

    if (b.life > BUBBLE_LIFE && !b.popping) {
      if (b.trapped) {
        const e = b.trapped;
        e.trapped = null;
        e.facing = Math.random() < 0.5 ? -1 : 1;
        e.vy = -160;
        e.alarm = 1.5;
        // Clamp back into level if anywhere near a wall
        if (e.x < TILE) e.x = TILE + 2;
        if (e.x + e.w > W - TILE) e.x = W - TILE - e.w - 2;
        b.trapped = null;
        for (let i = 0; i < 14; i++) particles.push(makeParticle(b.x + b.w / 2, b.y + b.h / 2, '#ff7050'));
      }
      b.popping = true;
      b.popTimer = 0;
    }

    if (b.popping) {
      b.popTimer += dt;
    }
  }

  function popBubble(b, byPlayer) {
    if (b.trapped) {
      const e = b.trapped;
      gems.push(makeGem(e.x + e.w / 2 - 8, e.y));
      for (let i = 0; i < 8; i++) particles.push(makeParticle(e.x + e.w / 2, e.y + e.h / 2, '#ffd066'));
      enemies = enemies.filter(en => en !== e);
      score += 100;
    }
    for (let i = 0; i < 6; i++) particles.push(makeParticle(b.x + b.w / 2, b.y + b.h / 2, '#ffe5b0'));
    b.popping = true;
    b.popTimer = 0.25;  // trigger removal below
  }

  function update(dt) {
    if (gameStatus !== 'playing') {
      statusTimer += dt;
      // Still update particles for visual continuity
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += GRAVITY * 0.6 * dt;
        p.life -= dt;
      }
      particles = particles.filter(p => p.life > 0);

      if (gameStatus === 'levelWon' && statusTimer > 1.6) {
        loadLevel(level + 1);
      }
      return;
    }

    // Players
    if (players[0]) updatePlayer(players[0], p1Input(), dt);
    if (players[1]) updatePlayer(players[1], p2Input(), dt);

    // Enemies (only those not trapped)
    for (const e of enemies) {
      if (!e.trapped) updateEnemy(e, dt);
    }

    // Bubbles
    for (const b of bubbles) updateBubble(b, dt);

    // Player vs bubbles — popping
    for (const p of players) {
      if (!p || p.dead) continue;
      for (const b of bubbles) {
        if (b.popping) continue;
        if (b.life < 0.3) continue;  // don't pop your own fresh bubble
        if (aabb(p, b)) {
          popBubble(b, p);
          // Small bounce off bubble
          p.vy = Math.min(p.vy, -260);
        }
      }
    }

    // Remove popped bubbles
    bubbles = bubbles.filter(b => !(b.popping && b.popTimer >= 0.2));

    // Player vs enemies — death
    for (const p of players) {
      if (!p || p.dead || p.invuln > 0) continue;
      for (const e of enemies) {
        if (e.trapped) continue;
        if (aabb(p, e)) {
          killPlayer(p);
          break;
        }
      }
    }

    // Gems
    for (const g of gems) {
      g.life += dt;
      g.vy += GRAVITY * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      // Land on platform
      const c = Math.floor((g.x + g.w / 2) / TILE);
      const r = Math.floor((g.y + g.h) / TILE);
      if (g.vy > 0 && (solidAt(c, r) || platformAt(c, r))) {
        g.y = r * TILE - g.h;
        g.vy = 0;
        g.vx = 0;
      }
    }

    // Player picks up gems
    for (const p of players) {
      if (!p || p.dead) continue;
      gems = gems.filter(g => {
        if (aabb(p, g)) {
          score += 50;
          for (let i = 0; i < 6; i++) particles.push(makeParticle(g.x + g.w / 2, g.y + g.h / 2, '#ffd066'));
          return false;
        }
        if (g.life > 6) return false;
        return true;
      });
    }

    // Particles
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += GRAVITY * 0.6 * dt;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);

    updateHud();

    // Level win check
    if (enemies.length === 0 && gameStatus === 'playing') {
      gameStatus = 'levelWon';
      statusTimer = 0;
      score += 500;
      updateHud();
    }
  }

  function killPlayer(p) {
    p.lives--;
    p.dead = true;
    p.respawnTimer = 1.4;
    for (let i = 0; i < 12; i++) particles.push(makeParticle(p.x + p.w / 2, p.y + p.h / 2, '#ff6680'));

    // Game over if all players have no lives left
    const alivePlayers = players.filter(pl => pl.lives > 0);
    if (alivePlayers.length === 0) {
      gameStatus = 'gameover';
      statusTimer = 0;
      showOverlay('Game Over', `Final score: ${score}`, 'Play Again', fullReset);
    }
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────
  function updateHud() {
    levelEl.textContent = level;
    scoreEl.textContent = score;
    lives1El.textContent = players[0] ? players[0].lives : 0;
    if (players[1]) lives2El.textContent = players[1].lives;
    const free = enemies.filter(e => !e.trapped).length;
    const trapped = enemies.filter(e => e.trapped).length;
    freeEl.textContent = free;
    trappedEl.textContent = trapped;
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

  function fullReset() {
    score = 0;
    players = null;
    p2Active = false;
    p2hudEl.classList.add('hidden');
    loadLevel(1);
    hideOverlay();
  }

  // ─── Rendering ───────────────────────────────────────────────────────────
  function draw() {
    drawBackground();
    drawTerrain();
    for (const g of gems) drawGem(g);
    for (const b of bubbles) drawBubble(b);
    for (const e of enemies) if (!e.trapped) drawEnemy(e);
    for (const p of players) if (p && !p.dead) drawPlayer(p);
    for (const part of particles) drawParticle(part);
    drawHintIfStuck();
    if (gameStatus === 'levelWon') drawLevelWon();
  }

  function drawHintIfStuck() {
    if (gameStatus !== 'playing') return;
    const free = enemies.filter(e => !e.trapped).length;
    const trapped = enemies.filter(e => e.trapped).length;
    if (free === 0 && trapped > 0) {
      const pulse = (Math.sin(performance.now() / 200) + 1) / 2;
      ctx.fillStyle = `rgba(255, 215, 130, ${0.7 + pulse * 0.3})`;
      ctx.font = 'bold 18px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Jump into the orbs to pop them!', W / 2, 28);
    }
  }

  function drawBackground() {
    // gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1d3f');
    g.addColorStop(1, '#1a1428');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // sparkles
    for (let i = 0; i < 30; i++) {
      const x = (i * 53) % W;
      const y = (i * 71 + i * i) % H;
      ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 5) * 0.02})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawTerrain() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = grid[r][c];
        const x = c * TILE;
        const y = r * TILE;
        if (t === 1) {
          // solid block — stone purple
          ctx.fillStyle = '#5a3878';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#7a52a0';
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = '#3a2050';
          ctx.fillRect(x, y + TILE - 4, TILE, 4);
          // highlight specks
          ctx.fillStyle = '#9a78c4';
          ctx.fillRect(x + 6, y + 6, 3, 3);
          ctx.fillRect(x + TILE - 10, y + 12, 2, 2);
        } else if (t === 2) {
          // jump-through platform — magenta bar
          ctx.fillStyle = '#e25fa1';
          ctx.fillRect(x, y, TILE, 8);
          ctx.fillStyle = '#ff8fc8';
          ctx.fillRect(x, y, TILE, 3);
          ctx.fillStyle = '#a83878';
          ctx.fillRect(x, y + 6, TILE, 2);
        }
      }
    }
  }

  function drawPlayer(p) {
    if (p.invuln > 0 && Math.floor(p.blinkPhase) % 2 === 0) return;
    const x = p.x, y = p.y;
    const isP1 = p.num === 1;
    const bodyColor = isP1 ? '#ffa64d' : '#ec5fbf';
    const darkColor = isP1 ? '#c66a1a' : '#a4307f';
    const lightColor = isP1 ? '#ffd9a0' : '#ffb3e0';

    // body (round puffball)
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(x + p.w / 2, y + p.h / 2 + 2, p.w / 2, 0, Math.PI * 2);
    ctx.fill();
    // belly
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.arc(x + p.w / 2, y + p.h / 2 + 6, p.w / 3, 0, Math.PI * 2);
    ctx.fill();
    // little ears/horns
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 3, y + 1, 4, 5);
    ctx.fillRect(x + p.w - 7, y + 1, 4, 5);
    // eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 6 + (p.facing > 0 ? 1 : -1), y + 10, 4, 5);
    ctx.fillRect(x + 14 + (p.facing > 0 ? 1 : -1), y + 10, 4, 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 7 + (p.facing > 0 ? 2 : 0), y + 11, 2, 3);
    ctx.fillRect(x + 15 + (p.facing > 0 ? 2 : 0), y + 11, 2, 3);
    // tiny feet
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 4, y + p.h - 4, 6, 4);
    ctx.fillRect(x + p.w - 10, y + p.h - 4, 6, 4);
  }

  function drawEnemy(e) {
    const x = e.x, y = e.y;
    const bounce = Math.sin(e.animPhase) * 1.5;
    // alarm ring (just released from bubble)
    if (e.alarm > 0) {
      const pulse = (Math.sin(e.alarm * 30) + 1) / 2;
      ctx.strokeStyle = `rgba(255, 80, 60, ${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + e.w / 2, y + e.h / 2 + 2, e.w / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // body
    ctx.fillStyle = '#6b3aa0';
    ctx.beginPath();
    ctx.arc(x + e.w / 2, y + e.h / 2 + 2 + bounce, e.w / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    // angry brow
    ctx.fillStyle = '#3a1860';
    ctx.fillRect(x + 4, y + 7 + bounce, 6, 2);
    ctx.fillRect(x + e.w - 10, y + 7 + bounce, 6, 2);
    // eyes
    ctx.fillStyle = '#ffeb3a';
    ctx.fillRect(x + 6, y + 10 + bounce, 4, 4);
    ctx.fillRect(x + e.w - 10, y + 10 + bounce, 4, 4);
    ctx.fillStyle = '#000';
    const eyeOff = e.facing > 0 ? 2 : 0;
    ctx.fillRect(x + 7 + eyeOff, y + 11 + bounce, 2, 3);
    ctx.fillRect(x + e.w - 9 + eyeOff, y + 11 + bounce, 2, 3);
    // tiny mouth fangs
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + e.w / 2 - 3, y + 17 + bounce, 2, 3);
    ctx.fillRect(x + e.w / 2 + 1, y + 17 + bounce, 2, 3);
    // little feet
    ctx.fillStyle = '#4a2470';
    ctx.fillRect(x + 4, y + e.h - 3, 5, 3);
    ctx.fillRect(x + e.w - 9, y + e.h - 3, 5, 3);
  }

  function drawBubble(b) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r = b.w / 2;
    const popping = b.popping;

    if (popping) {
      const t = b.popTimer / 0.2;
      ctx.strokeStyle = `rgba(255, 230, 150, ${1 - t})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r + t * 10, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    // Warning flash in last 2s of life — flash faster as time runs out
    const timeLeft = BUBBLE_LIFE - b.life;
    const warning = timeLeft < 2.0;
    const flashRate = warning ? 8 + (2.0 - timeLeft) * 8 : 0;
    const flash = warning ? (Math.sin(b.life * flashRate) > 0) : false;

    // Outer glow
    ctx.fillStyle = flash ? 'rgba(255, 80, 80, 0.4)' : 'rgba(255, 200, 100, 0.18)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fill();
    // Bubble
    ctx.fillStyle = flash ? 'rgba(255, 140, 140, 0.55)' : 'rgba(255, 215, 130, 0.45)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(cx - r / 3, cy - r / 3, r / 4, 0, Math.PI * 2);
    ctx.fill();
    // Outline
    ctx.strokeStyle = flash ? '#ff5060' : '#ffd066';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (b.trapped) {
      // Show trapped enemy in a desaturated form
      const e = b.trapped;
      ctx.save();
      ctx.globalAlpha = 0.85;
      drawEnemy(e);
      ctx.restore();
    }
  }

  function drawGem(g) {
    const cx = g.x + g.w / 2;
    const cy = g.y + g.h / 2;
    const r = g.w / 2;
    const sparkle = Math.sin(g.life * 8) * 0.4 + 0.6;
    ctx.fillStyle = `rgba(255, 230, 100, ${sparkle * 0.4})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd066';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff5b0';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.6);
    ctx.lineTo(cx + r * 0.4, cy);
    ctx.lineTo(cx - r * 0.4, cy);
    ctx.closePath();
    ctx.fill();
  }

  function drawParticle(p) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  function drawLevelWon() {
    ctx.fillStyle = 'rgba(20, 14, 30, 0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd066';
    ctx.font = 'bold 30px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Level ${level} cleared!`, W / 2, H / 2 - 6);
    ctx.font = '14px -apple-system, sans-serif';
    ctx.fillStyle = '#e6e8ee';
    ctx.fillText('+500 bonus · next round loading…', W / 2, H / 2 + 18);
  }

  // ─── Loop ────────────────────────────────────────────────────────────────
  function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  restartBtn.addEventListener('click', fullReset);

  // ─── Boot ────────────────────────────────────────────────────────────────
  fullReset();
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
