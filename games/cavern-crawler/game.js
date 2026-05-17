import { generateLevel, tick, dropBomb, levelName, TILE } from './engine.js';
import { render, CELL } from './renderer.js';

const TICK_MS = 150;
const BEST_SCORE_KEY = 'cavern-crawler-best-score';
const BEST_LEVEL_KEY = 'cavern-crawler-best-level';

// ─── Audio (synth) ─────────────────────────────────────────────────────────
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
function tone(freq, dur, type = 'sine', vol = 0.1) {
  const a = ensureAudio(); if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  osc.connect(g); g.connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur);
}
function chirp(f1, f2, dur, type = 'square', vol = 0.1) {
  const a = ensureAudio(); if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  osc.connect(g); g.connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur);
}
function noiseBurst(dur, vol = 0.18, lowpass = 2500) {
  const a = ensureAudio(); if (!a) return;
  const size = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, size, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / size * 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = lowpass;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(lp); lp.connect(g); g.connect(a.destination);
  src.start();
}
const sfx = {
  dig() { noiseBurst(0.05, 0.07, 1200); },
  crystal() { tone(1320, 0.06, 'sine', 0.08); setTimeout(() => tone(1760, 0.08, 'sine', 0.06), 40); },
  rockFall() { tone(110, 0.07, 'square', 0.07); noiseBurst(0.06, 0.05, 800); },
  rockPush() { tone(170, 0.04, 'square', 0.05); },
  enemyCrush() { noiseBurst(0.22, 0.18, 1200); tone(140, 0.18, 'sawtooth', 0.1); },
  ghostCrush() { chirp(660, 220, 0.25, 'triangle', 0.1); },
  bombPlace() { tone(440, 0.05, 'triangle', 0.06); },
  bombExplode() { noiseBurst(0.45, 0.25, 1800); tone(80, 0.35, 'sawtooth', 0.14); },
  bombPickup() { tone(523, 0.06, 'sine', 0.08); setTimeout(() => tone(659, 0.08, 'sine', 0.08), 50); setTimeout(() => tone(784, 0.1, 'sine', 0.08), 100); },
  magicActivate() { chirp(440, 1320, 0.4, 'sine', 0.1); },
  magicCrystal() { tone(1568, 0.05, 'sine', 0.05); },
  exitOpen() { tone(660, 0.12, 'sine', 0.08); setTimeout(() => tone(880, 0.18, 'sine', 0.08), 90); },
  playerDie() { chirp(440, 80, 0.6, 'sawtooth', 0.13); },
  levelClear() {
    [440, 554, 659, 880, 1109].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sine', 0.1), i * 90));
  },
  timeWarn() { tone(880, 0.08, 'square', 0.07); },
};

// ─── DOM ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('board');
const ctxOverlay = canvas.getContext('2d');

const levelEl = document.getElementById('level');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const livesEl = document.getElementById('lives');
const crystalsEl = document.getElementById('crystals');
const neededEl = document.getElementById('needed');
const bombsEl = document.getElementById('bombs');
const timeEl = document.getElementById('time');
const levelNameEl = document.getElementById('level-name');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');
const overlayBtn = document.getElementById('overlay-btn');
const restartBtn = document.getElementById('restart');

// ─── Game state ────────────────────────────────────────────────────────────
let state;
let pendingInput = null;
let pendingBombDrop = false;
let lastDir = null;
let keysDown = new Set();
let animTick = 0;
let runningScore = 0;
let runningBombInventory = 0;
let currentLevel = 1;
let lives = 3;
let tickHandle = null;
let rafHandle = null;

let bestScore = 0;
let bestLevel = 1;
try {
  bestScore = parseInt(localStorage.getItem(BEST_SCORE_KEY) || '0', 10) || 0;
  bestLevel = parseInt(localStorage.getItem(BEST_LEVEL_KEY) || '1', 10) || 1;
} catch (e) {}

// Particles + shake
const particles = [];
let shake = 0;
let lastTimeWarnAt = -Infinity;

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
  state.bombInventory = runningBombInventory;
  particles.length = 0;
  shake = 0;
  pendingInput = null;
  pendingBombDrop = false;
  lastDir = null;
  hideOverlay();
  updateHud();
  draw();
}

function updateHud() {
  levelEl.textContent = state.level;
  scoreEl.textContent = state.score;
  bestEl.textContent = bestScore;
  livesEl.textContent = state.lives;
  crystalsEl.textContent = state.crystalsCollected;
  neededEl.textContent = state.crystalsNeeded;
  bombsEl.textContent = state.bombInventory;
  timeEl.textContent = state.timeLeft;
  levelNameEl.textContent = levelName(state.level - 1);
}

function trySaveBest() {
  let changed = false;
  if (state.score > bestScore) {
    bestScore = state.score;
    try { localStorage.setItem(BEST_SCORE_KEY, String(bestScore)); } catch (e) {}
    changed = true;
  }
  if (currentLevel > bestLevel) {
    bestLevel = currentLevel;
    try { localStorage.setItem(BEST_LEVEL_KEY, String(bestLevel)); } catch (e) {}
    changed = true;
  }
  if (changed) bestEl.textContent = bestScore;
}

function processEvents(events) {
  if (!events) return;
  for (const ev of events) {
    if (typeof ev === 'string') { handleEvent(ev, null); }
    else { handleEvent(ev.kind, ev); }
  }
}

