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

  const rnd   = n => Math.floor(Math.random() * n);
  const range = (a, b) => a + rnd(b - a + 1);
  const pick  = arr => arr[rnd(arr.length)];
  const chance = p => Math.random() < p;

  // --- Classes ---
  const CLASS_LIST = ['warrior', 'mage', 'rogue', 'ranger'];
  const CLASSES = {
    warrior: {
      name: 'Warrior',
      desc: 'Heavy hitter. Starts armored.',
      hp: 30, atk: 5, def: 2,
      kit: () => [
        makeItem('weapon', 'short_sword'),
        makeItem('armor',  'leather'),
        makeItem('food',   'ration'),
        makeItem('food',   'ration'),
        makeItem('potion', 'healing'),
      ],
      wieldIdx: 0, wearIdx: 1,
      perks: [],
    },
    mage: {
      name: 'Mage',
      desc: 'Frail caster. Two wands in the pack.',
      hp: 16, atk: 2, def: 0,
      kit: () => {
        const wandPool = ['bolt', 'lightning', 'freeze', 'fire', 'slow'];
        const shuffled = wandPool.slice().sort(() => Math.random() - 0.5);
        return [
          makeItem('weapon', 'dagger'),
          makeItem('food',   'ration'),
          makeItem('potion', 'healing'),
          makeItem('potion', 'healing'),
          makeItem('scroll', 'identify'),
          makeWand(shuffled[0], 5),
          makeWand(shuffled[1], 4),
        ];
      },
      wieldIdx: 0,
      perks: ['identify_wands'],
    },
    rogue: {
      name: 'Rogue',
      desc: 'Nimble. Senses traps within sight.',
      hp: 22, atk: 3, def: 1,
      kit: () => [
        makeItem('weapon', 'dagger'),
        makeItem('armor',  'leather'),
        makeItem('food',   'ration'),
        makeItem('potion', 'healing'),
        makeItem('scroll', 'magic_mapping'),
      ],
      wieldIdx: 0, wearIdx: 1,
      perks: ['trap_sense'],
    },
    ranger: {
      name: 'Ranger',
      desc: 'Patient marksman. Starts with a wand.',
      hp: 24, atk: 4, def: 1,
      kit: () => [
        makeItem('weapon', 'short_sword'),
        makeItem('armor',  'leather'),
        makeItem('food',   'ration'),
        makeItem('food',   'ration'),
        makeWand('bolt', 6),
      ],
      wieldIdx: 0, wearIdx: 1,
      perks: [],
    },
  };

  // --- Items ---
  const WEAPONS = [
    { id: 'dagger',       name: 'dagger',           atk: 2 },
    { id: 'short_sword',  name: 'short sword',      atk: 4 },
    { id: 'mace',         name: 'mace',             atk: 5 },
    { id: 'long_sword',   name: 'long sword',       atk: 6 },
    { id: 'battle_axe',   name: 'battle axe',       atk: 8 },
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
  const WAND_KINDS = [
    { id: 'bolt',           name: 'wand of bolt' },
    { id: 'lightning',      name: 'wand of lightning' },
    { id: 'freeze',         name: 'wand of freeze' },
    { id: 'fire',           name: 'wand of fire' },
    { id: 'slow',           name: 'wand of slow' },
    { id: 'teleport_other', name: 'wand of teleport away' },
  ];
  const FOOD_KINDS = [
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
  const WAND_MATERIALS = [
    'oak', 'iron', 'ivory', 'silver', 'ebony', 'crystal',
    'copper', 'pewter', 'bone',
  ];

  // --- Traps ---
  const TRAP_KINDS = ['pit', 'dart', 'teleport', 'alarm', 'explosion'];
  const TRAP_NAMES = {
    pit:        'pit trap',
    dart:       'dart trap',
    teleport:   'teleport rune',
    alarm:      'alarm trap',
    explosion:  'glyph of warding',
  };

  // --- Monsters ---
  const MONSTERS = [
    { letter: 'r', name: 'rat',     hp:  4, atk:  2, def: 0, xp:   2, min: 1, max:  4, speed: 1 },
    { letter: 'b', name: 'bat',     hp:  3, atk:  2, def: 0, xp:   2, min: 1, max:  5, speed: 2, ability: 'confuse_bite' },
    { letter: 's', name: 'snake',   hp:  6, atk:  3, def: 1, xp:   4, min: 1, max:  4, speed: 1, ability: 'poison_bite' },
    { letter: 'k', name: 'kobold',  hp:  6, atk:  3, def: 1, xp:   5, min: 1, max:  4, speed: 1, ability: 'ranged_rock' },
    { letter: 'g', name: 'goblin',  hp:  9, atk:  4, def: 1, xp:   7, min: 2, max:  5, speed: 1 },
    { letter: 'd', name: 'jackal',  hp: 11, atk:  5, def: 1, xp:   9, min: 1, max:  5, speed: 2 },
    { letter: 'z', name: 'zombie',  hp: 14, atk:  5, def: 1, xp:  11, min: 2, max:  6, speed: 1 },
    { letter: 'G', name: 'gnome',   hp: 10, atk:  5, def: 2, xp:  11, min: 2, max:  5, speed: 1, ability: 'magic_bolt' },
    { letter: 'o', name: 'orc',     hp: 18, atk:  7, def: 2, xp:  16, min: 3, max:  7, speed: 1 },
    { letter: 'C', name: 'centaur', hp: 26, atk:  8, def: 3, xp:  24, min: 4, max:  8, speed: 2, strong: true },
    { letter: 'W', name: 'wraith',  hp: 28, atk: 10, def: 3, xp:  38, min: 5, max:  8, speed: 1, strong: true, ability: 'drain' },
    { letter: 'T', name: 'troll',   hp: 36, atk: 11, def: 4, xp:  48, min: 5, max:  9, speed: 1, strong: true, ability: 'regen' },
    { letter: 'M', name: 'minotaur', hp: 48, atk: 13, def: 5, xp: 72, min: 6, max:  9, speed: 1, strong: true },
    { letter: '&', name: 'demon',   hp: 58, atk: 16, def: 6, xp: 100, min: 7, max: 10, speed: 1, boss: false, ability: 'breath' },
    { letter: 'D', name: 'dragon',  hp: 95, atk: 22, def: 8, xp: 200, min: 8, max: 10, speed: 1, ability: 'breath' },
  ];

  const BOSSES = {
    4: { letter: 'H', name: 'Garm the Hound',     hp:  64, atk: 12, def: 4, xp: 120, speed: 2, ability: 'rabid' },
    7: { letter: 'V', name: 'Vex the Lich',       hp: 110, atk: 16, def: 6, xp: 240, speed: 1, ability: 'drain' },
    10:{ letter: 'X', name: 'Maraz the Dread Wyrm', hp: 200, atk: 26, def: 9, xp: 600, speed: 1, ability: 'breath' },
  };

  // --- State ---
  let game = null;
  let appearances = null;
  let identified = null;
  let modalState = null;
  let pendingAction = null;   // { kind: 'zap'|'throw'|'cursor', ... }
  let lookCursor = null;
  let running = null;         // { kind: 'dir'|'explore', dx?, dy? }
  let runScheduled = false;
  let mode = 'select';        // 'select' | 'play' | 'dead' | 'won'

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  function log(msg, type = 'normal') {
    if (!game) return;
    game.messages.push({ msg, type });
    if (game.messages.length > 60) game.messages.shift();
  }

  // --- Item factories ---
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
      return { category, id, name: p.name, char: '!', count: 1 };
    }
    if (category === 'scroll') {
      const s = SCROLL_KINDS.find(x => x.id === id);
      return { category, id, name: s.name, char: '?', count: 1 };
    }
    if (category === 'food') {
      const f = FOOD_KINDS.find(x => x.id === id);
      return { category, id, name: f.name, nutrition: f.nutrition, char: '%', count: 1 };
    }
    if (category === 'gold') {
      return { category, id: 'gold', name: 'gold', amount: qty, char: '$' };
    }
  }
  function makeWand(id, charges) {
    const w = WAND_KINDS.find(x => x.id === id);
    return { category: 'wand', id, name: w.name, char: '/', charges };
  }

  function displayName(item) {
    let name;
    if (item.category === 'potion' && !identified[item.id]) {
      name = `${appearances.potions[item.id]} potion`;
    } else if (item.category === 'scroll' && !identified[item.id]) {
      name = `scroll labeled ${appearances.scrolls[item.id]}`;
    } else if (item.category === 'wand' && !identified[item.id]) {
      name = `${appearances.wands[item.id]} wand`;
    } else if (item.category === 'gold') {
      return `${item.amount} gold pieces`;
    } else {
      name = item.name;
    }
    if (item.count && item.count > 1) {
      name = `${item.count} ${pluralize(name)}`;
    }
    if (item.category === 'wand') {
      name += ` (${item.charges})`;
    }
    return name;
  }
  function pluralize(name) {
    if (/\bpotion of\b/.test(name)) return name.replace('potion', 'potions');
    if (/\bscroll of\b/.test(name)) return name.replace('scroll', 'scrolls');
    if (/^scroll labeled/.test(name)) return 'scrolls labeled' + name.slice('scroll labeled'.length);
    if (/^(.+) potion$/.test(name)) return name.replace(/potion$/, 'potions');
    if (name === 'food ration') return 'food rations';
    if (name === 'loaf of bread') return 'loaves of bread';
    if (name === 'apple') return 'apples';
    return name + 's';
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
    if (roll < 0.32) return makeItem('potion', pick(POTION_KINDS).id);
    if (roll < 0.46) return makeItem('scroll', pick(SCROLL_KINDS).id);
    if (roll < 0.56) return makeWand(pick(WAND_KINDS).id, 2 + rnd(5));
    if (roll < 0.75) return makeItem('food', pick(FOOD_KINDS).id);
    return makeItem('gold', null, range(5, 18) + floor * 4);
  }

  // --- Inventory helpers ---
  function addToInventory(item) {
    if ((item.category === 'potion' || item.category === 'scroll' || item.category === 'food')) {
      const stack = game.player.inventory.find(it => it.category === item.category && it.id === item.id);
      if (stack) {
        stack.count = (stack.count || 1) + (item.count || 1);
        return;
      }
    }
    game.player.inventory.push(item);
  }
  function consumeStack(item) {
    if (item.count && item.count > 1) {
      item.count -= 1;
    } else {
      const idx = game.player.inventory.indexOf(item);
      if (idx >= 0) game.player.inventory.splice(idx, 1);
    }
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
        const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
        rooms.push(room);
        return [room];
      }
      const splitH = canSplitH && (!canSplitV || chance(0.5));
      if (splitH) {
        const s = range(minSize, h - minSize);
        const a = partition(x, y, w, s, depth + 1);
        const b = partition(x, y + s, w, h - s, depth + 1);
        carveCorridor(map, pick(a), pick(b));
        return a.concat(b);
      } else {
        const s = range(minSize, w - minSize);
        const a = partition(x, y, s, h, depth + 1);
        const b = partition(x + s, y, w - s, h, depth + 1);
        carveCorridor(map, pick(a), pick(b));
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
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 4; dx++) map[1 + dy][1 + dx] = TILE.FLOOR;
    }
    const startRoom = pick(rooms);
    const others = rooms.filter(r => r !== startRoom);
    const endRoom = others.length ? pick(others) : startRoom;
    if (floor > 1) map[startRoom.cy][startRoom.cx] = TILE.STAIRS_UP;
    map[endRoom.cy][endRoom.cx] = TILE.STAIRS_DOWN;

    return { map, rooms, startRoom, endRoom };
  }
  function carveCorridor(map, a, b) {
    const x1 = a.cx, y1 = a.cy, x2 = b.cx, y2 = b.cy;
    if (chance(0.5)) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) if (map[y1][x] !== TILE.FLOOR) map[y1][x] = TILE.FLOOR;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) if (map[y][x2] !== TILE.FLOOR) map[y][x2] = TILE.FLOOR;
    } else {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) if (map[y][x1] !== TILE.FLOOR) map[y][x1] = TILE.FLOOR;
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) if (map[y2][x] !== TILE.FLOOR) map[y2][x] = TILE.FLOOR;
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
    game.traps = [];
    game.rooms = rooms;
    game.startRoom = startRoom;
    game.endRoom = endRoom;
    game.zooType = null;

    game.player.x = startRoom.cx;
    game.player.y = startRoom.cy;

    // Optional zoo room
    const zooRoom = chance(0.30) && rooms.length >= 3 ? pick(rooms.filter(r => r !== startRoom && r !== endRoom)) : null;
    if (zooRoom) {
      const eligible = MONSTERS.filter(m => floor >= m.min - 1 && floor <= m.max + 1);
      if (eligible.length) {
        const zooMonster = pick(eligible);
        game.zooType = zooMonster.name;
        for (let dy = 0; dy < zooRoom.h; dy++) {
          for (let dx = 0; dx < zooRoom.w; dx++) {
            const x = zooRoom.x + dx, y = zooRoom.y + dy;
            if (!(x === game.player.x && y === game.player.y) && chance(0.55)) {
              game.monsters.push({
                ...zooMonster, x, y,
                maxHp: zooMonster.hp, currentHp: zooMonster.hp,
                statuses: {},
              });
            } else if (chance(0.10)) {
              const it = generateRandomItem(floor);
              it.x = x; it.y = y;
              game.items.push(it);
            }
          }
        }
      }
    }

    // Boss
    game.marazPresent = false;
    if (BOSSES[floor]) {
      const b = BOSSES[floor];
      // Place in endRoom (near stairs down), but not on the stairs tile
      const slots = [];
      for (let dy = 0; dy < endRoom.h; dy++) {
        for (let dx = 0; dx < endRoom.w; dx++) {
          const x = endRoom.x + dx, y = endRoom.y + dy;
          if (map[y][x] !== TILE.FLOOR) continue;
          if (x === game.player.x && y === game.player.y) continue;
          slots.push({ x, y });
        }
      }
      if (slots.length) {
        const s = pick(slots);
        game.monsters.push({
          letter: b.letter, name: b.name,
          hp: b.hp, atk: b.atk, def: b.def, xp: b.xp,
          speed: b.speed, boss: true, ability: b.ability,
          x: s.x, y: s.y,
          maxHp: b.hp, currentHp: b.hp,
          statuses: {},
        });
        if (floor === MAX_FLOORS) game.marazPresent = true;
      }
    }

    // Regular monsters
    const monsterCount = 4 + floor + rnd(4);
    for (let i = 0; i < monsterCount; i++) {
      const eligible = MONSTERS.filter(m => floor >= m.min && floor <= m.max);
      if (!eligible.length) continue;
      const template = pick(eligible);
      const placed = placeAt(rooms, (x, y) =>
        !(x === game.player.x && y === game.player.y) &&
        !game.monsters.some(m => m.x === x && m.y === y) &&
        chebyshev(x, y, game.player.x, game.player.y) >= 5
      );
      if (!placed) continue;
      game.monsters.push({
        ...template, x: placed.x, y: placed.y,
        maxHp: template.hp, currentHp: template.hp,
        statuses: {},
      });
    }

    // Items
    const itemCount = 3 + rnd(4);
    for (let i = 0; i < itemCount; i++) {
      const placed = placeAt(rooms, (x, y) => !game.items.some(it => it.x === x && it.y === y));
      if (!placed) continue;
      const it = generateRandomItem(floor);
      it.x = placed.x; it.y = placed.y;
      game.items.push(it);
    }

    // Traps
    const trapCount = Math.min(8, 1 + Math.floor(floor / 1.5) + rnd(2));
    for (let i = 0; i < trapCount; i++) {
      const placed = placeAt(rooms, (x, y) =>
        !(x === startRoom.cx && y === startRoom.cy) &&
        !game.traps.some(t => t.x === x && t.y === y) &&
        chebyshev(x, y, game.player.x, game.player.y) >= 3
      );
      if (!placed) continue;
      game.traps.push({ x: placed.x, y: placed.y, kind: pick(TRAP_KINDS), revealed: false });
    }

    if (game.player.perks.has('trap_sense')) {
      revealNearbyTraps(SIGHT);
    }
    computeFOV();
  }

  function placeAt(rooms, predicate) {
    for (let i = 0; i < 40; i++) {
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
  function chebyshev(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
  }

  function trapAt(x, y) {
    return game.traps.find(t => t.x === x && t.y === y);
  }
  function revealNearbyTraps(radius) {
    for (const t of game.traps) {
      if (t.revealed) continue;
      if (chebyshev(t.x, t.y, game.player.x, game.player.y) <= radius) t.revealed = true;
    }
  }

  // --- FOV ---
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
    if (game.player.perks.has('trap_sense')) revealNearbyTraps(SIGHT);
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

  // --- Combat & player stats ---
  function playerAttack() {
    return game.player.atk + (game.player.weapon ? game.player.weapon.atk : 0);
  }
  function playerDefense() {
    return game.player.def + (game.player.armor ? game.player.armor.def : 0);
  }

  function applyMonsterAbilityOnHit(monster) {
    if (!monster.ability) return;
    if (monster.ability === 'poison_bite' && chance(0.45)) {
      const turns = 6 + rnd(6);
      game.player.poisoned = Math.max(game.player.poisoned, turns);
      log(`The ${monster.name}'s bite is venomous!`, 'bad');
    }
    if (monster.ability === 'confuse_bite' && chance(0.30)) {
      game.player.confused += 10 + rnd(8);
      log(`The ${monster.name}'s bite leaves your head spinning.`, 'bad');
    }
    if (monster.ability === 'drain' && chance(0.6)) {
      const lost = Math.max(1, Math.floor(game.player.xp * 0.05));
      game.player.xp = Math.max(0, game.player.xp - lost);
      log(`The ${monster.name} drains your essence! (-${lost} XP)`, 'bad');
    }
    if (monster.ability === 'rabid' && chance(0.5)) {
      const extra = 4 + rnd(5);
      game.player.hp -= extra;
      log(`The ${monster.name}'s rabid frenzy mauls you for ${extra} more!`, 'bad');
      if (game.player.hp <= 0) die(`mauled by ${monster.name}`);
    }
  }

  function attackPlayer(monster) {
    const dmg = Math.max(1, monster.atk - playerDefense() + rnd(3) - 1);
    game.player.hp -= dmg;
    log(`The ${monster.name} hits you for ${dmg}.`, 'bad');
    applyMonsterAbilityOnHit(monster);
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
      log(`You ${monster.boss ? 'slay' : 'kill'} the ${monster.name}. (+${monster.xp} XP)`, 'good');
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

  // --- Pathfinding ---
  function bfsStep(fromX, fromY, isTarget, walkableExtra) {
    const visited = Array.from({ length: H }, () => Array(W).fill(false));
    const parent = Array.from({ length: H }, () => Array(W).fill(null));
    visited[fromY][fromX] = true;
    const queue = [[fromX, fromY]];
    let head = 0;
    const limit = 60;
    while (head < queue.length) {
      const [x, y] = queue[head++];
      if (isTarget(x, y)) {
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
        if (!isWalkable(nx, ny) && !(walkableExtra && walkableExtra(nx, ny))) continue;
        visited[ny][nx] = true;
        parent[ny][nx] = [x, y];
        queue.push([nx, ny]);
      }
    }
    return null;
  }
  function bfsStepToward(fromX, fromY, targetX, targetY) {
    return bfsStep(fromX, fromY,
      (x, y) => x === targetX && y === targetY,
      (x, y) => x === targetX && y === targetY,
    );
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
    if (monster.statuses.frozen > 0) { monster.statuses.frozen -= 1; return; }
    if (monster.statuses.slow > 0) {
      monster.statuses.slow -= 1;
      monster.skipNext = !monster.skipNext;
      if (monster.skipNext) return;
    }
    if (monster.ability === 'regen' && monster.currentHp < monster.maxHp) {
      monster.currentHp = Math.min(monster.maxHp, monster.currentHp + 1);
    }
    const seesPlayer = game.visible[monster.y][monster.x];
    const dx = game.player.x - monster.x;
    const dy = game.player.y - monster.y;
    const cheb = Math.max(Math.abs(dx), Math.abs(dy));
    if (cheb <= 1) {
      attackPlayer(monster);
      return;
    }
    if (seesPlayer) {
      // Ranged abilities
      if (monster.ability === 'ranged_rock' && cheb <= 4 && chance(0.55)) {
        const d = Math.max(1, monster.atk - playerDefense() - 1 + rnd(2));
        game.player.hp -= d;
        log(`The ${monster.name} hurls a rock at you (-${d}).`, 'bad');
        if (game.player.hp <= 0) die(`stoned by a ${monster.name}`);
        return;
      }
      if (monster.ability === 'magic_bolt' && cheb <= 5 && chance(0.45)) {
        const d = Math.max(2, monster.atk - 1 + rnd(2));
        game.player.hp -= d;
        log(`The ${monster.name} flings an arcane bolt (-${d}).`, 'bad');
        if (game.player.hp <= 0) die(`incinerated by a ${monster.name}`);
        return;
      }
      if (monster.ability === 'breath' && cheb <= 4 && chance(0.45)) {
        const d = 8 + rnd(8) + Math.floor(game.floor / 2);
        game.player.hp -= d;
        log(`The ${monster.name} breathes searing fire on you (-${d})!`, 'bad');
        if (game.player.hp <= 0) die(`incinerated by a ${monster.name}`);
        return;
      }
      const next = bfsStepToward(monster.x, monster.y, game.player.x, game.player.y);
      if (next) {
        if (!monsterAt(next[0], next[1])) {
          monster.x = next[0];
          monster.y = next[1];
        }
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

  // --- Wand zap ---
  function zapWand(item, dx, dy) {
    if (item.charges <= 0) {
      log('Nothing happens.');
    } else {
      identified[item.id] = true;
      castWandEffect(item.id, dx, dy);
      item.charges -= 1;
      if (item.charges <= 0) {
        const idx = game.player.inventory.indexOf(item);
        if (idx >= 0) game.player.inventory.splice(idx, 1);
        if (game.player.weapon === item) game.player.weapon = null;
      }
    }
    endTurn(true);
  }
  function traceLine(dx, dy, maxRange) {
    const path = [];
    let x = game.player.x, y = game.player.y;
    for (let i = 0; i < maxRange; i++) {
      x += dx; y += dy;
      if (x < 0 || x >= W || y < 0 || y >= H) break;
      if (game.map[y][x] === TILE.WALL) break;
      path.push([x, y]);
      const m = monsterAt(x, y);
      if (m) return { path, hit: m, end: [x, y] };
    }
    return { path, hit: null, end: path.length ? path[path.length - 1] : [game.player.x, game.player.y] };
  }
  function castWandEffect(id, dx, dy) {
    if (id === 'bolt') {
      const result = traceLine(dx, dy, 8);
      flashCells(result.path, 'bolt');
      if (result.hit) {
        const d = 12 + rnd(10) + Math.floor(game.floor / 2);
        result.hit.currentHp -= d;
        log(`A bolt strikes the ${result.hit.name} (-${d}).`, 'good');
        if (result.hit.currentHp <= 0) {
          game.player.xp += result.hit.xp;
          game.monsters = game.monsters.filter(m => m !== result.hit);
          log(`The ${result.hit.name} is destroyed!`, 'good');
          maybeLevelUp();
        }
      } else log('The bolt vanishes into the dark.');
    } else if (id === 'lightning') {
      const result = traceLine(dx, dy, 10);
      flashCells(result.path, 'lightning');
      const targets = result.path.map(([x, y]) => monsterAt(x, y)).filter(Boolean);
      for (const m of targets) {
        const d = 8 + rnd(6);
        m.currentHp -= d;
      }
      if (targets.length) {
        log(`Lightning arcs through ${targets.length} foe${targets.length > 1 ? 's' : ''}.`, 'good');
        for (const m of [...targets]) {
          if (m.currentHp <= 0) {
            game.player.xp += m.xp;
            game.monsters = game.monsters.filter(x => x !== m);
          }
        }
        maybeLevelUp();
      } else log('Lightning crackles harmlessly.');
    } else if (id === 'freeze') {
      const result = traceLine(dx, dy, 8);
      flashCells(result.path, 'freeze');
      if (result.hit) {
        result.hit.statuses.frozen = (result.hit.statuses.frozen || 0) + 6 + rnd(4);
        log(`The ${result.hit.name} freezes solid.`, 'good');
      } else log('The cold disperses.');
    } else if (id === 'fire') {
      // Cone: 3 tiles ahead in a wedge
      const cells = coneCells(dx, dy, 3);
      flashCells(cells, 'fire');
      let any = false;
      for (const [x, y] of cells) {
        const m = monsterAt(x, y);
        if (m) {
          const d = 10 + rnd(8);
          m.currentHp -= d;
          any = true;
          if (m.currentHp <= 0) {
            game.player.xp += m.xp;
            game.monsters = game.monsters.filter(x => x !== m);
          }
        }
      }
      log(any ? 'Fire engulfs the corridor.' : 'Flames lick stone.', any ? 'good' : 'normal');
      maybeLevelUp();
    } else if (id === 'slow') {
      const result = traceLine(dx, dy, 8);
      flashCells(result.path, 'slow');
      if (result.hit) {
        result.hit.statuses.slow = (result.hit.statuses.slow || 0) + 10;
        log(`The ${result.hit.name} slows to a crawl.`, 'good');
      } else log('Time wavers, then settles.');
    } else if (id === 'teleport_other') {
      const result = traceLine(dx, dy, 8);
      flashCells(result.path, 'tele');
      if (result.hit) {
        for (let i = 0; i < 100; i++) {
          const x = rnd(W), y = rnd(H);
          if (isWalkable(x, y) && !monsterAt(x, y) && !(x === game.player.x && y === game.player.y)) {
            result.hit.x = x; result.hit.y = y;
            log(`The ${result.hit.name} vanishes!`, 'good');
            return;
          }
        }
      } else log('The spell flickers and dies.');
    }
  }
  function coneCells(dx, dy, depth) {
    const cells = [];
    const perp = [-dy, dx];
    for (let i = 1; i <= depth; i++) {
      for (let s = -i + 1; s <= i - 1; s++) {
        const x = game.player.x + dx * i + perp[0] * s;
        const y = game.player.y + dy * i + perp[1] * s;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        if (game.map[y][x] === TILE.WALL) continue;
        cells.push([x, y]);
      }
    }
    return cells;
  }
  function flashCells(cells, kind) {
    game.flash = { cells: cells.slice(), kind, life: 2 };
  }

  // --- Movement & actions ---
  function playerMove(dx, dy) {
    if (game.dead || game.won) return false;
    if (game.player.confused > 0 && chance(0.35)) {
      const d = pick(DIRS_8);
      dx = d[0]; dy = d[1];
    }
    const nx = game.player.x + dx, ny = game.player.y + dy;
    const monster = monsterAt(nx, ny);
    if (monster) {
      attackMonster(monster);
      endTurn(true);
      return true;
    }
    if (!isWalkable(nx, ny)) return false;
    game.player.x = nx;
    game.player.y = ny;

    const startFloor = game.floor;
    const trap = trapAt(nx, ny);
    if (trap) {
      trap.revealed = true;
      triggerTrap(trap);
      if (game.dead || game.won) return true;
    }
    if (game.floor !== startFloor) {
      render();
      return true;
    }

    const it = itemAt(nx, ny);
    if (it) log(`You see ${article(displayName(it))} ${displayName(it)} here.`);
    const t = game.map[ny][nx];
    if (t === TILE.STAIRS_DOWN) log('There are stairs down here. (> to descend)');
    else if (t === TILE.STAIRS_UP) log('There are stairs up here. (< to ascend)');
    endTurn(true);
    return true;
  }
  function triggerTrap(t) {
    const name = TRAP_NAMES[t.kind];
    log(`You step on ${article(name)} ${name}!`, 'bad');
    if (t.kind === 'pit') {
      const d = 4 + rnd(6);
      game.player.hp -= d;
      log(`You tumble into the pit. (-${d} HP)`, 'bad');
      if (game.player.hp <= 0) { die('died at the bottom of a pit'); return; }
      // Optionally drop a floor on later floors
      if (game.floor < MAX_FLOORS && chance(0.4)) {
        enterFloor(game.floor + 1);
        log(`You fall through to floor ${game.floor}!`, 'bad');
      }
    } else if (t.kind === 'dart') {
      const d = 3 + rnd(4);
      game.player.hp -= d;
      log(`A poisoned dart pricks you. (-${d} HP)`, 'bad');
      game.player.poisoned = Math.max(game.player.poisoned, 8 + rnd(5));
      if (game.player.hp <= 0) die('poisoned by a dart');
    } else if (t.kind === 'teleport') {
      for (let i = 0; i < 200; i++) {
        const x = rnd(W), y = rnd(H);
        if (isWalkable(x, y) && !monsterAt(x, y) && !(x === game.player.x && y === game.player.y)) {
          game.player.x = x; game.player.y = y;
          log('A flash of color — you find yourself elsewhere.');
          return;
        }
      }
    } else if (t.kind === 'alarm') {
      log('A shrill alarm wakes the dungeon!', 'bad');
      // Spawn 2-3 monsters in nearby rooms
      const eligible = MONSTERS.filter(m => game.floor >= m.min && game.floor <= m.max);
      for (let i = 0; i < 2 + rnd(2); i++) {
        const tpl = pick(eligible);
        if (!tpl) break;
        const placed = placeAt(game.rooms, (x, y) =>
          !(x === game.player.x && y === game.player.y) &&
          !game.monsters.some(m => m.x === x && m.y === y)
        );
        if (placed) {
          game.monsters.push({
            ...tpl, x: placed.x, y: placed.y,
            maxHp: tpl.hp, currentHp: tpl.hp, statuses: {},
          });
        }
      }
    } else if (t.kind === 'explosion') {
      const d = 8 + rnd(8);
      game.player.hp -= d;
      log(`The glyph erupts! (-${d} HP)`, 'bad');
      if (game.player.hp <= 0) die('exploded by a glyph');
    }
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
      if (game.player.inventory.length >= 26 && !(
        (it.category === 'potion' || it.category === 'scroll' || it.category === 'food') &&
        game.player.inventory.some(x => x.category === it.category && x.id === it.id)
      )) {
        log('Your pack is full.');
        return;
      }
      game.items = game.items.filter(x => x !== it);
      addToInventory(it);
      log(`You pick up ${article(displayName(it))} ${displayName(it)}.`);
    }
    endTurn(true);
  }
  function useStairs(dir) {
    const t = game.map[game.player.y][game.player.x];
    if (dir === 'down') {
      if (t !== TILE.STAIRS_DOWN) { log('There are no stairs down here.'); return; }
      if (game.floor >= MAX_FLOORS) {
        // No-op: floor 10 has the boss; you only win by killing it
        log('A passage opens — but the Dread Wyrm blocks the way.');
        return;
      }
      enterFloor(game.floor + 1);
      log(`You descend to floor ${game.floor}. ${floorFlavor(game.floor)}`);
      render();
    } else {
      if (t !== TILE.STAIRS_UP) { log('There are no stairs up here.'); return; }
      if (game.floor === 1) { log("You can't leave the dungeon yet."); return; }
      enterFloor(game.floor - 1);
      log(`You climb to floor ${game.floor}.`);
      render();
    }
  }
  function floorFlavor(floor) {
    const lines = [
      'Cold air seeps up the walls.',
      'Distant skittering echoes.',
      'The torches gutter and dim.',
      'Bones crunch underfoot.',
      'The stone hums faintly.',
      'You smell smoke.',
      'Something far below growls.',
      'A whisper trails off.',
      'The air tastes of iron.',
    ];
    return floor === MAX_FLOORS ? 'A roar shakes the chamber.' : pick(lines);
  }

  function searchAction() {
    let any = false;
    for (const t of game.traps) {
      if (t.revealed) continue;
      if (chebyshev(t.x, t.y, game.player.x, game.player.y) <= 1) {
        t.revealed = true;
        any = true;
      }
    }
    if (any) log('You find a trap!', 'good');
    else log('You search the area.');
    endTurn(true);
  }

  // --- Item application ---
  function applyItem(item) {
    if (!item) return;
    if (item.category === 'potion') {
      identified[item.id] = true;
      applyPotion(item);
      consumeStack(item);
    } else if (item.category === 'scroll') {
      identified[item.id] = true;
      applyScroll(item);
      consumeStack(item);
    } else if (item.category === 'food') {
      game.player.hunger = Math.min(2000, game.player.hunger + item.nutrition);
      log(`You eat the ${item.name}.`);
      consumeStack(item);
    } else if (item.category === 'weapon') {
      game.player.weapon = item;
      log(`You wield the ${item.name}.`);
    } else if (item.category === 'armor') {
      game.player.armor = item;
      log(`You wear the ${item.name}.`);
    } else if (item.category === 'wand') {
      // Wand: zap — prompt for direction
      pendingAction = { kind: 'zap', item };
      log('Zap in which direction? (movement key, ESC to cancel)');
      render();
      return;
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
      p.poisoned = Math.max(p.poisoned, 8);
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
        if ((it.category === 'potion' || it.category === 'scroll' || it.category === 'wand') && !identified[it.id]) {
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
          game.player.x = x; game.player.y = y;
          log('You blink across the floor.', 'good');
          return;
        }
      }
      log('You feel a brief tug, then nothing.');
    } else if (item.id === 'remove_curse') {
      let cleared = false;
      if (game.player.confused > 0) { game.player.confused = 0; cleared = true; }
      if (game.player.poisoned > 0) { game.player.poisoned = 0; cleared = true; }
      log(cleared ? 'Your afflictions lift.' : 'A wave of warmth passes over you.', cleared ? 'good' : 'normal');
    } else if (item.id === 'magic_mapping') {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (game.map[y][x] !== TILE.VOID) game.seen[y][x] = true;
      log('A map of the floor unrolls in your mind.', 'good');
    }
  }

  function dropItem(item) {
    if (!item) return;
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
    const dropped = Object.assign({}, item, { count: 1 });
    dropped.x = game.player.x;
    dropped.y = game.player.y;
    game.items.push(dropped);
    if (item.count && item.count > 1) {
      item.count -= 1;
    } else {
      game.player.inventory.splice(idx, 1);
    }
    log(`You drop ${article(displayName(dropped))} ${displayName(dropped)}.`);
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
      // Hunger
      game.player.hunger -= 1;
      if (game.player.hunger === 200) log("You're starting to feel hungry.");
      else if (game.player.hunger === 60) log('You feel weak from hunger.', 'bad');
      if (game.player.hunger <= 0) {
        game.player.hunger = 0;
        if (game.turn % 4 === 0) {
          game.player.hp -= 1;
          log("You're starving!", 'bad');
          if (game.player.hp <= 0) die('starvation');
        }
      }
      // Status timers
      if (game.player.confused > 0) {
        game.player.confused -= 1;
        if (game.player.confused === 0) log('You feel less confused.');
      }
      if (game.player.poisoned > 0) {
        game.player.poisoned -= 1;
        if (game.turn % 3 === 0) {
          game.player.hp -= 1;
          if (game.player.hp <= 0) die('poison');
        }
        if (game.player.poisoned === 0) log('The poison wears off.');
      }
      // Win on Maraz dead on floor 10
      if (game.marazPresent && game.floor === MAX_FLOORS && !game.won) {
        const marazAlive = game.monsters.some(m => m.boss && /Wyrm/.test(m.name));
        if (!marazAlive) {
          winGame();
          return;
        }
      }
    }
    // Flash decay
    if (game.flash) {
      game.flash.life -= 1;
      if (game.flash.life <= 0) game.flash = null;
    }
    computeFOV();
    render();
  }

  // --- Death / win / scoring ---
  function die(cause) {
    if (game.dead) return;
    game.dead = true;
    game.deathCause = cause;
    mode = 'dead';
    log(`You die. (${cause})`, 'bad');
    running = null;
    gameOverScreen();
  }
  function winGame() {
    game.won = true;
    mode = 'won';
    log('You stand over the slain Dread Wyrm. The dungeon is yours.', 'good');
    running = null;
    gameOverScreen();
  }
  function score() {
    const p = game.player;
    return p.gold + p.xp * 4 + game.floor * 120 + (game.won ? 1500 : 0);
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
      cls: game.player.className,
      won: game.won,
      cause: game.deathCause || (game.won ? 'won' : 'unknown'),
      date: Date.now(),
    });
    list.sort((a, b) => b.score - a.score);
    list.length = Math.min(10, list.length);
    localStorage.setItem('dungeon-highscores', JSON.stringify(list));
    return list;
  }
  function gameOverScreen() {
    const s = score();
    if (window.GD) window.GD.record('dungeon', s, 'score');
    const list = saveHighScore(s);
    const lines = [
      game.won ? 'You escaped the dungeon!' : `You fell on floor ${game.floor}.`,
      game.deathCause ? `(${game.deathCause})` : '',
      '',
      `Class: ${game.player.className}`,
      `Final floor: ${game.floor}`,
      `Player level: ${game.player.level}   XP: ${game.player.xp}`,
      `Gold: ${game.player.gold}`,
      `Score: ${s}`,
      '',
      'High scores:',
      ...list.slice(0, 8).map((e, i) => {
        const mark = e.score === s && e.date === list[i].date ? ' *' : '  ';
        return `${mark}${String(i + 1).padStart(2, ' ')}. ${String(e.score).padStart(6, ' ')}  fl${e.floor}  ${e.cls || '?'}  ${e.won ? 'won' : (e.cause || '').slice(0, 28)}`;
      }),
    ];
    showModal({
      title: game.won ? 'Victory' : 'You Have Died',
      lines,
      hint: 'Press Enter or Space for a new game',
      onClose: () => showClassSelect(),
    });
    render();
  }

  // --- Auto-explore / run ---
  function shouldStopRun() {
    if (game.dead || game.won) return true;
    if (anyHostileVisible()) return true;
    if (itemAt(game.player.x, game.player.y)) return true;
    const t = game.map[game.player.y][game.player.x];
    if (t === TILE.STAIRS_DOWN || t === TILE.STAIRS_UP) return true;
    const trap = trapAt(game.player.x, game.player.y);
    if (trap && trap.revealed) return true;
    return false;
  }
  function anyHostileVisible() {
    for (const m of game.monsters) {
      if (game.visible[m.y][m.x]) return true;
    }
    return false;
  }
  function bfsToUnseen() {
    return bfsStep(game.player.x, game.player.y,
      (x, y) => !game.seen[y][x] && game.map[y] && game.map[y][x] !== undefined,
      null,
    );
  }
  function startRunDir(dx, dy) {
    if (shouldStopRun()) return;
    running = { kind: 'dir', dx, dy };
    scheduleRunStep();
  }
  function startAutoExplore() {
    if (shouldStopRun()) return;
    if (!bfsToUnseen()) { log('Nothing more to explore here.'); return; }
    running = { kind: 'explore' };
    scheduleRunStep();
  }
  function scheduleRunStep() {
    if (!running || runScheduled) return;
    runScheduled = true;
    setTimeout(() => {
      runScheduled = false;
      doRunStep();
    }, 55);
  }
  function doRunStep() {
    if (!running) return;
    const startFloor = game.floor;
    if (shouldStopRun()) { running = null; render(); return; }
    if (running.kind === 'dir') {
      const ok = playerMove(running.dx, running.dy);
      if (!ok) { running = null; return; }
    } else {
      const next = bfsToUnseen();
      if (!next) { running = null; log('Done exploring.'); render(); return; }
      const dx = Math.sign(next[0] - game.player.x);
      const dy = Math.sign(next[1] - game.player.y);
      if (!dx && !dy) { running = null; return; }
      const ok = playerMove(dx, dy);
      if (!ok) { running = null; return; }
    }
    if (game.floor !== startFloor || game.dead || game.won) {
      running = null;
      return;
    }
    scheduleRunStep();
  }

  // --- Look mode ---
  function startLook() {
    lookCursor = { x: game.player.x, y: game.player.y };
    log('Look — move cursor with movement keys. ESC to exit.');
    render();
  }
  function lookMove(dx, dy) {
    if (!lookCursor) return;
    const nx = Math.max(0, Math.min(W - 1, lookCursor.x + dx));
    const ny = Math.max(0, Math.min(H - 1, lookCursor.y + dy));
    lookCursor = { x: nx, y: ny };
    describeCell(nx, ny);
    render();
  }
  function describeCell(x, y) {
    if (!game.seen[y][x]) { log('You haven\'t explored there.'); return; }
    const m = monsterAt(x, y);
    if (m && game.visible[y][x]) {
      const ability = m.ability ? ` [${m.ability.replace('_', ' ')}]` : '';
      log(`${m.boss ? '★ ' : ''}${m.name}: HP ${m.currentHp}/${m.maxHp}, atk ${m.atk}, def ${m.def}${ability}.`);
      return;
    }
    const it = itemAt(x, y);
    if (it && game.visible[y][x]) {
      log(`${displayName(it)} lies here.`);
      return;
    }
    const trap = trapAt(x, y);
    if (trap && trap.revealed && game.visible[y][x]) {
      log(`${TRAP_NAMES[trap.kind]}.`);
      return;
    }
    const t = game.map[y][x];
    const names = { [TILE.VOID]: 'darkness', [TILE.WALL]: 'wall', [TILE.FLOOR]: 'floor',
      [TILE.DOOR]: 'door', [TILE.STAIRS_DOWN]: 'stairs down', [TILE.STAIRS_UP]: 'stairs up' };
    log(`${names[t] || 'something'}.`);
  }

  // --- Rendering ---
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
    wand:   't-item-wand',
  };

  function render() {
    renderScreen();
    renderStats();
    renderLog();
  }
  function renderScreen() {
    const rows = [];
    const flashCells = game.flash ? new Set(game.flash.cells.map(([x, y]) => y * W + x)) : null;
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const t = game.map[y][x];
        const visible = game.visible[y][x];
        const seen    = game.seen[y][x];
        const cursorHere = lookCursor && lookCursor.x === x && lookCursor.y === y;
        const cursorCls = cursorHere ? ' t-cursor' : '';
        if (!seen) {
          row += `<span class="t-void${cursorCls}"> </span>`;
          continue;
        }
        if (flashCells && flashCells.has(y * W + x)) {
          row += `<span class="t-monster-boss${cursorCls}">*</span>`;
          continue;
        }
        if (visible) {
          if (x === game.player.x && y === game.player.y) {
            row += `<span class="t-player${cursorCls}">@</span>`;
            continue;
          }
          const m = monsterAt(x, y);
          if (m) {
            row += `<span class="${monsterClass(m)}${cursorCls}">${escapeHtml(m.letter)}</span>`;
            continue;
          }
          const it = itemAt(x, y);
          if (it) {
            row += `<span class="${itemClassByCat[it.category]}${cursorCls}">${escapeHtml(it.char)}</span>`;
            continue;
          }
          const trap = trapAt(x, y);
          if (trap && trap.revealed) {
            row += `<span class="t-trap${cursorCls}">^</span>`;
            continue;
          }
          row += `<span class="${TILE_CLASS[t]}${cursorCls}">${escapeHtml(TILE_CHAR[t])}</span>`;
        } else {
          row += `<span class="${TILE_CLASS[t]} seen${cursorCls}">${escapeHtml(TILE_CHAR[t])}</span>`;
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
    if (!game) { document.getElementById('stats').innerHTML = ''; return; }
    const p = game.player;
    const statuses = [];
    if (p.poisoned > 0) statuses.push('<b style="color:#86efac">Poisoned</b>');
    if (p.confused > 0) statuses.push('<b style="color:#a78bfa">Confused</b>');
    if (game.zooType && anyHostileVisible()) statuses.push('<b style="color:#fb923c">Zoo!</b>');
    document.getElementById('stats').innerHTML = `
      <span>${p.className}</span>
      <span>HP <b>${p.hp}/${p.maxHp}</b></span>
      <span>Lv <b>${p.level}</b></span>
      <span>XP <b>${p.xp}/${p.nextLevelXp}</b></span>
      <span>Atk <b>${playerAttack()}</b></span>
      <span>Def <b>${playerDefense()}</b></span>
      <span>$ <b>${p.gold}</b></span>
      <span>Floor <b>${game.floor}</b></span>
      <span>${hungerLabel(p.hunger)}</span>
      ${statuses.length ? `<span>${statuses.join(' ')}</span>` : ''}
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
    if (opts.html) html += opts.html;
    if (opts.lines) {
      html += '<div class="modal-lines">' +
        opts.lines.map(l => l === '' ? '&nbsp;' : escapeHtml(l)).join('<br>') +
        '</div>';
    }
    if (opts.hint) {
      html += `<div class="modal-hint">${escapeHtml(opts.hint)}</div>`;
    }
    html += '</div>';
    modal.innerHTML = html;
    if (opts.bindClass) {
      modal.querySelectorAll('.class-card').forEach(el => {
        el.addEventListener('click', () => {
          hideModal();
          startGame(el.dataset.cls);
        });
      });
    }
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
      hint: 'a-z use/wear/wield/eat/zap. SHIFT+letter to drop. ESC to close.',
      mode: 'inventory',
    });
  }
  function openHelp() {
    showModal({
      title: 'Help',
      lines: [
        'Movement: hjkl / arrows;  yubn diagonals',
        '          Shift+dir or HJKL to run',
        '          . wait one turn',
        'Stairs:   >  descend     <  ascend',
        'Items:    ,  pick up     i  inventory      s  search nearby',
        'Actions:  q  quaff potion             r  read scroll',
        '          w  wield weapon             W  wear armor',
        '          e  eat food                 z  zap wand',
        'View:     ;  look around    T  auto-explore    ?  this help',
        '',
        'Tiles: @ you  # wall  . floor  + door  > down  < up  ^ trap',
        'Items: ) weapon  [ armor  ! potion  ? scroll  / wand  % food  $ gold',
        '',
        'Unknown potions, scrolls and wands reveal their nature when used.',
        'Hunger ticks every turn. Poison and confusion fade with time.',
        'Bosses guard floors 4, 7, and 10. Slay the Dread Wyrm to win.',
      ],
    });
  }
  function openTypedPicker(category, action, title) {
    const inv = game.player.inventory;
    const filtered = inv.map((it, i) => ({ it, i })).filter(({ it }) => it.category === category);
    if (filtered.length === 0) {
      log(`You have no ${category}s.`);
      return;
    }
    const lines = filtered.map(({ it, i }) => {
      const letter = String.fromCharCode(97 + i);
      const equipped =
        (game.player.weapon === it ? ' (wielded)' : '') +
        (game.player.armor === it ? ' (worn)' : '');
      return `${letter}) ${displayName(it)}${equipped}`;
    });
    showModal({
      title,
      lines,
      hint: 'Press a letter, or ESC to cancel.',
      mode: 'typed',
      action,
      allowed: new Set(filtered.map(f => f.i)),
    });
  }

  // --- Class selection ---
  function showClassSelect() {
    mode = 'select';
    const cards = CLASS_LIST.map((id, i) => {
      const c = CLASSES[id];
      return `
        <div class="class-card" data-cls="${id}">
          <h3>${c.name} <span class="key">${i + 1}</span></h3>
          <p>${c.desc}</p>
          <p>HP ${c.hp} &middot; Atk ${c.atk} &middot; Def ${c.def}</p>
        </div>`;
    }).join('');
    showModal({
      title: 'Choose your character',
      html: `<p style="margin:6px 0 4px;color:var(--muted)">Ten floors down. Slay the Dread Wyrm to escape.</p>
             <div class="class-grid">${cards}</div>
             <p style="font-size:0.78rem;color:var(--muted)">Click a card or press 1–4.</p>`,
      mode: 'class',
      bindClass: true,
    });
  }

  function startGame(classId) {
    const cls = CLASSES[classId];
    appearances = { potions: {}, scrolls: {}, wands: {} };
    identified = {};
    const colors = POTION_COLORS.slice().sort(() => Math.random() - 0.5);
    POTION_KINDS.forEach((k, i) => { appearances.potions[k.id] = colors[i % colors.length]; });
    const labels = SCROLL_LABELS.slice().sort(() => Math.random() - 0.5);
    SCROLL_KINDS.forEach((k, i) => { appearances.scrolls[k.id] = labels[i % labels.length]; });
    const mats = WAND_MATERIALS.slice().sort(() => Math.random() - 0.5);
    WAND_KINDS.forEach((k, i) => { appearances.wands[k.id] = mats[i % mats.length]; });

    const perks = new Set(cls.perks);
    if (perks.has('identify_wands')) {
      // Mages auto-identify wands in their pack at start
    }

    game = {
      floor: 1,
      player: {
        x: 0, y: 0,
        className: cls.name,
        hp: cls.hp, maxHp: cls.hp,
        atk: cls.atk, def: cls.def,
        xp: 0, level: 1, nextLevelXp: 20,
        hunger: 1200,
        gold: 0,
        confused: 0,
        poisoned: 0,
        inventory: [],
        weapon: null, armor: null,
        perks,
      },
      map: null, visible: null, seen: null, rooms: [],
      monsters: [], items: [], traps: [],
      messages: [],
      turn: 0,
      dead: false, won: false, deathCause: null,
      flash: null,
    };
    const kit = cls.kit();
    for (const it of kit) addToInventory(it);
    if (cls.wieldIdx !== undefined) game.player.weapon = kit[cls.wieldIdx];
    if (cls.wearIdx !== undefined)  game.player.armor  = kit[cls.wearIdx];
    if (perks.has('identify_wands')) {
      for (const it of game.player.inventory) if (it.category === 'wand') identified[it.id] = true;
    }

    mode = 'play';
    pendingAction = null;
    lookCursor = null;
    running = null;
    hideModal();
    enterFloor(1);
    log(`You step into the dungeon, a ${cls.name}. Stairs down lead deeper.`);
    render();
  }

  // --- Direction utilities ---
  function dirFromKey(e) {
    const k = e.key;
    if (k === 'ArrowLeft'  || k === 'h' || k === 'H') return { dx: -1, dy:  0 };
    if (k === 'ArrowRight' || k === 'l' || k === 'L') return { dx:  1, dy:  0 };
    if (k === 'ArrowUp'    || k === 'k' || k === 'K') return { dx:  0, dy: -1 };
    if (k === 'ArrowDown'  || k === 'j' || k === 'J') return { dx:  0, dy:  1 };
    if (k === 'y' || k === 'Y') return { dx: -1, dy: -1 };
    if (k === 'u' || k === 'U') return { dx:  1, dy: -1 };
    if (k === 'b' || k === 'B') return { dx: -1, dy:  1 };
    if (k === 'n' || k === 'N') return { dx:  1, dy:  1 };
    return null;
  }
  function isRunInput(e) {
    return e.shiftKey || /^[A-Z]$/.test(e.key);
  }

  // --- Input ---
  function handleKey(e) {
    // Look mode
    if (lookCursor) {
      const dir = dirFromKey(e);
      if (dir) { lookMove(dir.dx, dir.dy); e.preventDefault(); return; }
      if (e.key === 'Escape' || e.key === ';') {
        lookCursor = null; log('You stop looking.'); render(); e.preventDefault(); return;
      }
      return;
    }

    // Pending direction (zap, throw)
    if (pendingAction) {
      const dir = dirFromKey(e);
      if (e.key === 'Escape') {
        log('Never mind.');
        pendingAction = null;
        render();
        e.preventDefault();
        return;
      }
      if (dir) {
        const action = pendingAction;
        pendingAction = null;
        if (action.kind === 'zap') {
          zapWand(action.item, dir.dx, dir.dy);
        }
        e.preventDefault();
        return;
      }
      return;
    }

    // Modal handling
    if (modalState) {
      if (modalState.mode === 'class') {
        const m = e.key.match(/^([1-4])$/);
        if (m) {
          const idx = parseInt(m[1], 10) - 1;
          if (idx >= 0 && idx < CLASS_LIST.length) {
            hideModal();
            startGame(CLASS_LIST[idx]);
            e.preventDefault();
          }
        }
        return;
      }
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
      if (modalState.mode === 'typed') {
        if (e.key === 'Escape') { hideModal(); e.preventDefault(); return; }
        if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
          const idx = e.key.toLowerCase().charCodeAt(0) - 97;
          if (modalState.allowed.has(idx)) {
            const item = game.player.inventory[idx];
            hideModal();
            applyItem(item);
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

    if (game && (game.dead || game.won)) return;

    // Cancel running on any key
    if (running) {
      running = null;
    }

    const k = e.key;
    const dir = dirFromKey(e);
    if (dir) {
      e.preventDefault();
      if (isRunInput(e)) startRunDir(dir.dx, dir.dy);
      else playerMove(dir.dx, dir.dy);
      return;
    }

    if (k === '.') { wait(); e.preventDefault(); return; }
    if (k === ',' || k === 'g') { pickup(); e.preventDefault(); return; }
    if (k === '>') { useStairs('down'); e.preventDefault(); return; }
    if (k === '<') { useStairs('up'); e.preventDefault(); return; }
    if (k === 'i') { openInventory(); e.preventDefault(); return; }
    if (k === 's') { searchAction(); e.preventDefault(); return; }
    if (k === ';') { startLook(); e.preventDefault(); return; }
    if (k === 'T') { startAutoExplore(); e.preventDefault(); return; }
    if (k === '?') { openHelp(); e.preventDefault(); return; }
    if (k === 'q') { openTypedPicker('potion', 'quaff', 'Quaff which potion?'); e.preventDefault(); return; }
    if (k === 'r') { openTypedPicker('scroll', 'read',  'Read which scroll?');  e.preventDefault(); return; }
    if (k === 'w') { openTypedPicker('weapon', 'wield', 'Wield which weapon?'); e.preventDefault(); return; }
    if (k === 'W') { openTypedPicker('armor',  'wear',  'Wear which armor?');   e.preventDefault(); return; }
    if (k === 'e') { openTypedPicker('food',   'eat',   'Eat which food?');     e.preventDefault(); return; }
    if (k === 'z') { openTypedPicker('wand',   'zap',   'Zap which wand?');     e.preventDefault(); return; }
  }

  document.addEventListener('keydown', handleKey);
  document.getElementById('restart').addEventListener('click', () => showClassSelect());

  // Click on a class card uses bindClass in showModal.

  // Initialize: show class select first
  showClassSelect();
})();
