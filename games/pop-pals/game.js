(() => {
  // ─── Constants ───────────────────────────────────────────────────────────
  const TILE = 32;
  const COLS = 16;
  const ROWS = 14;
  const W = COLS * TILE;
  const H = ROWS * TILE;

  const GRAVITY = 1100;
  const MOVE_SPEED = 160;
  const JUMP_SPEED = 560;
  const FRICTION = 0.82;
  const BUBBLE_FWD_SPEED = 260;
  const BUBBLE_FLOAT_SPEED = -22;
  const BUBBLE_FWD_TIME = 0.35;
  const BUBBLE_LIFE = 7.0;
  const RESPAWN_INVULN = 2.0;
  const SHOOT_COOLDOWN = 0.35;
  const HURRY_UP_TIME = 30;
  const COMBO_WINDOW = 1.1;
  const POWERUP_DROP_CHANCE = 0.16;
  const SPECIAL_BUBBLE_CHANCE = 0.10;
  const SPECIAL_BUBBLE_TYPES = ['fire', 'ice', 'lightning'];

  // ─── DOM ─────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('board');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const levelEl = document.getElementById('level');
  const scoreEl = document.getElementById('score');
  const lives1El = document.getElementById('lives-1');
  const lives2El = document.getElementById('lives-2');
  const p2hudEl = document.getElementById('p2hud');
  const freeEl = document.getElementById('free');
  const trappedEl = document.getElementById('trapped');
  const overlay = document.getElementById('overlay');
  const overlayPanel = overlay.querySelector('.panel');
  const restartBtn = document.getElementById('restart');

  // ─── Enemy types ─────────────────────────────────────────────────────────
  const ENEMY_TYPES = {
    walker: {
      hp: 1, speed: 60, w: 24, h: 24,
      body: '#6b3aa0', dark: '#3a1860', eye: '#ffeb3a',
      glyph: '', big: false,
    },
    jumper: {
      hp: 1, speed: 70, w: 24, h: 24,
      body: '#3aa06b', dark: '#1d603a', eye: '#9affd0',
      glyph: '', big: false, jumps: true,
    },
    sprinter: {
      hp: 1, speed: 130, w: 22, h: 22,
      body: '#a03a3a', dark: '#601818', eye: '#ffd5d5',
      glyph: '', big: false, sprint: true,
    },
    spitter: {
      hp: 1, speed: 45, w: 24, h: 24,
      body: '#a08a3a', dark: '#604f18', eye: '#ffffff',
      glyph: '', big: false, shoots: true,
    },
    ghost: {
      hp: 1, speed: 50, w: 24, h: 24,
      body: '#7ac4ff', dark: '#406090', eye: '#ffffff',
      glyph: '', big: false, phases: true,
    },
    boss: {
      hp: 3, speed: 55, w: 40, h: 40,
      body: '#ff4080', dark: '#80103a', eye: '#fff5b0',
      glyph: '', big: true, jumps: true,
    },
  };

  // ─── Power-up types ──────────────────────────────────────────────────────
  const POWERUP_TYPES = {
    rapid: { color: '#ff7050', dark: '#a02818', duration: 10, glyph: '⚡' },
    speed: { color: '#5fd0ff', dark: '#1a78a0', duration: 10, glyph: '»' },
    triple:{ color: '#ffd066', dark: '#a07820', duration:  8, glyph: '⁂' },
    life:  { color: '#ff80a0', dark: '#a02050', duration:  0, glyph: '♥' },
  };
  const POWERUP_KEYS = Object.keys(POWERUP_TYPES);

  // ─── Special bubble types ────────────────────────────────────────────────
  const BUBBLE_PALETTE = {
    normal:    { fill: 'rgba(255,215,130,0.45)', stroke: '#ffd066', glow: 'rgba(255,200,100,0.18)' },
    fire:      { fill: 'rgba(255, 90, 70,0.55)', stroke: '#ff5040', glow: 'rgba(255, 80, 60,0.30)' },
    ice:       { fill: 'rgba(120,200,255,0.55)', stroke: '#5fd0ff', glow: 'rgba(120,200,255,0.30)' },
    lightning: { fill: 'rgba(255,250,150,0.55)', stroke: '#f8f060', glow: 'rgba(248,240, 96,0.30)' },
  };

  // ─── Themes ──────────────────────────────────────────────────────────────
  const THEMES = {
    cave:    { bg1: '#2a1d3f', bg2: '#1a1428', solid: '#5a3878', solidLight: '#7a52a0', solidDark: '#3a2050', speck: '#9a78c4', platform: '#e25fa1', platformLight: '#ff8fc8', platformDark: '#a83878' },
    sky:     { bg1: '#1e3a5a', bg2: '#0a1828', solid: '#3878a0', solidLight: '#52a0c8', solidDark: '#1f4868', speck: '#9ad0e8', platform: '#5fb8e0', platformLight: '#8fd4f0', platformDark: '#3878a0' },
    factory: { bg1: '#3a3025', bg2: '#1e1812', solid: '#806040', solidLight: '#a08058', solidDark: '#504028', speck: '#d0b088', platform: '#c08838', platformLight: '#e0a868', platformDark: '#805820' },
    lava:    { bg1: '#5a1d1d', bg2: '#280808', solid: '#a04040', solidLight: '#c86060', solidDark: '#601818', speck: '#ffaa88', platform: '#ff7838', platformLight: '#ffa868', platformDark: '#a04018' },
  };

  // ─── Levels ──────────────────────────────────────────────────────────────
  // Layout chars: # solid, = jump-through, . empty, P p1 spawn, p p2 spawn,
  // E walker, J jumper, S sprinter, T spitter, G ghost, B boss
  const LEVELS = [
    { theme: 'cave', layout: [
      '################',
      '#..............#',
      '#..............#',
      '#..============#',
      '#..............#',
      '#..............#',
      '#======..======#',
      '#..............#',
      '#..............#',
      '#==============#',
      '#..............#',
      '#..E........E..#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'cave', layout: [
      '################',
      '#..............#',
      '#====......====#',
      '#..............#',
      '#..============#',
      '#..............#',
      '#=========.....#',
      '#.....=========#',
      '#..J........J..#',
      '#==============#',
      '#..............#',
      '#..E........E..#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'cave', layout: [
      '################',
      '#..............#',
      '#..============#',
      '#..............#',
      '#===..======...#',
      '#..............#',
      '#...======..===#',
      '#..............#',
      '#==.======.====#',
      '#..S........S..#',
      '#..............#',
      '#.E..J....J..E.#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'cave', layout: [
      '################',
      '#..............#',
      '#====......====#',
      '#..............#',
      '#======..======#',
      '#..............#',
      '#..======......#',
      '#......======..#',
      '#..............#',
      '#==============#',
      '#..T........T..#',
      '#..............#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'cave', layout: [
      '################',
      '#..............#',
      '#..............#',
      '#......BB......#',
      '#......BB......#',
      '#==============#',
      '#..............#',
      '#====......====#',
      '#..............#',
      '#======..======#',
      '#..............#',
      '#==============#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'sky', layout: [
      '################',
      '#..............#',
      '#====......====#',
      '#..............#',
      '#......==......#',
      '#..............#',
      '#======..======#',
      '#..............#',
      '#..==......==..#',
      '#==============#',
      '#..S..J..J..S..#',
      '#..............#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'sky', layout: [
      '################',
      '#......==......#',
      '#..............#',
      '#==..======..==#',
      '#..............#',
      '#......==......#',
      '#==..======..==#',
      '#..G........G..#',
      '#......==......#',
      '#==..======..==#',
      '#..............#',
      '#..............#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'sky', layout: [
      '################',
      '#..............#',
      '#============..#',
      '#..............#',
      '#..============#',
      '#..............#',
      '#============..#',
      '#..............#',
      '#..S.J.S.T.J...#',
      '#==============#',
      '#..............#',
      '#..............#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'sky', layout: [
      '################',
      '#..............#',
      '#..............#',
      '#....======....#',
      '#....BB..BB....#',
      '#....======....#',
      '#..............#',
      '#==============#',
      '#..............#',
      '#====......====#',
      '#..............#',
      '#==============#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'factory', layout: [
      '################',
      '#..............#',
      '#==============#',
      '#..T........T..#',
      '#..============#',
      '#..............#',
      '#============..#',
      '#..............#',
      '#..============#',
      '#..S........S..#',
      '#==============#',
      '#..............#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'factory', layout: [
      '################',
      '#.G..........G.#',
      '#====......====#',
      '#..............#',
      '#..============#',
      '#..............#',
      '#============..#',
      '#..............#',
      '#..============#',
      '#..............#',
      '#==============#',
      '#..T..J..J..T..#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'factory', layout: [
      '################',
      '#..............#',
      '#......BB......#',
      '#==============#',
      '#.S..........S.#',
      '#==..======..==#',
      '#..............#',
      '#..==......==..#',
      '#..............#',
      '#======..======#',
      '#..T........T..#',
      '#==============#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'lava', layout: [
      '################',
      '#..............#',
      '#==..======..==#',
      '#..J........J..#',
      '#......==......#',
      '#..T........T..#',
      '#==..======..==#',
      '#..S........S..#',
      '#......==......#',
      '#..G........G..#',
      '#==============#',
      '#..............#',
      '#.P..........p.#',
      '################',
    ]},
    { theme: 'lava', layout: [
      '################',
      '#..............#',
      '#......BB......#',
      '#......BB......#',
      '#..G........G..#',
      '#==============#',
      '#..T..S..S..T..#',
      '#==..======..==#',
      '#..............#',
      '#..==......==..#',
      '#..............#',
      '#==============#',
      '#.P..........p.#',
      '################',
    ]},
  ];

  // ─── State ───────────────────────────────────────────────────────────────
  let mode = 'title';   // 'title' | 'playing' | 'levelWon' | 'gameover' | 'highscores'
  let grid, theme;
  let players, enemies, bubbles, particles, gems, powerups, projectiles;
  let level, score, lastTime, p2Active;
  let levelStartTime;
  let hurryUpActive = false;
  let hurrySkull = null;
  let combo = { count: 0, mul: 1, lastTime: -10 };
  let popups = [];      // floating texts
  let bestCombo = 0;
  let stats = null;     // populated on start
  let statusTimer = 0;

  // ─── Input ───────────────────────────────────────────────────────────────
  const keys = {};
  document.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys[e.key.toLowerCase()] = true;
    if (!p2Active && mode === 'playing' && ['a', 'd', 'w', 'f', 'g'].includes(e.key.toLowerCase())) {
      activateP2();
    }
  });
  document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  function p1Input() {
    return {
      left:  keys['arrowleft'],
      right: keys['arrowright'],
      jump:  keys['arrowup'] || keys['z'],
      down:  keys['arrowdown'],
      shoot: keys['x'],
    };
  }
  function p2Input() {
    return {
      left:  keys['a'],
      right: keys['d'],
      jump:  keys['w'] || keys['f'],
      down:  keys['s'],
      shoot: keys['g'],
    };
  }

  // ─── Level loading ───────────────────────────────────────────────────────
  function loadLevel(n) {
    const def = LEVELS[(n - 1) % LEVELS.length];
    theme = THEMES[def.theme] || THEMES.cave;
    const layout = def.layout;
    grid = [];
    enemies = [];
    bubbles = [];
    particles = [];
    gems = [];
    powerups = [];
    projectiles = [];
    hurryUpActive = false;
    hurrySkull = null;
    popups = [];

    let p1Spawn = null, p2Spawn = null;
    let bossSpawned = false;
    const enemySpec = { 'E': 'walker', 'J': 'jumper', 'S': 'sprinter', 'T': 'spitter', 'G': 'ghost', 'B': 'boss' };

    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const ch = layout[r][c];
        if (ch === '#') row.push(1);
        else if (ch === '=') row.push(2);
        else row.push(0);

        if (ch === 'P') p1Spawn = { x: c * TILE + 4, y: r * TILE };
        if (ch === 'p') p2Spawn = { x: c * TILE + 4, y: r * TILE };
        if (enemySpec[ch]) {
          if (enemySpec[ch] === 'boss') {
            if (bossSpawned) continue;
            bossSpawned = true;
          }
          enemies.push(makeEnemy(c * TILE + 4, r * TILE, enemySpec[ch]));
        }
      }
      grid.push(row);
    }

    // Scale enemy speed slightly with infinite-loop level number
    const loopBonus = Math.floor((n - 1) / LEVELS.length) * 0.15;
    for (const e of enemies) e.speed *= 1 + loopBonus;

    if (!players) {
      players = [makePlayer(p1Spawn.x, p1Spawn.y, 1)];
      if (p2Active) players.push(makePlayer(p2Spawn.x, p2Spawn.y, 2));
    } else {
      players[0].x = p1Spawn.x; players[0].y = p1Spawn.y;
      players[0].vx = 0; players[0].vy = 0;
      players[0].invuln = RESPAWN_INVULN;
      clearPlayerEffects(players[0]);
      if (players[1]) {
        players[1].x = p2Spawn.x; players[1].y = p2Spawn.y;
        players[1].vx = 0; players[1].vy = 0;
        players[1].invuln = RESPAWN_INVULN;
        clearPlayerEffects(players[1]);
      }
    }

    level = n;
    levelStartTime = performance.now() / 1000;
    statusTimer = 0;
    mode = 'playing';
    combo = { count: 0, mul: 1, lastTime: -10 };
    updateHud();
  }

  function activateP2() {
    p2Active = true;
    p2hudEl.classList.remove('hidden');
    if (players && !players[1]) {
      const sx = Math.min(W - 32, players[0].x + 64);
      const sy = players[0].y;
      players.push(makePlayer(sx, sy, 2));
    }
  }

  // ─── Entities ────────────────────────────────────────────────────────────
  function makePlayer(x, y, num) {
    return {
      kind: 'player', num,
      x, y, w: 24, h: 26,
      vx: 0, vy: 0,
      onGround: false,
      facing: num === 1 ? 1 : -1,
      lives: 3,
      invuln: RESPAWN_INVULN,
      shootTimer: 0,
      dead: false,
      respawnTimer: 0,
      blinkPhase: 0,
      dropping: 0,
      rapidUntil: 0,
      speedUntil: 0,
      tripleUntil: 0,
    };
  }
  function clearPlayerEffects(p) {
    p.rapidUntil = 0; p.speedUntil = 0; p.tripleUntil = 0;
  }

  function makeEnemy(x, y, type = 'walker') {
    const spec = ENEMY_TYPES[type];
    return {
      kind: 'enemy', type,
      x, y, w: spec.w, h: spec.h,
      vx: -spec.speed, vy: 0,
      speed: spec.speed,
      onGround: false,
      facing: -1,
      animPhase: Math.random() * 6,
      alarm: 0,
      hp: spec.hp, maxHp: spec.hp,
      freezeUntil: 0,
      shootTimer: 1 + Math.random() * 2,
      jumpCd: 1 + Math.random() * 2,
      sprintCd: 1.5,
    };
  }

  function makeBubble(x, y, dir, special) {
    return {
      kind: 'bubble',
      x, y, w: 22, h: 22,
      vx: dir * BUBBLE_FWD_SPEED, vy: 0,
      life: 0,
      trapped: null,
      popping: false,
      popTimer: 0,
      special: special || null,
    };
  }

  function makeGem(x, y, big) {
    return {
      kind: 'gem',
      x, y, w: big ? 22 : 16, h: big ? 22 : 16,
      vx: 0, vy: -200,
      life: 0,
      big: !!big,
    };
  }

  function makePowerup(x, y, type) {
    return {
      kind: 'powerup', type,
      x, y, w: 22, h: 22,
      vx: 0, vy: -120,
      life: 0,
    };
  }

  function makeProjectile(x, y, vx, vy) {
    return {
      kind: 'projectile',
      x, y, w: 8, h: 8,
      vx, vy,
      life: 3.0,
    };
  }

  function makeSkull(x, y) {
    return {
      kind: 'skull',
      x, y, w: 28, h: 28,
      vx: 0, vy: 0,
      facing: -1,
      pulse: 0,
    };
  }

  function makeParticle(x, y, color) {
    return {
      x, y,
      vx: (Math.random() - 0.5) * 200,
      vy: -Math.random() * 200 - 50,
      life: 0.6,
      color,
      size: 3 + Math.random() * 3,
    };
  }

  function makePopup(x, y, text, color) {
    return { x, y, vy: -42, life: 1.0, text, color };
  }

  // ─── Physics ─────────────────────────────────────────────────────────────
  function tileAt(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return 1;
    return grid[r][c];
  }
  function solidAt(c, r) { return tileAt(c, r) === 1; }
  function platformAt(c, r) { return tileAt(c, r) === 2; }

  function moveBody(b, dt, ignoreSolid) {
    b.vy += GRAVITY * dt;
    if (b.vy > 720) b.vy = 720;

    let nx = b.x + b.vx * dt;
    if (!ignoreSolid) {
      const left = Math.floor(nx / TILE);
      const right = Math.floor((nx + b.w - 1) / TILE);
      const top = Math.floor((b.y + 2) / TILE);
      const bot = Math.floor((b.y + b.h - 1) / TILE);
      let blocked = false;
      for (let r = top; r <= bot; r++) {
        if (b.vx > 0 && solidAt(right, r)) { nx = right * TILE - b.w; blocked = true; break; }
        if (b.vx < 0 && solidAt(left, r))  { nx = (left + 1) * TILE;   blocked = true; break; }
      }
      if (blocked) b.vx = 0;
    }
    b.x = nx;

    let ny = b.y + b.vy * dt;
    b.onGround = false;
    if (!ignoreSolid) {
      const left = Math.floor((b.x + 2) / TILE);
      const right = Math.floor((b.x + b.w - 3) / TILE);
      if (b.vy > 0) {
        const bot = Math.floor((ny + b.h) / TILE);
        for (let c = left; c <= right; c++) {
          if (solidAt(c, bot) || platformAt(c, bot)) {
            const oldBot = Math.floor((b.y + b.h - 1) / TILE);
            if (platformAt(c, bot) && oldBot >= bot) continue;
            if (platformAt(c, bot) && b.dropping > 0) continue;
            ny = bot * TILE - b.h;
            b.vy = 0;
            b.onGround = true;
            break;
          }
        }
      } else if (b.vy < 0) {
        const top = Math.floor(ny / TILE);
        for (let c = left; c <= right; c++) {
          if (solidAt(c, top)) { ny = (top + 1) * TILE; b.vy = 0; break; }
        }
      }
    }
    b.y = ny;
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function nearestPlayer(x, y) {
    let best = null, bestD = Infinity;
    for (const p of players) {
      if (!p || p.dead) continue;
      const dx = (p.x + p.w / 2) - x;
      const dy = (p.y + p.h / 2) - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // ─── Player update ───────────────────────────────────────────────────────
  function updatePlayer(p, input, dt) {
    if (p.dead) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0 && p.lives > 0) {
        const def = LEVELS[(level - 1) % LEVELS.length];
        const ch = p.num === 1 ? 'P' : 'p';
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (def.layout[r][c] === ch) {
              p.x = c * TILE + 4; p.y = r * TILE;
            }
          }
        }
        p.vx = 0; p.vy = 0; p.dead = false; p.invuln = RESPAWN_INVULN;
      }
      return;
    }

    const now = performance.now() / 1000;
    const speed = now < p.speedUntil ? MOVE_SPEED * 1.5 : MOVE_SPEED;
    const shootCd = now < p.rapidUntil ? SHOOT_COOLDOWN * 0.45 : SHOOT_COOLDOWN;

    if (input.left)  { p.vx = -speed; p.facing = -1; }
    else if (input.right) { p.vx = speed; p.facing = 1; }
    else {
      p.vx *= FRICTION;
      if (Math.abs(p.vx) < 5) p.vx = 0;
    }
    if (input.jump && p.onGround) {
      p.vy = -JUMP_SPEED;
      p.onGround = false;
    }
    if (input.down && p.onGround && p.dropping <= 0) {
      const c = Math.floor((p.x + p.w / 2) / TILE);
      const r = Math.floor((p.y + p.h) / TILE);
      if (platformAt(c, r)) {
        p.dropping = 0.18;
        p.y += 2;
        p.vy = 120;
        p.onGround = false;
      }
    }
    if (p.dropping > 0) p.dropping -= dt;

    if (input.shoot && p.shootTimer <= 0) {
      const triple = now < p.tripleUntil;
      const specialRoll = Math.random();
      const special = specialRoll < SPECIAL_BUBBLE_CHANCE ? SPECIAL_BUBBLE_TYPES[Math.floor(Math.random() * SPECIAL_BUBBLE_TYPES.length)] : null;
      const baseX = p.x + p.w / 2 - 11 + p.facing * 12;
      const baseY = p.y + 2;
      bubbles.push(makeBubble(baseX, baseY, p.facing, special));
      if (triple) {
        const upBubble = makeBubble(baseX, baseY, p.facing, null);
        upBubble.vy = -90; upBubble.vx *= 0.85;
        bubbles.push(upBubble);
        const downBubble = makeBubble(baseX, baseY, p.facing, null);
        downBubble.vy = 90; downBubble.vx *= 0.85;
        bubbles.push(downBubble);
      }
      stats.totalBubbles += triple ? 3 : 1;
      p.shootTimer = shootCd;
    }
    p.shootTimer -= dt;
    if (p.invuln > 0) { p.invuln -= dt; p.blinkPhase += dt * 18; }

    moveBody(p, dt);
    if (p.y > H) p.y = -p.h;
    if (p.y < -p.h) p.y = H - p.h - 1;
  }

  // ─── Enemy update (per-type) ────────────────────────────────────────────
  function updateEnemy(e, dt) {
    if (e.trapped) return;
    e.animPhase += dt * 4;
    if (e.alarm > 0) e.alarm -= dt;
    const now = performance.now() / 1000;
    if (now < e.freezeUntil) {
      // Frozen by ice bubble — stuck in place
      e.vx = 0; e.vy = 0;
      return;
    }

    if (e.type === 'spitter') updateSpitter(e, dt);
    else if (e.type === 'jumper' || e.type === 'boss') updateJumper(e, dt);
    else if (e.type === 'sprinter') updateSprinter(e, dt);
    else if (e.type === 'ghost') updateGhost(e, dt);
    else updateWalker(e, dt);

    if (e.y > H) e.y = -e.h;
    if (e.y < -e.h) e.y = H - e.h - 1;
  }
  function turnIfBlocked(e) {
    if (!e.onGround) return;
    const aheadC = Math.floor((e.x + (e.facing > 0 ? e.w + 2 : -2)) / TILE);
    const footR = Math.floor((e.y + e.h) / TILE);
    const aheadFloor = solidAt(aheadC, footR) || platformAt(aheadC, footR);
    const aheadWall  = solidAt(aheadC, footR - 1);
    if (!aheadFloor || aheadWall) e.facing *= -1;
  }
  function updateWalker(e, dt) {
    e.vx = e.facing * e.speed;
    moveBody(e, dt);
    turnIfBlocked(e);
  }
  function updateJumper(e, dt) {
    e.vx = e.facing * e.speed;
    e.jumpCd -= dt;
    if (e.onGround && e.jumpCd <= 0) {
      e.vy = -440;
      e.jumpCd = 1.6 + Math.random() * 1.2;
    }
    moveBody(e, dt);
    turnIfBlocked(e);
  }
  function updateSprinter(e, dt) {
    // Faster when lonely (few enemies left)
    const freeCount = enemies.filter(en => !en.trapped).length;
    const burst = freeCount <= 2 ? 1.5 : 1.0;
    e.vx = e.facing * e.speed * burst;
    moveBody(e, dt);
    turnIfBlocked(e);
  }
  function updateSpitter(e, dt) {
    const target = nearestPlayer(e.x, e.y);
    if (target && Math.abs(target.y - e.y) < TILE * 1.5) {
      e.facing = target.x > e.x ? 1 : -1;
      e.vx *= 0.6;
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        const sx = e.x + e.w / 2;
        const sy = e.y + e.h / 2;
        const dx = (target.x + target.w / 2) - sx;
        const dy = (target.y + target.h / 2) - sy;
        const d = Math.hypot(dx, dy) || 1;
        projectiles.push(makeProjectile(sx - 4, sy - 4, dx / d * 180, dy / d * 180));
        e.shootTimer = 2.0 + Math.random() * 0.8;
      }
    } else {
      e.vx = e.facing * e.speed;
    }
    moveBody(e, dt);
    turnIfBlocked(e);
  }
  function updateGhost(e, dt) {
    // Phases through walls; floats with no gravity
    const target = nearestPlayer(e.x, e.y);
    if (target) {
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = (dx / d) * e.speed;
      e.vy = (dy / d) * e.speed * 0.6;
      e.facing = dx >= 0 ? 1 : -1;
    } else {
      e.vx = e.facing * e.speed * 0.5;
      e.vy *= 0.9;
    }
    // Skip gravity; just integrate
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.x < 0) e.x = 0;
    if (e.x + e.w > W) e.x = W - e.w;
  }

  // ─── Bubble update ───────────────────────────────────────────────────────
  function updateBubble(b, dt) {
    b.life += dt;
    if (b.life < BUBBLE_FWD_TIME) {
      // Forward phase
    } else {
      b.vx *= 0.9;
      b.vy = BUBBLE_FLOAT_SPEED;
    }
    let nx = b.x + b.vx * dt;
    let ny = b.y + b.vy * dt;
    const midRow = Math.floor((b.y + b.h / 2) / TILE);
    if (b.vx > 0 && solidAt(Math.floor((nx + b.w - 1) / TILE), midRow)) {
      nx = Math.floor((nx + b.w - 1) / TILE) * TILE - b.w; b.vx = 0;
    } else if (b.vx < 0 && solidAt(Math.floor(nx / TILE), midRow)) {
      nx = (Math.floor(nx / TILE) + 1) * TILE; b.vx = 0;
    }
    const midCol = Math.floor((b.x + b.w / 2) / TILE);
    if (b.vy < 0 && solidAt(midCol, Math.floor(ny / TILE))) {
      ny = (Math.floor(ny / TILE) + 1) * TILE; b.vy = 0;
    }
    b.x = nx;
    b.y = ny;

    if (!b.trapped && b.life > 0.1) {
      for (const en of enemies) {
        if (en.trapped) continue;
        if (en.type === 'ghost' && b.special !== 'lightning') continue;
        if (aabb(b, en)) {
          b.trapped = en;
          en.trapped = b;
          en.vx = 0; en.vy = 0;
          if (en.type === 'boss') {
            const dw = 44 - b.w;
            b.x -= dw / 2;
            b.y -= dw / 2;
            b.w = 44; b.h = 44;
          }
          break;
        }
      }
    }
    if (b.trapped) {
      b.trapped.x = b.x + (b.w - b.trapped.w) / 2;
      b.trapped.y = b.y + (b.h - b.trapped.h) / 2;
    }

    if (b.life > BUBBLE_LIFE && !b.popping) {
      if (b.trapped) {
        const en = b.trapped;
        en.trapped = null;
        en.facing = Math.random() < 0.5 ? -1 : 1;
        en.vy = -160;
        en.alarm = 1.5;
        if (en.x < TILE) en.x = TILE + 2;
        if (en.x + en.w > W - TILE) en.x = W - TILE - en.w - 2;
        b.trapped = null;
        for (let i = 0; i < 14; i++) particles.push(makeParticle(b.x + b.w / 2, b.y + b.h / 2, '#ff7050'));
      }
      b.popping = true;
      b.popTimer = 0;
    }
    if (b.popping) b.popTimer += dt;
  }

  // ─── Special bubble effects ─────────────────────────────────────────────
  function applyBubbleSpecial(b, source) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (b.special === 'fire') {
      // Chain: pop nearby bubbles within radius
      const r = 100;
      for (const other of bubbles) {
        if (other === b || other.popping) continue;
        const odx = (other.x + other.w / 2) - cx;
        const ody = (other.y + other.h / 2) - cy;
        if (odx * odx + ody * ody <= r * r) {
          popBubble(other, source, true);
        }
      }
      for (let i = 0; i < 18; i++) particles.push(makeParticle(cx, cy, '#ff7848'));
    } else if (b.special === 'ice') {
      const r = 80;
      const now = performance.now() / 1000;
      for (const en of enemies) {
        if (en.trapped) continue;
        const edx = (en.x + en.w / 2) - cx;
        const edy = (en.y + en.h / 2) - cy;
        if (edx * edx + edy * edy <= r * r) {
          en.freezeUntil = Math.max(en.freezeUntil, now + 4.0);
        }
      }
      for (let i = 0; i < 14; i++) particles.push(makeParticle(cx, cy, '#9ad0ff'));
    } else if (b.special === 'lightning') {
      // Strike up to 3 visible enemies; instantly kill ghosts too
      const targets = enemies.filter(en => !en.trapped).slice(0, 3);
      for (const en of targets) {
        // Damage 1; if dies, drop gem
        en.hp -= 1;
        if (en.hp <= 0) {
          gems.push(makeGem(en.x + en.w / 2 - 8, en.y));
          enemies = enemies.filter(x => x !== en);
          addScore(80, en.x + en.w / 2, en.y, true);
          stats.enemiesPopped += 1;
        } else {
          en.alarm = 1.5;
        }
        for (let i = 0; i < 6; i++) particles.push(makeParticle(en.x + en.w / 2, en.y + en.h / 2, '#fff5b0'));
      }
      for (let i = 0; i < 8; i++) particles.push(makeParticle(cx, cy, '#fffce0'));
    }
  }

  // ─── Pop bubble (single, both for direct hits and chains) ───────────────
  function popBubble(b, byPlayer, isChain) {
    if (b.popping) return;
    if (b.trapped) {
      const en = b.trapped;
      en.hp -= 1;
      en.trapped = null;
      b.trapped = null;
      if (en.hp <= 0) {
        const isBig = en.type === 'boss';
        gems.push(makeGem(en.x + en.w / 2 - 8, en.y, isBig));
        const points = isBig ? 500 : 100;
        addScore(points, en.x + en.w / 2, en.y, true);
        if (Math.random() < POWERUP_DROP_CHANCE) {
          const ptype = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];
          powerups.push(makePowerup(en.x + en.w / 2 - 11, en.y, ptype));
        }
        for (let i = 0; i < 8; i++) particles.push(makeParticle(en.x + en.w / 2, en.y + en.h / 2, '#ffd066'));
        enemies = enemies.filter(x => x !== en);
        stats.enemiesPopped += 1;
      } else {
        // Released with reduced HP (boss)
        en.facing = Math.random() < 0.5 ? -1 : 1;
        en.vy = -260;
        en.alarm = 1.5;
        addScore(50, en.x + en.w / 2, en.y, true);
        for (let i = 0; i < 8; i++) particles.push(makeParticle(en.x + en.w / 2, en.y + en.h / 2, '#ff8848'));
      }
    } else {
      // Empty bubble pop — small score
      if (!isChain) addScore(10, b.x + b.w / 2, b.y, false);
    }
    if (b.special) applyBubbleSpecial(b, byPlayer);
    for (let i = 0; i < 6; i++) particles.push(makeParticle(b.x + b.w / 2, b.y + b.h / 2, '#ffe5b0'));
    b.popping = true;
    b.popTimer = 0.25;
  }

  function addScore(base, x, y, counts) {
    const now = performance.now() / 1000;
    let mul = 1;
    if (counts) {
      if (now - combo.lastTime < COMBO_WINDOW) {
        combo.count += 1;
      } else {
        combo.count = 1;
      }
      combo.lastTime = now;
      mul = Math.min(8, 1 + Math.floor((combo.count - 1) / 2));
      combo.mul = mul;
      if (combo.count > bestCombo) bestCombo = combo.count;
      if (combo.count >= 2) {
        popups.push(makePopup(x, y, `×${combo.count}!`, '#ffd066'));
      }
    }
    score += base * mul;
  }

  // ─── Main update ─────────────────────────────────────────────────────────
  function update(dt) {
    if (mode === 'levelWon') {
      statusTimer += dt;
      stepVisualsOnly(dt);
      if (statusTimer > 1.6) loadLevel(level + 1);
      return;
    }
    if (mode !== 'playing') {
      stepVisualsOnly(dt);
      return;
    }

    if (players[0]) updatePlayer(players[0], p1Input(), dt);
    if (players[1]) updatePlayer(players[1], p2Input(), dt);

    for (const e of enemies) updateEnemy(e, dt);
    for (const b of bubbles) updateBubble(b, dt);

    // Player vs bubbles
    for (const p of players) {
      if (!p || p.dead) continue;
      for (const b of bubbles) {
        if (b.popping || b.life < 0.3) continue;
        if (aabb(p, b)) {
          popBubble(b, p, false);
          p.vy = Math.min(p.vy, -260);
        }
      }
    }
    bubbles = bubbles.filter(b => !(b.popping && b.popTimer >= 0.2));

    // Projectiles
    for (const proj of projectiles) {
      proj.life -= dt;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      // Wall stop
      const tc = Math.floor((proj.x + 4) / TILE);
      const tr = Math.floor((proj.y + 4) / TILE);
      if (solidAt(tc, tr)) proj.life = 0;
      // Hit player
      for (const p of players) {
        if (!p || p.dead || p.invuln > 0) continue;
        if (aabb(proj, p)) { killPlayer(p); proj.life = 0; break; }
      }
    }
    projectiles = projectiles.filter(p => p.life > 0);

    // Enemies vs players
    for (const p of players) {
      if (!p || p.dead || p.invuln > 0) continue;
      for (const e of enemies) {
        if (e.trapped) continue;
        if (aabb(p, e)) { killPlayer(p); break; }
      }
    }

    // Skull vs players (hurry-up)
    if (hurrySkull) {
      const target = nearestPlayer(hurrySkull.x, hurrySkull.y);
      if (target) {
        const dx = target.x - hurrySkull.x;
        const dy = target.y - hurrySkull.y;
        const d = Math.hypot(dx, dy) || 1;
        hurrySkull.vx = (dx / d) * 70;
        hurrySkull.vy = (dy / d) * 70;
        hurrySkull.facing = dx >= 0 ? 1 : -1;
      }
      hurrySkull.x += hurrySkull.vx * dt;
      hurrySkull.y += hurrySkull.vy * dt;
      hurrySkull.pulse += dt * 5;
      for (const p of players) {
        if (!p || p.dead || p.invuln > 0) continue;
        if (aabb(p, hurrySkull)) { killPlayer(p); break; }
      }
    }

    // Hurry-up trigger
    if (!hurryUpActive && (performance.now() / 1000) - levelStartTime > HURRY_UP_TIME) {
      hurryUpActive = true;
      hurrySkull = makeSkull(W / 2 - 14, -28);
      popups.push(makePopup(W / 2, 60, 'HURRY UP!', '#ff5060'));
    }

    // Gems
    for (const g of gems) {
      g.life += dt;
      g.vy += GRAVITY * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      const c = Math.floor((g.x + g.w / 2) / TILE);
      const r = Math.floor((g.y + g.h) / TILE);
      if (g.vy > 0 && (solidAt(c, r) || platformAt(c, r))) {
        g.y = r * TILE - g.h; g.vy = 0; g.vx = 0;
      }
    }
    for (const p of players) {
      if (!p || p.dead) continue;
      gems = gems.filter(g => {
        if (aabb(p, g)) {
          const pts = g.big ? 200 : 50;
          addScore(pts, g.x + g.w / 2, g.y, false);
          stats.gemsCollected += 1;
          for (let i = 0; i < 6; i++) particles.push(makeParticle(g.x + g.w / 2, g.y + g.h / 2, '#ffd066'));
          return false;
        }
        if (g.life > 6) return false;
        return true;
      });
    }

    // Power-ups
    for (const pu of powerups) {
      pu.life += dt;
      pu.vy += GRAVITY * 0.6 * dt;
      if (pu.vy > 240) pu.vy = 240;
      pu.x += pu.vx * dt;
      pu.y += pu.vy * dt;
      const c = Math.floor((pu.x + pu.w / 2) / TILE);
      const r = Math.floor((pu.y + pu.h) / TILE);
      if (pu.vy > 0 && (solidAt(c, r) || platformAt(c, r))) {
        pu.y = r * TILE - pu.h; pu.vy = 0; pu.vx = 0;
      }
    }
    for (const p of players) {
      if (!p || p.dead) continue;
      powerups = powerups.filter(pu => {
        if (aabb(p, pu)) {
          applyPowerup(p, pu.type, pu.x + pu.w / 2, pu.y);
          return false;
        }
        if (pu.life > 12) return false;
        return true;
      });
    }

    // Particles
    for (const part of particles) {
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += GRAVITY * 0.6 * dt;
      part.life -= dt;
    }
    particles = particles.filter(part => part.life > 0);

    // Popups
    for (const pp of popups) { pp.y += pp.vy * dt; pp.life -= dt; }
    popups = popups.filter(pp => pp.life > 0);

    // Combo reset
    if ((performance.now() / 1000) - combo.lastTime > COMBO_WINDOW && combo.count > 0) {
      combo.count = 0;
      combo.mul = 1;
    }

    updateHud();

    if (enemies.length === 0 && mode === 'playing') {
      mode = 'levelWon';
      statusTimer = 0;
      const clearBonus = 500 + (hurryUpActive ? 0 : 200);
      score += clearBonus;
      popups.push(makePopup(W / 2, H / 2 + 30, `+${clearBonus}`, '#ffd066'));
      hurrySkull = null;
      updateHud();
    }
  }

  function stepVisualsOnly(dt) {
    for (const part of particles) {
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += GRAVITY * 0.6 * dt;
      part.life -= dt;
    }
    particles = particles.filter(part => part.life > 0);
    for (const pp of popups) { pp.y += pp.vy * dt; pp.life -= dt; }
    popups = popups.filter(pp => pp.life > 0);
  }

  function applyPowerup(p, type, x, y) {
    const now = performance.now() / 1000;
    const spec = POWERUP_TYPES[type];
    if (type === 'rapid')  p.rapidUntil  = now + spec.duration;
    if (type === 'speed')  p.speedUntil  = now + spec.duration;
    if (type === 'triple') p.tripleUntil = now + spec.duration;
    if (type === 'life')   p.lives += 1;
    popups.push(makePopup(x, y, spec.glyph, spec.color));
    for (let i = 0; i < 10; i++) particles.push(makeParticle(x, y, spec.color));
  }

  function killPlayer(p) {
    p.lives -= 1;
    p.dead = true;
    p.respawnTimer = 1.4;
    for (let i = 0; i < 12; i++) particles.push(makeParticle(p.x + p.w / 2, p.y + p.h / 2, '#ff6680'));
    const alivePlayers = players.filter(pl => pl.lives > 0);
    if (alivePlayers.length === 0) {
      mode = 'gameover';
      statusTimer = 0;
      saveScore(score, level);
      showGameOver();
    }
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────
  function updateHud() {
    levelEl.textContent = level;
    scoreEl.textContent = score;
    if (players && players[0]) lives1El.textContent = players[0].lives;
    if (players && players[1]) lives2El.textContent = players[1].lives;
    const free = enemies ? enemies.filter(e => !e.trapped).length : 0;
    const trapped = enemies ? enemies.filter(e => e.trapped).length : 0;
    freeEl.textContent = free;
    trappedEl.textContent = trapped;
  }

  // ─── Overlay screens ─────────────────────────────────────────────────────
  function showTitle() {
    mode = 'title';
    overlayPanel.innerHTML = `
      <h2>Pop Pals</h2>
      <p>Trap gremlins in orbs, then jump in to pop them.</p>
      <p style="font-size:0.78rem">Watch for power-ups and special bubbles. Boss every 5 levels.</p>
      <div class="actions-row">
        <button data-act="start1">1 Player</button>
        <button data-act="start2" class="alt">2 Players</button>
        <button data-act="hs" class="alt">High Scores</button>
      </div>
    `;
    bindPanelActions();
    overlay.classList.remove('hidden');
  }

  function showGameOver() {
    mode = 'gameover';
    const hsList = loadHighScores();
    const myRow = hsList.findIndex(h => h.score === score && h.level === level);
    const list = hsList.slice(0, 5).map((h, i) => `
      <div class="hs-row"${i === myRow ? ' style="color:#ffd066"' : ''}>
        <span>${i + 1}.</span>
        <span>${escapeHtml(h.name || (h.p2 ? 'co-op' : 'solo'))}</span>
        <span>L${h.level}</span>
        <span><b>${h.score}</b></span>
      </div>
    `).join('');
    overlayPanel.innerHTML = `
      <h2>Game Over</h2>
      <p>Reached level <b>${level}</b>. Score: <b>${score}</b></p>
      <div class="stat-grid">
        <span>Gremlins popped: <b>${stats.enemiesPopped}</b></span>
        <span>Gems collected: <b>${stats.gemsCollected}</b></span>
        <span>Bubbles fired: <b>${stats.totalBubbles}</b></span>
        <span>Best combo: <b>×${bestCombo}</b></span>
      </div>
      <p style="margin-top:6px;font-size:0.85rem">High scores</p>
      <div class="hs-table">
        <div class="hs-row head"><span>#</span><span>Run</span><span>Lv</span><span>Score</span></div>
        ${list || '<div style="color:var(--muted)">(none yet)</div>'}
      </div>
      <div class="actions-row">
        <button data-act="again">Play Again</button>
        <button data-act="title" class="alt">Title</button>
        <a class="btn-secondary" href="../../index.html">Quit</a>
      </div>
    `;
    bindPanelActions();
    overlay.classList.remove('hidden');
  }

  function showHighScores() {
    mode = 'highscores';
    const list = loadHighScores().map((h, i) => `
      <div class="hs-row">
        <span>${i + 1}.</span>
        <span>${escapeHtml(h.name || (h.p2 ? 'co-op' : 'solo'))}</span>
        <span>L${h.level}</span>
        <span><b>${h.score}</b></span>
      </div>
    `).join('');
    overlayPanel.innerHTML = `
      <h2>High Scores</h2>
      <div class="hs-table">
        <div class="hs-row head"><span>#</span><span>Run</span><span>Lv</span><span>Score</span></div>
        ${list || '<div style="color:var(--muted)">No scores yet — go set one!</div>'}
      </div>
      <div class="actions-row">
        <button data-act="title">Back</button>
      </div>
    `;
    bindPanelActions();
    overlay.classList.remove('hidden');
  }

  function bindPanelActions() {
    overlayPanel.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'start1') startNewGame(false);
        else if (act === 'start2') startNewGame(true);
        else if (act === 'hs') showHighScores();
        else if (act === 'again') startNewGame(p2Active);
        else if (act === 'title') showTitle();
      });
    });
  }

  function startNewGame(twoPlayer) {
    score = 0;
    players = null;
    p2Active = twoPlayer;
    p2hudEl.classList.toggle('hidden', !twoPlayer);
    bestCombo = 0;
    stats = { enemiesPopped: 0, gemsCollected: 0, totalBubbles: 0 };
    overlay.classList.add('hidden');
    loadLevel(1);
  }

  // ─── Persistence ─────────────────────────────────────────────────────────
  function loadHighScores() {
    try { return JSON.parse(localStorage.getItem('poppals-hs') || '[]'); }
    catch { return []; }
  }
  function saveScore(s, lvl) {
    const list = loadHighScores();
    list.push({ score: s, level: lvl, p2: !!p2Active, date: Date.now() });
    list.sort((a, b) => b.score - a.score);
    list.length = Math.min(8, list.length);
    localStorage.setItem('poppals-hs', JSON.stringify(list));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  // ─── Rendering ───────────────────────────────────────────────────────────
  function draw() {
    drawBackground();
    drawTerrain();
    for (const g of gems) drawGem(g);
    for (const pu of powerups) drawPowerup(pu);
    for (const b of bubbles) drawBubble(b);
    for (const e of enemies) if (!e.trapped) drawEnemy(e);
    for (const proj of projectiles) drawProjectile(proj);
    if (hurrySkull) drawSkull(hurrySkull);
    for (const p of players) if (p && !p.dead) drawPlayer(p);
    for (const part of particles) drawParticle(part);
    drawPopups();
    drawHud();
    if (mode === 'levelWon') drawLevelWon();
  }

  function drawBackground() {
    if (!theme) return;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.bg1);
    g.addColorStop(1, theme.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) {
      const x = (i * 53) % W;
      const y = (i * 71 + i * i) % H;
      ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 5) * 0.02})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawTerrain() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = grid[r][c];
        const x = c * TILE;
        const y = r * TILE;
        if (t === 1) {
          ctx.fillStyle = theme.solid;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = theme.solidLight;
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = theme.solidDark;
          ctx.fillRect(x, y + TILE - 4, TILE, 4);
          ctx.fillStyle = theme.speck;
          ctx.fillRect(x + 6, y + 6, 3, 3);
          ctx.fillRect(x + TILE - 10, y + 12, 2, 2);
        } else if (t === 2) {
          ctx.fillStyle = theme.platform;
          ctx.fillRect(x, y, TILE, 8);
          ctx.fillStyle = theme.platformLight;
          ctx.fillRect(x, y, TILE, 3);
          ctx.fillStyle = theme.platformDark;
          ctx.fillRect(x, y + 6, TILE, 2);
        }
      }
    }
  }

  function drawHud() {
    if (mode !== 'playing' && mode !== 'levelWon') return;
    const elapsed = mode === 'playing' ? (performance.now() / 1000) - levelStartTime : 0;
    if (elapsed > HURRY_UP_TIME - 5 && elapsed < HURRY_UP_TIME) {
      const t = HURRY_UP_TIME - elapsed;
      ctx.fillStyle = `rgba(255, 90, 90, ${0.5 + 0.5 * Math.sin(elapsed * 6)})`;
      ctx.font = 'bold 18px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Hurry up — ${Math.ceil(t)}s`, W / 2, 28);
    }
    // Combo indicator
    if (combo.count >= 2) {
      ctx.fillStyle = '#ffd066';
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Combo ×${combo.count}`, W - 12, 24);
    }
    // Hint when only trapped enemies remain
    if (mode === 'playing') {
      const free = enemies.filter(e => !e.trapped).length;
      const trapped = enemies.filter(e => e.trapped).length;
      if (free === 0 && trapped > 0) {
        const pulse = (Math.sin(performance.now() / 200) + 1) / 2;
        ctx.fillStyle = `rgba(255, 215, 130, ${0.7 + pulse * 0.3})`;
        ctx.font = 'bold 18px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Jump into the orbs to pop them!', W / 2, 28);
      }
    }
  }

  function drawPlayer(p) {
    if (p.invuln > 0 && Math.floor(p.blinkPhase) % 2 === 0) return;
    const x = p.x, y = p.y;
    const isP1 = p.num === 1;
    const bodyColor = isP1 ? '#ffa64d' : '#ec5fbf';
    const darkColor = isP1 ? '#c66a1a' : '#a4307f';
    const lightColor = isP1 ? '#ffd9a0' : '#ffb3e0';
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(x + p.w / 2, y + p.h / 2 + 2, p.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.arc(x + p.w / 2, y + p.h / 2 + 6, p.w / 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 3, y + 1, 4, 5);
    ctx.fillRect(x + p.w - 7, y + 1, 4, 5);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 6 + (p.facing > 0 ? 1 : -1), y + 10, 4, 5);
    ctx.fillRect(x + 14 + (p.facing > 0 ? 1 : -1), y + 10, 4, 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 7 + (p.facing > 0 ? 2 : 0), y + 11, 2, 3);
    ctx.fillRect(x + 15 + (p.facing > 0 ? 2 : 0), y + 11, 2, 3);
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 4, y + p.h - 4, 6, 4);
    ctx.fillRect(x + p.w - 10, y + p.h - 4, 6, 4);
    // Power-up aura
    const now = performance.now() / 1000;
    const auras = [];
    if (now < p.rapidUntil)  auras.push('#ff7050');
    if (now < p.speedUntil)  auras.push('#5fd0ff');
    if (now < p.tripleUntil) auras.push('#ffd066');
    for (let i = 0; i < auras.length; i++) {
      const a = 0.18 + 0.18 * Math.sin(performance.now() / 200 + i);
      ctx.strokeStyle = auras[i];
      ctx.globalAlpha = a;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + p.w / 2, y + p.h / 2 + 2, p.w / 2 + 2 + i * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemy(e) {
    const spec = ENEMY_TYPES[e.type] || ENEMY_TYPES.walker;
    const x = e.x, y = e.y;
    const bounce = Math.sin(e.animPhase) * (spec.big ? 2 : 1.5);
    if (e.alarm > 0) {
      const pulse = (Math.sin(e.alarm * 30) + 1) / 2;
      ctx.strokeStyle = `rgba(255, 80, 60, ${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + e.w / 2, y + e.h / 2 + 2, e.w / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Ghost transparency
    if (e.type === 'ghost') ctx.globalAlpha = 0.7;
    // Frozen tint
    const now = performance.now() / 1000;
    const frozen = now < e.freezeUntil;
    ctx.fillStyle = frozen ? '#9ad0ff' : spec.body;
    ctx.beginPath();
    ctx.arc(x + e.w / 2, y + e.h / 2 + 2 + bounce, e.w / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spec.dark;
    ctx.fillRect(x + 4, y + 7 + bounce, 6, 2);
    ctx.fillRect(x + e.w - 10, y + 7 + bounce, 6, 2);
    ctx.fillStyle = spec.eye;
    ctx.fillRect(x + 6, y + 10 + bounce, 4, 4);
    ctx.fillRect(x + e.w - 10, y + 10 + bounce, 4, 4);
    ctx.fillStyle = '#000';
    const eyeOff = e.facing > 0 ? 2 : 0;
    ctx.fillRect(x + 7 + eyeOff, y + 11 + bounce, 2, 3);
    ctx.fillRect(x + e.w - 9 + eyeOff, y + 11 + bounce, 2, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + e.w / 2 - 3, y + (e.h - 7) + bounce, 2, 3);
    ctx.fillRect(x + e.w / 2 + 1, y + (e.h - 7) + bounce, 2, 3);
    ctx.fillStyle = spec.dark;
    ctx.fillRect(x + 4, y + e.h - 3, 5, 3);
    ctx.fillRect(x + e.w - 9, y + e.h - 3, 5, 3);
    // Type marker
    if (e.type === 'jumper' || e.type === 'boss') {
      ctx.fillStyle = '#9affd0';
      ctx.fillRect(x + e.w / 2 - 2, y - 3, 4, 4);
    }
    if (e.type === 'sprinter') {
      ctx.fillStyle = '#ffd5d5';
      ctx.fillRect(x + e.w - 2, y + 4, 4, 2);
    }
    if (e.type === 'spitter') {
      ctx.fillStyle = '#fff5b0';
      ctx.fillRect(x + e.w / 2 - 1, y + 3, 2, 4);
    }
    // Boss HP pips
    if (e.type === 'boss') {
      for (let i = 0; i < e.maxHp; i++) {
        ctx.fillStyle = i < e.hp ? '#ff80a0' : '#3a1830';
        ctx.fillRect(x + i * 12 + 2, y - 8, 8, 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSkull(s) {
    const x = s.x, y = s.y;
    const pulse = (Math.sin(s.pulse) + 1) / 2;
    ctx.strokeStyle = `rgba(255,90,90,${0.3 + pulse * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + s.w / 2, y + s.h / 2, s.w / 2 + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.arc(x + s.w / 2, y + s.h / 2, s.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 7, y + 9, 5, 6);
    ctx.fillRect(x + s.w - 12, y + 9, 5, 6);
    ctx.fillRect(x + 9, y + s.h - 9, 2, 4);
    ctx.fillRect(x + 13, y + s.h - 9, 2, 4);
    ctx.fillRect(x + 17, y + s.h - 9, 2, 4);
  }

  function drawBubble(b) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r = b.w / 2;
    if (b.popping) {
      const t = b.popTimer / 0.2;
      ctx.strokeStyle = `rgba(255, 230, 150, ${1 - t})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r + t * 10, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    const timeLeft = BUBBLE_LIFE - b.life;
    const warning = timeLeft < 2.0;
    const flashRate = warning ? 8 + (2.0 - timeLeft) * 8 : 0;
    const flash = warning ? (Math.sin(b.life * flashRate) > 0) : false;
    const palette = BUBBLE_PALETTE[b.special || 'normal'];
    ctx.fillStyle = flash ? 'rgba(255, 80, 80, 0.4)' : palette.glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? 'rgba(255, 140, 140, 0.55)' : palette.fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(cx - r / 3, cy - r / 3, r / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = flash ? '#ff5060' : palette.stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (b.special) {
      const map = { fire: 'F', ice: 'I', lightning: 'L' };
      ctx.fillStyle = palette.stroke;
      ctx.font = 'bold 11px "SF Mono", Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(map[b.special] || '*', cx, cy + 4);
    }
    if (b.trapped) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      drawEnemy(b.trapped);
      ctx.restore();
    }
  }

  function drawGem(g) {
    const cx = g.x + g.w / 2;
    const cy = g.y + g.h / 2;
    const r = g.w / 2;
    const sparkle = Math.sin(g.life * 8) * 0.4 + 0.6;
    ctx.fillStyle = `rgba(255, 230, 100, ${sparkle * 0.4})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.big ? '#ff80a0' : '#ffd066';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff5b0';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.6);
    ctx.lineTo(cx + r * 0.4, cy);
    ctx.lineTo(cx - r * 0.4, cy);
    ctx.closePath();
    ctx.fill();
  }

  function drawPowerup(pu) {
    const spec = POWERUP_TYPES[pu.type];
    const cx = pu.x + pu.w / 2;
    const cy = pu.y + pu.h / 2;
    const pulse = (Math.sin(pu.life * 6) + 1) / 2;
    ctx.fillStyle = `rgba(255,255,255,${0.12 + pulse * 0.18})`;
    ctx.beginPath();
    ctx.arc(cx, cy, pu.w / 2 + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spec.color;
    ctx.beginPath();
    ctx.arc(cx, cy, pu.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spec.dark;
    ctx.beginPath();
    ctx.arc(cx, cy, pu.w / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(spec.glyph, cx, cy + 5);
  }

  function drawProjectile(p) {
    ctx.fillStyle = '#ffd5b0';
    ctx.beginPath();
    ctx.arc(p.x + 4, p.y + 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7848';
    ctx.beginPath();
    ctx.arc(p.x + 4, p.y + 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticle(p) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    for (const pp of popups) {
      ctx.globalAlpha = Math.min(1, pp.life);
      ctx.fillStyle = pp.color;
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawLevelWon() {
    ctx.fillStyle = 'rgba(20, 14, 30, 0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd066';
    ctx.font = 'bold 30px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Level ${level} cleared!`, W / 2, H / 2 - 6);
    ctx.font = '14px -apple-system, sans-serif';
    ctx.fillStyle = '#e6e8ee';
    ctx.fillText('+bonus · next round loading…', W / 2, H / 2 + 18);
  }

  // ─── Loop ────────────────────────────────────────────────────────────────
  function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    if (grid) draw();
    requestAnimationFrame(loop);
  }

  restartBtn.addEventListener('click', () => {
    if (mode === 'title') return;
    startNewGame(p2Active);
  });

  // ─── Boot ────────────────────────────────────────────────────────────────
  // Initialize visible state to prevent flash before title
  level = 1; score = 0; players = null; p2Active = false;
  stats = { enemiesPopped: 0, gemsCollected: 0, totalBubbles: 0 };
  updateHud();
  showTitle();
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
