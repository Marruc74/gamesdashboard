(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const minesEl = document.getElementById('mines');
  const timerEl = document.getElementById('timer');
  const restartBtn = document.getElementById('restart');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');

  const DIFFICULTIES = {
    easy:   { cols: 9,  rows: 9,  mines: 10 },
    medium: { cols: 16, rows: 16, mines: 40 },
    hard:   { cols: 22, rows: 22, mines: 80 },
  };

  const NUM_COLORS = ['', '#6eb5ff', '#3ddc97', '#ff5d6c', '#b07cff', '#ff8c42', '#00c8c8', '#ff9fdf', '#9aa0b4'];

  let cols, rows, mineCount, CELL;
  let grid, revealed, flagged, minesLeft, alive, started, seconds, timerInterval;
  let hoverCell = null;
  let difficulty = 'easy';

  function setDifficulty(d) {
    difficulty = d;
    const cfg = DIFFICULTIES[d];
    cols = cfg.cols;
    rows = cfg.rows;
    mineCount = cfg.mines;
    CELL = canvas.width / cols;
    reset();
  }

  function reset() {
    if (timerInterval) clearInterval(timerInterval);
    seconds = 0;
    timerEl.textContent = '0';

    grid     = Array.from({ length: rows }, () => new Array(cols).fill(0));
    revealed = Array.from({ length: rows }, () => new Array(cols).fill(false));
    flagged  = Array.from({ length: rows }, () => new Array(cols).fill(false));
    minesLeft = mineCount;
    alive = true;
    started = false;
    hoverCell = null;
    minesEl.textContent = minesLeft;
    overlay.classList.add('hidden');
    draw();
  }

  function placeMines(safeR, safeC) {
    const excluded = new Set();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = safeR + dr, c = safeC + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) excluded.add(r * cols + c);
      }
    }

    let placed = 0;
    while (placed < mineCount) {
      const idx = Math.floor(Math.random() * rows * cols);
      const r = Math.floor(idx / cols), c = idx % cols;
      if (!excluded.has(idx) && grid[r][c] !== -1) {
        grid[r][c] = -1;
        placed++;
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === -1) continue;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === -1) n++;
          }
        grid[r][c] = n;
      }
    }
  }

  function floodReveal(r, c) {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    if (revealed[r][c] || flagged[r][c]) return;
    revealed[r][c] = true;
    if (grid[r][c] === 0) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr !== 0 || dc !== 0) floodReveal(r + dr, c + dc);
    }
  }

  function checkWin() {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (grid[r][c] !== -1 && !revealed[r][c]) return false;
    return true;
  }

  function revealAllMines() {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (grid[r][c] === -1) revealed[r][c] = true;
  }

  function getCellAt(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const col = Math.floor((e.clientX - rect.left) * sx / CELL);
    const row = Math.floor((e.clientY - rect.top) * sy / CELL);
    return { row, col };
  }

  function handleClick(e) {
    if (!alive) return;
    const { row, col } = getCellAt(e);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    if (revealed[row][col] || flagged[row][col]) return;

    if (!started) {
      started = true;
      placeMines(row, col);
      timerInterval = setInterval(() => { seconds++; timerEl.textContent = seconds; }, 1000);
    }

    if (grid[row][col] === -1) {
      revealed[row][col] = true;
      alive = false;
      clearInterval(timerInterval);
      revealAllMines();
      draw();
      setTimeout(() => {
        overlayTitle.textContent = 'Boom!';
        overlayMsg.textContent = `You hit a mine after ${seconds}s.`;
        overlay.classList.remove('hidden');
      }, 350);
      return;
    }

    floodReveal(row, col);

    if (checkWin()) {
      alive = false;
      clearInterval(timerInterval);
      if (window.GD) window.GD.record('minesweeper', seconds, 'time');
      draw();
      setTimeout(() => {
        overlayTitle.textContent = 'Cleared!';
        overlayMsg.textContent = `You won in ${seconds}s.`;
        overlay.classList.remove('hidden');
      }, 200);
      return;
    }

    draw();
  }

  function handleRightClick(e) {
    e.preventDefault();
    if (!alive || !started) return;
    const { row, col } = getCellAt(e);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    if (revealed[row][col]) return;
    flagged[row][col] = !flagged[row][col];
    minesLeft += flagged[row][col] ? -1 : 1;
    minesEl.textContent = minesLeft;
    draw();
  }

  function handleMouseMove(e) {
    const { row, col } = getCellAt(e);
    const valid = row >= 0 && row < rows && col >= 0 && col < cols;
    const next = valid && !revealed[row][col] ? `${row},${col}` : null;
    const prev = hoverCell ? `${hoverCell.r},${hoverCell.c}` : null;
    if (next !== prev) {
      hoverCell = next ? { r: row, c: col } : null;
      draw();
    }
  }

  function handleMouseLeave() {
    if (hoverCell) { hoverCell = null; draw(); }
  }

  // ── Drawing ──────────────────────────────────────────────────

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        drawCell(r, c);
  }

  function drawCell(r, c) {
    const x = c * CELL;
    const y = r * CELL;
    const PAD = CELL > 20 ? 2 : 1;

    if (revealed[r][c]) {
      ctx.fillStyle = grid[r][c] === -1 ? '#3d0f0f' : '#0d111c';
      ctx.fillRect(x + PAD, y + PAD, CELL - PAD * 2, CELL - PAD * 2);

      if (grid[r][c] === -1) {
        drawMine(x + CELL / 2, y + CELL / 2, CELL * 0.26);
      } else if (grid[r][c] > 0) {
        ctx.fillStyle = NUM_COLORS[grid[r][c]];
        ctx.font = `bold ${Math.max(9, Math.floor(CELL * 0.52))}px "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(grid[r][c], x + CELL / 2, y + CELL / 2);
      }
    } else {
      const isHover = hoverCell && hoverCell.r === r && hoverCell.c === c;
      ctx.fillStyle = isHover ? '#252e47' : '#1c2235';
      ctx.fillRect(x + PAD, y + PAD, CELL - PAD * 2, CELL - PAD * 2);

      // Subtle top-left bevel
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      ctx.fillRect(x + PAD, y + PAD, CELL - PAD * 2, 2);
      ctx.fillRect(x + PAD, y + PAD, 2, CELL - PAD * 2);

      if (flagged[r][c]) drawFlag(x + CELL / 2, y + CELL / 2, CELL * 0.28);
    }
  }

  function drawMine(cx, cy, size) {
    ctx.shadowColor = 'rgba(255,93,108,0.55)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff5d6c';
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Spikes
    ctx.strokeStyle = '#ff5d6c';
    ctx.lineWidth = Math.max(1, size * 0.22);
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * size * 0.85, cy + Math.sin(a) * size * 0.85);
      ctx.lineTo(cx + Math.cos(a) * size * 1.6, cy + Math.sin(a) * size * 1.6);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(cx - size * 0.28, cy - size * 0.28, size * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlag(cx, cy, size) {
    // Pole
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(cx - size * 0.1, cy - size, size * 0.2, size * 1.9);

    // Flag
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.1, cy - size);
    ctx.lineTo(cx + size * 0.95, cy - size * 0.45);
    ctx.lineTo(cx - size * 0.1, cy + size * 0.1);
    ctx.closePath();
    ctx.fill();
  }

  // ── Events ───────────────────────────────────────────────────

  document.querySelectorAll('input[name="diff"]').forEach(radio => {
    radio.addEventListener('change', () => setDifficulty(radio.value));
  });

  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('contextmenu', handleRightClick);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  restartBtn.addEventListener('click', () => setDifficulty(difficulty));
  overlayBtn.addEventListener('click', () => setDifficulty(difficulty));

  setDifficulty('easy');
})();
