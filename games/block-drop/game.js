(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nCtx = nextCanvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const levelEl = document.getElementById('level');
  const linesEl = document.getElementById('lines');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');
  const restartBtn = document.getElementById('restart');

  const COLS = 10;
  const ROWS = 20;
  const CW = canvas.width / COLS;
  const CH = canvas.height / ROWS;

  // 7 standard geometric tetrominoes, plain colored squares
  const PIECES = [
    { cells: [[1,1,1,1]],           color: '#00d4ff' },
    { cells: [[1,1],[1,1]],          color: '#ffd93d' },
    { cells: [[0,1,0],[1,1,1]],      color: '#c77dff' },
    { cells: [[1,0],[1,0],[1,1]],    color: '#ff9f43' },
    { cells: [[0,1],[0,1],[1,1]],    color: '#54a0ff' },
    { cells: [[0,1,1],[1,1,0]],      color: '#5ddb6f' },
    { cells: [[1,1,0],[0,1,1]],      color: '#ff5d6c' },
  ];

  let grid, current, nextPiece, score, best, level, lines, alive, paused, dropHandle;

  best = parseInt(localStorage.getItem('block-drop-best') || '0', 10);
  bestEl.textContent = best;

  function makeGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function spawnPiece() {
    const p = PIECES[Math.floor(Math.random() * PIECES.length)];
    return {
      cells: p.cells.map(r => [...r]),
      color: p.color,
      x: Math.floor(COLS / 2) - Math.ceil(p.cells[0].length / 2),
      y: 0,
    };
  }

  function rotate90(cells) {
    const rows = cells.length, cols = cells[0].length;
    return Array.from({ length: cols }, (_, c) =>
      Array.from({ length: rows }, (_, r) => cells[rows - 1 - r][c])
    );
  }

  function collides(piece, dx, dy, altCells) {
    const shape = altCells || piece.cells;
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++)
        if (shape[r][c]) {
          const nx = piece.x + c + dx, ny = piece.y + r + dy;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && grid[ny][nx]) return true;
        }
    return false;
  }

  function lockPiece() {
    current.cells.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v && current.y + r >= 0) grid[current.y + r][current.x + c] = current.color;
      })
    );
    sweepLines();
    current = nextPiece;
    nextPiece = spawnPiece();
    drawNextPiece();
    if (collides(current, 0, 0)) gameOver();
  }

  function sweepLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r].every(cell => cell !== null)) {
        grid.splice(r, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    if (!cleared) return;
    lines += cleared;
    score += [0, 100, 300, 500, 800][cleared] * level;
    level = Math.floor(lines / 10) + 1;
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      localStorage.setItem('block-drop-best', best);
    }
  }

  function ghostRow() {
    let dy = 0;
    while (!collides(current, 0, dy + 1)) dy++;
    return current.y + dy;
  }

  function hardDrop() {
    while (!collides(current, 0, 1)) current.y++;
    lockPiece();
    if (alive) { draw(); scheduleDrop(); }
  }

  function dropSpeed() {
    return Math.max(80, 800 - (level - 1) * 70);
  }

  function scheduleDrop() {
    clearTimeout(dropHandle);
    if (alive && !paused) dropHandle = setTimeout(gravityTick, dropSpeed());
  }

  function gravityTick() {
    if (!alive || paused) return;
    if (!collides(current, 0, 1)) {
      current.y++;
    } else {
      lockPiece();
    }
    draw();
    scheduleDrop();
  }

  function gameOver() {
    alive = false;
    clearTimeout(dropHandle);
    overlayTitle.textContent = 'Game Over';
    overlayMsg.textContent = `Score: ${score}${score === best && score > 0 ? ' — new best!' : ''}`;
    overlayBtn.textContent = 'Play Again';
    overlay.classList.remove('hidden');
  }

  function reset() {
    clearTimeout(dropHandle);
    grid = makeGrid();
    score = 0; level = 1; lines = 0;
    alive = true; paused = false;
    scoreEl.textContent = 0;
    linesEl.textContent = 0;
    levelEl.textContent = 1;
    overlay.classList.add('hidden');
    nextPiece = spawnPiece();
    current = spawnPiece();
    drawNextPiece();
    scheduleDrop();
    draw();
  }

  function drawCell(context, col, row, color, alpha) {
    const x = col * CW, y = row * CH;
    context.globalAlpha = alpha ?? 1;
    context.fillStyle = color;
    context.fillRect(x + 1, y + 1, CW - 2, CH - 2);
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.fillRect(x + 1, y + 1, CW - 2, 3);
    context.globalAlpha = 1;
  }

  function draw() {
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * CW, 0); ctx.lineTo(i * CW, canvas.height); ctx.stroke();
    }
    for (let i = 1; i < ROWS; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * CH); ctx.lineTo(canvas.width, i * CH); ctx.stroke();
    }

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c]) drawCell(ctx, c, r, grid[r][c]);

    const gy = ghostRow();
    if (gy !== current.y) {
      current.cells.forEach((row, r) =>
        row.forEach((v, c) => { if (v) drawCell(ctx, current.x + c, gy + r, current.color, 0.18); })
      );
    }

    current.cells.forEach((row, r) =>
      row.forEach((v, c) => { if (v) drawCell(ctx, current.x + c, current.y + r, current.color); })
    );
  }

  function drawNextPiece() {
    const ncw = nextCanvas.width / 5;
    const nch = nextCanvas.height / 4;
    nCtx.fillStyle = '#0a0c12';
    nCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    const offX = Math.floor((5 - nextPiece.cells[0].length) / 2);
    const offY = Math.floor((4 - nextPiece.cells.length) / 2);
    nextPiece.cells.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v) return;
        const px = (offX + c) * ncw, py = (offY + r) * nch;
        nCtx.fillStyle = nextPiece.color;
        nCtx.fillRect(px + 1, py + 1, ncw - 2, nch - 2);
        nCtx.fillStyle = 'rgba(255,255,255,0.2)';
        nCtx.fillRect(px + 1, py + 1, ncw - 2, 3);
      })
    );
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'p' || e.key === 'P') {
      if (!alive) return;
      paused = !paused;
      if (paused) {
        clearTimeout(dropHandle);
        overlayTitle.textContent = 'Paused';
        overlayMsg.textContent = 'Press P to resume.';
        overlayBtn.textContent = 'Resume';
        overlay.classList.remove('hidden');
      } else {
        overlay.classList.add('hidden');
        scheduleDrop();
      }
      return;
    }
    if (!alive || paused) return;
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A':
        if (!collides(current, -1, 0)) { current.x--; draw(); }
        e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D':
        if (!collides(current, 1, 0)) { current.x++; draw(); }
        e.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S':
        if (!collides(current, 0, 1)) { current.y++; draw(); scheduleDrop(); }
        e.preventDefault(); break;
      case 'ArrowUp': case 'w': case 'W': {
        const rotated = rotate90(current.cells);
        for (const kick of [0, -1, 1, -2, 2]) {
          if (!collides(current, kick, 0, rotated)) {
            current.cells = rotated;
            current.x += kick;
            draw();
            break;
          }
        }
        e.preventDefault(); break;
      }
      case ' ':
        hardDrop();
        e.preventDefault(); break;
    }
  });

  restartBtn.addEventListener('click', reset);
  overlayBtn.addEventListener('click', () => {
    if (paused) {
      paused = false;
      overlay.classList.add('hidden');
      scheduleDrop();
    } else {
      reset();
    }
  });

  reset();
})();
