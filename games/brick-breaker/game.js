(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');
  const restartBtn = document.getElementById('restart');

  const PADDLE_W = 88;
  const PADDLE_H = 12;
  const BALL_R = 6;
  const BRICK_W = 56;
  const BRICK_H = 18;
  const BRICK_GAP = 4;
  const BRICK_TOP = 60;
  const BRICK_COLS = 8;
  const BRICK_LEFT = (W - (BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP)) / 2;

  const ROW_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc'];
  const ROW_POINTS = [60, 50, 40, 30, 20, 10];

  const POWERUP_CHANCE = 0.15;
  const DROP_SPEED = 2.2;
  const DROP_W = 26;
  const DROP_H = 14;
  const LASER_SPEED = 9;
  const LASER_COOLDOWN_FRAMES = 14;
  const MAX_BALLS = 12;

  const POWERUP_INFO = {
    wide:   { letter: 'W', color: '#4dabf7' },
    multi:  { letter: 'M', color: '#69db7c' },
    slow:   { letter: 'S', color: '#9775fa' },
    life:   { letter: '+', color: '#ff6b6b' },
    laser:  { letter: 'L', color: '#ffa94d' },
    sticky: { letter: 'C', color: '#22d3ee' },
  };
  const POWERUP_TYPES = Object.keys(POWERUP_INFO);

  const LEVELS = [
    [
      '########',
      '########',
      '########',
      ' ###### ',
      '  ####  ',
    ],
    [
      '# # # # ',
      ' # # # #',
      '# # # # ',
      ' # # # #',
      '########',
      '########',
    ],
    [
      '########',
      '#      #',
      '# #### #',
      '# #  # #',
      '# #### #',
      '#      #',
      '########',
    ],
    [
      '   ##   ',
      '  ####  ',
      ' ###### ',
      '########',
      ' ###### ',
      '  ####  ',
      '   ##   ',
    ],
  ];

  const state = { score: 0, lives: 3, level: 0 };
  let paddle, balls, bricks, drops, lasers, effects, laserCooldown;
  let paused, gameOver, levelDone;
  const keys = Object.create(null);

  const now = () => performance.now();

  function baseBallSpeed() { return 5 + state.level * 0.4; }
  function currentBallSpeed() {
    return now() < effects.slowUntil ? baseBallSpeed() * 0.65 : baseBallSpeed();
  }
  function widePaddleWidth() { return Math.round(PADDLE_W * 1.6); }

  function init() {
    state.score = 0;
    state.lives = 3;
    state.level = 0;
    gameOver = false;
    loadLevel();
    hideOverlay();
  }

  function loadLevel() {
    paddle = { x: (W - PADDLE_W) / 2, y: H - 32, w: PADDLE_W, h: PADDLE_H };
    balls = [];
    drops = [];
    lasers = [];
    effects = { wideUntil: 0, slowUntil: 0, laserUntil: 0, stickyUntil: 0 };
    laserCooldown = 0;
    spawnBallOnPaddle();
    paused = false;
    levelDone = false;

    const layout = LEVELS[state.level];
    bricks = [];
    for (let r = 0; r < layout.length; r++) {
      const row = layout[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '#') {
          bricks.push({
            x: BRICK_LEFT + c * (BRICK_W + BRICK_GAP),
            y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
            w: BRICK_W,
            h: BRICK_H,
            color: ROW_COLORS[r % ROW_COLORS.length],
            points: ROW_POINTS[r % ROW_POINTS.length],
            alive: true,
          });
        }
      }
    }
    updateHUD();
  }

  function spawnBallOnPaddle() {
    balls.push({
      x: paddle.x + paddle.w / 2,
      y: paddle.y - BALL_R - 1,
      vx: 0,
      vy: 0,
      stuck: true,
      stuckOffset: 0,
    });
  }

  function launchStuckBalls() {
    const speed = currentBallSpeed();
    let launched = false;
    for (const b of balls) {
      if (!b.stuck) continue;
      const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
      b.stuck = false;
      launched = true;
    }
    return launched;
  }

  function updateHUD() {
    scoreEl.textContent = state.score;
    livesEl.textContent = state.lives;
    levelEl.textContent = state.level + 1;
  }

  function showOverlay(title, msg, btnText) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlayBtn.textContent = btnText;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  function loseLife() {
    state.lives -= 1;
    updateHUD();
    if (state.lives <= 0) {
      gameOver = true;
      showOverlay('Game Over', `Final score: ${state.score}`, 'Play Again');
      return;
    }
    paddle.w = PADDLE_W;
    paddle.x = (W - PADDLE_W) / 2;
    balls = [];
    drops = [];
    lasers = [];
    effects.wideUntil = 0;
    effects.stickyUntil = 0;
    effects.laserUntil = 0;
    spawnBallOnPaddle();
  }

  function nextLevel() {
    state.level += 1;
    if (state.level >= LEVELS.length) {
      gameOver = true;
      showOverlay('You Cleared It', `Final score: ${state.score}`, 'Play Again');
      return;
    }
    loadLevel();
    hideOverlay();
  }

  function completeLevel() {
    if (levelDone) return;
    levelDone = true;
    showOverlay('Level Clear', `Score: ${state.score}`, 'Next Level');
  }

  function maybeDropPowerup(brick) {
    if (Math.random() > POWERUP_CHANCE) return;
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    drops.push({
      x: brick.x + brick.w / 2 - DROP_W / 2,
      y: brick.y + brick.h / 2 - DROP_H / 2,
      type,
    });
  }

  function applyPowerup(type) {
    const t = now();
    if (type === 'wide') {
      effects.wideUntil = t + 20000;
      const newW = widePaddleWidth();
      const center = paddle.x + paddle.w / 2;
      paddle.w = newW;
      paddle.x = Math.max(0, Math.min(W - newW, center - newW / 2));
    } else if (type === 'multi') {
      const speed = currentBallSpeed();
      const extras = [];
      for (const b of balls) {
        if (b.stuck) continue;
        const base = Math.atan2(b.vy, b.vx);
        for (const off of [-0.45, 0.45]) {
          if (balls.length + extras.length >= MAX_BALLS) break;
          const a = base + off;
          extras.push({
            x: b.x, y: b.y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            stuck: false,
            stuckOffset: 0,
          });
        }
      }
      balls.push(...extras);
    } else if (type === 'slow') {
      effects.slowUntil = t + 15000;
      const speed = baseBallSpeed() * 0.65;
      for (const b of balls) {
        if (b.stuck) continue;
        const a = Math.atan2(b.vy, b.vx);
        b.vx = Math.cos(a) * speed;
        b.vy = Math.sin(a) * speed;
      }
    } else if (type === 'life') {
      state.lives += 1;
      updateHUD();
    } else if (type === 'laser') {
      effects.laserUntil = t + 15000;
    } else if (type === 'sticky') {
      effects.stickyUntil = t + 15000;
    }
  }

  canvas.addEventListener('mousemove', (e) => {
    if (!paddle) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    paddle.x = Math.max(0, Math.min(W - paddle.w, x - paddle.w / 2));
  });
  canvas.addEventListener('click', () => {
    if (!paused && !gameOver && !levelDone) launchStuckBalls();
  });

  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      if (gameOver || levelDone) return;
      const launched = launchStuckBalls();
      if (!launched) paused = !paused;
    } else if (e.code === 'KeyR') {
      init();
    }
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });

  restartBtn.addEventListener('click', () => init());
  overlayBtn.addEventListener('click', () => {
    if (gameOver) init();
    else if (levelDone) nextLevel();
  });

  function update() {
    if (paused || gameOver || levelDone) return;
    const t = now();

    if (t >= effects.wideUntil && paddle.w !== PADDLE_W) {
      const center = paddle.x + paddle.w / 2;
      paddle.w = PADDLE_W;
      paddle.x = Math.max(0, Math.min(W - paddle.w, center - paddle.w / 2));
    }
    if (t >= effects.slowUntil) {
      const desired = baseBallSpeed();
      for (const b of balls) {
        if (b.stuck) continue;
        const cur = Math.hypot(b.vx, b.vy);
        if (cur > 0 && Math.abs(cur - desired) > 0.4) {
          const k = desired / cur;
          b.vx *= k;
          b.vy *= k;
        }
      }
    }

    const paddleSpeed = 8;
    if (keys['ArrowLeft'] || keys['KeyA']) paddle.x -= paddleSpeed;
    if (keys['ArrowRight'] || keys['KeyD']) paddle.x += paddleSpeed;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    for (const b of balls) {
      if (b.stuck) {
        b.x = paddle.x + paddle.w / 2 + b.stuckOffset;
        b.y = paddle.y - BALL_R - 1;
        continue;
      }
      b.x += b.vx;
      b.y += b.vy;

      if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
      if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }
      if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }

      if (
        b.vy > 0 &&
        b.y + BALL_R >= paddle.y &&
        b.y - BALL_R <= paddle.y + paddle.h &&
        b.x >= paddle.x && b.x <= paddle.x + paddle.w
      ) {
        b.y = paddle.y - BALL_R;
        if (t < effects.stickyUntil) {
          b.stuck = true;
          b.stuckOffset = b.x - (paddle.x + paddle.w / 2);
          b.vx = 0; b.vy = 0;
        } else {
          const rel = (b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
          const angle = rel * (Math.PI / 3) - Math.PI / 2;
          const sp = Math.hypot(b.vx, b.vy) || currentBallSpeed();
          b.vx = Math.cos(angle) * sp;
          b.vy = Math.sin(angle) * sp;
        }
      }

      for (const br of bricks) {
        if (!br.alive) continue;
        if (
          b.x + BALL_R > br.x && b.x - BALL_R < br.x + br.w &&
          b.y + BALL_R > br.y && b.y - BALL_R < br.y + br.h
        ) {
          br.alive = false;
          state.score += br.points;
          maybeDropPowerup(br);
          updateHUD();
          const overlapX = Math.min(b.x + BALL_R - br.x, br.x + br.w - (b.x - BALL_R));
          const overlapY = Math.min(b.y + BALL_R - br.y, br.y + br.h - (b.y - BALL_R));
          if (overlapX < overlapY) b.vx *= -1;
          else b.vy *= -1;
          break;
        }
      }
    }

    balls = balls.filter(b => b.y <= H + BALL_R);
    if (balls.length === 0) {
      loseLife();
      return;
    }

    for (const d of drops) d.y += DROP_SPEED;
    drops = drops.filter(d => {
      if (d.y > H) return false;
      if (
        d.y + DROP_H >= paddle.y &&
        d.y <= paddle.y + paddle.h &&
        d.x + DROP_W >= paddle.x &&
        d.x <= paddle.x + paddle.w
      ) {
        applyPowerup(d.type);
        return false;
      }
      return true;
    });

    if (t < effects.laserUntil) {
      if (laserCooldown <= 0) {
        lasers.push({ x: paddle.x + 8, y: paddle.y });
        lasers.push({ x: paddle.x + paddle.w - 8, y: paddle.y });
        laserCooldown = LASER_COOLDOWN_FRAMES;
      } else {
        laserCooldown -= 1;
      }
    }
    for (const l of lasers) l.y -= LASER_SPEED;
    lasers = lasers.filter(l => {
      if (l.y < -10) return false;
      for (const br of bricks) {
        if (!br.alive) continue;
        if (l.x >= br.x && l.x <= br.x + br.w && l.y >= br.y && l.y <= br.y + br.h) {
          br.alive = false;
          state.score += Math.round(br.points / 2);
          maybeDropPowerup(br);
          updateHUD();
          return false;
        }
      }
      return true;
    });

    if (bricks.every(b => !b.alive)) completeLevel();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function draw() {
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, W, H);

    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(b.x, b.y, b.w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3);
    }

    for (const l of lasers) {
      ctx.fillStyle = '#ffd43b';
      ctx.fillRect(l.x - 1, l.y, 2, 8);
    }

    for (const d of drops) {
      const info = POWERUP_INFO[d.type];
      ctx.fillStyle = info.color;
      roundRect(d.x, d.y, DROP_W, DROP_H, 3);
      ctx.fill();
      ctx.fillStyle = '#0a0c12';
      ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.letter, d.x + DROP_W / 2, d.y + DROP_H / 2 + 1);
    }
    ctx.textBaseline = 'alphabetic';

    const stickyOn = now() < effects.stickyUntil;
    ctx.fillStyle = stickyOn ? '#22d3ee' : '#e6e8ee';
    roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 4);
    ctx.fill();
    if (now() < effects.laserUntil) {
      ctx.fillStyle = '#ffa94d';
      ctx.fillRect(paddle.x + 6, paddle.y - 4, 4, 4);
      ctx.fillRect(paddle.x + paddle.w - 10, paddle.y - 4, 4, 4);
    }

    for (const b of balls) {
      ctx.beginPath();
      ctx.fillStyle = '#ffd43b';
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }

    if (balls.some(b => b.stuck) && !gameOver && !levelDone) {
      ctx.fillStyle = 'rgba(230,232,238,0.75)';
      ctx.font = '14px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click or press Space to launch', W / 2, H - 60);
    }

    if (paused && !gameOver && !levelDone) {
      ctx.fillStyle = 'rgba(10,12,18,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e6e8ee';
      ctx.font = '28px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Paused', W / 2, H / 2);
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  init();
  loop();
})();
