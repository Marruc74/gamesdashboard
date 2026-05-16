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

  const W = canvas.width;   // 400
  const H = canvas.height;  // 500

  const BIRD_X = 90;
  const BIRD_R = 13;
  const GRAVITY = 0.4;
  const FLAP_V = -7.5;
  const PIPE_W = 54;
  const PIPE_GAP = 138;
  const PIPE_SPEED = 2.4;
  const PIPE_EVERY = 82; // frames between spawns

  let birdY, birdV, pipes, score, best, alive, started, frame, rafId;

  // Static star field
  const STARS = Array.from({ length: 50 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H * 0.75,
    r: Math.random() * 1.4 + 0.4,
    a: Math.random() * 0.5 + 0.2,
  }));

  best = parseInt(localStorage.getItem('flappy-best') || '0', 10);
  bestEl.textContent = best;

  function reset() {
    birdY = H / 2;
    birdV = 0;
    pipes = [];
    score = 0;
    alive = true;
    started = false;
    frame = 0;
    scoreEl.textContent = 0;
    overlay.classList.add('hidden');
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function flap() {
    if (!alive) return;
    started = true;
    birdV = FLAP_V;
  }

  function spawnPipe() {
    const minTop = 60;
    const maxTop = H - PIPE_GAP - 70;
    const topH = Math.floor(Math.random() * (maxTop - minTop)) + minTop;
    pipes.push({ x: W + 10, topH, scored: false });
  }

  function update() {
    if (!started) return;
    frame++;

    birdV += GRAVITY;
    birdY += birdV;

    if (birdY - BIRD_R < 0) { birdY = BIRD_R; birdV = 0; }
    if (birdY + BIRD_R >= H - 20) return die();

    if (frame % PIPE_EVERY === 1) spawnPipe();

    for (const p of pipes) {
      p.x -= PIPE_SPEED;

      if (!p.scored && p.x + PIPE_W < BIRD_X - BIRD_R) {
        p.scored = true;
        score++;
        scoreEl.textContent = score;
        if (score > best) {
          best = score;
          bestEl.textContent = best;
          localStorage.setItem('flappy-best', best);
        }
      }

      const inX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
      const inY = birdY - BIRD_R < p.topH || birdY + BIRD_R > p.topH + PIPE_GAP;
      if (inX && inY) return die();
    }

    pipes = pipes.filter(p => p.x + PIPE_W > 0);
  }

  function die() {
    alive = false;
    overlayTitle.textContent = 'Game Over';
    overlayMsg.textContent = `Score: ${score}` + (score > 0 && score === best ? ' — new best!' : '');
    overlay.classList.remove('hidden');
  }

  function loop() {
    update();
    draw();
    if (alive) rafId = requestAnimationFrame(loop);
  }

  function draw() {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#07090f');
    sky.addColorStop(1, '#0e1525');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (const s of STARS) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pipes
    for (const p of pipes) drawPipe(p);

    // Ground
    ctx.fillStyle = '#1a2235';
    ctx.fillRect(0, H - 20, W, 20);
    ctx.fillStyle = '#243048';
    ctx.fillRect(0, H - 20, W, 4);

    // Bird
    drawBird(BIRD_X, birdY, birdV);

    // Start prompt
    if (!started) {
      ctx.fillStyle = 'rgba(230,232,238,0.7)';
      ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Press Space or click to start', W / 2, H / 2 + 55);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawPipe(p) {
    const CAP_H = 18;
    const CAP_EXTRA = 8;

    // Top pipe body
    ctx.fillStyle = '#2ab87a';
    ctx.fillRect(p.x, 0, PIPE_W, p.topH - CAP_H);

    // Top pipe cap
    ctx.fillStyle = '#3ddc97';
    ctx.beginPath();
    ctx.roundRect(p.x - CAP_EXTRA / 2, p.topH - CAP_H, PIPE_W + CAP_EXTRA, CAP_H, [0, 0, 4, 4]);
    ctx.fill();

    // Pipe highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(p.x + 4, 0, 8, p.topH - CAP_H);

    // Bottom pipe body
    const botY = p.topH + PIPE_GAP;
    ctx.fillStyle = '#2ab87a';
    ctx.fillRect(p.x, botY + CAP_H, PIPE_W, H - botY - CAP_H);

    // Bottom pipe cap
    ctx.fillStyle = '#3ddc97';
    ctx.beginPath();
    ctx.roundRect(p.x - CAP_EXTRA / 2, botY, PIPE_W + CAP_EXTRA, CAP_H, [4, 4, 0, 0]);
    ctx.fill();

    // Pipe highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(p.x + 4, botY + CAP_H, 8, H - botY - CAP_H);
  }

  function drawBird(x, y, vy) {
    const angle = Math.max(-0.45, Math.min(0.9, vy * 0.065));

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow
    ctx.shadowColor = 'rgba(255,210,74,0.45)';
    ctx.shadowBlur = 14;

    // Body
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Wing
    ctx.fillStyle = '#e8b830';
    ctx.beginPath();
    ctx.ellipse(-2, 4, 8, 5, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // Belly
    ctx.fillStyle = '#ffe680';
    ctx.beginPath();
    ctx.ellipse(2, 2, 6, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Eye white
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5, -4, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(6.5, -4, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(7.2, -5, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#ff8c42';
    ctx.beginPath();
    ctx.moveTo(BIRD_R - 1, -2);
    ctx.lineTo(BIRD_R + 8, 0);
    ctx.lineTo(BIRD_R - 1, 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  document.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); flap(); }
  });
  canvas.addEventListener('click', flap);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); flap(); }, { passive: false });

  restartBtn.addEventListener('click', reset);
  overlayBtn.addEventListener('click', reset);

  reset();
})();
