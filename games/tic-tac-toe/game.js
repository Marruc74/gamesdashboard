(() => {
  const cells = Array.from(document.querySelectorAll('.cell'));
  const statusEl = document.getElementById('status');
  const resetBtn = document.getElementById('reset');
  const scoreX = document.getElementById('score-x');
  const scoreO = document.getElementById('score-o');
  const scoreD = document.getElementById('score-d');
  const modeInputs = document.querySelectorAll('input[name="mode"]');

  const WIN_LINES = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6],
  ];

  let board, turn, gameOver, scores = { X: 0, O: 0, D: 0 }, mode = 'pvp';

  function reset() {
    board = Array(9).fill(null);
    turn = 'X';
    gameOver = false;
    cells.forEach(c => {
      c.textContent = '';
      c.disabled = false;
      c.classList.remove('x', 'o', 'win');
    });
    updateStatus();
  }

  function updateStatus() {
    if (gameOver) return;
    statusEl.innerHTML = `<span class="${turn.toLowerCase()}">${turn}</span>'s turn`;
  }

  function checkWin(b, player) {
    for (const line of WIN_LINES) {
      if (line.every(i => b[i] === player)) return line;
    }
    return null;
  }

  function play(i) {
    if (gameOver || board[i]) return;
    board[i] = turn;
    cells[i].textContent = turn;
    cells[i].classList.add(turn.toLowerCase());
    cells[i].disabled = true;

    const win = checkWin(board, turn);
    if (win) return endGame(turn, win);
    if (board.every(v => v)) return endGame(null);

    turn = turn === 'X' ? 'O' : 'X';
    updateStatus();

    if (mode === 'cpu' && turn === 'O' && !gameOver) {
      setTimeout(cpuMove, 350);
    }
  }

  function endGame(winner, line) {
    gameOver = true;
    cells.forEach(c => c.disabled = true);
    if (winner) {
      scores[winner]++;
      line.forEach(i => cells[i].classList.add('win'));
      statusEl.innerHTML = `<span class="${winner.toLowerCase()}">${winner}</span> wins!`;
    } else {
      scores.D++;
      statusEl.textContent = "It's a draw.";
    }
    scoreX.textContent = scores.X;
    scoreO.textContent = scores.O;
    scoreD.textContent = scores.D;
  }

  function cpuMove() {
    const best = minimax(board, 'O').index;
    if (best !== undefined) play(best);
  }

  function minimax(b, player) {
    const empty = b.map((v, i) => v ? null : i).filter(v => v !== null);

    if (checkWin(b, 'X')) return { score: -10 };
    if (checkWin(b, 'O')) return { score: 10 };
    if (empty.length === 0) return { score: 0 };

    const moves = [];
    for (const i of empty) {
      const next = b.slice();
      next[i] = player;
      const result = minimax(next, player === 'O' ? 'X' : 'O');
      moves.push({ index: i, score: result.score });
    }

    if (player === 'O') {
      return moves.reduce((a, b) => b.score > a.score ? b : a);
    } else {
      return moves.reduce((a, b) => b.score < a.score ? b : a);
    }
  }

  cells.forEach(c => c.addEventListener('click', () => play(parseInt(c.dataset.i, 10))));
  resetBtn.addEventListener('click', reset);
  modeInputs.forEach(r => r.addEventListener('change', e => {
    mode = e.target.value;
    reset();
  }));

  reset();
})();
