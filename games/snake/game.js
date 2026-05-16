(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const restartBtn = document.getElementById('restart');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');

  const GRID = 20;
  const CELL = canvas.width / GRID;
  const TICK_MS = 110;

  let snake, dir, nextDir, food, score, best, alive, paused, tickHandle;

  best = parseInt(localStorage.getItem('snake-best') || '0', 10);
  bestEl.textContent = best;

  function reset() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    alive = true;
    paused = false;
    placeFood();
    scoreEl.textContent = score;
    overlay.classList.add('hidden');
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(tick, TICK_MS);
    draw();
  }

  function placeFood() {
    while (true) {
      const f = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
      if (!snake.some(s => s.x === f.x && s.y === f.y)) {
        food = f;
        return;
      }
    }
  }

  function tick() {
    if (!alive || paused) return;
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) return die();
    if (snake.some(s => s.x === head.x && s.y === head.y)) return die();

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        localStorage.setItem('snake-best', best);
      }
      placeFood();
    } else {
      snake.pop();
    }

    draw();
  }

  function die() {
    alive = false;
    clearInterval(tickHandle);
    overlayTitle.textContent = 'Game Over';
    overlayMsg.textContent = `Score: ${score}` + (score === best && score > 0 ? ' — new best!' : '');
    overlay.classList.remove('hidden');
  }

  function draw() {
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, canvas.height);
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(canvas.width, i * CELL);
      ctx.stroke();
    }

    ctx.fillStyle = '#ff5d6c';
    ctx.shadowColor = 'rgba(255,93,108,0.6)';
    ctx.shadowBlur = 12;
    const fx = food.x * CELL + CELL / 2;
    const fy = food.y * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#6effbe' : '#3ddc97';
      const pad = i === 0 ? 1 : 2;
      ctx.fillRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
    });
  }

  function setDir(x, y) {
    if (dir.x === -x && dir.y === -y) return;
    nextDir = { x, y };
  }

  document.addEventListener('keydown', e => {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': setDir(0, -1); break;
      case 'ArrowDown': case 's': case 'S': setDir(0, 1); break;
      case 'ArrowLeft': case 'a': case 'A': setDir(-1, 0); break;
      case 'ArrowRight': case 'd': case 'D': setDir(1, 0); break;
      case ' ':
        if (alive) {
          paused = !paused;
          if (paused) {
            overlayTitle.textContent = 'Paused';
            overlayMsg.textContent = 'Press Space to resume.';
            overlay.classList.remove('hidden');
          } else {
            overlay.classList.add('hidden');
          }
        }
        e.preventDefault();
        break;
    }
  });

  restartBtn.addEventListener('click', reset);
  overlayBtn.addEventListener('click', reset);

  reset();
})();
