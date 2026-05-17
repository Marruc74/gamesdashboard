(() => {
  // ─── Constants ───────────────────────────────────────────────────────────
  const W = 720;
  const H = 380;
  const ARENA_INSET = 12;
  const GOAL_HEIGHT = 130;
  const PLAYER_R = 14;
  const BALL_R = 7;
  const PLAYER_ACCEL = 1100;
  const PLAYER_MAX = 230;
  const FRICTION = 5;
  const BALL_FRICTION = 1.5;
  const CARRY_DIST = PLAYER_R + BALL_R - 2;
  const PICKUP_COOLDOWN = 0.4;
  const STUN_DURATION = 1.0;
  const CHECK_THRESHOLD = 180;
  const MATCH_TIME = 90;
  const GOALS_TO_WIN = 5;

  const KICK_MIN_SPEED = 300;
  const KICK_MAX_SPEED = 700;
  const KICK_FULL_CHARGE_MS = 700;

  const BUMPER_R = 14;
  const BUMPER_BOOST = 1.35;

  const POWERUP_R = 12;
  const POWERUP_SPAWN_INTERVAL = 8;
  const POWERUP_LIFETIME = 10;
  const POWERUP_DURATION = 6;

  const REPLAY_BUFFER_SIZE = 90;  // ~1.5s at 60fps
  const REPLAY_SPEED = 0.35;
  const REPLAY_MAX_TICKS = 130;

  const TOURNAMENT_MATCHES = 5;
  const TOURNAMENT_DIFFICULTIES = ['easy', 'easy', 'normal', 'normal', 'hard'];

  const BEST_WINS_KEY = 'brawlball-wins';
  const TOURNAMENT_WINS_KEY = 'brawlball-tournaments';

  const POWERUP_INFO = {
    speed:      { letter: 'S', color: '#69db7c', label: 'SPEED' },
    multiplier: { letter: 'x2', color: '#ffd066', label: 'x2 GOAL' },
    magnet:     { letter: 'M', color: '#22d3ee', label: 'MAGNET' },
    shield:     { letter: 'D', color: '#b197fc', label: 'SHIELD' },
  };
  const POWERUP_KEYS = Object.keys(POWERUP_INFO);

  // ─── DOM ─────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('board');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const score1El = document.getElementById('score-1');
  const score2El = document.getElementById('score-2');
  const timeEl = document.getElementById('time');
  const winsEl = document.getElementById('wins');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayActions = document.querySelector('#overlay .panel-actions');
  const restartBtn = document.getElementById('restart');
  const team2Label = document.querySelector('.team-foe');

  // ─── Audio ───────────────────────────────────────────────────────────────
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.1) {
    const a = ensureAudio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  }
  function chirp(f1, f2, dur, type = 'square', vol = 0.1) {
    const a = ensureAudio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  }
  function noiseBurst(dur, vol = 0.18, lp = 2000) {
    const a = ensureAudio(); if (!a) return;
    const size = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, size, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < size; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / size * 4);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start();
  }
  const sfx = {
    kickSoft() { tone(280, 0.05, 'triangle', 0.07); },
    kickCharged() { tone(140, 0.09, 'sawtooth', 0.13); noiseBurst(0.07, 0.1, 1800); },
    chargeTick() { tone(660, 0.03, 'square', 0.04); },
    pickup() { tone(540, 0.04, 'triangle', 0.08); setTimeout(() => tone(720, 0.06, 'triangle', 0.07), 30); },
    bounce() { tone(320, 0.04, 'triangle', 0.06); },
    bumper() { tone(880, 0.05, 'sine', 0.08); tone(1320, 0.06, 'sine', 0.06); },
    powerupSpawn() { chirp(880, 1320, 0.3, 'sine', 0.06); },
    powerupGrab() {
      tone(523, 0.06, 'sine', 0.08);
      setTimeout(() => tone(784, 0.08, 'sine', 0.08), 50);
      setTimeout(() => tone(1046, 0.1, 'sine', 0.08), 110);
    },
    bodyCheck() { noiseBurst(0.18, 0.22, 800); tone(80, 0.15, 'sawtooth', 0.14); },
    stun() { chirp(330, 110, 0.3, 'sawtooth', 0.1); },
    goalYou() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sine', 0.11), i * 90)); },
    goalFoe() { chirp(660, 165, 0.7, 'sawtooth', 0.12); },
    whistle() { chirp(880, 1320, 0.4, 'square', 0.08); },
    timeTick() { tone(880, 0.06, 'square', 0.06); },
    matchEndWin() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'sine', 0.12), i * 110)); },
    matchEndLose() { chirp(440, 80, 0.9, 'sawtooth', 0.13); },
    overtime() { tone(880, 0.2, 'square', 0.12); setTimeout(() => tone(1320, 0.25, 'square', 0.12), 220); },
    cup() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sine', 0.14), i * 150)); },
  };

  // ─── State ───────────────────────────────────────────────────────────────
  let players;
  let ball;
  let bumpers;
  let powerups;
  let powerupSpawnTimer;
  let score;
  let timeLeft;
  let lastTimeWarn;
  let status;          // 'menu' | 'playing' | 'celebrating' | 'matchOver' | 'overtime' | 'replay'
  let mode;            // 'pvc' | 'pvp' | 'tournament'
  let difficulty;      // 'easy' | 'normal' | 'hard'
  let tournament;      // { matchNum, wins, losses, completed }
  let celebrateUntil;
  let scorer;
  let particles;
  let wins;
  let tournamentWins;
  let shake;
  let lastTime;
  let chargeP1, chargeP2; // { active, start }
  let ballTrail;
  let replay;          // { active, buffer, index, tick }
  let inOvertime;

  try { wins = parseInt(localStorage.getItem(BEST_WINS_KEY) || '0', 10) || 0; } catch (e) { wins = 0; }
  try { tournamentWins = parseInt(localStorage.getItem(TOURNAMENT_WINS_KEY) || '0', 10) || 0; } catch (e) { tournamentWins = 0; }
  winsEl.textContent = wins;

  const keys = Object.create(null);

  function arenaBounds() {
    return { left: ARENA_INSET, right: W - ARENA_INSET, top: ARENA_INSET, bottom: H - ARENA_INSET };
  }
  function goalRect(side) {
    const b = arenaBounds();
    const cy = (b.top + b.bottom) / 2;
    const top = cy - GOAL_HEIGHT / 2;
    const bot = cy + GOAL_HEIGHT / 2;
    if (side === 0) return { x: 0, y: top, w: ARENA_INSET + 2, h: bot - top };
    return { x: W - ARENA_INSET - 2, y: top, w: ARENA_INSET + 2, h: bot - top };
  }

  function setupArena() {
    bumpers = [
      { x: W * 0.32, y: H * 0.32, hitTimer: 0 },
      { x: W * 0.68, y: H * 0.68, hitTimer: 0 },
      { x: W * 0.32, y: H * 0.68, hitTimer: 0 },
      { x: W * 0.68, y: H * 0.32, hitTimer: 0 },
    ];
    powerups = [];
    powerupSpawnTimer = 3;
  }

  function resetPositions() {
    const b = arenaBounds();
    const cy = (b.top + b.bottom) / 2;
    players = [
      { team: 0, name: 'YOU', x: b.left + 80, y: cy, vx: 0, vy: 0, stun: 0, color: '#4dabf7', dark: '#1f6ea8',
        effects: { speedUntil: 0, scoreMul: 1, magnetUntil: 0, shieldUntil: 0 } },
      { team: 1, name: mode === 'pvp' ? 'P2' : 'CPU', x: b.right - 80, y: cy, vx: 0, vy: 0, stun: 0, color: '#ff5d6c', dark: '#a52a36',
        effects: { speedUntil: 0, scoreMul: 1, magnetUntil: 0, shieldUntil: 0 } },
    ];
    ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, holder: null, pickupCooldown: 0 };
    ballTrail = [];
  }

  function startMatch(opts) {
    mode = opts.mode || 'pvc';
    difficulty = opts.difficulty || 'normal';
    score = [0, 0];
    timeLeft = MATCH_TIME;
    lastTimeWarn = -1;
    inOvertime = false;
    chargeP1 = { active: false, start: 0 };
    chargeP2 = { active: false, start: 0 };
    setupArena();
    resetPositions();
    if (team2Label) team2Label.firstChild.textContent = (mode === 'pvp' ? 'P2 ' : 'CPU ');
    status = 'playing';
    particles = [];
    replay = { active: false, buffer: [], index: 0, tick: 0 };
    shake = 0;
    sfx.whistle();
    updateHud();
    hideOverlay();
  }

  function updateHud() {
    score1El.textContent = score[0];
    score2El.textContent = score[1];
    timeEl.textContent = inOvertime ? 'OT' : Math.max(0, Math.ceil(timeLeft));
    winsEl.textContent = wins;
  }

  function showOverlay(title, msg, actions) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlayActions.innerHTML = '';
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.textContent = a.label;
      if (a.secondary) btn.className = 'btn-secondary';
      btn.onclick = () => { ensureAudio(); a.onClick(); };
      overlayActions.appendChild(btn);
    }
    const quit = document.createElement('a');
    quit.className = 'btn-secondary';
    quit.href = '../../index.html';
    quit.textContent = 'Quit to Dashboard';
    overlayActions.appendChild(quit);
    overlay.classList.remove('hidden');
  }

  function hideOverlay() { overlay.classList.add('hidden'); }

  function showMainMenu() {
    status = 'menu';
    setupArena();
    resetPositions();
    score = [0, 0];
    timeLeft = MATCH_TIME;
    particles = [];
    shake = 0;
    showOverlay(
      'Brawlball',
      `Pickup ball, score in blue goal. Hold Space for charged shot, ram opponents to stun. Lifetime wins: ${wins} · Cups won: ${tournamentWins}.`,
      [
        { label: 'Easy', onClick: () => startMatch({ mode: 'pvc', difficulty: 'easy' }) },
        { label: 'Normal', onClick: () => startMatch({ mode: 'pvc', difficulty: 'normal' }) },
        { label: 'Hard', onClick: () => startMatch({ mode: 'pvc', difficulty: 'hard' }) },
        { label: '2 Players', onClick: () => startMatch({ mode: 'pvp' }) },
        { label: 'Tournament', onClick: startTournament },
      ],
    );
  }

  function startTournament() {
    tournament = { matchNum: 1, wins: 0, losses: 0 };
    startMatch({ mode: 'tournament', difficulty: TOURNAMENT_DIFFICULTIES[0] });
  }

  // ─── Input ───────────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    const k = e.key.toLowerCase();
    const wasPressed = keys[k];
    keys[k] = true;
    if (!wasPressed) {
      if (k === ' ') {
        ensureAudio();
        if (canKick(0)) startCharge(0);
      }
      if ((k === 'enter' || k === '/') && mode === 'pvp') {
        ensureAudio();
        if (canKick(1)) startCharge(1);
      }
    }
  });
  document.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if (k === ' ' && chargeP1.active) releaseKick(0);
    if ((k === 'enter' || k === '/') && chargeP2.active) releaseKick(1);
  });

  function canKick(team) {
    if (status !== 'playing') return false;
    if (mode === 'pvp' && team === 1) {
      return ball.holder === players[1];
    }
    if (team === 0) return ball.holder === players[0];
    return false;
  }

  function startCharge(team) {
    const ch = team === 0 ? chargeP1 : chargeP2;
    ch.active = true;
    ch.start = performance.now();
  }

  function releaseKick(team) {
    const ch = team === 0 ? chargeP1 : chargeP2;
    if (!ch.active) return;
    const held = performance.now() - ch.start;
    const t = Math.min(held / KICK_FULL_CHARGE_MS, 1);
    const speed = KICK_MIN_SPEED + (KICK_MAX_SPEED - KICK_MIN_SPEED) * t;
    ch.active = false;
    kickBall(team, speed, t);
  }

  function p1Input() {
    let dx = 0, dy = 0;
    // In pvp mode P1 uses WASD only; in solo P1 also accepts arrows.
    if (keys['a']) dx -= 1;
    if (keys['d']) dx += 1;
    if (keys['w']) dy -= 1;
    if (keys['s']) dy += 1;
    if (mode !== 'pvp') {
      if (keys['arrowleft']) dx -= 1;
      if (keys['arrowright']) dx += 1;
      if (keys['arrowup']) dy -= 1;
      if (keys['arrowdown']) dy += 1;
    }
    if (dx !== 0 && dy !== 0) { const k = 1 / Math.SQRT2; dx *= k; dy *= k; }
    return { dx, dy };
  }
  function p2Input() {
    let dx = 0, dy = 0;
    if (keys['arrowleft']) dx -= 1;
    if (keys['arrowright']) dx += 1;
    if (keys['arrowup']) dy -= 1;
    if (keys['arrowdown']) dy += 1;
    if (dx !== 0 && dy !== 0) { const k = 1 / Math.SQRT2; dx *= k; dy *= k; }
    return { dx, dy };
  }

  function kickBall(team, speed, chargeT) {
    const p = players[team];
    if (ball.holder !== p) return;
    let dx, dy;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 30) {
      dx = p.vx / sp; dy = p.vy / sp;
    } else {
      const goal = goalRect(1 - team);
      const gx = goal.x + goal.w / 2;
      const gy = goal.y + goal.h / 2;
      const d = Math.hypot(gx - p.x, gy - p.y);
      dx = (gx - p.x) / d; dy = (gy - p.y) / d;
    }
    releaseBall(p, dx * speed + p.vx * 0.4, dy * speed + p.vy * 0.4);
    if (chargeT > 0.4) sfx.kickCharged(); else sfx.kickSoft();
  }

  function releaseBall(p, vx, vy) {
    ball.holder = null;
    ball.vx = vx;
    ball.vy = vy;
    const sp = Math.hypot(vx, vy) || 1;
    ball.x = p.x + (vx / sp) * (PLAYER_R + BALL_R + 2);
    ball.y = p.y + (vy / sp) * (PLAYER_R + BALL_R + 2);
    ball.pickupCooldown = PICKUP_COOLDOWN;
  }

  // ─── AI ──────────────────────────────────────────────────────────────────
  function aiTune() {
    if (difficulty === 'easy')   return { shootDist: 320, react: 0.85, checkChance: 0.3 };
    if (difficulty === 'hard')   return { shootDist: 200, react: 1.0,  checkChance: 0.85 };
    return { shootDist: 240, react: 0.95, checkChance: 0.6 };
  }
  function aiDecision() {
    const ai = players[1];
    const foe = players[0];
    const tune = aiTune();
    if (ai.stun > 0) return { dx: 0, dy: 0, kick: false };

    let dx = 0, dy = 0;

    // 1. Grab a free power-up if it's close-ish (in AI's half)
    if (powerups.length && ball.holder !== ai) {
      const p = powerups[0];
      const d = Math.hypot(p.x - ai.x, p.y - ai.y);
      if (d < 200 && Math.abs(p.x - foe.x) > 60) {
        return { dx: (p.x - ai.x) / d, dy: (p.y - ai.y) / d, kick: false };
      }
    }

    if (ball.holder === ai) {
      const goal = goalRect(0);
      const gx = goal.x + goal.w / 2;
      const gy = goal.y + goal.h / 2;
      const dist = Math.hypot(gx - ai.x, gy - ai.y);
      if (dist < tune.shootDist) {
        return { dx: 0, dy: 0, kick: true, kickDx: (gx - ai.x) / dist, kickDy: (gy - ai.y) / dist };
      }
      dx = (gx - ai.x) / dist;
      dy = (gy - ai.y) / dist;
      const fdx = foe.x - ai.x;
      const fdy = foe.y - ai.y;
      const fd = Math.hypot(fdx, fdy);
      if (fd < 90) {
        dx -= fdy / fd * 0.4;
        dy += fdx / fd * 0.4;
        const nd = Math.hypot(dx, dy);
        if (nd > 0) { dx /= nd; dy /= nd; }
      }
    } else if (ball.holder === foe) {
      const ownGoal = goalRect(1);
      const og = { x: ownGoal.x + ownGoal.w / 2, y: ownGoal.y + ownGoal.h / 2 };
      const tx = foe.x * 0.55 + og.x * 0.45;
      const ty = foe.y * 0.55 + og.y * 0.45;
      const d = Math.hypot(tx - ai.x, ty - ai.y);
      if (d > 10) { dx = (tx - ai.x) / d; dy = (ty - ai.y) / d; }
      const fdx = foe.x - ai.x;
      const fdy = foe.y - ai.y;
      const fd = Math.hypot(fdx, fdy);
      if (fd < 140 && Math.random() < tune.checkChance * 0.06) {
        dx = fdx / fd; dy = fdy / fd;
      }
    } else {
      const d = Math.hypot(ball.x - ai.x, ball.y - ai.y);
      if (d > 1) { dx = (ball.x - ai.x) / d; dy = (ball.y - ai.y) / d; }
    }
    // React rate scales the input
    dx *= tune.react;
    dy *= tune.react;
    return { dx, dy, kick: false };
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  function effectiveMaxSpeed(p) {
    const t = performance.now();
    return t < p.effects.speedUntil ? PLAYER_MAX * 1.5 : PLAYER_MAX;
  }
  function applyMovement(p, dx, dy, dt) {
    if (p.stun > 0) {
      p.stun -= dt;
      p.vx *= Math.exp(-FRICTION * dt);
      p.vy *= Math.exp(-FRICTION * dt);
    } else {
      p.vx += dx * PLAYER_ACCEL * dt;
      p.vy += dy * PLAYER_ACCEL * dt;
      p.vx *= Math.exp(-FRICTION * dt);
      p.vy *= Math.exp(-FRICTION * dt);
      const cap = effectiveMaxSpeed(p);
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > cap) { p.vx = (p.vx / sp) * cap; p.vy = (p.vy / sp) * cap; }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  function clampPlayer(p) {
    const b = arenaBounds();
    if (p.x < b.left + PLAYER_R) { p.x = b.left + PLAYER_R; p.vx = Math.abs(p.vx) * 0.4; }
    if (p.x > b.right - PLAYER_R) { p.x = b.right - PLAYER_R; p.vx = -Math.abs(p.vx) * 0.4; }
    if (p.y < b.top + PLAYER_R) { p.y = b.top + PLAYER_R; p.vy = Math.abs(p.vy) * 0.4; }
    if (p.y > b.bottom - PLAYER_R) { p.y = b.bottom - PLAYER_R; p.vy = -Math.abs(p.vy) * 0.4; }
  }
  function resolvePlayerBumper(p) {
    for (const bp of bumpers) {
      const dx = p.x - bp.x;
      const dy = p.y - bp.y;
      const d = Math.hypot(dx, dy);
      const minDist = PLAYER_R + BUMPER_R;
      if (d < minDist && d > 0) {
        const nx = dx / d, ny = dy / d;
        const push = minDist - d;
        p.x += nx * push;
        p.y += ny * push;
        const along = p.vx * nx + p.vy * ny;
        if (along < 0) {
          p.vx -= along * nx * 1.1;
          p.vy -= along * ny * 1.1;
        }
      }
    }
  }

  function update(dt) {
    if (status === 'replay') {
      replay.tick++;
      replay.index = Math.min(replay.buffer.length - 1, replay.index + REPLAY_SPEED);
      updateParticles(dt);
      if (replay.index >= replay.buffer.length - 1 || replay.tick > REPLAY_MAX_TICKS) {
        finishReplay();
      }
      return;
    }
    if (status === 'celebrating') {
      updateParticles(dt);
      if (performance.now() > celebrateUntil) {
        resetPositions();
        status = 'playing';
      }
      return;
    }
    if (status !== 'playing') return;

    // Inputs
    const { dx: p1dx, dy: p1dy } = p1Input();
    applyMovement(players[0], p1dx, p1dy, dt);

    if (mode === 'pvp') {
      const { dx, dy } = p2Input();
      applyMovement(players[1], dx, dy, dt);
    } else {
      const ai = aiDecision();
      applyMovement(players[1], ai.dx, ai.dy, dt);
      if (ai.kick && ball.holder === players[1]) {
        releaseBall(players[1], ai.kickDx * KICK_MAX_SPEED * 0.85 + players[1].vx * 0.4, ai.kickDy * KICK_MAX_SPEED * 0.85 + players[1].vy * 0.4);
        sfx.kickCharged();
      }
    }

    for (const p of players) {
      clampPlayer(p);
      resolvePlayerBumper(p);
    }

    // Player-player collision
    collidePlayers();

    // Bumpers ↔ ball
    for (const bp of bumpers) {
      if (bp.hitTimer > 0) bp.hitTimer -= dt;
      const dx = ball.x - bp.x;
      const dy = ball.y - bp.y;
      const d = Math.hypot(dx, dy);
      const minDist = BALL_R + BUMPER_R;
      if (d < minDist && d > 0 && !ball.holder) {
        const nx = dx / d, ny = dy / d;
        ball.x = bp.x + nx * minDist;
        ball.y = bp.y + ny * minDist;
        const along = ball.vx * nx + ball.vy * ny;
        if (along < 0) {
          ball.vx = (ball.vx - 2 * along * nx) * BUMPER_BOOST;
          ball.vy = (ball.vy - 2 * along * ny) * BUMPER_BOOST;
        } else {
          ball.vx = nx * 280 * BUMPER_BOOST;
          ball.vy = ny * 280 * BUMPER_BOOST;
        }
        bp.hitTimer = 0.3;
        sfx.bumper();
        spawnParticles(bp.x + nx * BUMPER_R, bp.y + ny * BUMPER_R, 8, '#ffd066');
      }
    }

    // Ball
    if (ball.pickupCooldown > 0) ball.pickupCooldown -= dt;

    // Magnet effect: ball loose, pull toward magnet holder
    if (!ball.holder) {
      const t = performance.now();
      for (const p of players) {
        if (t < p.effects.magnetUntil) {
          const dx = p.x - ball.x;
          const dy = p.y - ball.y;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < 280) {
            const pull = (1 - d / 280) * 380;
            ball.vx += (dx / d) * pull * dt;
            ball.vy += (dy / d) * pull * dt;
          }
        }
      }
    }

    if (ball.holder) {
      const p = ball.holder;
      const sp = Math.hypot(p.vx, p.vy);
      const ang = sp > 30 ? Math.atan2(p.vy, p.vx) : (p.team === 0 ? 0 : Math.PI);
      ball.x = p.x + Math.cos(ang) * CARRY_DIST;
      ball.y = p.y + Math.sin(ang) * CARRY_DIST;
      ball.vx = p.vx;
      ball.vy = p.vy;
    } else {
      ball.vx *= Math.exp(-BALL_FRICTION * dt);
      ball.vy *= Math.exp(-BALL_FRICTION * dt);
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      const b = arenaBounds();
      const left = goalRect(0);
      const right = goalRect(1);
      if (ball.x < b.left + BALL_R) {
        if (ball.y > left.y + 4 && ball.y < left.y + left.h - 4) { handleGoal(1); return; }
        ball.x = b.left + BALL_R; ball.vx = Math.abs(ball.vx) * 0.7; sfx.bounce();
      }
      if (ball.x > b.right - BALL_R) {
        if (ball.y > right.y + 4 && ball.y < right.y + right.h - 4) { handleGoal(0); return; }
        ball.x = b.right - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.7; sfx.bounce();
      }
      if (ball.y < b.top + BALL_R) { ball.y = b.top + BALL_R; ball.vy = Math.abs(ball.vy) * 0.7; sfx.bounce(); }
      if (ball.y > b.bottom - BALL_R) { ball.y = b.bottom - BALL_R; ball.vy = -Math.abs(ball.vy) * 0.7; sfx.bounce(); }

      // Pickup
      if (ball.pickupCooldown <= 0) {
        for (const p of players) {
          if (p.stun > 0) continue;
          const d = Math.hypot(p.x - ball.x, p.y - ball.y);
          if (d < PLAYER_R + BALL_R + 2) {
            ball.holder = p;
            sfx.pickup();
            // Cancel any charge for the other player who can't kick now
            // Cancel charge for the holder if they were charging from before
            break;
          }
        }
      }
    }

    // Power-ups
    powerupSpawnTimer -= dt;
    if (powerupSpawnTimer <= 0 && powerups.length === 0) {
      spawnPowerup();
      powerupSpawnTimer = POWERUP_SPAWN_INTERVAL;
    }
    powerups = powerups.filter(pu => {
      pu.life -= dt;
      if (pu.life <= 0) return false;
      for (const p of players) {
        const d = Math.hypot(p.x - pu.x, p.y - pu.y);
        if (d < PLAYER_R + POWERUP_R) {
          applyPowerup(p, pu.kind);
          return false;
        }
      }
      return true;
    });

    // Trail
    ballTrail.push({ x: ball.x, y: ball.y, t: 1 });
    if (ballTrail.length > 14) ballTrail.shift();

    // Replay buffer
    replay.buffer.push({
      ball: { x: ball.x, y: ball.y },
      players: players.map(p => ({ x: p.x, y: p.y, color: p.color, dark: p.dark, vx: p.vx, vy: p.vy, team: p.team })),
    });
    if (replay.buffer.length > REPLAY_BUFFER_SIZE) replay.buffer.shift();

    // Time
    if (!inOvertime) {
      timeLeft -= dt;
      if (timeLeft <= 10 && Math.floor(timeLeft) !== lastTimeWarn && timeLeft > 0) {
        sfx.timeTick();
        lastTimeWarn = Math.floor(timeLeft);
      }
      if (timeLeft <= 0) {
        timeLeft = 0;
        if (score[0] === score[1]) startOvertime(); else endMatch();
        return;
      }
    }

    updateParticles(dt);
    if (shake > 0) {
      shake *= Math.exp(-3 * dt);
      if (shake < 0.1) shake = 0;
    }
    updateHud();
  }

  function collidePlayers() {
    const a = players[0], b = players[1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const overlap = (PLAYER_R * 2) - dist;
    if (overlap <= 0) return;
    const nx = dx / dist, ny = dy / dist;
    a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2; b.y += ny * overlap / 2;
    const rvx = a.vx - b.vx;
    const rvy = a.vy - b.vy;
    const sepSpeed = rvx * nx + rvy * ny;
    if (sepSpeed > 0) {
      a.vx -= sepSpeed * nx; a.vy -= sepSpeed * ny;
      b.vx += sepSpeed * nx; b.vy += sepSpeed * ny;
      if (sepSpeed > CHECK_THRESHOLD) {
        const aSp = Math.hypot(a.vx, a.vy);
        const bSp = Math.hypot(b.vx, b.vy);
        const loser = aSp < bSp ? a : b;
        const winner = loser === a ? b : a;
        const now = performance.now();
        if (loser.stun <= 0 && now >= loser.effects.shieldUntil) {
          loser.stun = STUN_DURATION;
          sfx.bodyCheck(); sfx.stun();
          shake = Math.max(shake, 6);
          spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 14, '#ffeb3a');
          const dir = loser === a ? 1 : -1;
          loser.vx -= nx * 80 * dir;
          loser.vy -= ny * 80 * dir;
          if (ball.holder === loser) {
            releaseBall(loser, -nx * 200 * dir, -ny * 200 * dir);
          }
        } else if (now < loser.effects.shieldUntil) {
          // Shield absorbs; sparkles
          spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 10, '#b197fc');
        }
      }
    }
  }

  function spawnPowerup() {
    const kind = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];
    const b = arenaBounds();
    let x, y;
    for (let i = 0; i < 30; i++) {
      x = b.left + 50 + Math.random() * (b.right - b.left - 100);
      y = b.top + 40 + Math.random() * (b.bottom - b.top - 80);
      let ok = true;
      for (const bp of bumpers) {
        if (Math.hypot(x - bp.x, y - bp.y) < BUMPER_R + POWERUP_R + 8) ok = false;
      }
      if (ok) break;
    }
    powerups.push({ x, y, kind, life: POWERUP_LIFETIME });
    sfx.powerupSpawn();
  }

  function applyPowerup(p, kind) {
    const t = performance.now();
    if (kind === 'speed') p.effects.speedUntil = t + POWERUP_DURATION * 1000;
    else if (kind === 'multiplier') p.effects.scoreMul = 2;
    else if (kind === 'magnet') p.effects.magnetUntil = t + POWERUP_DURATION * 1000;
    else if (kind === 'shield') p.effects.shieldUntil = t + POWERUP_DURATION * 1000;
    sfx.powerupGrab();
    spawnParticles(p.x, p.y, 14, POWERUP_INFO[kind].color);
  }

  function handleGoal(team) {
    const mul = players[team].effects.scoreMul || 1;
    score[team] += mul;
    if (mul > 1) {
      players[team].effects.scoreMul = 1; // consume
    }
    if (team === 0) sfx.goalYou(); else sfx.goalFoe();
    spawnParticles(ball.x, ball.y, 30, team === 0 ? '#4dabf7' : '#ff5d6c');
    shake = Math.max(shake, 10);
    updateHud();

    if (inOvertime || score[team] >= GOALS_TO_WIN) {
      // Match decided — still play replay then end
      startReplay(team, true);
      return;
    }
    startReplay(team, false);
  }

  function startReplay(team, isMatchOver) {
    if (replay.buffer.length < 4) {
      // Not enough buffer for a replay; skip straight to celebrate or end
      if (isMatchOver) endMatch();
      else {
        scorer = team;
        status = 'celebrating';
        celebrateUntil = performance.now() + 1500;
      }
      return;
    }
    replay.active = true;
    replay.index = 0;
    replay.tick = 0;
    replay.endsMatch = isMatchOver;
    replay.scorer = team;
    status = 'replay';
  }

  function finishReplay() {
    replay.active = false;
    replay.buffer = [];
    if (replay.endsMatch) {
      endMatch();
    } else {
      scorer = replay.scorer;
      status = 'celebrating';
      celebrateUntil = performance.now() + 1200;
    }
  }

  function startOvertime() {
    inOvertime = true;
    sfx.overtime();
    showOverlay('OVERTIME', 'Sudden death — next goal wins.', [
      { label: 'Play On', onClick: () => { hideOverlay(); status = 'playing'; resetPositions(); } },
    ]);
    status = 'celebrating'; // freeze world during overlay
    celebrateUntil = performance.now() + 99999; // until button clicked
  }

  function endMatch() {
    status = 'matchOver';
    const youWon = score[0] > score[1];
    if (mode === 'tournament') {
      if (youWon) tournament.wins++; else tournament.losses++;
      if (youWon && tournament.matchNum < TOURNAMENT_MATCHES) {
        tournament.matchNum++;
        const nextDiff = TOURNAMENT_DIFFICULTIES[tournament.matchNum - 1];
        sfx.matchEndWin();
        showOverlay(
          `Round ${tournament.matchNum - 1} won!`,
          `Score: ${score[0]}–${score[1]}. Next: round ${tournament.matchNum}/${TOURNAMENT_MATCHES} · ${nextDiff.toUpperCase()}.`,
          [{ label: 'Next Round', onClick: () => startMatch({ mode: 'tournament', difficulty: nextDiff }) }],
        );
      } else if (youWon) {
        // Won the final
        tournamentWins++;
        try { localStorage.setItem(TOURNAMENT_WINS_KEY, String(tournamentWins)); } catch (e) {}
        wins++;
        try { localStorage.setItem(BEST_WINS_KEY, String(wins)); } catch (e) {}
        sfx.cup();
        showOverlay(
          'CHAMPION',
          `Tournament won! Final ${score[0]}–${score[1]}. Cups: ${tournamentWins}.`,
          [{ label: 'Back to Menu', onClick: showMainMenu }],
        );
      } else {
        // Lost during tournament
        sfx.matchEndLose();
        showOverlay(
          'Eliminated',
          `Lost ${score[0]}–${score[1]} in round ${tournament.matchNum}/${TOURNAMENT_MATCHES}.`,
          [{ label: 'Back to Menu', onClick: showMainMenu }],
        );
      }
    } else if (youWon) {
      wins++;
      try { localStorage.setItem(BEST_WINS_KEY, String(wins)); } catch (e) {}
      sfx.matchEndWin();
      showOverlay(
        mode === 'pvp' ? 'P1 wins!' : 'You win!',
        `Final: ${score[0]}–${score[1]}. Lifetime wins: ${wins}.`,
        [{ label: 'Rematch', onClick: () => startMatch({ mode, difficulty }) }, { label: 'Main Menu', onClick: showMainMenu }],
      );
    } else if (score[1] > score[0]) {
      sfx.matchEndLose();
      showOverlay(
        mode === 'pvp' ? 'P2 wins' : 'CPU wins',
        `Final: ${score[0]}–${score[1]}. Lifetime wins: ${wins}.`,
        [{ label: 'Rematch', onClick: () => startMatch({ mode, difficulty }) }, { label: 'Main Menu', onClick: showMainMenu }],
      );
    } else {
      sfx.whistle();
      showOverlay('Tie game', `Final: ${score[0]}–${score[1]}.`, [
        { label: 'Rematch', onClick: () => startMatch({ mode, difficulty }) },
        { label: 'Main Menu', onClick: showMainMenu },
      ]);
    }
    updateHud();
  }

  // ─── Particles ──────────────────────────────────────────────────────────
  function spawnParticles(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 200;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
    }
  }
  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.exp(-2 * dt); p.vy *= Math.exp(-2 * dt);
      p.life -= dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  function draw() {
    ctx.save();
    if (shake > 0.1) {
      ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
    }
    drawBackground();
    drawGoals();
    drawBumpers();
    drawPowerups();
    drawParticlesBelow();

    if (status === 'replay') {
      drawReplay();
    } else {
      drawBallTrail();
      for (const p of players) drawPlayer(p);
      drawBall();
    }

    if (status === 'celebrating' && scorer != null) {
      const text = scorer === 0 ? 'GOAL!' : (mode === 'pvp' ? 'P2 GOAL' : 'CPU GOAL');
      ctx.fillStyle = scorer === 0 ? '#4dabf7' : '#ff5d6c';
      ctx.font = 'bold 44px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, H / 2 - 10);
    }
    if (status === 'replay') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('REPLAY', W / 2, 28);
    }
    if (inOvertime && status === 'playing') {
      ctx.fillStyle = '#ffd066';
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SUDDEN DEATH', W / 2, 28);
    }
    drawChargeMeter();
    drawPowerupHUD();
    ctx.restore();
  }

  function drawBackground() {
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const b = arenaBounds();
    ctx.fillStyle = '#15192a';
    ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    ctx.strokeStyle = 'rgba(80, 110, 160, 0.15)';
    ctx.lineWidth = 1;
    for (let x = b.left; x < b.right; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, b.top); ctx.lineTo(x, b.bottom); ctx.stroke();
    }
    for (let y = b.top; y < b.bottom; y += 40) {
      ctx.beginPath(); ctx.moveTo(b.left, y); ctx.lineTo(b.right, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(140, 170, 220, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(W / 2, b.top); ctx.lineTo(W / 2, b.bottom); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 36, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#3a4055';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
  }

  function drawGoals() {
    const drawGoal = (g, color, glowRgb) => {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.fillStyle = color;
      ctx.fillRect(g.x, g.y, g.w, 3);
      ctx.fillRect(g.x, g.y + g.h - 3, g.w, 3);
      ctx.fillRect(g.x + g.w / 2 - 1, g.y, 2, g.h);
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(${glowRgb}, 0.5)`;
      ctx.fillRect(g.x + g.w / 2 - 1, g.y, 2, g.h);
      ctx.shadowBlur = 0;
    };
    drawGoal(goalRect(0), '#ff5d6c', '255,120,130');
    drawGoal(goalRect(1), '#4dabf7', '120,180,255');
  }

  function drawBumpers() {
    for (const bp of bumpers) {
      const flash = Math.max(0, bp.hitTimer / 0.3);
      ctx.fillStyle = `rgba(255, 220, 100, ${0.2 + flash * 0.5})`;
      ctx.beginPath(); ctx.arc(bp.x, bp.y, BUMPER_R + 4 + flash * 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7b6438';
      ctx.beginPath(); ctx.arc(bp.x, bp.y, BUMPER_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = flash > 0.1 ? '#fff7c8' : '#ffd066';
      ctx.beginPath(); ctx.arc(bp.x, bp.y, BUMPER_R - 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a2a14';
      ctx.beginPath(); ctx.arc(bp.x - 2, bp.y - 2, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPowerups() {
    const t = performance.now();
    for (const pu of powerups) {
      const info = POWERUP_INFO[pu.kind];
      const pulse = (Math.sin(t / 200) + 1) / 2;
      // glow
      ctx.fillStyle = info.color;
      ctx.globalAlpha = 0.25 + pulse * 0.25;
      ctx.beginPath(); ctx.arc(pu.x, pu.y, POWERUP_R + 6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // body
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.arc(pu.x, pu.y, POWERUP_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(pu.x, pu.y, POWERUP_R - 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = info.color;
      ctx.font = 'bold 12px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.letter, pu.x, pu.y + 1);
      ctx.textBaseline = 'alphabetic';
      // fading life
      if (pu.life < 3) {
        ctx.globalAlpha = (Math.sin(t / 80) + 1) / 4;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(pu.x, pu.y, POWERUP_R + 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawParticlesBelow() {
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life / 0.3);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawBallTrail() {
    for (let i = 0; i < ballTrail.length; i++) {
      const t = ballTrail[i];
      const alpha = (i / ballTrail.length) * 0.4;
      ctx.fillStyle = `rgba(255, 230, 130, ${alpha})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * (0.5 + i / ballTrail.length * 0.5), 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPlayer(p) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + PLAYER_R * 0.7, PLAYER_R * 0.9, 3, 0, 0, Math.PI * 2); ctx.fill();

    const sp = Math.hypot(p.vx, p.vy);
    const ang = sp > 20 ? Math.atan2(p.vy, p.vx) : (p.team === 0 ? 0 : Math.PI);

    const t = performance.now();
    // shield ring
    if (t < p.effects.shieldUntil) {
      ctx.strokeStyle = '#b197fc';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 4, 0, Math.PI * 2); ctx.stroke();
    }
    // speed boost trail glow
    if (t < p.effects.speedUntil) {
      ctx.fillStyle = 'rgba(105, 219, 124, 0.3)';
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = p.dark;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.stun > 0 ? '#888' : p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R - 3, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(ang) * PLAYER_R, p.y + Math.sin(ang) * PLAYER_R);
    ctx.lineTo(p.x + Math.cos(ang + 2.6) * (PLAYER_R - 4), p.y + Math.sin(ang + 2.6) * (PLAYER_R - 4));
    ctx.lineTo(p.x + Math.cos(ang - 2.6) * (PLAYER_R - 4), p.y + Math.sin(ang - 2.6) * (PLAYER_R - 4));
    ctx.closePath();
    ctx.fill();

    if (p.stun > 0) {
      ctx.fillStyle = '#ffeb3a';
      for (let i = 0; i < 3; i++) {
        const a = performance.now() / 200 + i * 2.1;
        ctx.fillRect(p.x + Math.cos(a) * 14 - 1, p.y + Math.sin(a) * 14 - 12, 3, 3);
      }
    }
    if (ball.holder === p) {
      ctx.strokeStyle = '#ffd066';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // x2 multiplier indicator
    if (p.effects.scoreMul > 1) {
      ctx.fillStyle = '#ffd066';
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('x2', p.x, p.y - PLAYER_R - 5);
    }
  }

  function drawBall() {
    ctx.fillStyle = 'rgba(255, 230, 130, 0.4)';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff7c0';
    ctx.beginPath(); ctx.arc(ball.x - 2, ball.y - 2, BALL_R / 2, 0, Math.PI * 2); ctx.fill();
  }

  function drawReplay() {
    const idx = Math.floor(replay.index);
    const frame = replay.buffer[idx];
    if (!frame) return;
    // Trail from buffer leading to current frame
    ctx.globalAlpha = 0.4;
    for (let i = Math.max(0, idx - 10); i < idx; i++) {
      const f = replay.buffer[i];
      if (!f) continue;
      const a = (i - (idx - 10)) / 10 * 0.5;
      ctx.fillStyle = `rgba(255, 230, 130, ${a})`;
      ctx.beginPath(); ctx.arc(f.ball.x, f.ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Players
    for (const p of frame.players) {
      ctx.fillStyle = p.dark;
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R - 3, 0, Math.PI * 2); ctx.fill();
    }
    // Ball
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.arc(frame.ball.x, frame.ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
  }

  function drawChargeMeter() {
    const drawFor = (p, ch) => {
      if (!ch.active || ball.holder !== p) return;
      const held = performance.now() - ch.start;
      const t = Math.min(held / KICK_FULL_CHARGE_MS, 1);
      const w = 26;
      const h = 4;
      const x = p.x - w / 2;
      const y = p.y - PLAYER_R - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x, y, w, h);
      const color = t < 0.4 ? '#69db7c' : t < 0.8 ? '#ffd066' : '#ff5d6c';
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, (w - 2) * t, h - 2);
    };
    drawFor(players[0], chargeP1);
    if (mode === 'pvp') drawFor(players[1], chargeP2);
  }

  function drawPowerupHUD() {
    const t = performance.now();
    const items = [
      { p: players[0], key: 'speedUntil', kind: 'speed' },
      { p: players[0], key: 'magnetUntil', kind: 'magnet' },
      { p: players[0], key: 'shieldUntil', kind: 'shield' },
    ];
    let x = ARENA_INSET + 4;
    const y = ARENA_INSET + 4;
    const bw = 60, bh = 10;
    for (const it of items) {
      if (it.p.effects[it.key] <= t) continue;
      const info = POWERUP_INFO[it.kind];
      const remain = Math.max(0, (it.p.effects[it.key] - t) / 1000);
      const frac = remain / POWERUP_DURATION;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = info.color;
      ctx.fillRect(x + 1, y + 1, (bw - 2) * frac, bh - 2);
      x += bw + 4;
    }
    // P2 / CPU effects shown on right side
    let x2 = W - ARENA_INSET - 4;
    const items2 = [
      { p: players[1], key: 'speedUntil', kind: 'speed' },
      { p: players[1], key: 'magnetUntil', kind: 'magnet' },
      { p: players[1], key: 'shieldUntil', kind: 'shield' },
    ];
    for (const it of items2) {
      if (it.p.effects[it.key] <= t) continue;
      const info = POWERUP_INFO[it.kind];
      const remain = Math.max(0, (it.p.effects[it.key] - t) / 1000);
      const frac = remain / POWERUP_DURATION;
      x2 -= bw;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x2, y, bw, bh);
      ctx.fillStyle = info.color;
      ctx.fillRect(x2 + 1, y + 1, (bw - 2) * frac, bh - 2);
      x2 -= 4;
    }
  }

  // ─── Loop ───────────────────────────────────────────────────────────────
  function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  restartBtn.addEventListener('click', () => { ensureAudio(); showMainMenu(); });

  // Boot
  resetPositions();
  setupArena();
  status = 'menu';
  score = [0, 0];
  timeLeft = MATCH_TIME;
  particles = [];
  replay = { active: false, buffer: [], index: 0, tick: 0 };
  ballTrail = [];
  chargeP1 = { active: false, start: 0 };
  chargeP2 = { active: false, start: 0 };
  shake = 0;
  updateHud();
  showMainMenu();
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
