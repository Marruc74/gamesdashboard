(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const statsEl = document.getElementById('stats');
  const overlay = document.getElementById('overlay');
  const panel = document.getElementById('panel');
  const restartBtn = document.getElementById('restart');

  const TILE = 24;
  const VW = canvas.width;
  const VH = canvas.height;
  const COLS_V = VW / TILE;   // 30
  const ROWS_V = VH / TILE;   // 20
  const MAP_W = 50;
  const MAP_H = 38;
  const MAX_FLOORS = 5;

  const T = {
    WALL: 0,
    FLOOR: 1,
    DOOR: 2,
    EXIT: 3,
    GENERATOR: 4,
  };

  const CLASSES = {
    knight: {
      name: 'Knight',  hp: 950, speed: 1.6, shotSpeed: 5.0, shotRate: 14,
      shotDmg: 14, shotR: 4, color: '#fbbf24', glyph: 'K',
      blurb: 'Heavy armour. Slow shots, heavy hits.',
    },
    archer: {
      name: 'Archer',  hp: 600, speed: 2.6, shotSpeed: 7.5, shotRate: 8,
      shotDmg: 7,  shotR: 3, color: '#86efac', glyph: 'A',
      blurb: 'Fast and nimble. Light damage but constant fire.',
    },
    sorcerer: {
      name: 'Sorcerer', hp: 450, speed: 1.8, shotSpeed: 4.2, shotRate: 22,
      shotDmg: 26, shotR: 5, color: '#a78bfa', glyph: 'S',
      blurb: 'Devastating arcane bolts. Fragile in melee.',
    },
    scout: {
      name: 'Scout',   hp: 550, speed: 2.9, shotSpeed: 6.5, shotRate: 10,
      shotDmg: 9,  shotR: 3, color: '#22d3ee', glyph: 'R',
      blurb: 'Quickest feet in the crypt. Balanced fire.',
    },
  };

  const MONSTER_TYPES = {
    rat:     { hp: 8,  speed: 1.4, dmg: 4,  score: 15,  color: '#9ca3af', glyph: 'r' },
    grunt:   { hp: 18, speed: 0.9, dmg: 8,  score: 35,  color: '#f472b6', glyph: 'g' },
    skeleton:{ hp: 22, speed: 1.1, dmg: 9,  score: 45,  color: '#cbd5e1', glyph: 'b' },
    ghoul:   { hp: 32, speed: 1.0, dmg: 12, score: 70,  color: '#86efac', glyph: 'h' },
    wraith:  { hp: 28, speed: 1.5, dmg: 11, score: 80,  color: '#67e8f9', glyph: 'w' },
    fiend:   { hp: 55, speed: 0.8, dmg: 18, score: 140, color: '#ef4444', glyph: 'd' },
  };

  const rnd = n => Math.random() * n;
  const rint = n => Math.floor(Math.random() * n);
  const pick = arr => arr[rint(arr.length)];
  const chance = p => Math.random() < p;

  // --- State ---
  let mode;       // 'select' | 'play' | 'dead' | 'won'
  let player, map, monsters, projectiles, generators, items, doors;
  let camera, floor, score, paused;
  let drainTimer, magicCharges, keys;
  let ringBurst = null;
  const input = Object.create(null);

  function showOverlay(html) {
    panel.innerHTML = html;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // --- Class selection ---
  function showClassSelect() {
    mode = 'select';
    const order = ['knight', 'archer', 'sorcerer', 'scout'];
    const cards = order.map((id, i) => {
      const c = CLASSES[id];
      return `
        <div class="class-card" data-class="${id}">
          <div class="glyph" style="color:${c.color}">${c.glyph}</div>
          <h3 style="color:${c.color}">${c.name}</h3>
          <div class="stats-line">HP ${c.hp} &middot; Spd ${c.speed.toFixed(1)}<br>Dmg ${c.shotDmg} &middot; Rate ${(60 / c.shotRate).toFixed(1)}/s</div>
          <p style="font-size:0.8rem;margin:6px 0 0;color:var(--muted)">${c.blurb}</p>
          <div class="key">Press ${i + 1}</div>
        </div>`;
    }).join('');
    showOverlay(`
      <h2>Choose your character</h2>
      <p>Five floors down. Find each exit. Health drains as you walk.</p>
      <div class="class-grid">${cards}</div>
      <p style="font-size:0.78rem">Click a card or press 1&ndash;4.</p>
    `);
    panel.querySelectorAll('.class-card').forEach(el => {
      el.addEventListener('click', () => startGame(el.dataset.class));
    });
  }

  function startGame(classId) {
    const cls = CLASSES[classId];
    player = {
      x: 0, y: 0,
      vx: 0, vy: 0,
      r: 9,
      hp: cls.hp, maxHp: cls.hp,
      speed: cls.speed,
      shotSpeed: cls.shotSpeed,
      shotRate: cls.shotRate,
      shotDmg: cls.shotDmg,
      shotR: cls.shotR,
      color: cls.color,
      glyph: cls.glyph,
      className: cls.name,
      shootCooldown: 0,
      dx: 1, dy: 0,
      lastNonZero: { dx: 1, dy: 0 },
      hitFlash: 0,
    };
    floor = 0;
    score = 0;
    magicCharges = 2;
    keys = 0;
    paused = false;
    drainTimer = 0;
    lastShotDir = null;
    mode = 'play';
    hideOverlay();
    nextFloor();
  }

  // --- Map generation (rooms + corridors) ---
  function generateMap() {
    const m = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(T.WALL));
    const rooms = [];
    const roomCount = 9 + rint(4);
    for (let i = 0; i < roomCount; i++) {
      const w = 5 + rint(6);
      const h = 4 + rint(4);
      const x = 1 + rint(MAP_W - w - 2);
      const y = 1 + rint(MAP_H - h - 2);
      let overlap = false;
      for (const r of rooms) {
        if (x < r.x + r.w + 1 && x + w + 1 > r.x &&
            y < r.y + r.h + 1 && y + h + 1 > r.y) {
          overlap = true; break;
        }
      }
      if (overlap) continue;
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          m[y + dy][x + dx] = T.FLOOR;
      rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
    }
    // Connect rooms in sequence
    for (let i = 1; i < rooms.length; i++) {
      carveCorridor(m, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
    }
    return { map: m, rooms };
  }

  function carveCorridor(m, x1, y1, x2, y2) {
    if (chance(0.5)) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) m[y1][x] = T.FLOOR;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) m[y][x2] = T.FLOOR;
    } else {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) m[y][x1] = T.FLOOR;
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) m[y2][x] = T.FLOOR;
    }
  }

  function placeOnFloor(rooms, predicate) {
    for (let i = 0; i < 80; i++) {
      const r = pick(rooms);
      const x = r.x + rint(r.w);
      const y = r.y + rint(r.h);
      if (map[y][x] !== T.FLOOR) continue;
      if (predicate && !predicate(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  function nextFloor() {
    floor += 1;
    if (floor > MAX_FLOORS) {
      mode = 'won';
      gameOverScreen(true);
      return;
    }
    const gen = generateMap();
    map = gen.map;
    monsters = [];
    projectiles = [];
    generators = [];
    items = [];
    doors = [];

    const rooms = gen.rooms;
    // Player at first room
    const startRoom = rooms[0];
    player.x = (startRoom.cx + 0.5) * TILE;
    player.y = (startRoom.cy + 0.5) * TILE;

    // Exit at farthest room
    let exitRoom = rooms[1] || startRoom;
    let bestD = 0;
    for (const r of rooms) {
      const d = Math.abs(r.cx - startRoom.cx) + Math.abs(r.cy - startRoom.cy);
      if (d > bestD) { bestD = d; exitRoom = r; }
    }
    map[exitRoom.cy][exitRoom.cx] = T.EXIT;

    // Generators (2-4 per floor)
    const genCount = 2 + Math.min(3, Math.floor(floor / 2)) + rint(2);
    const generatorPool = floor < 3
      ? ['rat', 'grunt']
      : floor < 4
        ? ['rat', 'grunt', 'skeleton', 'ghoul']
        : ['grunt', 'skeleton', 'ghoul', 'wraith', 'fiend'];
    for (let i = 0; i < genCount; i++) {
      const p = placeOnFloor(rooms, (x, y) =>
        Math.abs(x - startRoom.cx) + Math.abs(y - startRoom.cy) > 6 &&
        !(x === exitRoom.cx && y === exitRoom.cy) &&
        !generators.some(g => g.tx === x && g.ty === y)
      );
      if (!p) continue;
      map[p.y][p.x] = T.GENERATOR;
      generators.push({
        tx: p.x, ty: p.y,
        x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE,
        hp: 40 + floor * 15,
        maxHp: 40 + floor * 15,
        spawn: 240 - floor * 18 + rint(80),
        type: pick(generatorPool),
        pulse: 0,
      });
    }

    // Doors (1-3)
    const doorCount = 1 + rint(3);
    for (let i = 0; i < doorCount; i++) {
      const p = placeOnFloor(rooms, (x, y) => {
        if (map[y][x] !== T.FLOOR) return false;
        const ns = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(([nx,ny]) =>
          nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H ? map[ny][nx] : T.WALL);
        const wallH = ns[0] === T.WALL && ns[1] === T.WALL;
        const wallV = ns[2] === T.WALL && ns[3] === T.WALL;
        return wallH || wallV;
      });
      if (!p) continue;
      map[p.y][p.x] = T.DOOR;
      doors.push({ x: p.x, y: p.y });
    }

    // Items
    const itemCount = 5 + rint(5);
    for (let i = 0; i < itemCount; i++) {
      const p = placeOnFloor(rooms);
      if (!p) continue;
      const roll = Math.random();
      let kind = 'food';
      if (roll < 0.30) kind = 'food';
      else if (roll < 0.55) kind = 'treasure';
      else if (roll < 0.75) kind = 'key';
      else if (roll < 0.90) kind = 'potion';
      else kind = 'magic';
      items.push({
        x: (p.x + 0.5) * TILE,
        y: (p.y + 0.5) * TILE,
        tx: p.x, ty: p.y,
        kind,
      });
    }

    // Some initial monsters
    const monsterCount = 4 + floor * 2;
    for (let i = 0; i < monsterCount; i++) {
      const p = placeOnFloor(rooms, (x, y) =>
        Math.abs(x - startRoom.cx) + Math.abs(y - startRoom.cy) > 8
      );
      if (!p) continue;
      const type = pick(generatorPool);
      spawnMonster(type, (p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
    }

    camera = {
      x: Math.max(0, Math.min(MAP_W * TILE - VW, player.x - VW / 2)),
      y: Math.max(0, Math.min(MAP_H * TILE - VH, player.y - VH / 2)),
    };
  }

  function spawnMonster(type, x, y) {
    const tpl = MONSTER_TYPES[type];
    monsters.push({
      type, x, y,
      vx: 0, vy: 0,
      r: 9,
      hp: tpl.hp, maxHp: tpl.hp,
      speed: tpl.speed,
      dmg: tpl.dmg,
      score: tpl.score,
      color: tpl.color,
      glyph: tpl.glyph,
      hitFlash: 0,
      attackCd: 0,
    });
  }

  // --- Movement & collision ---
  function tileAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return T.WALL;
    return map[ty][tx];
  }

  function isBlocked(px, py, r) {
    const corners = [[px - r, py - r], [px + r, py - r], [px - r, py + r], [px + r, py + r]];
    for (const [cx, cy] of corners) {
      const t = tileAt(cx, cy);
      if (t === T.WALL || t === T.GENERATOR || t === T.DOOR) return true;
    }
    return false;
  }

  function tryOpenDoorAt(px, py, r) {
    const corners = [[px - r, py - r], [px + r, py - r], [px - r, py + r], [px + r, py + r]];
    for (const [cx, cy] of corners) {
      const tx = Math.floor(cx / TILE);
      const ty = Math.floor(cy / TILE);
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
      if (map[ty][tx] === T.DOOR) {
        map[ty][tx] = T.FLOOR;
        doors = doors.filter(d => !(d.x === tx && d.y === ty));
        keys -= 1;
        return true;
      }
    }
    return false;
  }

  function tryMove(ent, dx, dy) {
    if (!dx && !dy) return false;
    const isPlayer = ent === player;
    const canOpen = isPlayer && keys > 0;
    if (!isBlocked(ent.x + dx, ent.y + dy, ent.r)) {
      ent.x += dx; ent.y += dy;
      return true;
    }
    if (canOpen && tryOpenDoorAt(ent.x + dx, ent.y + dy, ent.r) &&
        !isBlocked(ent.x + dx, ent.y + dy, ent.r)) {
      ent.x += dx; ent.y += dy;
      return true;
    }
    if (dx && !isBlocked(ent.x + dx, ent.y, ent.r)) { ent.x += dx; return true; }
    if (dy && !isBlocked(ent.x, ent.y + dy, ent.r)) { ent.y += dy; return true; }
    if (canOpen && keys > 0) {
      if (dx && tryOpenDoorAt(ent.x + dx, ent.y, ent.r) &&
          !isBlocked(ent.x + dx, ent.y, ent.r)) { ent.x += dx; return true; }
      if (dy && tryOpenDoorAt(ent.x, ent.y + dy, ent.r) &&
          !isBlocked(ent.x, ent.y + dy, ent.r)) { ent.y += dy; return true; }
    }
    return false;
  }

  // --- Input ---
  document.addEventListener('keydown', e => {
    input[e.code] = true;
    if (mode === 'select') {
      const m = e.code.match(/^Digit(\d)$/);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        const order = ['knight', 'archer', 'sorcerer', 'scout'];
        if (idx >= 0 && idx < order.length) startGame(order[idx]);
      }
      return;
    }
    if (mode === 'dead' || mode === 'won') {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR') {
        showClassSelect();
      }
      return;
    }
    if (e.code === 'KeyP') paused = !paused;
    if (e.code === 'KeyR') showClassSelect();
    if (e.code === 'KeyQ' && !paused) useMagic();
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code.startsWith('Key')) {
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', e => { input[e.code] = false; });
  restartBtn.addEventListener('click', () => showClassSelect());

  function useMagic() {
    if (magicCharges <= 0) return;
    magicCharges -= 1;
    const range = 200;
    for (const m of monsters) {
      const dx = m.x - player.x, dy = m.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d <= range) {
        m.hp -= 80;
        m.hitFlash = 12;
        const push = (range - d) / range * 6;
        m.vx = (dx / (d || 1)) * push;
        m.vy = (dy / (d || 1)) * push;
      }
    }
    for (const g of generators) {
      const dx = g.x - player.x, dy = g.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d <= range) g.hp -= 60;
    }
    spawnRingBurst(player.x, player.y);
  }

  function spawnRingBurst(x, y) { ringBurst = { x, y, t: 0 }; }

  // --- Update ---
  function update() {
    if (paused || mode !== 'play') return;

    // Player input → velocity
    let mx = 0, my = 0;
    if (input['ArrowLeft']  || input['KeyA']) mx -= 1;
    if (input['ArrowRight'] || input['KeyD']) mx += 1;
    if (input['ArrowUp']    || input['KeyW']) my -= 1;
    if (input['ArrowDown']  || input['KeyS']) my += 1;
    if (mx || my) {
      const norm = Math.hypot(mx, my) || 1;
      mx /= norm; my /= norm;
      player.lastNonZero = { dx: mx, dy: my };
      tryMove(player, mx * player.speed, my * player.speed);
    }

    // Item pickup
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const dx = it.x - player.x, dy = it.y - player.y;
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
        items.splice(i, 1);
        applyItem(it);
      }
    }

    // Exit
    const t = tileAt(player.x, player.y);
    if (t === T.EXIT) {
      score += 200 + floor * 100;
      nextFloor();
      return;
    }

    // Firing
    if (player.shootCooldown > 0) player.shootCooldown -= 1;
    if (input['Space'] && player.shootCooldown <= 0) {
      const dir = player.lastNonZero;
      projectiles.push({
        x: player.x, y: player.y,
        vx: dir.dx * player.shotSpeed,
        vy: dir.dy * player.shotSpeed,
        r: player.shotR,
        dmg: player.shotDmg,
        owner: 'player',
        life: 80,
        color: player.color,
      });
      player.shootCooldown = player.shotRate;
    }

    // Projectiles: move
    for (const p of projectiles) {
      p.x += p.vx; p.y += p.vy;
      p.life -= 1;
    }

    // Projectiles: collisions
    for (const p of projectiles) {
      if (p.life <= 0) continue;
      if (p.owner === 'player') {
        let hit = false;
        for (const m of monsters) {
          if (m.hp <= 0) continue;
          const dx = m.x - p.x, dy = m.y - p.y;
          if (dx * dx + dy * dy < (m.r + p.r) * (m.r + p.r)) {
            m.hp -= p.dmg;
            m.hitFlash = 8;
            p.life = 0;
            hit = true;
            break;
          }
        }
        if (hit) continue;
        const tx = Math.floor(p.x / TILE);
        const ty = Math.floor(p.y / TILE);
        if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H && map[ty][tx] === T.GENERATOR) {
          const g = generators.find(gg => gg.tx === tx && gg.ty === ty);
          if (g) { g.hp -= p.dmg; g.pulse = 8; }
          p.life = 0;
          continue;
        }
      }
      if (isBlockedPoint(p.x, p.y)) p.life = 0;
    }
    projectiles = projectiles.filter(p => p.life > 0);

    // Monsters
    for (const m of monsters) {
      if (m.hp <= 0) continue;
      if (m.hitFlash > 0) m.hitFlash -= 1;
      if (m.attackCd > 0) m.attackCd -= 1;
      // Knockback velocity from magic
      if (Math.abs(m.vx) > 0.05 || Math.abs(m.vy) > 0.05) {
        tryMove(m, m.vx, m.vy);
        m.vx *= 0.85; m.vy *= 0.85;
      }
      const dx = player.x - m.x, dy = player.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d > TILE * 18) continue;
      if (d < m.r + player.r + 2) {
        if (m.attackCd <= 0) {
          damagePlayer(m.dmg, m.glyph);
          m.attackCd = 30;
        }
      } else if (d > 0) {
        const ix = (dx / d) * m.speed;
        const iy = (dy / d) * m.speed;
        if (!tryMove(m, ix, iy)) {
          if (Math.abs(dx) > Math.abs(dy)) tryMove(m, ix, 0) || tryMove(m, 0, iy);
          else tryMove(m, 0, iy) || tryMove(m, ix, 0);
        }
      }
    }

    // Score kills
    for (let i = monsters.length - 1; i >= 0; i--) {
      const m = monsters[i];
      if (m.hp <= 0) {
        score += m.score;
        monsters.splice(i, 1);
      }
    }

    // Generators
    for (let i = generators.length - 1; i >= 0; i--) {
      const g = generators[i];
      if (g.pulse > 0) g.pulse -= 1;
      if (g.hp <= 0) {
        map[g.ty][g.tx] = T.FLOOR;
        score += 100;
        generators.splice(i, 1);
        continue;
      }
      g.spawn -= 1;
      if (g.spawn <= 0 && monsters.length < 18) {
        // Spawn adjacent floor tile
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        for (const [dx, dy] of dirs) {
          const nx = g.tx + dx, ny = g.ty + dy;
          if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && map[ny][nx] === T.FLOOR) {
            spawnMonster(g.type, (nx + 0.5) * TILE, (ny + 0.5) * TILE);
            break;
          }
        }
        g.spawn = 200 - floor * 12 + rint(120);
      }
    }

    // Health drain
    drainTimer += 1;
    if (drainTimer >= 80) {
      drainTimer = 0;
      player.hp -= 1;
    }
    if (player.hp <= 0) {
      player.hp = 0;
      mode = 'dead';
      gameOverScreen(false);
      return;
    }

    if (player.hitFlash > 0) player.hitFlash -= 1;

    // Ring burst
    if (ringBurst) {
      ringBurst.t += 1;
      if (ringBurst.t > 24) ringBurst = null;
    }

    // Camera follows player
    camera = {
      x: Math.max(0, Math.min(MAP_W * TILE - VW, player.x - VW / 2)),
      y: Math.max(0, Math.min(MAP_H * TILE - VH, player.y - VH / 2)),
    };
  }

  function isBlockedPoint(px, py) {
    const t = tileAt(px, py);
    return t === T.WALL || t === T.GENERATOR || t === T.DOOR;
  }

  function applyItem(it) {
    if (it.kind === 'food') {
      const h = 120 + rint(80);
      player.hp = Math.min(player.maxHp, player.hp + h);
      score += 10;
    } else if (it.kind === 'treasure') {
      score += 100 + rint(80);
    } else if (it.kind === 'key') {
      keys += 1;
      score += 25;
    } else if (it.kind === 'potion') {
      const h = 250 + rint(150);
      player.hp = Math.min(player.maxHp, player.hp + h);
      score += 40;
    } else if (it.kind === 'magic') {
      magicCharges += 1;
      score += 60;
    }
  }

  function damagePlayer(dmg, glyph) {
    if (player.hitFlash > 0) return;
    player.hp -= dmg;
    player.hitFlash = 18;
  }

  // --- Rendering ---
  function render() {
    ctx.fillStyle = '#06080d';
    ctx.fillRect(0, 0, VW, VH);
    if (mode === 'select') return;

    const cx0 = Math.floor(camera.x / TILE);
    const cy0 = Math.floor(camera.y / TILE);
    const cx1 = Math.min(MAP_W, cx0 + COLS_V + 2);
    const cy1 = Math.min(MAP_H, cy0 + ROWS_V + 2);

    // Tiles
    for (let y = cy0; y < cy1; y++) {
      for (let x = cx0; x < cx1; x++) {
        const t = map[y][x];
        const sx = x * TILE - camera.x;
        const sy = y * TILE - camera.y;
        if (t === T.WALL) {
          ctx.fillStyle = '#1f2433';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = '#2a3142';
          ctx.fillRect(sx, sy, TILE, 3);
        } else if (t === T.FLOOR) {
          ctx.fillStyle = '#0d1119';
          ctx.fillRect(sx, sy, TILE, TILE);
          // subtle stipple
          if ((x + y) % 7 === 0) {
            ctx.fillStyle = '#141a25';
            ctx.fillRect(sx + 4, sy + 4, 2, 2);
          }
        } else if (t === T.DOOR) {
          ctx.fillStyle = '#0d1119';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(sx + 2, sy + 4, TILE - 4, TILE - 8);
          ctx.fillStyle = '#fcd34d';
          ctx.fillRect(sx + TILE / 2 - 1, sy + TILE / 2 - 1, 2, 2);
        } else if (t === T.EXIT) {
          ctx.fillStyle = '#0d1119';
          ctx.fillRect(sx, sy, TILE, TILE);
          const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 250);
          ctx.fillStyle = `rgba(167,139,250,${pulse})`;
          ctx.fillRect(sx + 3, sy + 3, TILE - 6, TILE - 6);
          ctx.fillStyle = '#1a1825';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('>', sx + TILE / 2, sy + TILE / 2 + 1);
        } else if (t === T.GENERATOR) {
          // drawn below with HP bar
        }
      }
    }

    // Generators
    for (const g of generators) {
      if (g.x < camera.x - TILE || g.x > camera.x + VW + TILE) continue;
      const sx = g.x - camera.x;
      const sy = g.y - camera.y;
      ctx.fillStyle = '#0d1119';
      ctx.fillRect(sx - TILE / 2, sy - TILE / 2, TILE, TILE);
      const tpl = MONSTER_TYPES[g.type];
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
      ctx.fillStyle = tpl ? tpl.color : '#ef4444';
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(sx, sy, TILE / 2 - 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g.pulse > 0 ? '#fde047' : '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, TILE / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();
      // HP bar
      const w = TILE - 4;
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(sx - w / 2, sy + TILE / 2 - 2, w, 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(sx - w / 2, sy + TILE / 2 - 2, w * (g.hp / g.maxHp), 3);
    }

    // Items
    for (const it of items) {
      if (it.x < camera.x - TILE || it.x > camera.x + VW + TILE) continue;
      const sx = it.x - camera.x;
      const sy = it.y - camera.y;
      drawItem(sx, sy, it.kind);
    }

    // Projectiles
    for (const p of projectiles) {
      const sx = p.x - camera.x;
      const sy = p.y - camera.y;
      ctx.fillStyle = p.color || '#fde047';
      ctx.beginPath();
      ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Monsters
    for (const m of monsters) {
      const sx = m.x - camera.x;
      const sy = m.y - camera.y;
      ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : m.color;
      ctx.beginPath();
      ctx.arc(sx, sy, m.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#06080d';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.glyph, sx, sy + 1);
      // small hp bar
      if (m.hp < m.maxHp) {
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(sx - 10, sy - m.r - 5, 20, 3);
        ctx.fillStyle = '#86efac';
        ctx.fillRect(sx - 10, sy - m.r - 5, 20 * (m.hp / m.maxHp), 3);
      }
    }

    // Player
    {
      const sx = player.x - camera.x;
      const sy = player.y - camera.y;
      ctx.fillStyle = player.hitFlash > 0 ? '#ef4444' : player.color;
      ctx.beginPath();
      ctx.arc(sx, sy, player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#06080d';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.glyph, sx, sy + 1);
      // facing indicator
      const d = player.lastNonZero;
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + d.dx * 14, sy + d.dy * 14);
      ctx.stroke();
    }

    // Ring burst (magic)
    if (ringBurst) {
      const sx = ringBurst.x - camera.x;
      const sy = ringBurst.y - camera.y;
      const r = ringBurst.t * 9;
      ctx.strokeStyle = `rgba(167,139,250,${1 - ringBurst.t / 24})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (paused) {
      ctx.fillStyle = 'rgba(6,8,13,0.6)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = '#e6e8ee';
      ctx.font = 'bold 30px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Paused', VW / 2, VH / 2);
    }
  }

  function drawItem(sx, sy, kind) {
    if (kind === 'food') {
      ctx.fillStyle = '#86efac';
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d1119';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', sx, sy + 1);
    } else if (kind === 'treasure') {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(sx - 5, sy - 5, 10, 10);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(sx - 5, sy - 2, 10, 2);
    } else if (kind === 'key') {
      ctx.fillStyle = '#fde047';
      ctx.fillRect(sx - 5, sy - 1, 8, 3);
      ctx.beginPath();
      ctx.arc(sx + 4, sy + 0.5, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'potion') {
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(sx - 3, sy - 6, 6, 9);
      ctx.fillStyle = '#fbcfe8';
      ctx.fillRect(sx - 2, sy - 7, 4, 2);
    } else if (kind === 'magic') {
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6);
      ctx.lineTo(sx + 5, sy + 4);
      ctx.lineTo(sx - 5, sy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0d1119';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('*', sx, sy + 1);
    }
  }

  function renderStats() {
    if (mode === 'select') {
      statsEl.innerHTML = '';
      return;
    }
    const hpPct = player ? Math.max(0, player.hp / player.maxHp) : 0;
    const hpColor = hpPct > 0.5 ? '#86efac' : hpPct > 0.2 ? '#fbbf24' : '#ef4444';
    statsEl.innerHTML = `
      <span>${player.className}</span>
      <span>HP: <b style="color:${hpColor}">${Math.max(0, Math.ceil(player.hp))}/${player.maxHp}</b></span>
      <span>Floor: <b>${floor}/${MAX_FLOORS}</b></span>
      <span>Score: <b>${score}</b></span>
      <span>Keys: <b>${keys}</b></span>
      <span>Magic: <b>${magicCharges}</b></span>
    `;
  }

  function gameOverScreen(won) {
    if (window.GD) window.GD.record('crypt-run', score, 'score');
    showOverlay(`
      <h2>${won ? 'You Escape the Crypt' : 'You Have Fallen'}</h2>
      <p>${won ? 'Daylight, at last.' : `Floor ${floor}.`}</p>
      <p>Final score: <b style="color:var(--accent)">${score}</b></p>
      <p style="font-size:0.85rem">Press <b>R</b> or click below for a new run.</p>
      <button id="again">Try Again</button>
    `);
    panel.querySelector('#again').addEventListener('click', () => showClassSelect());
  }

  function loop() {
    update();
    render();
    renderStats();
    requestAnimationFrame(loop);
  }

  showClassSelect();
  requestAnimationFrame(loop);
})();
