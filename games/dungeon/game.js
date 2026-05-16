(() => {
  const W = 80;
  const H = 24;
  const SIGHT = 8;
  const MAX_FLOORS = 10;

  const TILE = { VOID: 0, WALL: 1, FLOOR: 2, DOOR: 3, STAIRS_DOWN: 4, STAIRS_UP: 5 };
  const TILE_CHAR  = [' ', '#', '.', '+', '>', '<'];
  const TILE_CLASS = ['t-void', 't-wall', 't-floor', 't-door', 't-stairs', 't-stairs'];

  const DIRS_8 = [
    [ 1, 0], [-1, 0], [ 0, 1], [ 0,-1],
    [ 1, 1], [-1, 1], [ 1,-1], [-1,-1],
  ];

  const rnd = n => Math.floor(Math.random() * n);
  const range = (a, b) => a + rnd(b - a + 1);
  const pick = arr => arr[rnd(arr.length)];
  const chance = p => Math.random() < p;

  const WEAPONS = [
    { id: 'dagger',       name: 'dagger',         atk: 2 },
    { id: 'short_sword',  name: 'short sword',    atk: 4 },
    { id: 'mace',         name: 'mace',           atk: 5 },
    { id: 'long_sword',   name: 'long sword',     atk: 6 },
    { id: 'battle_axe',   name: 'battle axe',     atk: 8 },
    { id: 'two_hander',   name: 'two-handed sword', atk: 11 },
  ];
  const ARMORS = [
    { id: 'leather', name: 'leather armor', def: 2 },
    { id: 'chain',   name: 'chain mail',    def: 4 },
    { id: 'plate',   name: 'plate mail',    def: 6 },
    { id: 'mithril', name: 'mithril mail',  def: 9 },
  ];
  const POTION_KINDS = [
    { id: 'healing',       name: 'potion of healing' },
    { id: 'extra_healing', name: 'potion of extra healing' },
    { id: 'poison',        name: 'potion of poison' },
    { id: 'confusion',     name: 'potion of confusion' },
  ];
  const SCROLL_KINDS = [
    { id: 'identify',      name: 'scroll of identify' },
    { id: 'teleport',      name: 'scroll of teleport' },
    { id: 'remove_curse',  name: 'scroll of remove curse' },
    { id: 'magic_mapping', name: 'scroll of magic mapping' },
  ];
  const FOODS = [
    { id: 'ration', name: 'food ration',  nutrition: 600 },
    { id: 'bread',  name: 'loaf of bread', nutrition: 350 },
    { id: 'apple',  name: 'apple',         nutrition: 200 },
  ];
  const POTION_COLORS = [
    'blue', 'red', 'green', 'yellow', 'clear', 'purple',
    'cloudy', 'fizzy', 'amber', 'milky', 'silver', 'inky',
  ];
  const SCROLL_LABELS = [
    'ZELGO MER', 'JUYED AWK', 'NR 9', 'XIXAXA',
    'PRATYAVAYAH', 'DAIYEN FOOELS', 'LEP GEX VEN',
    'PRIRUTSENIE', 'ANDOVA BEGOI', 'KIRJE',
  ];

  const MONSTERS = [
    { letter: 'r', name: 'rat',       hp:  4, atk:  2, def: 0, xp:   2, min: 1, max:  4, speed: 1 },
    { letter: 'b', name: 'bat',       hp:  3, atk:  2, def: 0, xp:   2, min: 1, max:  5, speed: 2 },
    { letter: 's', name: 'snake',     hp:  6, atk:  3, def: 1, xp:   4, min: 1, max:  4, speed: 1 },
    { letter: 'k', name: 'kobold',    hp:  6, atk:  3, def: 1, xp:   5, min: 1, max:  4, speed: 1 },
    { letter: 'g', name: 'goblin',    hp:  9, atk:  4, def: 1, xp:   7, min: 2, max:  5, speed: 1 },
    { letter: 'd', name: 'jackal',    hp: 11, atk:  5, def: 1, xp:   9, min: 1, max:  5, speed: 2 },
    { letter: 'z', name: 'zombie',    hp: 14, atk:  5, def: 1, xp:  11, min: 2, max:  6, speed: 1 },
    { letter: 'G', name: 'gnome',     hp: 10, atk:  5, def: 2, xp:  11, min: 2, max:  5, speed: 1 },
    { letter: 'o', name: 'orc',       hp: 18, atk:  7, def: 2, xp:  16, min: 3, max:  7, speed: 1 },
    { letter: 'C', name: 'centaur',   hp: 26, atk:  8, def: 3, xp:  24, min: 4, max:  8, speed: 2, strong: true },
    { letter: 'W', name: 'wraith',    hp: 28, atk: 10, def: 3, xp:  38, min: 5, max:  8, speed: 1, strong: true },
    { letter: 'T', name: 'troll',     hp: 36, atk: 11, def: 4, xp:  48, min: 5, max:  9, speed: 1, strong: true },
    { letter: 'M', name: 'minotaur',  hp: 48, atk: 13, def: 5, xp:  72, min: 6, max:  9, speed: 1, strong: true },
    { letter: '&', name: 'demon',     hp: 58, atk: 16, def: 6, xp: 100, min: 7, max: 10, speed: 1, boss: true },
    { letter: 'D', name: 'dragon',    hp: 95, atk: 22, def: 8, xp: 200, min: 8, max: 10, speed: 1, boss: true },
  ];

  // --- State ---
  let game;
  let appearances;
  let identified;
  let modalState = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function log(msg, type = 'normal') {
    game.messages.push({ msg, type });
    if (game.messages.length > 50) game.messages.shift();
  }

  // --- Items ---
  function makeItem(category, id, qty = 1) {
    if (category === 'weapon') {
      const w = WEAPONS.find(x => x.id === id);
      return { category, id, name: w.name, atk: w.atk, char: ')' };
    }
    if (category === 'armor') {
      const a = ARMORS.find(x => x.id === id);
      return { category, id, name: a.name, def: a.def, char: '[' };
    }
    if (category === 'potion') {
      const p = POTION_KINDS.find(x => x.id === id);
      return { category, id, name: p.name, char: '!' };
    }
    if (category === 'scroll') {
      const s = SCROLL_KINDS.find(x => x.id === id);
      return { category, id, name: s.name, char: '?' };
    }
    if (category === 'food') {
      const f = FOODS.find(x => x.id === id);
      return { category, id, name: f.name, nutrition: f.nutrition, char: '%' };
    }
    if (category === 'gold') {
      return { category, id: 'gold', name: 'gold', amount: qty, char: '$' };
    }
  }

  function displayName(item) {
    if (item.category === 'potion' && !identified[item.id]) {
      return `${appearances.potions[item.id]} potion`;
    }
    if (item.category === 'scroll' && !identified[item.id]) {
      return `scroll labeled ${appearances.scrolls[item.id]}`;
    }
    if (item.category === 'gold') return `${item.amount} gold pieces`;
    return item.name;
  }

  function article(name) {
    return /^[aeiou]/i.test(name) ? 'an' : 'a';
  }

  function generateRandomItem(floor) {
    const roll = Math.random();
    if (roll < 0.10) {
      const tier = Math.min(WEAPONS.length - 1, Math.floor((floor - 1) / 2) + rnd(2));
      return makeItem('weapon', WEAPONS[tier].id);
    }
    if (roll < 0.18) {
      const tier = Math.min(ARMORS.length - 1, Math.floor((floor - 1) / 3) + rnd(2));
      return makeItem('armor', ARMORS[tier].id);
    }
    if (roll < 0.40) return makeItem('potion', pick(POTION_KINDS).id);
    if (roll < 0.55) return makeItem('scroll', pick(SCROLL_KINDS).id);
    if (roll < 0.75) return makeItem('food', pick(FOODS).id);
    return makeItem('gold', null, range(5, 18) + floor * 4);
  }

  // --- Map generation (BSP) ---
  function generateMap(floor) {
    const map = Array.from({ length: H }, () => Array(W).fill(TILE.VOID));
    const rooms = [];

    function partition(x, y, w, h, depth) {
      const minSize = 7;
      const canSplitH = h >= minSize * 2 + 1;
      const canSplitV = w >= minSize * 2 + 1;
      if (depth >= 4 || (!canSplitH && !canSplitV) || (depth >= 2 && chance(0.25))) {
        const rw = Math.max(4, Math.min(w - 2, range(4, Math.max(4, w - 2))));
        const rh = Math.max(3, Math.min(h - 2, range(3, Math.max(3, h - 2))));
        const rx = x + 1 + rnd(Math.max(1, w - rw - 1));
        const ry = y + 1 + rnd(Math.max(1, h - rh - 1));
        for (let dy = 0; dy < rh; dy++) {
          for (let dx = 0; dx < rw; dx++) {
            map[ry + dy][rx + dx] = TILE.FLOOR;
          }
        }
        const room = {
          x: rx, y: ry, w: rw, h: rh,
          cx: rx + Math.floor(rw / 2),
          cy: ry + Math.floor(rh / 2),
        };
        rooms.push(room);
        return [room];
      }
      let splitH = canSplitH && (!canSplitV || chance(0.5));
      if (splitH) {
        const s = range(minSize, h - minSize);
        const a = partition(x, y, w, s, depth + 1);
        const b = partition(x, y + s, w, h - s, depth + 1);
        const ra = pick(a), rb = pick(b);
        carveCorridor(map, ra.cx, ra.cy, rb.cx, rb.cy);
        return a.concat(b);
      } else {
        const s = range(minSize, w - minSize);
        const a = partition(x, y, s, h, depth + 1);
        const b = partition(x + s, y, w - s, h, depth + 1);
        const ra = pick(a), rb = pick(b);
        carveCorridor(map, ra.cx, ra.cy, rb.cx, rb.cy);
        return a.concat(b);
      }
    }
    partition(0, 0, W, H, 0);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (map[y][x] !== TILE.VOID) continue;
        for (const [dx, dy] of DIRS_8) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && map[ny][nx] === TILE.FLOOR) {
            map[y][x] = TILE.WALL;
            break;
          }
        }
      }
    }

    if (rooms.length < 2) {
      rooms.push({ x: 1, y: 1, w: 4, h: 3, cx: 3, cy: 2 });
      for (let dy = 0; dy < 3; dy++)
        for (let dx = 0; dx < 4; dx++)
          map[1 + dy][1 + dx] = TILE.FLOOR;
    }

    const startRoom = pick(rooms);
    const others = rooms.filter(r => r !== startRoom);
    const endRoom = others.length ? pick(others) : startRoom;
    if (floor > 1) map[startRoom.cy][startRoom.cx] = TILE.STAIRS_UP;
    map[endRoom.cy][endRoom.cx] = TILE.STAIRS_DOWN;

    return { map, rooms, startRoom, endRoom };
  }

  function carveCorridor(map, x1, y1, x2, y2) {
    if (chance(0.5)) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (map[y1][x] !== TILE.FLOOR) map[y1][x] = TILE.FLOOR;
      }
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        if (map[y][x2] !== TILE.FLOOR) map[y][x2] = TILE.FLOOR;
      }
    } else {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        if (map[y][x1] !== TILE.FLOOR) map[y][x1] = TILE.FLOOR;
      }
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (map[y2][x] !== TILE.FLOOR) map[y2][x] = TILE.FLOOR;
      }
    }
  }

  function enterFloor(floor) {
    game.floor = floor;
    const { map, rooms, startRoom, endRoom } = generateMap(floor);
    game.map = map;
    game.visible = Array.from({ length: H }, () => Array(W).fill(false));
    game.seen    = Array.from({ length: H }, () => Array(W).fill(false));
    game.monsters = [];
    game.items = [];
    game.rooms = rooms;

    game.player.x = startRoom.cx;
    game.player.y = startRoom.cy;

    const monsterCount = 4 + floor + rnd(4);
    for (let i = 0; i < monsterCount; i++) {
      const eligible = MONSTERS.filter(m => floor >= m.min && floor <= m.max);
      if (!eligible.length) continue;
      const template = pick(eligible);
      const placed = placeAt(rooms, (x, y) =>
        !(x === game.player.x && y === game.player.y) &&
        !game.monsters.some(m => m.x === x && m.y === y)
      );
      if (!placed) continue;
      game.monsters.push({
        ...template,
        x: placed.x, y: placed.y,
        maxHp: template.hp,
        currentHp: template.hp,
      });
    }

    const itemCount = 3 + rnd(4);
    for (let i = 0; i < itemCount; i++) {
      const placed = placeAt(rooms, (x, y) =>
        !game.items.some(it => it.x === x && it.y === y)
      );
      if (!placed) continue;
      const it = generateRandomItem(floor);
      it.x = placed.x;
      it.y = placed.y;
      game.items.push(it);
    }

    computeFOV();
  }

  function placeAt(rooms, predicate) {
    for (let i = 0; i < 30; i++) {
      const room = pick(rooms);
      if (!room) continue;
      const x = room.x + rnd(room.w);
      const y = room.y + rnd(room.h);
      if (game.map[y][x] !== TILE.FLOOR) continue;
      if (predicate && !predicate(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  // --- FOV (Bresenham raycast within radius) ---
  function computeFOV() {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) game.visible[y][x] = false;
    }
    const px = game.player.x, py = game.player.y;
    game.visible[py][px] = true;
    game.seen[py][px] = true;
    const r2 = SIGHT * SIGHT;
    for (let dy = -SIGHT; dy <= SIGHT; dy++) {
      for (let dx = -SIGHT; dx <= SIGHT; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        castRay(px, py, px + dx, py + dy);
      }
    }
  }

  function castRay(x1, y1, x2, y2) {
    let x = x1, y = y1;
    const dxAbs = Math.abs(x2 - x1);
    const dyAbs = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dxAbs - dyAbs;
    while (true) {
      if (x !== x1 || y !== y1) {
        if (x < 0 || x >= W || y < 0 || y >= H) return;
        game.visible[y][x] = true;
        game.seen[y][x] = true;
        if (game.map[y][x] === TILE.WALL) return;
      }
      if (x === x2 && y === y2) return;
      const e2 = 2 * err;
      if (e2 > -dyAbs) { err -= dyAbs; x += sx; }
      if (e2 <  dxAbs) { err += dxAbs; y += sy; }
    }
  }

  // --- Combat ---
  function playerAttack() {
    return game.player.atk + (game.player.weapon ? game.player.weapon.atk : 0);
  }
  function playerDefense() {
    return game.player.def + (game.player.armor ? game.player.armor.def : 0);
  }

  function attackPlayer(monster) {
    const dmg = Math.max(1, monster.atk - playerDefense() + rnd(3) - 1);
    game.player.hp -= dmg;
    log(`The ${monster.name} hits you for ${dmg}.`, 'bad');
    if (game.player.hp <= 0) {
      game.player.hp = 0;
      die(`killed by a ${monster.name} on floor ${game.floor}`);
    }
  }

  function attackMonster(monster) {
    const dmg = Math.max(1, playerAttack() - monster.def + rnd(3) - 1);
    monster.currentHp -= dmg;
    if (monster.currentHp <= 0) {
      game.monsters = game.monsters.filter(m => m !== monster);
      game.player.xp += monster.xp;
      log(`You kill the ${monster.name}. (+${monster.xp} XP)`, 'good');
      maybeLevelUp();
    } else {
      log(`You hit the ${monster.name} for ${dmg}.`);
    }
  }

  function maybeLevelUp() {
    while (game.player.xp >= game.player.nextLevelXp) {
      game.player.level += 1;
      const gain = 5 + rnd(4);
      game.player.maxHp += gain;
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + gain);
      game.player.atk += 1;
      if (game.player.level % 2 === 0) game.player.def += 1;
      log(`You reach level ${game.player.level}!`, 'good');
      game.player.nextLevelXp = Math.floor(20 * Math.pow(1.6, game.player.level - 1));
    }
  }

  // --- Pathfinding (BFS) ---
  function bfsStepToward(fromX, fromY, targetX, targetY) {
    const visited = Array.from({ length: H }, () => Array(W).fill(false));
    const parent = Array.from({ length: H }, () => Array(W).fill(null));
    visited[fromY][fromX] = true;
    const queue = [[fromX, fromY]];
    let head = 0;
    const limit = 28;
    while (head < queue.length) {
      const cell = queue[head++];
      const x = cell[0], y = cell[1];
      if (x === targetX && y === targetY) {
        let cx = x, cy = y, last = null;
        while (parent[cy][cx]) {
          last = [cx, cy];
          const p = parent[cy][cx];
          cx = p[0]; cy = p[1];
        }
        return last;
      }
      if (Math.abs(x - fromX) + Math.abs(y - fromY) >= limit) continue;
      for (const [dx, dy] of DIRS_8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        if (visited[ny][nx]) continue;
        const isTarget = nx === targetX && ny === targetY;
        if (!isWalkable(nx, ny) && !isTarget) continue;
        if (!isTarget && monsterAt(nx, ny)) continue;
        visited[ny][nx] = true;
        parent[ny][nx] = [x, y];
        queue.push([nx, ny]);
      }
    }
    return null;
  }

  function isWalkable(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    const t = game.map[y][x];
    return t === TILE.FLOOR || t === TILE.DOOR || t === TILE.STAIRS_UP || t === TILE.STAIRS_DOWN;
  }

  function monsterAt(x, y) {
    return game.monsters.find(m => m.x === x && m.y === y);
  }
  function itemAt(x, y) {
    return game.items.find(it => it.x === x && it.y === y);
  }

  // --- Monster turn ---
  function monsterAct(monster) {
    if (!game.monsters.includes(monster)) return;
    const seesPlayer = game.visible[monster.y][monster.x];
    const adjacent = Math.abs(monster.x - game.player.x) <= 1 && Math.abs(monster.y - game.player.y) <= 1;
    if (adjacent) {
      attackPlayer(monster);
      return;
    }
    if (seesPlayer) {
      const next = bfsStepToward(monster.x, monster.y, game.player.x, game.player.y);
      if (next) {
        monster.x = next[0];
        monster.y = next[1];
      }
      return;
    }
    if (chance(0.5)) {
      const d = pick(DIRS_8);
      const nx = monster.x + d[0], ny = monster.y + d[1];
      if (isWalkable(nx, ny) && !monsterAt(nx, ny) &&
          !(nx === game.player.x && ny === game.player.y)) {
        monster.x = nx; monster.y = ny;
      }
    }
  }

  // --- Player actions ---
  function playerMove(dx, dy) {
    if (game.dead || game.won) return;
    if (game.player.confused > 0 && chance(0.35)) {
      const d = pick(DIRS_8);
      dx = d[0]; dy = d[1];
    }
    const nx = game.player.x + dx, ny = game.player.y + dy;
    const monster = monsterAt(nx, ny);
    if (monster) {
      attackMonster(monster);
      endTurn(true);
      return;
    }
    if (!isWalkable(nx, ny)) return;
    game.player.x = nx;
    game.player.y = ny;
    const it = itemAt(nx, ny);
    if (it) log(`You see ${article(displayName(it))} ${displayName(it)} here.`);
    const t = game.map[ny][nx];
    if (t === TILE.STAIRS_DOWN) log('There are stairs down here. (> to descend)');
    else if (t === TILE.STAIRS_UP) log('There are stairs up here. (< to ascend)');
    endTurn(true);
  }

  function wait() {
    log('You rest a moment.');
    endTurn(true);
  }

  function pickup() {
    const it = itemAt(game.player.x, game.player.y);
    if (!it) { log('There is nothing here to pick up.'); return; }
    if (it.category === 'gold') {
      game.player.gold += it.amount;
      log(`You pick up ${it.amount} gold pieces.`);
      game.items = game.items.filter(x => x !== it);
    } else {
      if (game.player.inventory.length >= 26) {
        log('Your pack is full.');
        return;
      }
      game.items = game.items.filter(x => x !== it);
      game.player.inventory.push(it);
      log(`You pick up ${article(displayName(it))} ${displayName(it)}.`);
    }
    endTurn(true);
  }

  function useStairs(dir) {
    const t = game.map[game.player.y][game.player.x];
    if (dir === 'down') {
      if (t !== TILE.STAIRS_DOWN) { log('There are no stairs down here.'); return; }
      if (game.floor >= MAX_FLOORS) {
        game.won = true;
        log('You descend to the bottom of the dungeon — and find daylight beyond! You win!', 'good');
        gameOverScreen();
        return;
      }
      enterFloor(game.floor + 1);
      log(`You descend to floor ${game.floor}.`);
      render();
    } else {
      if (t !== TILE.STAIRS_UP) { log('There are no stairs up here.'); return; }
      if (game.floor === 1) { log("You can't leave the dungeon yet — there's nothing for you outside."); return; }
      enterFloor(game.floor - 1);
      log(`You climb to floor ${game.floor}.`);
      render();
    }
  }

  function applyItem(item) {
    const idx = game.player.inventory.indexOf(item);
    if (idx < 0) return;
    if (item.category === 'potion') {
      identified[item.id] = true;
      applyPotion(item);
      game.player.inventory.splice(idx, 1);
    } else if (item.category === 'scroll') {
      identified[item.id] = true;
      applyScroll(item);
      game.player.inventory.splice(idx, 1);
    } else if (item.category === 'food') {
      game.player.hunger = Math.min(2000, game.player.hunger + item.nutrition);
      log(`You eat the ${item.name}.`);
      game.player.inventory.splice(idx, 1);
    } else if (item.category === 'weapon') {
      game.player.weapon = item;
      log(`You wield the ${item.name}.`);
    } else if (item.category === 'armor') {
      game.player.armor = item;
      log(`You wear the ${item.name}.`);
    }
    endTurn(true);
  }

  function applyPotion(item) {
    const p = game.player;
    if (item.id === 'healing') {
      const h = 10 + rnd(8);
      p.hp = Math.min(p.maxHp, p.hp + h);
      log(`You feel better. (+${h} HP)`, 'good');
    } else if (item.id === 'extra_healing') {
      const h = 25 + rnd(12);
      p.maxHp += 2;
      p.hp = Math.min(p.maxHp, p.hp + h);
      log(`Healing energy floods you. (+${h} HP, +2 max)`, 'good');
    } else if (item.id === 'poison') {
      const d = 6 + rnd(8);
      p.hp -= d;
      log(`The potion burns! Poison! (-${d} HP)`, 'bad');
      if (p.hp <= 0) die('killed by a poisoned potion');
    } else if (item.id === 'confusion') {
      p.confused += 15 + rnd(10);
      log('The room spins around you.', 'bad');
    }
  }

  function applyScroll(item) {
    if (item.id === 'identify') {
      let any = false;
      for (const it of game.player.inventory) {
        if ((it.category === 'potion' || it.category === 'scroll') && !identified[it.id]) {
          identified[it.id] = true;
          log(`You identify ${article(displayName(it))} ${displayName(it)}.`);
          any = true;
        }
      }
      if (!any) log('Nothing in your pack needs identifying.');
    } else if (item.id === 'teleport') {
      for (let i = 0; i < 200; i++) {
        const x = rnd(W), y = rnd(H);
        if (isWalkable(x, y) && !monsterAt(x, y) &&
            !(x === game.player.x && y === game.player.y)) {
          game.player.x = x;
          game.player.y = y;
          log('You blink across the floor.', 'good');
          return;
        }
      }
      log('You feel a brief tug, then nothing.');
    } else if (item.id === 'remove_curse') {
      if (game.player.confused > 0) {
        game.player.confused = 0;
        log('Your head clears.', 'good');
      } else {
        log('A wave of warmth passes over you.');
      }
    } else if (item.id === 'magic_mapping') {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (game.map[y][x] !== TILE.VOID) game.seen[y][x] = true;
      log('A map of the floor unrolls in your mind.', 'good');
    }
  }

  function dropItem(item) {
    const idx = game.player.inventory.indexOf(item);
    if (idx < 0) return;
    if (game.player.weapon === item) {
      game.player.weapon = null;
      log(`You stop wielding the ${item.name}.`);
    }
    if (game.player.armor === item) {
      game.player.armor = null;
      log(`You take off the ${item.name}.`);
    }
    if (itemAt(game.player.x, game.player.y)) {
      log("There's already something on the floor here.");
      return;
    }
    item.x = game.player.x;
    item.y = game.player.y;
    game.items.push(item);
    game.player.inventory.splice(idx, 1);
    log(`You drop ${article(displayName(item))} ${displayName(item)}.`);
    endTurn(true);
  }

  // --- Turn flow ---
  function endTurn(runMonsters) {
    if (game.dead || game.won) {
      computeFOV();
      render();
      return;
    }
    game.turn += 1;

    if (runMonsters) {
      const snapshot = game.monsters.slice();
      for (const m of snapshot) {
        if (!game.monsters.includes(m)) continue;
        const acts = m.speed || 1;
        for (let i = 0; i < acts; i++) {
          if (!game.monsters.includes(m)) break;
          if (game.dead) break;
          monsterAct(m);
        }
        if (game.dead) break;
      }
    }

    if (!game.dead) {
      game.player.hunger -= 1;
      if (game.player.hunger === 200) log("You're starting to feel hungry.");
      else if (game.player.hunger === 60) log("You feel weak from hunger.", 'bad');
      if (game.player.hunger <= 0) {
        game.player.hunger = 0;
        if (game.turn % 4 === 0) {
          game.player.hp -= 1;
          log("You're starving!", 'bad');
          if (game.player.hp <= 0) die('starvation');
        }
      }
      if (game.player.confused > 0) {
        game.player.confused -= 1;
        if (game.player.confused === 0) log('You feel less confused.');
      }
    }

    computeFOV();
    render();
  }

  // --- Death / scoring ---
  function die(cause) {
    if (game.dead) return;
    game.dead = true;
    game.deathCause = cause;
    log(`You die. (${cause})`, 'bad');
    gameOverScreen();
  }

  function score() {
    const p = game.player;
    return p.gold + p.xp * 4 + game.floor * 120 + (game.won ? 1000 : 0);
  }

  function getHighScores() {
    try { return JSON.parse(localStorage.getItem('dungeon-highscores') || '[]'); }
    catch { return []; }
  }
  function saveHighScore(s) {
    const list = getHighScores();
    list.push({
      score: s,
      floor: game.floor,
      level: game.player.level,
      won: game.won,
      cause: game.deathCause || (game.won ? 'won' : 'unknown'),
      date: Date.now(),
    });
    list.sort((a, b) => b.score - a.score);
    list.length = Math.min(8, list.length);
    localStorage.setItem('dungeon-highscores', JSON.stringify(list));
    return list;
  }

  function gameOverScreen() {
    const s = score();
    const list = saveHighScore(s);
    const lines = [
      game.won ? 'You escaped the dungeon!' : `You fell on floor ${game.floor}.`,
      game.deathCause ? `(${game.deathCause})` : '',
      '',
      `Final floor: ${game.floor}`,
      `Player level: ${game.player.level}   XP: ${game.player.xp}`,
      `Gold: ${game.player.gold}`,
      `Score: ${s}`,
      '',
      'High scores:',
      ...list.slice(0, 8).map((e, i) => {
        const mark = e.score === s ? ' *' : '  ';
        return `${mark}${String(i + 1).padStart(2, ' ')}. ${String(e.score).padStart(6, ' ')}  fl${e.floor}  ${e.won ? 'won' : e.cause.slice(0, 32)}`;
      }),
    ];
    showModal({
      title: game.won ? 'Victory' : 'You Have Died',
      lines,
      hint: 'Press Enter or Space for a new game',
      onClose: () => newGame(),
    });
    render();
  }

  // --- Rendering ---
  function render() {
    renderScreen();
    renderStats();
    renderLog();
  }

  function monsterClass(m) {
    if (m.boss) return 't-monster-boss';
    if (m.strong) return 't-monster-strong';
    return 't-monster';
  }
  const itemClassByCat = {
    weapon: 't-item-weapon',
    armor:  't-item-armor',
    potion: 't-item-potion',
    scroll: 't-item-scroll',
    food:   't-item-food',
    gold:   't-item-gold',
  };

  function renderScreen() {
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const t = game.map[y][x];
        const visible = game.visible[y][x];
        const seen    = game.seen[y][x];
        if (!seen) {
          row += '<span class="t-void"> </span>';
          continue;
        }
        if (visible) {
          if (x === game.player.x && y === game.player.y) {
            row += '<span class="t-player">@</span>';
            continue;
          }
          const m = monsterAt(x, y);
          if (m) {
            row += `<span class="${monsterClass(m)}">${escapeHtml(m.letter)}</span>`;
            continue;
          }
          const it = itemAt(x, y);
          if (it) {
            row += `<span class="${itemClassByCat[it.category]}">${escapeHtml(it.char)}</span>`;
            continue;
          }
          row += `<span class="${TILE_CLASS[t]}">${escapeHtml(TILE_CHAR[t])}</span>`;
        } else {
          row += `<span class="${TILE_CLASS[t]} seen">${escapeHtml(TILE_CHAR[t])}</span>`;
        }
      }
      rows.push(row);
    }
    document.getElementById('screen').innerHTML = rows.join('\n');
  }

  function hungerLabel(h) {
    if (h > 1500) return 'Satiated';
    if (h > 800)  return 'Well-fed';
    if (h > 250)  return 'Normal';
    if (h > 60)   return 'Hungry';
    if (h > 0)    return 'Weak';
    return 'Starving';
  }

  function renderStats() {
    const p = game.player;
    document.getElementById('stats').innerHTML = `
      <span>HP <b>${p.hp}/${p.maxHp}</b></span>
      <span>Lv <b>${p.level}</b></span>
      <span>XP <b>${p.xp}/${p.nextLevelXp}</b></span>
      <span>Atk <b>${playerAttack()}</b></span>
      <span>Def <b>${playerDefense()}</b></span>
      <span>$ <b>${p.gold}</b></span>
      <span>Floor <b>${game.floor}</b></span>
      <span>${hungerLabel(p.hunger)}</span>
    `;
  }

  function renderLog() {
    const recent = game.messages.slice(-3);
    document.getElementById('log').innerHTML = recent
      .map(m => `<div class="log-${m.type}">${escapeHtml(m.msg)}</div>`)
      .join('') || '&nbsp;';
  }

  // --- Modal ---
  function showModal(opts) {
    modalState = opts;
    const modal = document.getElementById('modal');
    modal.classList.remove('hidden');
    let html = '<div class="modal-panel">';
    if (opts.title) html += `<h2>${escapeHtml(opts.title)}</h2>`;
    if (opts.lines) {
      html += '<div class="modal-lines">' +
        opts.lines.map(l => l === '' ? '&nbsp;' : escapeHtml(l)).join('<br>') +
        '</div>';
    }
    html += `<div class="modal-hint">${escapeHtml(opts.hint || 'Press any key to close')}</div>`;
    html += '</div>';
    modal.innerHTML = html;
  }
  function hideModal() {
    modalState = null;
    document.getElementById('modal').classList.add('hidden');
  }

  function openInventory() {
    const inv = game.player.inventory;
    const lines = inv.length
      ? inv.map((it, i) => {
          const letter = String.fromCharCode(97 + i);
          const equipped =
            (game.player.weapon === it ? ' (wielded)' : '') +
            (game.player.armor === it ? ' (worn)' : '');
          return `${letter}) ${displayName(it)}${equipped}`;
        })
      : ['(empty)'];
    showModal({
      title: 'Inventory',
      lines,
      hint: 'a-z to use/wear/wield/eat. SHIFT+letter to drop. ESC to close.',
      mode: 'inventory',
    });
  }

  function openHelp() {
    showModal({
      title: 'Help',
      lines: [
        'Movement:',
        '  Arrows / hjkl  cardinal',
        '  y u b n        diagonals',
        '  .              wait',
        '',
        'Actions:',
        '  ,  pick up      i  inventory',
        '  >  stairs down  <  stairs up',
        '  ?  this help',
        '',
        'Tiles: @ you  # wall  . floor  + door  > down  < up',
        'Items: ) weapon  [ armor  ! potion  ? scroll  % food  $ gold',
        '',
        'Monsters scale with depth. Unknown potions and scrolls',
        'reveal their effect when you use them. Hunger ticks down',
        'each turn — keep eating. Death is permanent.',
      ],
    });
  }

  // --- Input ---
  function handleKey(e) {
    if (modalState) {
      if (modalState.mode === 'inventory') {
        if (e.key === 'Escape') { hideModal(); e.preventDefault(); return; }
        if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
          const lower = e.key.toLowerCase();
          const isUpper = e.key !== lower;
          const idx = lower.charCodeAt(0) - 97;
          if (idx >= 0 && idx < game.player.inventory.length) {
            const item = game.player.inventory[idx];
            hideModal();
            if (isUpper) dropItem(item);
            else applyItem(item);
            e.preventDefault();
          }
          return;
        }
        return;
      }
      if (modalState.onClose) {
        const cb = modalState.onClose;
        hideModal();
        cb();
        e.preventDefault();
        return;
      }
      hideModal();
      e.preventDefault();
      return;
    }

    if (game.dead || game.won) return;

    const k = e.key;
    let dx = 0, dy = 0, action = null;

    if      (k === 'ArrowLeft'  || k === 'h') dx = -1;
    else if (k === 'ArrowRight' || k === 'l') dx =  1;
    else if (k === 'ArrowUp'    || k === 'k') dy = -1;
    else if (k === 'ArrowDown'  || k === 'j') dy =  1;
    else if (k === 'y') { dx = -1; dy = -1; }
    else if (k === 'u') { dx =  1; dy = -1; }
    else if (k === 'b') { dx = -1; dy =  1; }
    else if (k === 'n') { dx =  1; dy =  1; }
    else if (k === '.') action = 'wait';
    else if (k === ',' || k === 'g') action = 'pickup';
    else if (k === '>') action = 'down';
    else if (k === '<') action = 'up';
    else if (k === 'i') action = 'inv';
    else if (k === '?') action = 'help';
    else return;

    e.preventDefault();
    if (dx || dy) playerMove(dx, dy);
    else if (action === 'wait')    wait();
    else if (action === 'pickup')  pickup();
    else if (action === 'down')    useStairs('down');
    else if (action === 'up')      useStairs('up');
    else if (action === 'inv')     openInventory();
    else if (action === 'help')    openHelp();
  }

  // --- New game ---
  function newGame() {
    appearances = { potions: {}, scrolls: {} };
    identified = {};
    const colors = POTION_COLORS.slice().sort(() => Math.random() - 0.5);
    POTION_KINDS.forEach((k, i) => { appearances.potions[k.id] = colors[i % colors.length]; });
    const labels = SCROLL_LABELS.slice().sort(() => Math.random() - 0.5);
    SCROLL_KINDS.forEach((k, i) => { appearances.scrolls[k.id] = labels[i % labels.length]; });

    game = {
      floor: 1,
      player: {
        x: 0, y: 0,
        hp: 22, maxHp: 22,
        atk: 3, def: 1,
        xp: 0, level: 1, nextLevelXp: 20,
        hunger: 1200,
        gold: 0,
        confused: 0,
        inventory: [],
        weapon: null, armor: null,
      },
      map: null, visible: null, seen: null, rooms: [],
      monsters: [], items: [],
      messages: [],
      turn: 0,
      dead: false, won: false, deathCause: null,
    };

    const starterDagger = makeItem('weapon', 'dagger');
    game.player.inventory.push(starterDagger);
    game.player.inventory.push(makeItem('food', 'ration'));
    game.player.inventory.push(makeItem('potion', 'healing'));
    game.player.weapon = starterDagger;

    enterFloor(1);
    log('You step into the dungeon. Stairs down lead deeper.');
    render();
    hideModal();
  }

  document.addEventListener('keydown', handleKey);
  document.getElementById('restart').addEventListener('click', () => newGame());

  newGame();
})();
