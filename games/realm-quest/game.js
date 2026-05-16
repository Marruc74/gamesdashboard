(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const statsEl = document.getElementById('stats');
  const logEl = document.getElementById('log');
  const modal = document.getElementById('modal');
  const restartBtn = document.getElementById('restart');

  const VW = canvas.width;       // 720
  const VH = canvas.height;      // 432
  const TILE = 24;
  const COLS = VW / TILE;        // 30
  const ROWS = VH / TILE;        // 18

  const rnd  = n => Math.floor(Math.random() * n);
  const range = (a, b) => a + rnd(b - a + 1);
  const pick = arr => arr[rnd(arr.length)];
  const chance = p => Math.random() < p;

  // --- Tile types ---
  const T = {
    WATER:    0,
    GRASS:    1,
    FOREST:   2,
    MOUNTAIN: 3,
    TOWN:     4,
    DUNGEON:  5,
    CASTLE:   6,
    BRIDGE:   7,
  };

  // --- Overworld (30 x 18) ---
  const OVERWORLD_RAW = [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~..........^^^^^.............~',
    '~..FFFF....^^^^^.....FFFF....~',
    '~..FFFF...............FFF....~',
    '~..FF.....!..........FFF.....~',
    '~............................~',
    '~......T.....................~',
    '~..........FF................~',
    '~.....FF...FF................~',
    '~.....FF..............T......~',
    '~.....FF.....................~',
    '~..............D.............~',
    '~............................~',
    '~.....^^^^^..................~',
    '~......^^^...................~',
    '~..@.........................~',
    '~............................~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ];

  const RAW_TO_TILE = {
    '~': T.WATER, '.': T.GRASS, 'F': T.FOREST, '^': T.MOUNTAIN,
    'T': T.TOWN, 'D': T.DUNGEON, '!': T.CASTLE, '@': T.GRASS,
  };

  const TILE_WALKABLE = {
    [T.GRASS]: true, [T.FOREST]: true,
    [T.TOWN]: true, [T.DUNGEON]: true, [T.CASTLE]: true,
    [T.BRIDGE]: true,
  };

  // --- Items ---
  const WEAPONS = [
    { id: 'club',         name: 'club',          atk: 1,  cost: 0 },
    { id: 'dagger',       name: 'dagger',        atk: 3,  cost: 50 },
    { id: 'short_sword',  name: 'short sword',   atk: 6,  cost: 200 },
    { id: 'long_sword',   name: 'long sword',    atk: 10, cost: 500 },
    { id: 'battle_axe',   name: 'battle axe',    atk: 14, cost: 1200 },
    { id: 'sun_blade',    name: 'sun blade',     atk: 20, cost: 3000 },
  ];
  const ARMORS = [
    { id: 'cloth',     name: 'cloth tunic',   def: 0,  cost: 0 },
    { id: 'leather',   name: 'leather armor', def: 2,  cost: 80 },
    { id: 'chain',     name: 'chain mail',    def: 5,  cost: 300 },
    { id: 'plate',     name: 'plate mail',    def: 9,  cost: 800 },
    { id: 'mithril',   name: 'mithril mail',  def: 14, cost: 2200 },
  ];
  const POTIONS = [
    { id: 'minor',  name: 'minor potion',   heal: 18,  cost: 30 },
    { id: 'normal', name: 'healing potion', heal: 45,  cost: 100 },
    { id: 'elixir', name: 'elixir',         heal: 999, cost: 450 },
  ];

  // --- Monsters ---
  const MONSTERS = [
    { id: 'slime',    name: 'slime',     hp:  8, atk:  3, def: 0, xp:  5,  gold:   4, color: '#86efac', shape: 'blob' },
    { id: 'rat',      name: 'giant rat', hp: 12, atk:  4, def: 1, xp:  8,  gold:   6, color: '#a8a29e', shape: 'critter' },
    { id: 'goblin',   name: 'goblin',    hp: 18, atk:  6, def: 2, xp: 14,  gold:  14, color: '#f472b6', shape: 'goblin' },
    { id: 'skeleton', name: 'skeleton',  hp: 24, atk:  8, def: 3, xp: 22,  gold:  18, color: '#e2e8f0', shape: 'undead' },
    { id: 'orc',      name: 'orc',       hp: 38, atk: 11, def: 4, xp: 38,  gold:  32, color: '#84cc16', shape: 'orc' },
    { id: 'wraith',   name: 'wraith',    hp: 50, atk: 14, def: 5, xp: 65,  gold:  55, color: '#c084fc', shape: 'wraith' },
    { id: 'troll',    name: 'troll',     hp: 75, atk: 18, def: 7, xp: 110, gold:  90, color: '#65a30d', shape: 'troll' },
    { id: 'dragon',   name: 'red dragon', hp: 130, atk: 25, def: 9, xp: 220, gold: 200, color: '#ef4444', shape: 'dragon' },
  ];
  const BOSS = {
    id: 'warlord', name: 'the Iron Warlord',
    hp: 240, atk: 32, def: 11, xp: 800, gold: 1500,
    color: '#fb923c', shape: 'warlord', boss: true,
  };

  // Encounter tables — increasingly harder by depth
  const OVERWORLD_ENCOUNTERS = ['slime', 'rat', 'goblin'];
  const DUNGEON_ENCOUNTERS = [
    ['slime', 'rat', 'goblin'],            // floor 1
    ['goblin', 'skeleton', 'orc'],         // floor 2
    ['orc', 'wraith', 'troll', 'dragon'],  // floor 3
  ];

  // --- Towns ---
  const TOWNS = [
    {
      x: 7,  y: 6, name: 'Brindale',
      blurb: 'A quiet hamlet on the western plains.',
      shop: { weapons: ['dagger', 'short_sword'], armors: ['leather', 'chain'], potions: ['minor', 'normal'] },
      innCost: 8,
    },
    {
      x: 22, y: 9, name: 'Hightower',
      blurb: 'Bustling market town in the east.',
      shop: { weapons: ['short_sword', 'long_sword', 'battle_axe'], armors: ['chain', 'plate'], potions: ['normal', 'elixir'] },
      innCost: 25,
    },
  ];

  // --- Castle quest dialog ---
  const CASTLE_LINES = [
    'You stand before the gates of the High Keep.',
    'The seneschal greets you and motions to a chamber.',
    '',
    '"Brave one — the Iron Warlord has risen beneath',
    'the southern hills. The dungeon he claims for his',
    'lair festers under our roads. Find him. End him."',
    '',
    'A heavy purse is pressed into your hand: 80 gold.',
    '',
    '"Return alive and you will be remembered."',
  ];

  // --- State ---
  let mode = 'overworld';   // 'overworld' | 'dungeon' | 'combat' | 'win' | 'gameover'
  let modalState = null;
  let world;                // 2D array of tile ids
  let player;
  let dungeon = null;       // { map, monsters, items, floor }
  let combat = null;        // active fight
  let messages = [];

  function log(msg, type = 'normal') {
    messages.push({ msg, type });
    if (messages.length > 60) messages.shift();
    renderLog();
  }
  function renderLog() {
    const recent = messages.slice(-3);
    logEl.innerHTML = recent.map(m => `<div class="log-${m.type === 'normal' ? 'info' : m.type}">${escapeHtml(m.msg)}</div>`).join('') || '&nbsp;';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  // --- Init ---
  function newGame() {
    world = OVERWORLD_RAW.map(row =>
      row.split('').map(ch => RAW_TO_TILE[ch] ?? T.GRASS)
    );
    // Find @ in raw for player start
    let sx = 3, sy = 15;
    for (let y = 0; y < OVERWORLD_RAW.length; y++) {
      const i = OVERWORLD_RAW[y].indexOf('@');
      if (i >= 0) { sx = i; sy = y; break; }
    }
    player = {
      x: sx, y: sy,
      hp: 30, maxHp: 30,
      atk: 4, def: 1,
      xp: 0, level: 1, nextLevelXp: 30,
      gold: 30,
      weapon: itemByCat('weapon', 'club'),
      armor: itemByCat('armor', 'cloth'),
      potions: [{ ...itemByCat('potion', 'minor'), count: 2 }],
      questAccepted: false,
      warlordDead: false,
    };
    mode = 'overworld';
    dungeon = null;
    combat = null;
    messages = [];
    log('You step out at dawn. The kingdom waits.', 'good');
    hideModal();
    render();
  }
  function itemByCat(cat, id) {
    const src = cat === 'weapon' ? WEAPONS : cat === 'armor' ? ARMORS : POTIONS;
    const it = src.find(x => x.id === id);
    return { ...it, category: cat };
  }
  function findPotion(id) {
    return player.potions.find(p => p.id === id);
  }
  function addPotion(id, n = 1) {
    const ex = findPotion(id);
    if (ex) ex.count += n;
    else {
      const it = itemByCat('potion', id);
      player.potions.push({ ...it, count: n });
    }
  }
  function consumePotion(p) {
    p.count -= 1;
    if (p.count <= 0) player.potions = player.potions.filter(x => x !== p);
  }

  function totalAttack() { return player.atk + (player.weapon ? player.weapon.atk : 0); }
  function totalDefense() { return player.def + (player.armor ? player.armor.def : 0); }

  // --- Stats / leveling ---
  function gainXp(n) {
    player.xp += n;
    while (player.xp >= player.nextLevelXp) {
      player.level += 1;
      const gain = 6 + rnd(4);
      player.maxHp += gain;
      player.hp = Math.min(player.maxHp, player.hp + gain);
      player.atk += 2;
      if (player.level % 2 === 0) player.def += 1;
      log(`You reach level ${player.level}!`, 'good');
      player.nextLevelXp = Math.floor(30 * Math.pow(1.7, player.level - 1));
    }
  }

  // --- Movement ---
  function tryMoveOverworld(dx, dy) {
    const nx = player.x + dx, ny = player.y + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    const t = world[ny][nx];
    if (!TILE_WALKABLE[t]) {
      if (t === T.WATER) log('Water blocks your path.');
      else if (t === T.MOUNTAIN) log('The cliffs are too sheer.');
      return;
    }
    player.x = nx; player.y = ny;

    if (t === T.TOWN) {
      const town = TOWNS.find(tw => tw.x === nx && tw.y === ny);
      if (town) enterTown(town);
      return;
    }
    if (t === T.DUNGEON) {
      enterDungeon();
      return;
    }
    if (t === T.CASTLE) {
      visitCastle();
      return;
    }

    // Random encounter
    const rate = t === T.FOREST ? 0.13 : 0.04;
    if (chance(rate)) startEncounter(OVERWORLD_ENCOUNTERS, 'a wild beast leaps from cover');
  }

  function tryMoveDungeon(dx, dy) {
    const nx = player.x + dx, ny = player.y + dy;
    if (nx < 0 || nx >= dungeon.w || ny < 0 || ny >= dungeon.h) return;
    const t = dungeon.map[ny][nx];
    if (t === DT.WALL) return;
    if (t === DT.EXIT) {
      log('You climb back to the surface.');
      exitToOverworld();
      render();
      return;
    }
    if (t === DT.STAIRS_DOWN) {
      player.x = nx; player.y = ny;
      if (dungeon.floor >= 3) {
        // Floor 3 is the boss floor. Stepping on >>> is the boss tile.
        log('The stairs are sealed by foul rune-locks.');
        render();
        return;
      }
      enterDungeonFloor(dungeon.floor + 1);
      return;
    }
    if (t === DT.STAIRS_UP) {
      player.x = nx; player.y = ny;
      if (dungeon.floor === 1) {
        log('You climb back to the surface.');
        exitToOverworld();
      } else {
        enterDungeonFloor(dungeon.floor - 1);
      }
      render();
      return;
    }
    if (t === DT.CHEST) {
      const chest = dungeon.chests.find(c => c.x === nx && c.y === ny);
      if (chest && !chest.opened) {
        openChest(chest);
        chest.opened = true;
        dungeon.map[ny][nx] = DT.FLOOR;
      }
      player.x = nx; player.y = ny;
      render();
      return;
    }
    if (t === DT.BOSS_TILE) {
      // Engage boss
      player.x = nx; player.y = ny;
      startBossFight();
      return;
    }
    player.x = nx; player.y = ny;

    // Encounter check on dungeon floor tile
    const monsterAt = dungeon.monsters.find(m => m.x === nx && m.y === ny);
    if (monsterAt) {
      startEncounterByName(monsterAt.id, `a ${monsterAt.id} blocks your way`);
      dungeon.monsters = dungeon.monsters.filter(m => m !== monsterAt);
    } else if (chance(0.07)) {
      const pool = DUNGEON_ENCOUNTERS[Math.min(2, dungeon.floor - 1)];
      startEncounter(pool, 'something lurches out of the shadows');
    }
    render();
  }

  // --- Dungeon generation ---
  const DT = { VOID: 0, WALL: 1, FLOOR: 2, STAIRS_UP: 3, STAIRS_DOWN: 4, CHEST: 5, EXIT: 6, BOSS_TILE: 7 };

  function enterDungeon() {
    player.owX = player.x;
    player.owY = player.y;
    log('You descend into the dungeon.');
    enterDungeonFloor(1, true);
  }
  function exitToOverworld() {
    mode = 'overworld';
    dungeon = null;
    if (player.owX !== undefined) {
      player.x = player.owX;
      player.y = player.owY;
    }
  }

  function enterDungeonFloor(floor, fresh) {
    const w = 30, h = 18;
    const map = Array.from({ length: h }, () => Array(w).fill(DT.WALL));
    const rooms = [];
    // Carve rooms
    const roomCount = 6 + rnd(3);
    for (let i = 0; i < roomCount; i++) {
      const rw = 4 + rnd(5);
      const rh = 3 + rnd(3);
      const rx = 1 + rnd(w - rw - 2);
      const ry = 1 + rnd(h - rh - 2);
      let overlap = false;
      for (const r of rooms) {
        if (rx < r.x + r.w + 1 && rx + rw + 1 > r.x &&
            ry < r.y + r.h + 1 && ry + rh + 1 > r.y) { overlap = true; break; }
      }
      if (overlap) continue;
      for (let dy = 0; dy < rh; dy++)
        for (let dx = 0; dx < rw; dx++)
          map[ry + dy][rx + dx] = DT.FLOOR;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) });
    }
    // Connect rooms
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1], b = rooms[i];
      if (Math.random() < 0.5) {
        for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) map[a.cy][x] = DT.FLOOR;
        for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) map[y][b.cx] = DT.FLOOR;
      } else {
        for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) map[y][a.cx] = DT.FLOOR;
        for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) map[b.cy][x] = DT.FLOOR;
      }
    }

    const startRoom = rooms[0];
    const endRoom = rooms[rooms.length - 1];
    if (floor === 1) map[startRoom.cy][startRoom.cx] = DT.EXIT;
    else map[startRoom.cy][startRoom.cx] = DT.STAIRS_UP;

    if (floor < 3) {
      map[endRoom.cy][endRoom.cx] = DT.STAIRS_DOWN;
    } else {
      // Boss tile
      if (!player.warlordDead) map[endRoom.cy][endRoom.cx] = DT.BOSS_TILE;
      else map[endRoom.cy][endRoom.cx] = DT.FLOOR;
    }

    // Place player either at entry (fresh from overworld) or matching stair
    if (fresh) {
      player.x = startRoom.cx;
      player.y = startRoom.cy;
    } else {
      // came from another floor — place on opposite stair
      player.x = startRoom.cx;
      player.y = startRoom.cy;
    }

    // Chests
    const chests = [];
    const chestCount = 1 + rnd(3);
    for (let i = 0; i < chestCount; i++) {
      const r = pick(rooms);
      const cx = r.x + rnd(r.w);
      const cy = r.y + rnd(r.h);
      if (map[cy][cx] !== DT.FLOOR) continue;
      if (cx === player.x && cy === player.y) continue;
      if (chests.some(c => c.x === cx && c.y === cy)) continue;
      map[cy][cx] = DT.CHEST;
      chests.push({ x: cx, y: cy, opened: false, floor });
    }

    // Stationary monsters
    const monstersOnFloor = [];
    const pool = DUNGEON_ENCOUNTERS[Math.min(2, floor - 1)];
    const monsterCount = 2 + rnd(3);
    for (let i = 0; i < monsterCount; i++) {
      const r = pick(rooms);
      const mx = r.x + rnd(r.w);
      const my = r.y + rnd(r.h);
      if (map[my][mx] !== DT.FLOOR) continue;
      if (mx === player.x && my === player.y) continue;
      monstersOnFloor.push({ x: mx, y: my, id: pick(pool) });
    }

    dungeon = { map, w, h, rooms, chests, monsters: monstersOnFloor, floor };
    mode = 'dungeon';
    log(`Dungeon floor ${floor}.`, 'info');
    render();
  }

  function openChest(chest) {
    const roll = Math.random();
    if (roll < 0.45) {
      const g = 20 + rnd(50) + chest.floor * 15;
      player.gold += g;
      log(`The chest holds ${g} gold pieces.`, 'good');
    } else if (roll < 0.75) {
      const tier = Math.min(POTIONS.length - 1, rnd(POTIONS.length));
      addPotion(POTIONS[tier].id);
      log(`Inside: a ${POTIONS[tier].name}.`, 'good');
    } else if (roll < 0.90) {
      const idx = Math.min(WEAPONS.length - 1, 1 + chest.floor + rnd(2));
      const w = WEAPONS[idx];
      if (!player.weapon || w.atk > player.weapon.atk) {
        log(`You find a ${w.name} and wield it.`, 'good');
        player.weapon = itemByCat('weapon', w.id);
      } else {
        const g = w.cost / 2 | 0;
        player.gold += g;
        log(`A ${w.name} — you sell it for ${g} gold.`, 'good');
      }
    } else {
      const idx = Math.min(ARMORS.length - 1, 1 + chest.floor + rnd(2));
      const a = ARMORS[idx];
      if (!player.armor || a.def > player.armor.def) {
        log(`You find ${a.name} and don it.`, 'good');
        player.armor = itemByCat('armor', a.id);
      } else {
        const g = a.cost / 2 | 0;
        player.gold += g;
        log(`${a.name} — you sell it for ${g} gold.`, 'good');
      }
    }
  }

  // --- Combat ---
  function startEncounter(pool, msg) {
    startEncounterByName(pick(pool), msg);
  }
  function startEncounterByName(monsterId, msg) {
    const tpl = MONSTERS.find(m => m.id === monsterId);
    if (!tpl) return;
    combat = {
      monster: { ...tpl, currentHp: tpl.hp, maxHp: tpl.hp },
      defending: false,
      turn: 'player',
      log: [],
      done: false,
      boss: false,
    };
    mode = 'combat';
    pushCombatLog(`${msg.charAt(0).toUpperCase()}${msg.slice(1)} — ${tpl.name}!`);
    render();
  }
  function startBossFight() {
    combat = {
      monster: { ...BOSS, currentHp: BOSS.hp, maxHp: BOSS.hp },
      defending: false,
      turn: 'player',
      log: [],
      done: false,
      boss: true,
    };
    mode = 'combat';
    pushCombatLog(`From the shadows steps ${BOSS.name}.`);
    pushCombatLog('"You dare?" The air grows heavy.');
    render();
  }
  function pushCombatLog(m) {
    combat.log.push(m);
    if (combat.log.length > 6) combat.log.shift();
  }

  function playerAttack() {
    if (combat.done || combat.turn !== 'player') return;
    combat.turn = 'monster';
    const dmg = Math.max(1, totalAttack() - combat.monster.def + rnd(4) - 1);
    combat.monster.currentHp -= dmg;
    pushCombatLog(`You hit the ${combat.monster.name} for ${dmg}.`);
    if (combat.monster.currentHp <= 0) {
      victory();
      return;
    }
    monsterTurn();
  }
  function playerDefend() {
    if (combat.done || combat.turn !== 'player') return;
    combat.turn = 'monster';
    combat.defending = true;
    pushCombatLog('You raise your guard.');
    monsterTurn();
  }
  function playerItemPrompt() {
    if (combat.done || combat.turn !== 'player') return;
    if (player.potions.length === 0) {
      pushCombatLog('You carry no potions.');
      render();
      return;
    }
    showPotionPicker();
  }
  function playerRun() {
    if (combat.done || combat.turn !== 'player') return;
    combat.turn = 'monster';
    if (combat.boss) {
      pushCombatLog('The Warlord blocks your escape!');
      monsterTurn();
      return;
    }
    if (Math.random() < 0.65) {
      pushCombatLog('You break away from the fight!');
      combat.done = true;
      setTimeout(() => endCombat(false), 700);
    } else {
      pushCombatLog('You cannot escape!');
      monsterTurn();
    }
  }
  function monsterTurn() {
    if (combat.done) return;
    setTimeout(() => {
      const def = combat.defending ? Math.floor(totalDefense() * 1.6) : totalDefense();
      const raw = combat.monster.atk - def + rnd(4) - 1;
      const dmg = Math.max(1, raw);
      player.hp -= dmg;
      pushCombatLog(`The ${combat.monster.name} hits you for ${dmg}.`);
      combat.defending = false;
      if (player.hp <= 0) {
        player.hp = 0;
        pushCombatLog('You collapse...');
        combat.done = true;
        setTimeout(() => die(`slain by a ${combat.monster.name}`), 800);
      } else {
        combat.turn = 'player';
      }
      render();
    }, 380);
  }
  function victory() {
    const m = combat.monster;
    pushCombatLog(`You defeat the ${m.name}! +${m.xp} XP, +${m.gold} gp.`);
    player.gold += m.gold;
    gainXp(m.xp);
    combat.done = true;
    if (combat.boss) {
      player.warlordDead = true;
      setTimeout(winGame, 1500);
    } else {
      setTimeout(() => endCombat(true), 900);
    }
    render();
  }
  function endCombat(killed) {
    combat = null;
    mode = dungeon ? 'dungeon' : 'overworld';
    render();
  }

  // --- Towns ---
  function enterTown(town) {
    showModal({
      title: town.name,
      lines: [town.blurb],
      opts: [
        { key: '1', label: 'Shop', go: () => openShop(town) },
        { key: '2', label: `Inn (rest, ${town.innCost} gp)`, go: () => useInn(town) },
        { key: '3', label: 'Leave', go: () => leaveTown() },
      ],
      hint: 'Press 1-3 or click an option.',
    });
  }
  function leaveTown() {
    hideModal();
    // step one tile down from town to avoid re-entering
    const nx = player.x, ny = player.y + 1;
    if (ny < ROWS && TILE_WALKABLE[world[ny][nx]] && world[ny][nx] !== T.TOWN && world[ny][nx] !== T.DUNGEON && world[ny][nx] !== T.CASTLE) {
      player.y = ny;
    }
    render();
  }
  function useInn(town) {
    if (player.gold < town.innCost) {
      log("You can't afford a room.");
      enterTown(town);
      return;
    }
    player.gold -= town.innCost;
    player.hp = player.maxHp;
    log('A warm meal and a soft bed. Fully restored.', 'good');
    enterTown(town);
  }
  function openShop(town) {
    const wOpts = town.shop.weapons.map(id => WEAPONS.find(w => w.id === id));
    const aOpts = town.shop.armors.map(id => ARMORS.find(a => a.id === id));
    const pOpts = town.shop.potions.map(id => POTIONS.find(p => p.id === id));
    const opts = [];
    let k = 1;
    const lines = [`Gold: ${player.gold}`, '', 'Weapons'];
    for (const w of wOpts) {
      const owned = player.weapon && player.weapon.id === w.id;
      const can = player.gold >= w.cost && !owned;
      lines.push(`${k}) ${w.name}  +${w.atk} atk    ${owned ? '(wielded)' : w.cost + ' gp'}`);
      if (can) opts.push({ key: String(k), label: '', go: () => buyWeapon(town, w) });
      k++;
    }
    lines.push('', 'Armor');
    for (const a of aOpts) {
      const owned = player.armor && player.armor.id === a.id;
      const can = player.gold >= a.cost && !owned;
      lines.push(`${k}) ${a.name}  +${a.def} def    ${owned ? '(worn)' : a.cost + ' gp'}`);
      if (can) opts.push({ key: String(k), label: '', go: () => buyArmor(town, a) });
      k++;
    }
    lines.push('', 'Potions');
    for (const p of pOpts) {
      const can = player.gold >= p.cost;
      lines.push(`${k}) ${p.name}  +${p.heal === 999 ? 'full' : p.heal} HP    ${p.cost} gp`);
      if (can) opts.push({ key: String(k), label: '', go: () => buyPotion(town, p) });
      k++;
    }
    showModal({
      title: `${town.name} — Shop`,
      lines,
      opts,
      hint: 'Number to buy.  ESC to back.',
      backTo: () => enterTown(town),
    });
  }
  function buyWeapon(town, w) {
    player.gold -= w.cost;
    player.weapon = itemByCat('weapon', w.id);
    log(`You buy and wield the ${w.name}.`, 'good');
    openShop(town);
  }
  function buyArmor(town, a) {
    player.gold -= a.cost;
    player.armor = itemByCat('armor', a.id);
    log(`You buy and don the ${a.name}.`, 'good');
    openShop(town);
  }
  function buyPotion(town, p) {
    player.gold -= p.cost;
    addPotion(p.id, 1);
    log(`You buy a ${p.name}.`, 'good');
    openShop(town);
  }

  function visitCastle() {
    showModal({
      title: 'The High Keep',
      lines: CASTLE_LINES,
      opts: [
        { key: '1', label: 'Accept the quest', go: () => acceptQuest() },
        { key: '2', label: 'Leave', go: () => leaveCastle() },
      ],
      hint: 'Press 1-2.',
    });
  }
  function acceptQuest() {
    if (!player.questAccepted) {
      player.questAccepted = true;
      player.gold += 80;
      log('The seneschal hands you 80 gold. The quest is yours.', 'good');
    } else {
      log('"Still you tarry. The Warlord waits."');
    }
    leaveCastle();
  }
  function leaveCastle() {
    hideModal();
    const ny = player.y + 1;
    if (ny < ROWS && TILE_WALKABLE[world[ny][player.x]] && world[ny][player.x] !== T.CASTLE) {
      player.y = ny;
    }
    render();
  }

  // --- Inventory / potions ---
  function showInventory() {
    const lines = [
      `HP: ${player.hp}/${player.maxHp}    Gold: ${player.gold}`,
      `Atk: ${totalAttack()} (base ${player.atk} + ${player.weapon ? player.weapon.atk : 0})`,
      `Def: ${totalDefense()} (base ${player.def} + ${player.armor ? player.armor.def : 0})`,
      `Level ${player.level} — XP ${player.xp}/${player.nextLevelXp}`,
      '',
      `Wielded: ${player.weapon ? player.weapon.name : '(nothing)'}`,
      `Worn:    ${player.armor  ? player.armor.name  : '(nothing)'}`,
      '',
      'Potions:',
      ...(player.potions.length
        ? player.potions.map((p, i) => `${i + 1}) ${p.name} (+${p.heal === 999 ? 'full' : p.heal})  ×${p.count}`)
        : ['  (none)']),
    ];
    const opts = player.potions.map((p, i) => ({
      key: String(i + 1), label: '', go: () => quaff(p),
    }));
    showModal({ title: 'Inventory', lines, opts, hint: 'Number to drink. ESC to close.' });
  }
  function quaff(p) {
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + p.heal);
    consumePotion(p);
    log(`You drink the ${p.name}. (+${player.hp - before} HP)`, 'good');
    hideModal();
    render();
  }
  function showPotionPicker() {
    if (player.potions.length === 0) {
      pushCombatLog('You carry no potions.');
      render();
      return;
    }
    const opts = player.potions.map((p, i) => ({
      key: String(i + 1), label: '', go: () => quaffInCombat(p),
    }));
    const lines = player.potions.map((p, i) =>
      `${i + 1}) ${p.name} (+${p.heal === 999 ? 'full' : p.heal})  ×${p.count}`
    );
    showModal({ title: 'Quaff which?', lines, opts, hint: 'Number to drink.  ESC cancel.' });
  }
  function quaffInCombat(p) {
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + p.heal);
    consumePotion(p);
    pushCombatLog(`You drink the ${p.name}. (+${player.hp - before} HP)`);
    hideModal();
    monsterTurn();
  }

  // --- Death / win ---
  function die(cause) {
    if (mode === 'gameover') return;
    mode = 'gameover';
    log(`You die. (${cause})`, 'bad');
    showModal({
      title: 'You have died',
      lines: [
        cause,
        '',
        `Final level: ${player.level}`,
        `XP: ${player.xp}`,
        `Gold: ${player.gold}`,
      ],
      opts: [
        { key: '1', label: 'New game', go: () => newGame() },
      ],
      hint: 'Press 1 to start over.',
    });
  }
  function winGame() {
    mode = 'win';
    log('You have slain the Warlord. The realm is safe.', 'good');
    saveScore();
    const scores = getScores();
    const lines = [
      'The Warlord falls. His armies scatter.',
      'You return to the High Keep a hero.',
      '',
      `Level: ${player.level}`,
      `Gold: ${player.gold}`,
      `Score: ${score()}`,
      '',
      'Records:',
      ...scores.slice(0, 5).map((s, i) =>
        `  ${i + 1}. ${String(s.score).padStart(6)}  Lv ${s.level}  ${s.won ? 'won' : 'fell'}`
      ),
    ];
    showModal({
      title: 'Victory',
      lines,
      opts: [{ key: '1', label: 'New game', go: () => newGame() }],
      hint: 'Press 1.',
    });
  }
  function score() {
    return player.gold + player.xp * 3 + (player.warlordDead ? 2000 : 0) + player.level * 50;
  }
  function getScores() {
    try { return JSON.parse(localStorage.getItem('realmquest-hs') || '[]'); }
    catch { return []; }
  }
  function saveScore() {
    const list = getScores();
    list.push({ score: score(), level: player.level, gold: player.gold, won: player.warlordDead, date: Date.now() });
    list.sort((a, b) => b.score - a.score);
    list.length = Math.min(10, list.length);
    localStorage.setItem('realmquest-hs', JSON.stringify(list));
  }

  // --- Modal ---
  function showModal(opts) {
    modalState = opts;
    let html = '<div class="modal-panel">';
    if (opts.title) html += `<h2>${escapeHtml(opts.title)}</h2>`;
    if (opts.lines) {
      html += '<div>' + opts.lines.map(l => l === '' ? '<br>' : `<div class="opt">${escapeHtml(l)}</div>`).join('') + '</div>';
    }
    if (opts.opts && opts.opts.length) {
      html += '<div style="margin-top:10px">' + opts.opts.map(o =>
        o.label ? `<div class="opt"><span class="key">${o.key}</span>${escapeHtml(o.label)}</div>` : ''
      ).join('') + '</div>';
    }
    if (opts.hint) html += `<div class="modal-hint">${escapeHtml(opts.hint)}</div>`;
    html += '</div>';
    modal.innerHTML = html;
    modal.classList.remove('hidden');
  }
  function hideModal() {
    modalState = null;
    modal.classList.add('hidden');
  }

  // --- Rendering ---
  function render() {
    ctx.fillStyle = '#06080d';
    ctx.fillRect(0, 0, VW, VH);
    if (mode === 'overworld') renderOverworld();
    else if (mode === 'dungeon') renderDungeon();
    else if (mode === 'combat') renderCombat();
    renderStats();
  }

  function renderStats() {
    if (!player) { statsEl.innerHTML = ''; return; }
    statsEl.innerHTML = `
      <span>HP <b>${player.hp}/${player.maxHp}</b></span>
      <span>Lv <b>${player.level}</b></span>
      <span>XP <b>${player.xp}/${player.nextLevelXp}</b></span>
      <span>Atk <b>${totalAttack()}</b></span>
      <span>Def <b>${totalDefense()}</b></span>
      <span>$ <b>${player.gold}</b></span>
      <span>${mode === 'dungeon' && dungeon ? 'Floor ' + dungeon.floor : 'Overworld'}</span>
    `;
  }

  function drawTerrainTile(t, sx, sy, frame) {
    if (t === T.WATER) {
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#3b82f6';
      const yo = (Math.sin((frame + sx + sy) / 14) * 2) | 0;
      ctx.fillRect(sx + 4, sy + 6 + yo, 6, 1);
      ctx.fillRect(sx + 14, sy + 14 - yo, 6, 1);
    } else if (t === T.GRASS) {
      ctx.fillStyle = '#1e3b1a';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#2a5a23';
      ctx.fillRect(sx + 4, sy + 4, 3, 2);
      ctx.fillRect(sx + 14, sy + 11, 3, 2);
      ctx.fillRect(sx + 8, sy + 18, 3, 2);
    } else if (t === T.FOREST) {
      ctx.fillStyle = '#163018';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#2f6b30';
      ctx.beginPath();
      ctx.moveTo(sx + 12, sy + 2);
      ctx.lineTo(sx + 21, sy + 18);
      ctx.lineTo(sx + 3, sy + 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3b1d05';
      ctx.fillRect(sx + 10, sy + 18, 4, 4);
    } else if (t === T.MOUNTAIN) {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#737373';
      ctx.beginPath();
      ctx.moveTo(sx + 12, sy + 2);
      ctx.lineTo(sx + 22, sy + 20);
      ctx.lineTo(sx + 2, sy + 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e5e5e5';
      ctx.beginPath();
      ctx.moveTo(sx + 12, sy + 2);
      ctx.lineTo(sx + 16, sy + 9);
      ctx.lineTo(sx + 8, sy + 9);
      ctx.closePath();
      ctx.fill();
    } else if (t === T.TOWN) {
      ctx.fillStyle = '#1e3b1a';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#a16207';
      ctx.fillRect(sx + 5, sy + 10, 14, 10);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(sx + 12, sy + 3);
      ctx.lineTo(sx + 21, sy + 11);
      ctx.lineTo(sx + 3, sy + 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#171717';
      ctx.fillRect(sx + 10, sy + 14, 4, 6);
    } else if (t === T.DUNGEON) {
      ctx.fillStyle = '#1e3b1a';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#525252';
      ctx.fillRect(sx + 3, sy + 9, 18, 12);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(sx + 12, sy + 16, 6, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#737373';
      ctx.fillRect(sx + 3, sy + 8, 18, 3);
    } else if (t === T.CASTLE) {
      ctx.fillStyle = '#1e3b1a';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(sx + 4, sy + 6, 16, 14);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(sx + 4, sy + 4, 3, 4);
      ctx.fillRect(sx + 10, sy + 4, 3, 4);
      ctx.fillRect(sx + 16, sy + 4, 3, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(sx + 10, sy + 14, 4, 6);
    }
  }

  let frameCounter = 0;
  function renderOverworld() {
    frameCounter += 1;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        drawTerrainTile(world[y][x], x * TILE, y * TILE, frameCounter);
      }
    }
    drawPlayer(player.x * TILE, player.y * TILE);
  }

  function renderDungeon() {
    for (let y = 0; y < dungeon.h; y++) {
      for (let x = 0; x < dungeon.w; x++) {
        const t = dungeon.map[y][x];
        const sx = x * TILE, sy = y * TILE;
        if (t === DT.WALL) {
          ctx.fillStyle = '#1f2433';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = '#2a3142';
          ctx.fillRect(sx, sy, TILE, 3);
        } else if (t === DT.FLOOR) {
          ctx.fillStyle = '#0d1119';
          ctx.fillRect(sx, sy, TILE, TILE);
          if ((x + y) % 7 === 0) {
            ctx.fillStyle = '#141a25';
            ctx.fillRect(sx + 4, sy + 4, 2, 2);
          }
        } else if (t === DT.EXIT) {
          ctx.fillStyle = '#0d1119';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('↑', sx + TILE / 2, sy + TILE / 2 + 1);
        } else if (t === DT.STAIRS_DOWN) {
          ctx.fillStyle = '#0d1119';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('>', sx + TILE / 2, sy + TILE / 2 + 1);
        } else if (t === DT.STAIRS_UP) {
          ctx.fillStyle = '#0d1119';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('<', sx + TILE / 2, sy + TILE / 2 + 1);
        } else if (t === DT.CHEST) {
          ctx.fillStyle = '#0d1119';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = '#a16207';
          ctx.fillRect(sx + 5, sy + 9, 14, 11);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(sx + 5, sy + 13, 14, 2);
          ctx.fillStyle = '#1a1500';
          ctx.fillRect(sx + 11, sy + 13, 2, 4);
        } else if (t === DT.BOSS_TILE) {
          ctx.fillStyle = '#1a0d0d';
          ctx.fillRect(sx, sy, TILE, TILE);
          const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 200);
          ctx.fillStyle = `rgba(251,146,60,${pulse})`;
          ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
          ctx.fillStyle = '#000';
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', sx + TILE / 2, sy + TILE / 2 + 1);
        }
      }
    }
    // Pre-placed monsters
    for (const m of dungeon.monsters) {
      const tpl = MONSTERS.find(t => t.id === m.id);
      if (!tpl) continue;
      const sx = m.x * TILE, sy = m.y * TILE;
      ctx.fillStyle = tpl.color;
      ctx.beginPath();
      ctx.arc(sx + TILE / 2, sy + TILE / 2, TILE * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d1119';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tpl.name[0].toUpperCase(), sx + TILE / 2, sy + TILE / 2 + 1);
    }
    drawPlayer(player.x * TILE, player.y * TILE);
  }

  function drawPlayer(sx, sy) {
    // body
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(sx + TILE / 2, sy + TILE / 2, TILE * 0.34, 0, Math.PI * 2);
    ctx.fill();
    // face
    ctx.fillStyle = '#1a1500';
    ctx.fillRect(sx + 8, sy + 9, 2, 3);
    ctx.fillRect(sx + 14, sy + 9, 2, 3);
    ctx.fillRect(sx + 9, sy + 15, 6, 1);
  }

  function renderCombat() {
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#1a1428');
    grad.addColorStop(1, '#06080d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);

    // Floor band
    ctx.fillStyle = '#0a1810';
    ctx.fillRect(0, VH - 96, VW, 96);

    // Monster
    const m = combat.monster;
    drawMonster(m, VW / 2, VH / 2 - 40, combat.boss ? 70 : 46);

    // HP bars
    drawHpBar(40, 24, VW - 80, player.hp / player.maxHp, '#86efac', `You — HP ${player.hp}/${player.maxHp}`);
    drawHpBar(40, 56, VW - 80, m.currentHp / m.maxHp, '#ef4444', `${m.name} — HP ${Math.max(0, m.currentHp)}/${m.maxHp}`);

    // Combat log
    ctx.fillStyle = '#0e0e16';
    ctx.fillRect(40, VH - 200, VW - 80, 90);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px "SF Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = combat.log.slice(-5);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 50, VH - 195 + i * 16);
    }

    // Action menu
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 16px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    if (!combat.done && combat.turn === 'player') {
      ctx.fillText('1) Attack    2) Defend    3) Item    4) Run', VW / 2, VH - 28);
    } else if (combat.done) {
      ctx.fillStyle = combat.monster.currentHp <= 0 ? '#86efac' : '#fca5a5';
      ctx.fillText(combat.monster.currentHp <= 0 ? 'Victory!' : '…', VW / 2, VH - 28);
    } else {
      ctx.fillStyle = '#fca5a5';
      ctx.fillText('…', VW / 2, VH - 28);
    }
  }
  function drawHpBar(x, y, w, frac, color, label) {
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, frac), 8);
    ctx.fillStyle = '#e6e8ee';
    ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, y - 4);
  }
  function drawMonster(m, cx, cy, r) {
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.3, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.15, r * 0.18, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, cy - r * 0.15, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.12, r * 0.08, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, cy - r * 0.12, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    // Mouth
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (m.boss) {
      ctx.moveTo(cx - r * 0.35, cy + r * 0.35);
      ctx.lineTo(cx, cy + r * 0.45);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
    } else if (m.shape === 'dragon' || m.shape === 'troll') {
      // fangs
      ctx.moveTo(cx - r * 0.25, cy + r * 0.25);
      ctx.lineTo(cx - r * 0.15, cy + r * 0.45);
      ctx.lineTo(cx, cy + r * 0.30);
      ctx.lineTo(cx + r * 0.15, cy + r * 0.45);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.25);
    } else if (m.shape === 'undead') {
      // jagged
      ctx.moveTo(cx - r * 0.30, cy + r * 0.30);
      for (let i = -2; i <= 2; i++) {
        ctx.lineTo(cx + i * r * 0.15, cy + r * 0.30 + ((i % 2) ? r * 0.10 : -r * 0.05));
      }
    } else {
      ctx.moveTo(cx - r * 0.25, cy + r * 0.35);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.35);
    }
    ctx.stroke();
    // Boss horns
    if (m.boss) {
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy - r * 0.4);
      ctx.lineTo(cx - r * 0.4, cy - r * 0.95);
      ctx.lineTo(cx - r * 0.2, cy - r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.2, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.4, cy - r * 0.95);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- Input ---
  function handleKey(e) {
    if (modalState) {
      if (e.key === 'Escape') {
        if (modalState.backTo) { hideModal(); modalState.backTo(); }
        else hideModal();
        e.preventDefault();
        return;
      }
      for (const o of (modalState.opts || [])) {
        if (e.key === o.key) {
          o.go();
          e.preventDefault();
          return;
        }
      }
      return;
    }

    if (mode === 'win' || mode === 'gameover') {
      if (e.key === 'Enter' || e.key === ' ' || e.key === '1' || e.key === 'r' || e.key === 'R') newGame();
      return;
    }

    if (mode === 'combat') {
      if (combat.done || combat.turn !== 'player') return;
      if (e.key === '1') { playerAttack(); e.preventDefault(); return; }
      if (e.key === '2') { playerDefend(); e.preventDefault(); return; }
      if (e.key === '3') { playerItemPrompt(); e.preventDefault(); return; }
      if (e.key === '4') { playerRun(); e.preventDefault(); return; }
      return;
    }

    // Overworld / dungeon movement
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') dx = -1;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dx = 1;
    else if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') dy = -1;
    else if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') dy = 1;
    else if (e.key === 'i' || e.key === 'I') { showInventory(); e.preventDefault(); return; }
    else if (e.key === 'r' || e.key === 'R') { newGame(); return; }
    else return;
    e.preventDefault();
    if (mode === 'overworld') tryMoveOverworld(dx, dy);
    else if (mode === 'dungeon') tryMoveDungeon(dx, dy);
    render();
  }

  document.addEventListener('keydown', handleKey);
  restartBtn.addEventListener('click', () => newGame());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      // click outside panel: act as ESC
      if (!modalState) return;
      if (modalState.backTo) { hideModal(); modalState.backTo(); }
      else hideModal();
    }
  });

  // --- Animation loop (for water shimmer + boss tile pulse) ---
  function loop() {
    if (mode === 'overworld' || (mode === 'dungeon' && dungeon)) render();
    requestAnimationFrame(loop);
  }

  newGame();
  requestAnimationFrame(loop);
})();