function handleEvent(kind, ev) {
  switch (kind) {
    case 'dig':
      sfx.dig();
      if (ev) spawnParticles(ev.x, ev.y, 4, '#7a4218', 0.4, 1.2);
      break;
    case 'crystal':
      sfx.crystal();
      if (ev) spawnParticles(ev.x, ev.y, 6, '#d870e8', 0.5, 1.6);
      break;
    case 'rock-push':
      sfx.rockPush();
      break;
    case 'rock-fall':
      sfx.rockFall();
      if (ev) spawnParticles(ev.x, ev.y, 3, '#aab', 0.25, 1.2);
      shake = Math.max(shake, 1.2);
      break;
    case 'enemy-crush':
      sfx.enemyCrush();
      shake = Math.max(shake, 3);
      break;
    case 'ghost-crush':
      sfx.ghostCrush();
      if (ev) spawnParticles(ev.x, ev.y, 10, '#b8f5d0', 0.7, 2);
      shake = Math.max(shake, 2);
      break;
    case 'magic-wall-activate':
      sfx.magicActivate();
      break;
    case 'crystal-from-magic':
      sfx.magicCrystal();
      if (ev) spawnParticles(ev.x, ev.y, 4, '#d870e8', 0.4, 1.4);
      break;
    case 'bomb-place':
      sfx.bombPlace();
      break;
    case 'bomb-pickup':
      sfx.bombPickup();
      if (ev) spawnParticles(ev.x, ev.y, 10, '#ffd066', 0.6, 2);
      break;
    case 'bomb-explode':
      sfx.bombExplode();
      if (ev) spawnParticles(ev.x, ev.y, 24, '#ff8a3a', 0.9, 3);
      shake = Math.max(shake, 9);
      break;
    case 'exit-open':
      sfx.exitOpen();
      break;
    case 'level-clear':
      sfx.levelClear();
      break;
    case 'player-die':
      sfx.playerDie();
      shake = Math.max(shake, 12);
      break;
  }
}

function spawnParticles(tileX, tileY, count, color, life, spread) {
  const cx = tileX * CELL + CELL / 2;
  const cy = tileY * CELL + CELL / 2;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * spread;
    particles.push({
      x: cx + (Math.random() - 0.5) * CELL * 0.4,
      y: cy + (Math.random() - 0.5) * CELL * 0.4,
      vx: Math.cos(angle) * speed * CELL * 0.25,
      vy: Math.sin(angle) * speed * CELL * 0.25 - CELL * 0.15,
      life,
      maxLife: life,
      color,
      size: 2 + Math.random() * 2,
    });
  }
}

function draw() {
  render(canvas, state, animTick);
  drawParticlesOnCanvas();
  updateHud();
}

function drawParticlesOnCanvas() {
  const ctx = canvas.getContext('2d');
  for (const p of particles) {
    const alpha = Math.min(1, p.life / 0.3);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function loop() {
  const inputDir = pendingInput || dirFromKeys();
  pendingInput = null;

  if (pendingBombDrop) {
    state = dropBomb(state);
    pendingBombDrop = false;
    processEvents(state.events);
  }

  state = tick(state, inputDir);
  processEvents(state.events);
  updateHud();

  if (state.timeLeft > 0 && state.timeLeft <= 10 && animTick - lastTimeWarnAt > 14) {
    sfx.timeWarn();
    lastTimeWarnAt = animTick;
  }

  if (state.status === 'won') {
    runningScore = state.score + Math.max(0, state.timeLeft) * 2 + 50;
    runningBombInventory = state.bombInventory;
    lives = state.lives;
    state.score = runningScore;
    trySaveBest();
    stopLoop();
    currentLevel++;
    if (currentLevel > bestLevel) {
      bestLevel = currentLevel;
      try { localStorage.setItem(BEST_LEVEL_KEY, String(bestLevel)); } catch (e) {}
    }
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
    trySaveBest();
    if (window.GD) window.GD.record('cavern-crawler', runningScore, 'score');
    stopLoop();
    showOverlay('Game Over', `Final score: ${runningScore} · Best: ${bestScore}`, 'Play Again', resetGame);
    return;
  }
}

function animLoop() {
  animTick++;
  // Update particles each animation frame
  for (const p of particles) {
    p.x += p.vx * (1 / 60);
    p.y += p.vy * (1 / 60);
    p.vy += 220 * (1 / 60);
    p.vx *= 0.97;
    p.life -= 1 / 60;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
  // Decay shake
  if (shake > 0) {
    shake *= 0.86;
    if (shake < 0.1) shake = 0;
  }
  if (state) {
    // Apply screen shake via translation
    const ctx = canvas.getContext('2d');
    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;
    ctx.save();
    ctx.translate(sx, sy);
    render(canvas, state, animTick);
    drawParticlesOnCanvas();
    ctx.restore();
  }
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
  runningBombInventory = 0;
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
  if (e.key === ' ' || e.key === 'b' || e.key === 'B') {
    pendingBombDrop = true;
    ensureAudio();
  }
});

document.addEventListener('keyup', e => {
  keysDown.delete(e.key);
  lastDir = dirFromKeys();
});

restartBtn.addEventListener('click', resetGame);

resetGame();
animLoop();
