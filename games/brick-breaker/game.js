(() => {
  // ─── Audio (synthesised, lazy-init on first sound) ───────────────────────
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
  function tone(freq, dur, type = 'sine', vol = 0.12) {
    const a = ensureAudio();
    if (!a) return;
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
    const a = ensureAudio();
    if (!a) return;
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
  function noiseBurst(dur, vol = 0.18, lowpass = 3000) {
    const a = ensureAudio();
    if (!a) return;
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
    brickBreak(combo) {
      const f = 580 * Math.pow(1.05, Math.min(combo - 1, 16));
      tone(f, 0.07, 'square', 0.08);
    },
    brickDamage() { tone(380, 0.04, 'square', 0.07); },
    paddleHit() { tone(220, 0.07, 'triangle', 0.1); },
    wallBounce() { tone(260, 0.03, 'triangle', 0.05); },
    bomb() { noiseBurst(0.4, 0.22, 1500); tone(90, 0.3, 'sawtooth', 0.12); },
    loseLife() { chirp(440, 90, 0.55, 'sawtooth', 0.13); },
    levelClear() {
      [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sine', 0.1), i * 110));
    },
    powerup() {
      tone(523, 0.08, 'sine', 0.1);
      setTimeout(() => tone(784, 0.1, 'sine', 0.1), 80);
    },
    badPowerup() { chirp(330, 165, 0.25, 'sawtooth', 0.12); },
    laser() { chirp(1400, 700, 0.05, 'square', 0.05); },
    shieldSave() { chirp(330, 660, 0.18, 'sine', 0.12); },
    fire() { tone(120, 0.04, 'sawtooth', 0.08); },
  };
  let lastWallSoundAt = 0;

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const bestEl = document.getElementById('best');
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
  const BRICK_TOP = 64;
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
    wide:   { letter: 'W', color: '#4dabf7', good: true },
    multi:  { letter: 'M', color: '#69db7c', good: true },
    slow:   { letter: 'S', color: '#9775fa', good: true },
    life:   { letter: '+', color: '#ff6b6b', good: true },
    laser:  { letter: 'L', color: '#ffa94d', good: true },
    sticky: { letter: 'C', color: '#22d3ee', good: true },
    fire:   { letter: 'F', color: '#ff5252', good: true },
    magnet: { letter: 'N', color: '#ffba33', good: true },
    shield: { letter: 'D', color: '#0288d1', good: true },
    shrink: { letter: '-', color: '#b91c1c', good: false },
  };
  // Drop pool: weighted so positives are ~85% of drops, shrink the rest.
  const POWERUP_TYPES = [
    'wide', 'wide',
    'multi', 'multi',
    'slow',
    'life',
    'laser', 'laser',
    'sticky',
    'fire', 'fire',
    'magnet', 'magnet',
    'shield',
    'shrink', 'shrink', 'shrink',
  ];

  // Brick type definitions. Char in layout → {type, hp, points-multiplier}
  const BRICK_DEFS = {
    '#': { type: 'normal', hp: 1, scoreMul: 1 },
    'H': { type: 'hard',   hp: 2, scoreMul: 1.5 },
    'T': { type: 'tough',  hp: 3, scoreMul: 2 },
    'X': { type: 'steel',  hp: Infinity, scoreMul: 0 },
    'B': { type: 'bomb',   hp: 1, scoreMul: 1.5 },
  };

  const BOMB_RADIUS = 90;
  const TRAIL_LEN = 7;

  // Power-up durations (ms)
  const D_WIDE = 20000;
  const D_SLOW = 15000;
  const D_LASER = 15000;
  const D_STICKY = 15000;
  const D_FIRE = 12000;
  const D_MAGNET = 18000;
  const D_SHRINK = 14000;
  const SHIELD_CHARGES_PER_PICKUP = 3;
  const MAGNET_PULL = 1.8;
  const SHRINK_W = Math.round(88 * 0.6);

  const BEST_KEY = 'brick-breaker-best';

  const LEVELS = [
    // 1 — pyramid intro
    [
      '########',
      '########',
      '########',
      ' ###### ',
      '  ####  ',
    ],
    // 2 — alternating
    [
      '# # # # ',
      ' # # # #',
      '# # # # ',
      ' # # # #',
      '########',
      '########',
    ],
    // 3 — meet the hard bricks
    [
      'HHHHHHHH',
      '########',
      '########',
      'HHHHHHHH',
      '########',
      '########',
    ],
    // 4 — fortress with steel pillars
    [
      '########',
      '#      #',
      '# HHHH #',
      '# H  H #',
      '# HHHH #',
      '#      #',
      '########',
    ],
    // 5 — bomb showcase
    [
      'B##B##B ',
      '########',
      '########',
      ' B#### B',
      '########',
    ],
    // 6 — diamond of toughness
    [
      '   ##   ',
      '  HHHH  ',
      ' HTTTTH ',
      'HTTBBTTH',
      ' HTTTTH ',
      '  HHHH  ',
      '   ##   ',
    ],
    // 7 — sparse with bomb chains
    [
      'B  ##  B',
      '  ####  ',
      ' ###### ',
      'B##  ##B',
      ' ###### ',
      '  ####  ',
      'B  ##  B',
    ],
    // 8 — steel corridors
    [
      'X##X##X ',
      'X##X##X ',
      'X##X##X ',
      'X##X##X ',
      '########',
      'HHHHHHHH',
    ],
    // 9 — castle with hidden bombs
    [
      'XXXXXXXX',
      'X######X',
      'X#BTTB#X',
      'X#TTTT#X',
      'X#TTTT#X',
      'X#BTTB#X',
      'X######X',
      'XXXXXXXX',
    ],
    // 10 — zigzag
    [
      '####    ',
      'HHHH####',
      '    HHHH',
      'TTTT####',
      '    HHHH',
      'HHHH####',
      '####    ',
    ],
    // 11 — bomb minefield
    [
      ' B  B  B',
      '########',
      'HHHHHHHH',
      ' B  B  B',
      'HHHHHHHH',
      '########',
      'B  B  B ',
    ],
    // 12 — final boss
    [
      'XXXXXXXX',
      'X TTTT X',
      'X TBBT X',
      'X TBBT X',
      'X TTTT X',
      'XHHHHHHX',
      'X#####X#',
      'XXXXXXXX',
    ],
  ];

  const state = { score: 0, best: 0, lives: 3, level: 0 };
  let paddle, balls, bricks, drops, lasers, effects, laserCooldown;
  let paused, gameOver, levelDone;
  let combo, comboFlash;
  let particles, shake;
  let shieldCharges;
  const keys = Object.create(null);

  // Load best score from localStorage
  try {
    state.best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  } catch (e) { state.best = 0; }

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
    particles = [];
    shake = 0;
    combo = 0;
    comboFlash = 0;
    loadLevel();
    hideOverlay();
  }

  function loadLevel() {
    paddle = { x: (W - PADDLE_W) / 2, y: H - 32, w: PADDLE_W, h: PADDLE_H };
    balls = [];
    drops = [];
    lasers = [];
    particles = [];
    shake = 0;
    combo = 0;
    comboFlash = 0;
    effects = {
      wideUntil: 0, slowUntil: 0, laserUntil: 0, stickyUntil: 0,
      fireUntil: 0, magnetUntil: 0, shrinkUntil: 0,
    };
    shieldCharges = 0;
    laserCooldown = 0;
    spawnBallOnPaddle();
    paused = false;
    levelDone = false;

    const layout = LEVELS[state.level % LEVELS.length];
    bricks = [];
    for (let r = 0; r < layout.length; r++) {
      const row = layout[r];
      for (let c = 0; c < row.length; c++) {
        const def = BRICK_DEFS[row[c]];
        if (!def) continue;
        const baseColor = ROW_COLORS[r % ROW_COLORS.length];
        const points = Math.round(ROW_POINTS[r % ROW_POINTS.length] * def.scoreMul);
        bricks.push({
          x: BRICK_LEFT + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W,
          h: BRICK_H,
          baseColor,
          points,
          alive: true,
          type: def.type,
          hp: def.hp,
          maxHp: def.hp,
        });
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
      trail: [],
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
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem(BEST_KEY, String(state.best)); } catch (e) {}
    }
    bestEl.textContent = state.best;
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
    combo = 0;
    shake = Math.max(shake, 14);
    updateHUD();
    if (state.lives <= 0) {
      gameOver = true;
      sfx.loseLife();
      if (window.GD) window.GD.record('brick-breaker', state.score, 'score');
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
    effects.fireUntil = 0;
    effects.shrinkUntil = 0;
    shieldCharges = 0;
    sfx.loseLife();
    spawnBallOnPaddle();
  }

  function nextLevel() {
    state.level += 1;
    if (state.level >= LEVELS.length) {
      gameOver = true;
      if (window.GD) window.GD.record('brick-breaker', state.score, 'score');
      showOverlay('You Cleared It', `Final score: ${state.score}`, 'Play Again');
      return;
    }
    loadLevel();
    hideOverlay();
  }

  function completeLevel() {
    if (levelDone) return;
    levelDone = true;
    sfx.levelClear();
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

  function setPaddleWidth(newW) {
    const center = paddle.x + paddle.w / 2;
    paddle.w = newW;
    paddle.x = Math.max(0, Math.min(W - newW, center - newW / 2));
  }

  function applyPowerup(type) {
    const t = now();
    const info = POWERUP_INFO[type];
    if (info && info.good) sfx.powerup();
    else sfx.badPowerup();

    if (type === 'wide') {
      effects.wideUntil = t + D_WIDE;
      effects.shrinkUntil = 0;
      setPaddleWidth(widePaddleWidth());
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
            trail: [],
          });
        }
      }
      balls.push(...extras);
    } else if (type === 'slow') {
      effects.slowUntil = t + D_SLOW;
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
      effects.laserUntil = t + D_LASER;
    } else if (type === 'sticky') {
      effects.stickyUntil = t + D_STICKY;
    } else if (type === 'fire') {
      effects.fireUntil = t + D_FIRE;
    } else if (type === 'magnet') {
      effects.magnetUntil = t + D_MAGNET;
    } else if (type === 'shield') {
      shieldCharges += SHIELD_CHARGES_PER_PICKUP;
    } else if (type === 'shrink') {
      effects.shrinkUntil = t + D_SHRINK;
      effects.wideUntil = 0;
      setPaddleWidth(SHRINK_W);
    }
  }

  // ─── Brick damage / destruction ─────────────────────────────────────────
  function brickColor(brick) {
    if (brick.type === 'normal') return brick.baseColor;
    if (brick.type === 'hard') {
      return brick.hp === 2 ? '#94a3b8' : '#5a6573';
    }
    if (brick.type === 'tough') {
      if (brick.hp === 3) return '#52647a';
      if (brick.hp === 2) return '#3d4a5c';
      return '#283142';
    }
    if (brick.type === 'steel') return '#d1d5db';
    if (brick.type === 'bomb') return '#dc2626';
    return brick.baseColor;
  }

  // hitBrick: returns 'destroyed' | 'damaged' | 'bounce'
  function hitBrick(brick) {
    if (brick.type === 'steel') {
      sfx.wallBounce();
      return 'bounce';
    }
    brick.hp -= 1;
    if (brick.hp > 0) {
      // Damaged but alive
      spawnParticles(brick, 4, '#ffffff', 0.35);
      shake = Math.max(shake, 0.6);
      sfx.brickDamage();
      return 'damaged';
    }
    destroyBrick(brick, false);
    return 'destroyed';
  }

  function destroyBrick(brick, fromChain) {
    if (!brick.alive) return;
    brick.alive = false;
    combo += 1;
    const earned = brick.points * combo;
    state.score += earned;
    comboFlash = 0.6;
    maybeDropPowerup(brick);
    spawnParticles(brick, fromChain ? 8 : 14, brick.baseColor, 0.7);
    if (!fromChain) {
      shake = Math.max(shake, 1.6);
      sfx.brickBreak(combo);
    }
    if (brick.type === 'bomb') explodeBomb(brick);
    updateHUD();
  }

  function explodeBomb(bomb) {
    shake = Math.max(shake, 8);
    spawnParticles(bomb, 28, '#ff8a3a', 1.0);
    sfx.bomb();
    const queue = [bomb];
    const seen = new Set([bomb]);
    while (queue.length) {
      const b = queue.shift();
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      for (const other of bricks) {
        if (!other.alive || seen.has(other)) continue;
        if (other.type === 'steel') continue;
        const dx = (other.x + other.w / 2) - cx;
        const dy = (other.y + other.h / 2) - cy;
        if (dx * dx + dy * dy <= BOMB_RADIUS * BOMB_RADIUS) {
          seen.add(other);
          // For chain bombs, queue them so they too explode
          if (other.type === 'bomb') queue.push(other);
          destroyBrick(other, true);
        }
      }
    }
  }

  // ─── Particles ──────────────────────────────────────────────────────────
  function spawnParticles(brick, count, color, lifeBoost) {
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3.5;
      particles.push({
        x: cx + (Math.random() - 0.5) * brick.w * 0.7,
        y: cy + (Math.random() - 0.5) * brick.h * 0.7,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: lifeBoost,
        maxLife: lifeBoost,
        color,
        size: 2 + Math.random() * 2,
      });
    }
  }

  function updateParticles() {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vx *= 0.97;
      p.life -= 1 / 60;
    }
    particles = particles.filter(p => p.life > 0);
  }

  // ─── Input ──────────────────────────────────────────────────────────────
  canvas.addEventListener('mousemove', (e) => {
    if (!paddle) return;
    if (paused || gameOver || levelDone) return;
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

  // ─── Update loop ────────────────────────────────────────────────────────
  function update() {
    if (paused || gameOver || levelDone) return;
    const t = now();

    // Restore paddle width when wide/shrink expire
    if (t >= effects.wideUntil && t >= effects.shrinkUntil && paddle.w !== PADDLE_W) {
      setPaddleWidth(PADDLE_W);
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

      // Trail update
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > TRAIL_LEN) b.trail.shift();

      let bounced = false;
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); bounced = true; }
      if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); bounced = true; }
      if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); bounced = true; }
      if (bounced && t - lastWallSoundAt > 60) {
        sfx.wallBounce();
        lastWallSoundAt = t;
      }

      // Paddle collision — reset combo on paddle bounce.
      if (
        b.vy > 0 &&
        b.y + BALL_R >= paddle.y &&
        b.y - BALL_R <= paddle.y + paddle.h &&
        b.x >= paddle.x && b.x <= paddle.x + paddle.w
      ) {
        b.y = paddle.y - BALL_R;
        combo = 0;
        sfx.paddleHit();
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

      const onFire = t < effects.fireUntil;
      for (const br of bricks) {
        if (!br.alive) continue;
        if (
          b.x + BALL_R > br.x && b.x - BALL_R < br.x + br.w &&
          b.y + BALL_R > br.y && b.y - BALL_R < br.y + br.h
        ) {
          const overlapX = Math.min(b.x + BALL_R - br.x, br.x + br.w - (b.x - BALL_R));
          const overlapY = Math.min(b.y + BALL_R - br.y, br.y + br.h - (b.y - BALL_R));
          // Fireball: destroy any non-steel brick (regardless of HP) and don't bounce.
          if (onFire && br.type !== 'steel') {
            br.hp = 0;
            destroyBrick(br, false);
            sfx.fire();
            // Don't bounce — continue checking other bricks in case ball is overlapping multiple
            continue;
          }
          hitBrick(br);
          if (overlapX < overlapY) b.vx *= -1;
          else b.vy *= -1;
          break;
        }
      }
    }

    balls = balls.filter(b => {
      if (b.y > H + BALL_R) {
        if (shieldCharges > 0) {
          shieldCharges--;
          b.y = H - BALL_R - 4;
          b.vy = -Math.abs(b.vy);
          sfx.shieldSave();
          return true;
        }
        return false;
      }
      return true;
    });
    if (balls.length === 0) {
      loseLife();
      return;
    }

    const magnetOn = t < effects.magnetUntil;
    for (const d of drops) {
      d.y += DROP_SPEED;
      if (magnetOn && d.y > paddle.y - 200) {
        const target = paddle.x + paddle.w / 2 - DROP_W / 2;
        const dx = target - d.x;
        d.x += Math.sign(dx) * Math.min(Math.abs(dx), MAGNET_PULL);
      }
    }
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
        sfx.laser();
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
          // Laser hits brick: same damage path, but steel still absorbs/reflects
          const result = hitBrick(br);
          // Halve score-multiplier bonus for laser kills by removing the last combo bonus:
          // Easier: when destroyed, refund half its bonus. But our scoring is brick.points * combo.
          // Just leave it: laser does the same.
          // Laser is consumed regardless of result
          return false;
        }
      }
      return true;
    });

    updateParticles();

    // Decay combo flash
    comboFlash = Math.max(0, comboFlash - 1 / 60);

    // Decay shake
    if (shake > 0) {
      shake *= 0.86;
      if (shake < 0.1) shake = 0;
    }

    // Level clear: only requires breakable bricks
    if (bricks.every(b => !b.alive || b.type === 'steel')) completeLevel();
  }

  // ─── Rendering ──────────────────────────────────────────────────────────
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

  function drawBrick(b) {
    const color = brickColor(b);
    ctx.fillStyle = color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // top highlight / bottom shadow
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(b.x, b.y, b.w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3);

    if (b.type === 'hard' || b.type === 'tough') {
      // Cracks based on damage taken
      const damage = b.maxHp - b.hp;
      if (damage >= 1) {
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x + b.w * 0.3, b.y + 3);
        ctx.lineTo(b.x + b.w * 0.5, b.y + b.h * 0.55);
        ctx.lineTo(b.x + b.w * 0.4, b.y + b.h - 3);
        ctx.stroke();
      }
      if (damage >= 2) {
        ctx.beginPath();
        ctx.moveTo(b.x + b.w * 0.75, b.y + 3);
        ctx.lineTo(b.x + b.w * 0.6, b.y + b.h * 0.5);
        ctx.lineTo(b.x + b.w * 0.7, b.y + b.h - 3);
        ctx.stroke();
      }
    } else if (b.type === 'steel') {
      // hatched metallic look
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      for (let i = -b.h; i < b.w; i += 6) {
        ctx.beginPath();
        ctx.moveTo(b.x + i, b.y);
        ctx.lineTo(b.x + i + b.h, b.y + b.h);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    } else if (b.type === 'bomb') {
      // pulsing core + fuse
      const pulse = (Math.sin(now() / 150) + 1) / 2;
      ctx.fillStyle = `rgba(255, 200, 60, ${0.4 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 5 + pulse * 1.5, 0, Math.PI * 2);
      ctx.fill();
      // fuse on top
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(b.x + b.w / 2 - 1, b.y - 3, 2, 4);
      ctx.fillStyle = '#ffec88';
      ctx.fillRect(b.x + b.w / 2 - 1, b.y - 4, 2, 2);
    }
  }

  function drawPowerupBars() {
    const t = now();
    const items = [
      { active: t < effects.wideUntil,   total: D_WIDE,   until: effects.wideUntil,   color: '#4dabf7', label: 'WIDE' },
      { active: t < effects.slowUntil,   total: D_SLOW,   until: effects.slowUntil,   color: '#9775fa', label: 'SLOW' },
      { active: t < effects.laserUntil,  total: D_LASER,  until: effects.laserUntil,  color: '#ffa94d', label: 'LASER' },
      { active: t < effects.stickyUntil, total: D_STICKY, until: effects.stickyUntil, color: '#22d3ee', label: 'STICKY' },
      { active: t < effects.fireUntil,   total: D_FIRE,   until: effects.fireUntil,   color: '#ff5252', label: 'FIRE' },
      { active: t < effects.magnetUntil, total: D_MAGNET, until: effects.magnetUntil, color: '#ffba33', label: 'MAGNET' },
      { active: t < effects.shrinkUntil, total: D_SHRINK, until: effects.shrinkUntil, color: '#b91c1c', label: 'SHRINK' },
      { active: shieldCharges > 0, total: 1, until: 0, color: '#38bdf8', label: `SHIELD x${shieldCharges}`, fixedFrac: 1 },
    ];
    let x = 8;
    const y = 8;
    const barW = 76;
    const barH = 14;
    for (const it of items) {
      if (!it.active) continue;
      if (x + barW > W - 8) { x = 8; }  // wrap to next row if overflowing (only happens at 7+ active)
      const frac = it.fixedFrac != null ? it.fixedFrac : Math.max(0, (it.until - t) / it.total);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(x, y, barW, barH, 4);
      ctx.fill();
      ctx.fillStyle = it.color;
      roundRect(x + 2, y + 2, (barW - 4) * frac, barH - 4, 3);
      ctx.fill();
      ctx.fillStyle = '#0a0c12';
      ctx.font = 'bold 9px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label, x + 6, y + barH / 2 + 1);
      x += barW + 6;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
  }

  function drawCombo() {
    if (combo < 2) return;
    const flash = Math.min(1, comboFlash * 2);
    const size = 18 + flash * 10;
    const hue = Math.min(60, combo * 6);
    ctx.font = `bold ${size}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = `hsl(${hue}, 100%, ${65 + flash * 10}%)`;
    ctx.textAlign = 'center';
    ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
    ctx.shadowBlur = 12;
    ctx.fillText(`x${combo} COMBO`, W / 2, H - 70);
    ctx.shadowBlur = 0;
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = Math.min(1, p.life / 0.35);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    if (shake > 0.1) {
      ctx.translate(
        (Math.random() - 0.5) * shake * 2,
        (Math.random() - 0.5) * shake * 2,
      );
    }

    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(-20, -20, W + 40, H + 40);

    for (const b of bricks) {
      if (!b.alive) continue;
      drawBrick(b);
    }

    drawParticles();

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

    // Ball trails — orange when on fire
    const onFire = now() < effects.fireUntil;
    const trailColor = onFire ? '255, 110, 60' : '255, 212, 59';
    for (const b of balls) {
      for (let i = 0; i < b.trail.length; i++) {
        const tp = b.trail[i];
        const alpha = ((i + 1) / b.trail.length) * (onFire ? 0.5 : 0.35);
        ctx.fillStyle = `rgba(${trailColor}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, BALL_R * (onFire ? 1.0 : 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const b of balls) {
      if (onFire) {
        ctx.fillStyle = 'rgba(255, 180, 50, 0.5)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R + 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = onFire ? '#ff5252' : '#ffd43b';
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shield: glowing line at the bottom indicating active charges
    if (shieldCharges > 0) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      const pulse = (Math.sin(now() / 180) + 1) / 2;
      ctx.globalAlpha = 0.6 + pulse * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, H - 3);
      ctx.lineTo(W, H - 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    drawPowerupBars();
    drawCombo();

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

    ctx.restore();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  init();
  loop();
})();
