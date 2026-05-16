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
  let paddle, ball, bricks, paused, awaitingLaunch, gameOver, levelDone;
  const keys = Object.create(null);

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
    resetBall();
    awaitingLaunch = true;
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

  function resetBall() {
    const baseSpeed = 5 + state.level * 0.4;
    ball = {
      x: paddle.x + paddle.w / 2,
      y: paddle.y - BALL_R - 1,
      vx: 0,
      vy: 0,
      speed: baseSpeed,
    };
  }

  function launch() {
    if (!awaitingLaunch || gameOver || levelDone) return;
    const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
    ball.vx = Math.cos(angle) * ball.speed;
    ball.vy = Math.sin(angle) * ball.speed;
    awaitingLaunch = false;
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
  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  function loseLife() {
    state.lives -= 1;
    updateHUD();
    if (state.lives <= 0) {
      gameOver = true;
      showOverlay('Game Over', `Final score: ${state.score}`, 'Play Again');
      return;
    }
    paddle.x = (W - PADDLE_W) / 2;
    resetBall();
    awaitingLaunch = true;
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

  canvas.addEventListener('mousemove', (e) => {
    if (!paddle) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    paddle.x = Math.max(0, Math.min(W - paddle.w, x - paddle.w / 2));
  });
  canvas.addEventListener('click', () => {
    if (awaitingLaunch && !paused && !gameOver && !levelDone) launch();
  });

  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      if (gameOver || levelDone) return;
      if (awaitingLaunch) launch();
      else paused = !paused;
    } else if (e.code === 'KeyR') {
      init();
    }
  });
  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  restartBtn.addEventListener('click', () => init());
  overlayBtn.addEventListener('click', () => {
    if (gameOver) init();
    else if (levelDone) nextLevel();
  });

  function update() {
    if (paused || gameOver || levelDone) return;

    const paddleSpeed = 8;
    if (keys['ArrowLeft'] || keys['KeyA']) paddle.x -= paddleSpeed;
    if (keys['ArrowRight'] || keys['KeyD']) paddle.x += paddleSpeed;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    if (awaitingLaunch) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - BALL_R - 1;
      return;
    }

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }

    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= paddle.y &&
      ball.y - BALL_R <= paddle.y + paddle.h &&
      ball.x >= paddle.x &&
      ball.x <= paddle.x + paddle.w
    ) {
      ball.y = paddle.y - BALL_R;
      const rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const angle = rel * (Math.PI / 3) - Math.PI / 2;
      ball.vx = Math.cos(angle) * ball.speed;
      ball.vy = Math.sin(angle) * ball.speed;
    }

    for (const b of bricks) {
      if (!b.alive) continue;
      if (
        ball.x + BALL_R > b.x && ball.x - BALL_R < b.x + b.w &&
        ball.y + BALL_R > b.y && ball.y - BALL_R < b.y + b.h
      ) {
        b.alive = false;
        state.score += b.points;
        updateHUD();
        const overlapX = Math.min(ball.x + BALL_R - b.x, b.x + b.w - (ball.x - BALL_R));
        const overlapY = Math.min(ball.y + BALL_R - b.y, b.y + b.h - (ball.y - BALL_R));
        if (overlapX < overlapY) ball.vx *= -1;
        else ball.vy *= -1;
        break;
      }
    }

    if (ball.y > H + BALL_R) {
      loseLife();
      return;
    }

    if (bricks.every(b => !b.alive)) {
      completeLevel();
    }
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

    ctx.fillStyle = '#e6e8ee';
    roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 4);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = '#ffd43b';
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    if (awaitingLaunch && !gameOver && !levelDone) {
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
