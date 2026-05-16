import { generateLevel, tick, levelName } from './engine.js';
import { render } from './renderer.js';

const TICK_MS = 150;

const canvas = document.getElementById('board');
const levelEl = document.getElementById('level');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const crystalsEl = document.getElementById('crystals');
const neededEl = document.getElementById('needed');
const timeEl = document.getElementById('time');
const levelNameEl = document.getElementById('level-name');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');
const overlayBtn = document.getElementById('overlay-btn');
const restartBtn = document.getElementById('restart');

let state;
let pendingInput = null;
let lastDir = null;
let keysDown = new Set();
let animTick = 0;
let runningScore = 0;
let currentLevel = 1;
let lives = 3;
let tickHandle = null;
let rafHandle = null;

function dirFromKeys() {
  if (keysDown.has('ArrowUp') || keysDown.has('w') || keysDown.has('W')) return 'up';
  if (keysDown.has('ArrowDown') || keysDown.has('s') || keysDown.has('S')) return 'down';
  if (keysDown.has('ArrowLeft') || keysDown.has('a') || keysDown.has('A')) return 'left';
  if (keysDown.has('ArrowRight') || keysDown.has('d') || keysDown.has('D')) return 'right';
  return null;
}

function startLevel(levelNum) {
  state = generateLevel(levelNum, lives);
  state.score = runningScore;
  pendingInput = null;
  lastDir = null;
  hideOverlay();
  updateHud();
  draw();
}

function updateHud() {
  levelEl.textContent = state.level;
  scoreEl.textContent = state.score;
  livesEl.textContent = state.lives;
  crystalsEl.textContent = state.crystalsCollected;
  neededEl.textContent = state.crystalsNeeded;
  timeEl.textContent = state.timeLeft;
  levelNameEl.textContent = levelName(state.level - 1);
}

function draw() {
  render(canvas, state, animTick);
  updateHud();
}

function loop() {
  const inputDir = pendingInput || dirFromKeys();
  pendingInput = null;
  state = tick(state, inputDir);

  if (state.status === 'won') {
    runningScore = state.score + Math.max(0, state.timeLeft) * 2 + 50;
    lives = state.lives;
    stopLoop();
    currentLevel++;
    showOverlay(
      `Level ${currentLevel - 1} Cleared`,
      `Bonus: +${Math.max(0, state.timeLeft) * 2 + 50}. Score: ${runningScore}.`,
      'Next Level',
      () => { startLevel(currentLevel); startLoop(); },
    );
    return;
  }

  if (state.status === 'dead') {
    lives = state.lives;
    stopLoop();
    showOverlay('You died', `Lives left: ${state.lives}`, 'Retry', () => { startLevel(currentLevel); startLoop(); });
    return;
  }

  if (state.status === 'gameover') {
    runningScore = state.score;
    stopLoop();
    showOverlay('Game Over', `Final score: ${runningScore}`, 'Play Again', resetGame);
    return;
  }

  draw();
}

function animLoop() {
  animTick++;
  if (state) render(canvas, state, animTick);
  rafHandle = requestAnimationFrame(animLoop);
}

function startLoop() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(loop, TICK_MS);
}

function stopLoop() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
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

function resetGame() {
  runningScore = 0;
  lives = 3;
  currentLevel = 1;
  startLevel(1);
  startLoop();
}

document.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keysDown.add(e.key);
  const d = dirFromKeys();
  if (d && d !== lastDir) {
    pendingInput = d;
    lastDir = d;
  }
});

document.addEventListener('keyup', e => {
  keysDown.delete(e.key);
  lastDir = dirFromKeys();
});

restartBtn.addEventListener('click', resetGame);

resetGame();
animLoop();
