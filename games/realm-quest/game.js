(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const statsEl = document.getElementById('stats');
  const logEl = document.getElementById('log');
  const modal = document.getElementById('modal');
  const questLogEl = document.getElementById('quest-log');
  const restartBtn = document.getElementById('restart');

  const VW = canvas.width;       // 720
  const VH = canvas.height;      // 480
  const TILE = 24;
  const COLS = VW / TILE;        // 30
  const ROWS = VH / TILE;        // 20

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
    SAND:     8,
  };

  // --- Overworld (30 x 20) ---
  // Symbols:
  //   ~ water,  . grass,  F forest,  ^ mountain
  //   T town,   D dungeon, ! castle,  b sand
  //   @ player start
  const OVERWORLD_RAW = [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~..........^^^^^.............~',
    '~..FFFF....^^^^^.....FFFF....~',
    '~..FFFF....!..........FFF....~',
    '~..FF................FFF.....~',
    '~......T.....................~',
    '~............................~',
    '~..........FF................~',
    '~.....FF...FF................~',
    '~.....FF................T....~',
    '~.....FF.....................~',
    '~...............D............~',
    '~............................~',
    '~.....^^^^^..................~',
    '~......^^^.....T.............~',
    '~..@.........................~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~bb...FFFF.................~~',
    '~~bb.............D..........~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ];

  const RAW_TO_TILE = {
    '~': T.WATER, '.': T.GRASS, 'F': T.FOREST, '^': T.MOUNTAIN,
    'T': T.TOWN, 'D': T.DUNGEON, '!': T.CASTLE, '@': T.GRASS,
    'b': T.SAND,
  };

  const WALKABLE = {
    [T.GRASS]: true, [T.FOREST]: true, [T.SAND]: true,
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
  const RINGS = [
    { id: 'ring_vigor', name: 'ring of vigor',    cost: 250, hp: 8 },
    { id: 'ring_might', name: 'ring of might',    cost: 500, atk: 2 },
    { id: 'ring_ember', name: 'ring of embers',   cost: 600, resist: 'fire' },
    { id: 'ring_frost', name: 'ring of frost',    cost: 600, resist: 'ice' },
  ];
  const AMULETS = [
    { id: 'amulet_focus', name: 'amulet of focus',  cost: 300, mp: 6 },
    { id: 'amulet_ward',  name: 'amulet of warding',cost: 600, def: 2 },
    { id: 'amulet_regen', name: 'amulet of regen',  cost: 900, regen: 1 },
  ];
  const POTIONS = [
    { id: 'minor',  name: 'minor potion',   heal: 18,  cost: 30 },
    { id: 'normal', name: 'healing potion', heal: 45,  cost: 100 },
    { id: 'elixir', name: 'elixir',         heal: 999, cost: 450 },
    { id: 'ether',  name: 'ether',          mp: 20,    cost: 150 },
  ];

  // --- Spells ---
  const SPELLS = [
    { id: 'spark',     name: 'spark',     mp: 3,  cost: 100,  desc: 'small magic bolt',           dmg: [6, 12],  element: 'arcane' },
    { id: 'fireball',  name: 'fireball',  mp: 8,  cost: 350,  desc: 'searing fire',                dmg: [14, 22], element: 'fire'   },
    { id: 'ice_lance', name: 'ice lance', mp: 7,  cost: 350,  desc: 'piercing ice',                dmg: [12, 20], element: 'ice'    },
    { id: 'thunder',   name: 'thunder',   mp: 12, cost: 700,  desc: 'lightning bolt, ignores def', dmg: [18, 30], element: 'shock'  },
    { id: 'heal',      name: 'heal',      mp: 6,  cost: 250,  desc: 'mends wounds',                hp:  [20, 35] },
    { id: 'shield',    name: 'shield',    mp: 5,  cost: 400,  desc: 'doubled defense for 3 turns', buff: 'shield', dur: 3 },
    { id: 'slumber',   name: 'slumber',   mp: 9,  cost: 550,  desc: 'sleeps one foe',              status: 'sleep', dur: 3 },
    { id: 'flee',      name: 'flee',      mp: 10, cost: 600,  desc: 'always escape combat',        flee: true },
  ];

  // --- Monsters ---
  // weak: element this monster is weak to (1.5× damage)
  // resist: element this monster resists (0.5× damage)
  // status: when it hits the player, may inflict this
  const MONSTERS = [
    { id: 'slime',    name: 'slime',     hp:  8, atk:  3, def: 0, xp:  5,  gold:   4, color: '#86efac', shape: 'blob' },
    { id: 'rat',      name: 'giant rat', hp: 12, atk:  4, def: 1, xp:  8,  gold:   6, color: '#a8a29e', shape: 'critter' },
    { id: 'goblin',   name: 'goblin',    hp: 18, atk:  6, def: 2, xp: 14,  gold:  14, color: '#f472b6', shape: 'goblin' },
    { id: 'snake',    name: 'serpent',   hp: 16, atk:  6, def: 1, xp: 16,  gold:  12, color: '#65a30d', shape: 'critter', status: 'poison' },
    { id: 'skeleton', name: 'skeleton',  hp: 24, atk:  8, def: 3, xp: 22,  gold:  18, color: '#e2e8f0', shape: 'undead', resist: 'ice' },
    { id: 'orc',      name: 'orc',       hp: 38, atk: 11, def: 4, xp: 38,  gold:  32, color: '#84cc16', shape: 'orc' },
    { id: 'fire_imp', name: 'fire imp',  hp: 28, atk:  9, def: 3, xp: 36,  gold:  30, color: '#f97316', shape: 'imp', resist: 'fire', weak: 'ice' },
    { id: 'wraith',   name: 'wraith',    hp: 50, atk: 14, def: 5, xp: 65,  gold:  55, color: '#c084fc', shape: 'wraith', resist: 'arcane', status: 'sleep' },
    { id: 'ice_troll',name: 'ice troll', hp: 80, atk: 17, def: 7, xp: 100, gold:  85, color: '#7dd3fc', shape: 'troll', resist: 'ice', weak: 'fire' },
    { id: 'troll',    name: 'troll',     hp: 75, atk: 18, def: 7, xp: 110, gold:  90, color: '#65a30d', shape: 'troll' },
    { id: 'shockling',name: 'shockling', hp: 42, atk: 13, def: 4, xp: 70,  gold:  60, color: '#fde047', shape: 'imp', resist: 'shock', status: 'paralyze' },
    { id: 'dragon',   name: 'red dragon', hp: 130, atk: 25, def: 9, xp: 220, gold: 200, color: '#ef4444', shape: 'dragon', resist: 'fire', weak: 'ice' },
    { id: 'shadow_wraith', name: 'shadow wraith', hp: 18, atk: 9, def: 3, xp: 22, gold: 12, color: '#312e81', shape: 'wraith', weak: 'fire' },
  ];
  const BOSS = {
    id: 'warlord', name: 'the Iron Warlord',
    hp: 240, atk: 32, def: 11, xp: 800, gold: 1500,
    color: '#fb923c', shape: 'warlord', boss: true,
  };
  const ISLAND_BOSS = {
    id: 'wyrm', name: 'the Drowned Wyrm',
    hp: 320, atk: 36, def: 12, xp: 1200, gold: 2200,
    color: '#22d3ee', shape: 'dragon', boss: true, resist: 'ice',
  };

  const OVERWORLD_ENCOUNTERS = ['slime', 'rat', 'goblin', 'snake'];
  const DUNGEON1_ENCOUNTERS = [
    ['slime', 'rat', 'goblin'],
    ['goblin', 'snake', 'skeleton', 'orc'],
    ['orc', 'fire_imp', 'wraith', 'troll'],
  ];
  const DUNGEON2_ENCOUNTERS = [
    ['skeleton', 'fire_imp', 'wraith'],
    ['orc', 'wraith', 'shockling', 'ice_troll'],
    ['ice_troll', 'troll', 'shockling', 'dragon'],
    ['dragon', 'ice_troll', 'shockling'],
  ];

  // --- Towns ---
  // Mysterious Stranger hint pool — one is picked fresh on each visit.
  const HINTS_POOL = [
    '"Fire imps drink flame. Ice cuts them deep, traveller."',
    '"In the casino, three matched dice pay eight times your stake."',
    '"The southern dungeon runs three floors before the Warlord stirs."',
    '"The island below holds a fourth-floor terror — pack potions."',
    '"A skiff costs three hundred gold at this very port."',
    '"Rain damps fire magic but sharpens ice."',
  ];

  const TOWNS = [
    {
      x: 7, y: 5, name: 'Brindale',
      blurb: 'A quiet hamlet on the western plains.',
      shop:   { weapons: ['dagger', 'short_sword'], armors: ['leather', 'chain'], potions: ['minor', 'normal'], rings: [], amulets: [] },
      innCost: 8,
      hasCasino: true,
      npcs: [
        {
          name: 'Old Fisherman',
          lines: (p) => p.hasBoat
            ? [
                '"So ye bought a skiff, eh? Brave fool."',
                '"The water past Seabridge is calm enough,"',
                '"but the wyrm in the southern shoals... it dreams."',
              ]
            : [
                '"Wind\'s up. The port at Seabridge will be busy."',
                '"If ye plan to sail, a boat costs gold — same as anything."',
                '"They say there\'s an island south, with darker waters yet."',
              ],
        },
        {
          name: 'Wandering Merchant',
          lines: (p) => p.gold < 50
            ? [
                '"Light pockets, friend? Stay out of the casino."',
                '"I\'ve seen knights leave there in their underclothes."',
                '"Save your coin for steel."',
              ]
            : [
                '"Brindale\'s casino takes three dice, no more."',
                '"Triples pay eight times the stake. Doubles half again."',
                '"Sums above eleven, a touch over your bet — at least."',
              ],
        },
      ],
    },
    {
      x: 24, y: 9, name: 'Hightower',
      blurb: 'Bustling market town. A pale spire rises beyond the inn.',
      shop:   { weapons: ['short_sword', 'long_sword', 'battle_axe'], armors: ['chain', 'plate'], potions: ['normal', 'elixir', 'ether'], rings: ['ring_vigor', 'ring_might'], amulets: ['amulet_focus', 'amulet_ward'] },
      innCost: 25,
      hasMage: true,
      npcs: [
        {
          name: 'Temple Priest',
          lines: (p) => p.poisoned > 0
            ? [
                '"You stink of venom, traveller. Sit, sit."',
                '"Thirty gold pays for the cleansing herbs."',
                '"Press [C] when you are ready."',
              ]
            : [
                '"Light keep you on the road, friend."',
                '"The pale spire watches both castle and coast."',
                '"Return if any rot takes hold."',
              ],
        },
        {
          name: 'Guard Captain',
          lines: (p) => p.warlordDead
            ? [
                '"You felled the Warlord! The barracks drink your name."',
                '"Now look south — sailors speak of a wyrm under the shoals."',
                '"The seneschal will give you a second charge."',
              ]
            : [
                '"You think to brave the dungeon? Heed me."',
                '"Steel before potions. Potions before pride."',
                '"And never sleep in a corridor."',
              ],
        },
      ],
    },
    {
      x: 15, y: 14, name: 'Seabridge',
      blurb: 'A fishing port. Tide ropes creak in the wind.',
      shop:   { weapons: ['long_sword'], armors: ['plate'], potions: ['normal', 'elixir'], rings: ['ring_ember', 'ring_frost'], amulets: ['amulet_regen'] },
      innCost: 18,
      hasPort: true,
      npcs: [
        {
          name: 'Harbour Master',
          lines: (p) => p.hasBoat
            ? [
                '"Your skiff is fine work. Treat her well."',
                '"South past the gap, the water turns black."',
                '"Old tales speak of a wyrm. Older sailors don\'t come back."',
              ]
            : [
                '"Need a boat? The dock keeper sells one for three hundred gold."',
                '"Pick the harbour from the town menu when you have coin."',
                '"You\'ll want one — the island won\'t come to you."',
              ],
        },
        {
          name: 'Mysterious Stranger',
          lines: (p) => [
            '"Lean close, traveller. A tip for the road:"',
            '',
            pick(HINTS_POOL),
          ],
        },
      ],
    },
  ];
  const TOWN_BY_POS = {};
  for (const t of TOWNS) TOWN_BY_POS[`${t.x},${t.y}`] = t;

  const DUNGEONS = [
    { x: 16, y: 11, id: 1, floors: 3 },   // Mainland dungeon (warlord on floor 3)
    { x: 17, y: 18, id: 2, floors: 4 },   // Island dungeon (drowned wyrm on floor 4)
  ];
  const DUNGEON_BY_POS = {};
  for (const d of DUNGEONS) DUNGEON_BY_POS[`${d.x},${d.y}`] = d;

  const CASTLE_LINES = [
    'You stand before the gates of the High Keep.',
    'The seneschal motions you to the throne chamber.',
    '',
    '"Brave one — the Iron Warlord has risen beneath',
    'the southern hills. Find him. End him."',
    '',
    'A purse of 80 gold is pressed into your hand.',
  ];
  const CASTLE_LINES_2 = [
    'The King rises. "Word reaches us from the coast.',
    'A drowned wyrm coils beneath the island shoals.',
    'Take a boat at Seabridge. End the beast."',
    '',
    'A further 200 gold is yours.',
  ];

  // Quests are evaluated lazily against the current `player` object so the same
  // QUESTS table works across newGame() and loadGame() without rebinding.
  const QUESTS = [
    {
      id: 'q1',
      name: 'Defeat the Iron Warlord',
      desc: 'The king has asked you to clear Dungeon 1, Floor 3.',
      accepted: () => !!(player && player.questAccepted),
      done:     () => !!(player && player.warlordDead),
    },
    {
      id: 'q2',
      name: 'Slay the Drowned Wyrm',
      desc: 'Venture to the island dungeon and destroy the Wyrm on Floor 4.',
      accepted: () => !!(player && player.questAccepted2),
      done:     () => !!(player && player.wyrmDead),
    },
  ];

  // --- State ---
  const SAVE_KEY = 'realmquest-save';
  let mode = 'overworld';
  let modalState = null;
  let world;
  let player;
  let dungeon = null;
  let combat = null;
  let messages = [];
  let effects = [];      // visual combat effects [{kind, x, y, t, ...}]
  let casinoState = null;
  let skillPending = false;
  // Day/night cycle. worldTime is minutes 0-1439 (24h). Ticks +1 every 30 frames
  // regardless of mode, so a full day takes ~12 real minutes at 60fps.
  let worldTime = 360;       // 6:00 AM at game start
  let timeFrameAcc = 0;
  let lastPhase = null;

  // --- Day/night helpers ---
  function getDaytimePhase() {
    const t = worldTime;
    if (t >= 300 && t < 420)  return 'dawn';
    if (t >= 420 && t < 1080) return 'day';
    if (t >= 1080 && t < 1200) return 'dusk';
    return 'night'; // 1200..1439 and 0..299
  }
  function phaseEncounterMultiplier(phase) {
    if (phase === 'day') return 1.0;
    if (phase === 'night') return 1.8;
    return 1.3; // dawn or dusk
  }
  function formatClock(minutes) {
    const h24 = Math.floor(minutes / 60);
    const m   = minutes % 60;
    const h12 = ((h24 + 11) % 12) + 1;
    const ampm = h24 < 12 ? 'AM' : 'PM';
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  function phaseEmoji(phase) {
    return (phase === 'night' || phase === 'dusk') ? '🌙' : '☀';
  }
  function syncNightEncounters(phase) {
    const id = 'shadow_wraith';
    const idx = OVERWORLD_ENCOUNTERS.indexOf(id);
    if (phase === 'night' && idx < 0) OVERWORLD_ENCOUNTERS.push(id);
    else if (phase !== 'night' && idx >= 0) OVERWORLD_ENCOUNTERS.splice(idx, 1);
  }
  function tickWorldTime() {
    timeFrameAcc += 1;
    if (timeFrameAcc >= 30) {
      timeFrameAcc = 0;
      worldTime = (worldTime + 1) % 1440;
      const phase = getDaytimePhase();
      if (phase !== lastPhase) {
        lastPhase = phase;
        syncNightEncounters(phase);
      }
    }
  }

  // --- Weather ---
  // type: 'clear' | 'rain' | 'fog' | 'storm'. timer counts frames until the next roll.
  // particles are NOT persisted across save/load; rebuilt empty on load.
  let weather = { type: 'clear', timer: 1200, particles: [], lightning: 0, flashAcc: 0 };

  function pickNewWeather() {
    const r = Math.random();
    weather.type = r < 0.50 ? 'clear'
      : r < 0.75 ? 'rain'
      : r < 0.90 ? 'fog'
      : 'storm';
    weather.timer = 600 + Math.floor(Math.random() * 1201); // 600..1800 frames
    if (weather.type !== 'storm') { weather.lightning = 0; weather.flashAcc = 0; }
  }
  function weatherEmoji(type) {
    if (type === 'rain')  return '🌧';
    if (type === 'fog')   return '🌫';
    if (type === 'storm') return '⛈';
    return '☀';
  }
  function weatherDodgeBonus() { return weather.type === 'fog' ? 0.10 : 0; }
  function weatherMonsterPhysMult() { return weather.type === 'storm' ? 1.10 : 1.0; }
  function weatherSpellMult(element) {
    let m = 1.0;
    if (weather.type === 'storm') m *= 0.80;
    if (weather.type === 'rain') {
      if (element === 'fire') m *= 0.70;
      else if (element === 'ice') m *= 1.15;
    }
    return m;
  }
  function tickWeather() {
    weather.timer -= 1;
    if (weather.timer <= 0) pickNewWeather();

    // Storm lightning flash bookkeeping
    if (weather.type === 'storm') {
      weather.flashAcc += 1;
      if (weather.flashAcc >= 180) {
        weather.lightning = 6;
        weather.flashAcc = 0;
      }
    }
    if (weather.lightning > 0) weather.lightning -= 1;

    // Spawn particles based on type
    if (weather.type === 'rain') {
      for (let i = 0; i < 40; i++) {
        weather.particles.push({ x: Math.random() * VW, y: 0, dx: 1, dy: 8 + Math.random() * 4 });
      }
    } else if (weather.type === 'storm') {
      for (let i = 0; i < 80; i++) {
        weather.particles.push({ x: Math.random() * VW, y: 0, dx: 3, dy: 11 + Math.random() * 5 });
      }
    }
    // Move and cull (clear/fog let existing particles fade off naturally)
    for (const p of weather.particles) {
      p.x += p.dx;
      p.y += p.dy;
    }
    weather.particles = weather.particles.filter(p => p.y < VH + 6 && p.x < VW + 10);
  }

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
  function renderQuestLog() {
    if (!questLogEl) return;
    const rows = QUESTS.map(q => {
      const acc = q.accepted();
      const dn = q.done();
      const cls = dn ? 'done' : (acc ? 'active' : 'locked');
      return `<div class="q ${cls}">
        <div class="name">${escapeHtml(q.name)}</div>
        <div class="desc">${escapeHtml(q.desc)}</div>
      </div>`;
    });
    questLogEl.innerHTML = `<h3>Quest Log</h3>${rows.join('')}`;
  }
  function toggleQuestLog(forceShow) {
    if (!questLogEl) return;
    const showing = questLogEl.style.display === 'block';
    const target = typeof forceShow === 'boolean' ? forceShow : !showing;
    questLogEl.style.display = target ? 'block' : 'none';
    if (target) renderQuestLog();
  }

  // --- Item helpers ---
  function findItem(category, id) {
    const src = category === 'weapon' ? WEAPONS
      : category === 'armor' ? ARMORS
      : category === 'ring' ? RINGS
      : category === 'amulet' ? AMULETS
      : POTIONS;
    return src.find(x => x.id === id);
  }
  function makeItem(category, id) {
    const def = findItem(category, id);
    if (!def) return null;
    return { ...def, category };
  }
  function findPotion(id) { return player.potions.find(p => p.id === id); }
  function addPotion(id, n = 1) {
    const ex = findPotion(id);
    if (ex) ex.count += n;
    else player.potions.push({ ...makeItem('potion', id), count: n });
  }
  function consumePotion(p) {
    p.count -= 1;
    if (p.count <= 0) player.potions = player.potions.filter(x => x !== p);
  }
  function hasSpell(id) { return player.spells.some(s => s.id === id); }
  function findSpell(id) { return SPELLS.find(s => s.id === id); }

  function totalAttack() {
    let a = player.atk + (player.weapon ? player.weapon.atk : 0);
    if (player.ring && player.ring.atk) a += player.ring.atk;
    return a;
  }
  function totalDefense() {
    let d = player.def + (player.armor ? player.armor.def : 0);
    if (player.amulet && player.amulet.def) d += player.amulet.def;
    if (player.shieldTurns > 0) d *= 2;
    return d;
  }
  function totalMaxHp() {
    let h = player.maxHp;
    if (player.ring && player.ring.hp) h += player.ring.hp;
    return h;
  }
  function totalMaxMp() {
    let m = player.maxMp;
    if (player.amulet && player.amulet.mp) m += player.amulet.mp;
    return m;
  }
  function elementResist(element) {
    return player.ring && player.ring.resist === element;
  }
  function regenPerTurn() {
    return (player.amulet && player.amulet.regen) || 0;
  }

  // --- Init / save / load ---
  function newGame() {
    world = OVERWORLD_RAW.map(row =>
      row.split('').map(ch => RAW_TO_TILE[ch] ?? T.GRASS)
    );
    let sx = 3, sy = 15;
    for (let y = 0; y < OVERWORLD_RAW.length; y++) {
      const i = OVERWORLD_RAW[y].indexOf('@');
      if (i >= 0) { sx = i; sy = y; break; }
    }
    player = {
      x: sx, y: sy,
      hp: 30, maxHp: 30,
      mp: 8,  maxMp: 8,
      atk: 4, def: 1,
      xp: 0, level: 1, nextLevelXp: 30,
      gold: 30,
      weapon: makeItem('weapon', 'club'),
      armor:  makeItem('armor',  'cloth'),
      ring:   null,
      amulet: null,
      potions: [{ ...makeItem('potion', 'minor'), count: 2 }],
      spells: [],
      questAccepted: false,
      questAccepted2: false,
      warlordDead: false,
      wyrmDead: false,
      hasBoat: false,
      poisoned: 0, sleeping: 0, paralyzed: 0,
      shieldTurns: 0,
    };
    mode = 'overworld';
    dungeon = null;
    combat = null;
    messages = [];
    effects = [];
    casinoState = null;
    skillPending = false;
    worldTime = 360;
    timeFrameAcc = 0;
    lastPhase = getDaytimePhase();
    syncNightEncounters(lastPhase);
    weather = { type: 'clear', timer: 1200, particles: [], lightning: 0, flashAcc: 0 };
    log('You step out at dawn. The kingdom waits.', 'good');
    hideModal();
    saveGame();
    render();
  }

  function saveGame() {
    try {
      const weatherSave = { type: weather.type, timer: weather.timer };
      const data = { mode, player, dungeon, world, worldTime, weather: weatherSave, version: 4 };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {}
  }
  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || (data.version !== 2 && data.version !== 3 && data.version !== 4)) return false;
      world = data.world;
      player = data.player;
      dungeon = data.dungeon;
      mode = data.mode === 'combat' ? 'overworld' : data.mode;
      combat = null;
      messages = [];
      effects = [];
      worldTime = typeof data.worldTime === 'number' ? data.worldTime : 360;
      timeFrameAcc = 0;
      lastPhase = getDaytimePhase();
      syncNightEncounters(lastPhase);
      const wt = (data.weather && typeof data.weather.type === 'string') ? data.weather.type : 'clear';
      const wi = (data.weather && typeof data.weather.timer === 'number') ? data.weather.timer : 1200;
      weather = { type: wt, timer: wi, particles: [], lightning: 0, flashAcc: 0 };
      log('Saved game restored.', 'good');
      hideModal();
      render();
      return true;
    } catch { return false; }
  }
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  // --- Leveling ---
  function gainXp(n) {
    player.xp += n;
    while (player.xp >= player.nextLevelXp) {
      player.level += 1;
      log(`You reach level ${player.level}!`, 'good');
      player.nextLevelXp = Math.floor(30 * Math.pow(1.7, player.level - 1));
      // Queue a skill choice — open after combat ends so we don't disrupt flow.
      skillPending = true;
    }
  }
  function offerSkillPoint() {
    showModal({
      title: `Level ${player.level} — choose a gain`,
      lines: ['Your training takes hold. Pick one boon:'],
      opts: [
        { key: '1', label: '+8 max HP (full heal)',  go: () => applyLevelUp('hp') },
        { key: '2', label: '+2 attack',              go: () => applyLevelUp('atk') },
        { key: '3', label: '+2 defense',             go: () => applyLevelUp('def') },
        { key: '4', label: '+6 max MP (full mp)',    go: () => applyLevelUp('mp') },
      ],
      hint: 'Press 1-4.',
    });
  }
  function applyLevelUp(kind) {
    if (kind === 'hp')  { player.maxHp += 8; player.hp = player.maxHp; }
    if (kind === 'atk') { player.atk += 2; }
    if (kind === 'def') { player.def += 2; }
    if (kind === 'mp')  { player.maxMp += 6; player.mp = player.maxMp; }
    log(`You feel stronger (${kind === 'hp' ? '+max HP' : kind === 'atk' ? '+atk' : kind === 'def' ? '+def' : '+max MP'}).`, 'good');
    skillPending = false;
    hideModal();
    saveGame();
    render();
  }

  // --- Movement ---
  function tryMoveOverworld(dx, dy) {
    const nx = player.x + dx, ny = player.y + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    const t = world[ny][nx];
    const walkable = WALKABLE[t] || (t === T.WATER && player.hasBoat);
    if (!walkable) {
      if (t === T.WATER) log("You'll need a boat to cross open water.");
      else if (t === T.MOUNTAIN) log('The cliffs are too sheer.');
      return;
    }
    player.x = nx; player.y = ny;

    if (t === T.TOWN) {
      const town = TOWN_BY_POS[`${nx},${ny}`];
      if (town) { saveGame(); enterTown(town); }
      return;
    }
    if (t === T.DUNGEON) {
      const dInfo = DUNGEON_BY_POS[`${nx},${ny}`];
      if (dInfo) { saveGame(); enterDungeon(dInfo); }
      return;
    }
    if (t === T.CASTLE) { saveGame(); visitCastle(); return; }

    // Regen from amulet
    const r = regenPerTurn();
    if (r > 0 && Math.random() < 0.5) {
      player.hp = Math.min(totalMaxHp(), player.hp + r);
    }

    // Random encounter (modified by time of day)
    let rate = 0;
    if (t === T.GRASS) rate = 0.04;
    else if (t === T.FOREST) rate = 0.13;
    else if (t === T.WATER) rate = 0.05;  // sea encounters
    else if (t === T.SAND) rate = 0.06;
    rate *= phaseEncounterMultiplier(getDaytimePhase());
    if (chance(rate)) {
      const pool = t === T.WATER ? ['shockling', 'snake'] : OVERWORLD_ENCOUNTERS;
      startEncounter(pool, t === T.WATER ? 'something stirs in the depths' : 'a wild creature leaps from cover');
    }
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
      saveGame();
      render();
      return;
    }
    if (t === DT.BOSS_TILE) {
      player.x = nx; player.y = ny;
      startBossFight(dungeon.bossKind);
      return;
    }
    player.x = nx; player.y = ny;

    // Mark seen for mini-map
    markSeen(nx, ny);

    // Regen
    const r = regenPerTurn();
    if (r > 0 && Math.random() < 0.5) {
      player.hp = Math.min(totalMaxHp(), player.hp + r);
    }

    const monsterAt = dungeon.monsters.find(m => m.x === nx && m.y === ny);
    if (monsterAt) {
      const encName = dungeon.id === 2 ? 'an island fiend lurches forth' : 'something blocks your way';
      startEncounter([monsterAt.id], encName);
      dungeon.monsters = dungeon.monsters.filter(m => m !== monsterAt);
    } else if (chance(0.08)) {
      const tables = dungeon.id === 1 ? DUNGEON1_ENCOUNTERS : DUNGEON2_ENCOUNTERS;
      const pool = tables[Math.min(tables.length - 1, dungeon.floor - 1)];
      startEncounter(pool, 'something lurches from the shadows');
    }
    render();
  }
  function markSeen(x, y) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < dungeon.w && ny >= 0 && ny < dungeon.h) {
          dungeon.seen[ny][nx] = true;
        }
      }
    }
  }

  // --- Dungeon generation ---
  const DT = { VOID: 0, WALL: 1, FLOOR: 2, STAIRS_UP: 3, STAIRS_DOWN: 4, CHEST: 5, EXIT: 6, BOSS_TILE: 7 };

  function enterDungeon(info) {
    player.owX = player.x;
    player.owY = player.y;
    dungeon = { info };
    log(`You descend into the dungeon.`);
    enterDungeonFloor(1, true);
  }
  function exitToOverworld() {
    mode = 'overworld';
    dungeon = null;
    if (player.owX !== undefined) {
      player.x = player.owX;
      player.y = player.owY;
    }
    saveGame();
  }

  function enterDungeonFloor(floor, fresh) {
    const info = dungeon.info || (dungeon && dungeon.info);
    const id = info.id;
    const maxFloors = info.floors;
    const w = 30, h = 18;
    const map = Array.from({ length: h }, () => Array(w).fill(DT.WALL));
    const seen = Array.from({ length: h }, () => Array(w).fill(false));
    const rooms = [];
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

    const isBossFloor = floor === maxFloors;
    const bossKind = id === 1 ? 'warlord' : 'wyrm';
    if (isBossFloor) {
      const bossDone = (bossKind === 'warlord' && player.warlordDead) ||
                       (bossKind === 'wyrm'    && player.wyrmDead);
      map[endRoom.cy][endRoom.cx] = bossDone ? DT.FLOOR : DT.BOSS_TILE;
    } else {
      map[endRoom.cy][endRoom.cx] = DT.STAIRS_DOWN;
    }

    player.x = startRoom.cx;
    player.y = startRoom.cy;

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
    const tables = id === 1 ? DUNGEON1_ENCOUNTERS : DUNGEON2_ENCOUNTERS;
    const pool = tables[Math.min(tables.length - 1, floor - 1)];
    const monsterCount = 2 + rnd(3);
    for (let i = 0; i < monsterCount; i++) {
      const r = pick(rooms);
      const mx = r.x + rnd(r.w);
      const my = r.y + rnd(r.h);
      if (map[my][mx] !== DT.FLOOR) continue;
      if (mx === player.x && my === player.y) continue;
      monstersOnFloor.push({ x: mx, y: my, id: pick(pool) });
    }

    dungeon = { info, map, seen, w, h, rooms, chests, monsters: monstersOnFloor, floor, bossKind };
    mode = 'dungeon';
    markSeen(player.x, player.y);
    saveGame();
    log(`Dungeon ${id} — floor ${floor}.`, 'info');
    render();
  }

  function openChest(chest) {
    const roll = Math.random();
    const floor = chest.floor;
    if (roll < 0.40) {
      const g = 20 + rnd(50) + floor * 15;
      player.gold += g;
      log(`The chest holds ${g} gold pieces.`, 'good');
    } else if (roll < 0.65) {
      const tier = Math.min(POTIONS.length - 1, rnd(POTIONS.length));
      addPotion(POTIONS[tier].id);
      log(`Inside: a ${POTIONS[tier].name}.`, 'good');
    } else if (roll < 0.80) {
      const idx = Math.min(WEAPONS.length - 1, 1 + floor + rnd(2));
      const w = WEAPONS[idx];
      if (!player.weapon || w.atk > player.weapon.atk) {
        log(`You find a ${w.name} and wield it.`, 'good');
        player.weapon = makeItem('weapon', w.id);
      } else {
        const g = w.cost / 2 | 0;
        player.gold += g;
        log(`A ${w.name} — you sell it for ${g} gold.`, 'good');
      }
    } else if (roll < 0.92) {
      const idx = Math.min(ARMORS.length - 1, 1 + floor + rnd(2));
      const a = ARMORS[idx];
      if (!player.armor || a.def > player.armor.def) {
        log(`You find ${a.name} and don it.`, 'good');
        player.armor = makeItem('armor', a.id);
      } else {
        const g = a.cost / 2 | 0;
        player.gold += g;
        log(`${a.name} — you sell it for ${g} gold.`, 'good');
      }
    } else {
      // Ring or amulet
      const list = Math.random() < 0.5 ? RINGS : AMULETS;
      const item = pick(list);
      const category = list === RINGS ? 'ring' : 'amulet';
      const slot = category === 'ring' ? 'ring' : 'amulet';
      if (!player[slot]) {
        player[slot] = makeItem(category, item.id);
        log(`You find ${item.name} and wear it.`, 'good');
      } else {
        const g = item.cost / 2 | 0;
        player.gold += g;
        log(`${item.name} — you sell it for ${g} gold.`, 'good');
      }
    }
  }

  // --- Combat ---
  function startEncounter(pool, msg) {
    const count = 1 + rnd(3);
    const enemies = [];
    for (let i = 0; i < count; i++) {
      const tpl = MONSTERS.find(m => m.id === pick(pool));
      if (!tpl) continue;
      enemies.push({ ...tpl, currentHp: tpl.hp, maxHp: tpl.hp, status: {} });
      if (enemies.length === 1 && count > 1) {
        // After first, low chance to add more
        if (Math.random() < 0.55) continue;
        else break;
      }
    }
    if (enemies.length === 0) return;
    startCombat(enemies, msg, false);
  }
  function startBossFight(kind) {
    const tpl = kind === 'wyrm' ? ISLAND_BOSS : BOSS;
    const enemies = [{ ...tpl, currentHp: tpl.hp, maxHp: tpl.hp, status: {} }];
    startCombat(enemies, `From the shadows: ${tpl.name}.`, true);
  }
  function startCombat(enemies, msg, boss) {
    combat = {
      enemies, selected: 0,
      defending: false,
      turn: 'player',
      log: [msg],
      done: false,
      boss,
      anim: { kind: null, t: 0 },
      popups: [],
    };
    mode = 'combat';
    render();
  }
  function pushCombatLog(m) {
    combat.log.push(m);
    if (combat.log.length > 6) combat.log.shift();
  }
  function aliveEnemies() {
    return combat.enemies.filter(e => e.currentHp > 0);
  }
  function ensureValidTarget() {
    const alive = aliveEnemies();
    if (alive.length === 0) return false;
    if (!combat.enemies[combat.selected] || combat.enemies[combat.selected].currentHp <= 0) {
      combat.selected = combat.enemies.indexOf(alive[0]);
    }
    return true;
  }
  function cycleTarget(dir) {
    if (!combat) return;
    const idxs = combat.enemies.map((e, i) => e.currentHp > 0 ? i : -1).filter(i => i >= 0);
    if (idxs.length === 0) return;
    let cur = idxs.indexOf(combat.selected);
    if (cur === -1) cur = 0;
    cur = (cur + dir + idxs.length) % idxs.length;
    combat.selected = idxs[cur];
    render();
  }

  function playerAttack() {
    if (combat.done || combat.turn !== 'player') return;
    if (!ensureValidTarget()) return;
    combat.turn = 'monster';
    const target = combat.enemies[combat.selected];
    // Dodge / crit (fog grants +10% dodge to both sides)
    if (Math.random() < 0.06 + weatherDodgeBonus()) {
      pushCombatLog(`The ${target.name} dodges!`);
      flashTarget(target, '#94a3b8');
      monsterTurn();
      return;
    }
    let dmg = Math.max(1, totalAttack() - target.def + rnd(4) - 1);
    let crit = false;
    if (Math.random() < 0.08) { dmg = Math.floor(dmg * 2); crit = true; }
    target.currentHp -= dmg;
    pushCombatLog(`You hit the ${target.name} for ${dmg}${crit ? ' (crit!)' : ''}.`);
    flashTarget(target, '#ef4444');
    spawnPopup(target, `-${dmg}`, crit ? '#fbbf24' : '#fca5a5');
    if (target.currentHp <= 0) {
      pushCombatLog(`The ${target.name} falls.`);
      gainXp(target.xp);
      player.gold += target.gold;
    }
    if (aliveEnemies().length === 0) { victory(); return; }
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
  function playerSpellPrompt() {
    if (combat.done || combat.turn !== 'player') return;
    if (player.spells.length === 0) {
      pushCombatLog('You know no spells.');
      render();
      return;
    }
    const opts = player.spells.map((s, i) => ({
      key: String(i + 1), label: '', go: () => castSpell(s),
    }));
    const lines = player.spells.map((s, i) =>
      `${i + 1}) ${s.name}  (${s.mp} mp)  — ${s.desc}`
    );
    showModal({ title: 'Cast which spell?', lines: [`MP: ${player.mp}/${totalMaxMp()}`, ''].concat(lines), opts, hint: 'Number / ESC cancel.' });
  }
  function castSpell(s) {
    hideModal();
    if (player.mp < s.mp) { pushCombatLog('Not enough MP.'); render(); return; }
    player.mp -= s.mp;
    combat.turn = 'monster';
    if (s.flee) {
      pushCombatLog('You vanish in a curl of smoke!');
      combat.done = true;
      setTimeout(() => endCombat(false), 700);
      return;
    }
    if (s.hp) {
      const heal = range(s.hp[0], s.hp[1]);
      const before = player.hp;
      player.hp = Math.min(totalMaxHp(), player.hp + heal);
      pushCombatLog(`You feel restored. (+${player.hp - before} HP)`);
      spawnPopup({ side: 'player' }, `+${player.hp - before}`, '#86efac');
      monsterTurn();
      return;
    }
    if (s.buff === 'shield') {
      player.shieldTurns = s.dur;
      pushCombatLog('A shimmering ward surrounds you.');
      monsterTurn();
      return;
    }
    if (!ensureValidTarget()) { monsterTurn(); return; }
    const target = combat.enemies[combat.selected];
    if (s.status) {
      target.status[s.status] = (target.status[s.status] || 0) + s.dur;
      pushCombatLog(`The ${target.name} succumbs to ${s.status}.`);
      flashTarget(target, '#a78bfa');
      monsterTurn();
      return;
    }
    if (s.dmg) {
      let dmg = range(s.dmg[0], s.dmg[1]);
      const def = s.element === 'shock' ? 0 : target.def;
      dmg = Math.max(1, dmg - Math.floor(def / 2));
      if (target.weak === s.element) dmg = Math.floor(dmg * 1.5);
      if (target.resist === s.element) dmg = Math.max(1, Math.floor(dmg * 0.5));
      // Weather: storm dampens all spell dmg; rain shifts fire/ice
      dmg = Math.max(1, Math.round(dmg * weatherSpellMult(s.element)));
      target.currentHp -= dmg;
      pushCombatLog(`${s.name} hits the ${target.name} for ${dmg}.`);
      flashTarget(target, s.element === 'fire' ? '#f97316' : s.element === 'ice' ? '#5fd0ff' : s.element === 'shock' ? '#fde047' : '#a78bfa');
      spawnPopup(target, `-${dmg}`, '#fca5a5');
      if (target.currentHp <= 0) {
        pushCombatLog(`The ${target.name} is destroyed.`);
        gainXp(target.xp);
        player.gold += target.gold;
      }
      if (aliveEnemies().length === 0) { victory(); return; }
    }
    monsterTurn();
  }
  function playerRun() {
    if (combat.done || combat.turn !== 'player') return;
    combat.turn = 'monster';
    if (combat.boss) {
      pushCombatLog('Your foe blocks your escape!');
      monsterTurn();
      return;
    }
    if (Math.random() < 0.7) {
      pushCombatLog('You break away!');
      combat.done = true;
      setTimeout(() => endCombat(false), 600);
    } else {
      pushCombatLog('You cannot escape!');
      monsterTurn();
    }
  }
  function monsterTurn() {
    if (combat.done) return;
    setTimeout(() => {
      if (combat.done) return;
      const alive = aliveEnemies();
      for (const m of alive) {
        if (m.status.sleep > 0) { m.status.sleep -= 1; continue; }
        // Damage from poison status on monster?
        let raw = m.atk - (combat.defending ? Math.floor(totalDefense() * 1.6) : totalDefense()) + rnd(4) - 1;
        let dmg = Math.max(1, raw);
        if (Math.random() < 0.06 + weatherDodgeBonus()) { pushCombatLog(`You dodge the ${m.name}.`); continue; }
        if (Math.random() < 0.06) { dmg = Math.floor(dmg * 2); pushCombatLog(`The ${m.name} crits!`); }
        // Storm boosts monster physical damage by +10%
        dmg = Math.max(1, Math.round(dmg * weatherMonsterPhysMult()));
        // resistance via ring
        if (m.resist === 'fire' && elementResist('fire')) {/* no-op, monster resists, not us */}
        player.hp -= dmg;
        pushCombatLog(`The ${m.name} hits you for ${dmg}.`);
        spawnPopup({ side: 'player' }, `-${dmg}`, '#fca5a5');
        // Status from monster
        if (m.status && m.status.flag) { /* placeholder */ }
        if (m.status === undefined) m.status = {};
        // Look at monster template's status field via the original tpl, copied:
        const tpl = MONSTERS.find(x => x.id === m.id) || (combat.boss ? null : null);
        const inflict = (tpl && tpl.status) ? tpl.status : null;
        if (inflict && Math.random() < 0.30) {
          if (inflict === 'poison') {
            player.poisoned = Math.max(player.poisoned, 6);
            pushCombatLog('You are poisoned!');
          } else if (inflict === 'sleep') {
            player.sleeping = Math.max(player.sleeping, 2);
            pushCombatLog('You feel drowsy...');
          } else if (inflict === 'paralyze') {
            player.paralyzed = Math.max(player.paralyzed, 2);
            pushCombatLog('Numbness creeps over you.');
          }
        }
        if (player.hp <= 0) {
          player.hp = 0;
          pushCombatLog('You collapse...');
          combat.done = true;
          setTimeout(() => die(`slain by a ${m.name}`), 700);
          render();
          return;
        }
      }
      combat.defending = false;
      // Player status ticks
      if (player.poisoned > 0) {
        const pd = 2 + rnd(3);
        player.hp -= pd;
        player.poisoned -= 1;
        pushCombatLog(`Poison gnaws (-${pd} HP).`);
        spawnPopup({ side: 'player' }, `-${pd}`, '#86efac');
        if (player.hp <= 0) {
          player.hp = 0;
          combat.done = true;
          setTimeout(() => die('killed by poison'), 700);
          render();
          return;
        }
      }
      if (player.shieldTurns > 0) player.shieldTurns -= 1;
      // Skip player turn if asleep/paralyzed
      if (player.sleeping > 0) {
        pushCombatLog('You are asleep!');
        player.sleeping -= 1;
        setTimeout(() => { combat.turn = 'monster'; monsterTurn(); }, 350);
        render();
        return;
      }
      if (player.paralyzed > 0) {
        pushCombatLog('You cannot move!');
        player.paralyzed -= 1;
        setTimeout(() => { combat.turn = 'monster'; monsterTurn(); }, 350);
        render();
        return;
      }
      combat.turn = 'player';
      render();
    }, 400);
  }
  function flashTarget(target, color) {
    target.flash = { color, t: 0, max: 12 };
  }
  function spawnPopup(target, text, color) {
    combat.popups.push({ target, text, color, t: 0, max: 36 });
  }
  function victory() {
    combat.done = true;
    if (combat.boss) {
      const bossEnt = combat.enemies[0];
      if (bossEnt.id === 'warlord') player.warlordDead = true;
      if (bossEnt.id === 'wyrm') player.wyrmDead = true;
      renderQuestLog();
      pushCombatLog(`You have slain ${bossEnt.name}!`);
      setTimeout(() => {
        if (player.warlordDead && player.wyrmDead) winGame(true);
        else { endCombat(true); afterBossWin(bossEnt.id); }
      }, 1200);
    } else {
      pushCombatLog('You are victorious!');
      setTimeout(() => endCombat(true), 700);
    }
    render();
  }
  function afterBossWin(bossId) {
    if (bossId === 'warlord') {
      log('The Warlord has fallen. The mainland breathes.', 'good');
      // Return to floor 3 entry; clear boss tile
      if (dungeon) {
        const er = dungeon.rooms[dungeon.rooms.length - 1];
        if (er) dungeon.map[er.cy][er.cx] = DT.FLOOR;
      }
    } else if (bossId === 'wyrm') {
      log('The Wyrm sinks back into the depths. Forever.', 'good');
      if (dungeon) {
        const er = dungeon.rooms[dungeon.rooms.length - 1];
        if (er) dungeon.map[er.cy][er.cx] = DT.FLOOR;
      }
    }
    saveGame();
    if (skillPending) offerSkillPoint();
  }
  function endCombat(killed) {
    combat = null;
    mode = dungeon ? 'dungeon' : 'overworld';
    saveGame();
    if (skillPending && !combat) offerSkillPoint();
    render();
  }

  // --- Towns ---
  function enterTown(town) {
    const opts = [
      { key: '1', label: 'Shop', go: () => openShop(town) },
      { key: '2', label: `Inn (rest, ${town.innCost} gp)`, go: () => useInn(town) },
    ];
    let k = 3;
    if (town.hasMage) { opts.push({ key: String(k++), label: 'Mage Tower', go: () => openMageTower(town) }); }
    if (town.hasCasino) { opts.push({ key: String(k++), label: 'Casino — dice game', go: () => openCasino(town) }); }
    if (town.hasPort) { opts.push({ key: String(k++), label: player.hasBoat ? 'Harbour (boat moored)' : 'Harbour — buy boat (300 gp)', go: () => buyBoat(town) }); }
    if (town.npcs && town.npcs.length) {
      opts.push({ key: 't', label: '[T] Talk to people', go: () => openTalkMenu(town) });
    }
    opts.push({ key: String(k++), label: 'Leave', go: () => leaveTown() });
    showModal({
      title: town.name,
      lines: [town.blurb],
      opts,
      hint: 'Press 1-' + (k - 1) + (town.npcs && town.npcs.length ? ' / T' : '') + ' or click an option.',
    });
  }
  function openTalkMenu(town) {
    const opts = town.npcs.map((npc, i) => ({
      key: String(i + 1),
      label: npc.name,
      go: () => talkToNpc(npc, town),
    }));
    showModal({
      title: `${town.name} — who do you approach?`,
      lines: town.npcs.map((npc, i) => `${i + 1}) ${npc.name}`),
      opts,
      hint: 'Press a number.  ESC to go back.',
      backTo: () => enterTown(town),
    });
  }
  function talkToNpc(npc, town) {
    const lines = npc.lines(player);
    const opts = [];
    if (npc.name === 'Temple Priest' && player.poisoned > 0) {
      opts.push({
        key: 'c',
        label: '[C] Pay 30gp to cure poison',
        go: () => {
          if (player.gold < 30) {
            log('You can\'t spare thirty gold.', 'bad');
            talkToNpc(npc, town);
            return;
          }
          player.gold -= 30;
          player.poisoned = 0;
          log('The priest works the herbs into a poultice. The venom fades.', 'good');
          saveGame();
          talkToNpc(npc, town);
        },
      });
    }
    // Synthetic "leave" row — ESC dispatches via backTo, this just shows the hint.
    opts.push({ key: 'Esc', label: '[Esc] Leave', go: () => enterTown(town) });
    showModal({
      title: npc.name,
      lines,
      opts,
      hint: 'ESC to step back.',
      backTo: () => enterTown(town),
    });
  }
  function leaveTown() {
    hideModal();
    const ny = player.y + 1, nx = player.x;
    if (ny < ROWS && WALKABLE[world[ny][nx]] && world[ny][nx] !== T.TOWN && world[ny][nx] !== T.DUNGEON && world[ny][nx] !== T.CASTLE) {
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
    player.hp = totalMaxHp();
    player.mp = totalMaxMp();
    player.poisoned = 0; player.sleeping = 0; player.paralyzed = 0;
    log('Warm meal, soft bed. Fully restored.', 'good');
    saveGame();
    enterTown(town);
  }
  function buyBoat(town) {
    if (player.hasBoat) { enterTown(town); return; }
    if (player.gold < 300) { log("You can't afford a boat."); enterTown(town); return; }
    player.gold -= 300;
    player.hasBoat = true;
    log('You buy a small skiff. The sea is yours.', 'good');
    saveGame();
    enterTown(town);
  }
  function openShop(town) {
    const lines = [`Gold: ${player.gold}`, '', 'Weapons'];
    const opts = [];
    let k = 1;
    for (const id of town.shop.weapons) {
      const w = findItem('weapon', id);
      const owned = player.weapon && player.weapon.id === id;
      lines.push(`${k}) ${w.name}  +${w.atk} atk    ${owned ? '(wielded)' : w.cost + ' gp'}`);
      if (!owned && player.gold >= w.cost) opts.push({ key: String(k), label: '', go: () => buyEquip(town, 'weapon', id) });
      k++;
    }
    lines.push('', 'Armor');
    for (const id of town.shop.armors) {
      const a = findItem('armor', id);
      const owned = player.armor && player.armor.id === id;
      lines.push(`${k}) ${a.name}  +${a.def} def    ${owned ? '(worn)' : a.cost + ' gp'}`);
      if (!owned && player.gold >= a.cost) opts.push({ key: String(k), label: '', go: () => buyEquip(town, 'armor', id) });
      k++;
    }
    if (town.shop.rings && town.shop.rings.length) {
      lines.push('', 'Rings');
      for (const id of town.shop.rings) {
        const r = findItem('ring', id);
        const owned = player.ring && player.ring.id === id;
        const desc = r.atk ? `+${r.atk} atk` : r.hp ? `+${r.hp} HP` : r.resist ? `resist ${r.resist}` : '';
        lines.push(`${k}) ${r.name}  ${desc}    ${owned ? '(worn)' : r.cost + ' gp'}`);
        if (!owned && player.gold >= r.cost) opts.push({ key: String(k), label: '', go: () => buyEquip(town, 'ring', id) });
        k++;
      }
    }
    if (town.shop.amulets && town.shop.amulets.length) {
      lines.push('', 'Amulets');
      for (const id of town.shop.amulets) {
        const a = findItem('amulet', id);
        const owned = player.amulet && player.amulet.id === id;
        const desc = a.def ? `+${a.def} def` : a.mp ? `+${a.mp} MP` : a.regen ? `+${a.regen} HP/turn` : '';
        lines.push(`${k}) ${a.name}  ${desc}    ${owned ? '(worn)' : a.cost + ' gp'}`);
        if (!owned && player.gold >= a.cost) opts.push({ key: String(k), label: '', go: () => buyEquip(town, 'amulet', id) });
        k++;
      }
    }
    lines.push('', 'Potions');
    for (const id of town.shop.potions) {
      const p = findItem('potion', id);
      const desc = p.mp ? `+${p.mp} MP` : `+${p.heal === 999 ? 'full' : p.heal} HP`;
      lines.push(`${k}) ${p.name}  ${desc}    ${p.cost} gp`);
      if (player.gold >= p.cost) opts.push({ key: String(k), label: '', go: () => buyPotion(town, id) });
      k++;
    }
    showModal({
      title: `${town.name} — Shop`,
      lines, opts,
      hint: 'Number to buy.  ESC to back.',
      backTo: () => enterTown(town),
    });
  }
  function buyEquip(town, slot, id) {
    const def = findItem(slot, id);
    player.gold -= def.cost;
    player[slot] = makeItem(slot, id);
    log(`You buy and equip the ${def.name}.`, 'good');
    saveGame();
    openShop(town);
  }
  function buyPotion(town, id) {
    const p = findItem('potion', id);
    player.gold -= p.cost;
    if (p.mp) {
      // Treat ether as a potion-like item; for simplicity, restore MP immediately on use
      addPotion(id, 1);
    } else {
      addPotion(id, 1);
    }
    log(`You buy a ${p.name}.`, 'good');
    saveGame();
    openShop(town);
  }
  function openMageTower(town) {
    const lines = [
      'A tall spire smells of ink and ozone.',
      `Gold: ${player.gold}    MP: ${player.mp}/${totalMaxMp()}`,
      '',
      'Tomes available:',
    ];
    const opts = [];
    let k = 1;
    for (const s of SPELLS) {
      const known = hasSpell(s.id);
      lines.push(`${k}) ${s.name}  (${s.mp} mp) — ${s.desc}    ${known ? '(known)' : s.cost + ' gp'}`);
      if (!known && player.gold >= s.cost) opts.push({ key: String(k), label: '', go: () => buySpell(town, s.id) });
      k++;
    }
    showModal({
      title: `${town.name} — Mage Tower`,
      lines, opts,
      hint: 'Number to learn.  ESC to back.',
      backTo: () => enterTown(town),
    });
  }
  function buySpell(town, id) {
    const s = findSpell(id);
    player.gold -= s.cost;
    player.spells.push({ ...s });
    log(`You commit ${s.name} to memory.`, 'good');
    saveGame();
    openMageTower(town);
  }

  // --- Casino ---
  function openCasino(town) {
    casinoState = { lastRolls: null, lastBet: 0, lastResult: null, lastWin: 0 };
    showCasinoMenu(town);
  }
  function showCasinoMenu(town) {
    const lines = [
      'Three dice. Place a bet, then watch the throw.',
      `Gold: ${player.gold}`,
      '',
      'Payouts:',
      '  Triple (3 of a kind): 8×',
      '  Double:               1.5×',
      '  Sum 11-12:            1.2×',
      '  Otherwise:            you lose your stake',
      '',
    ];
    if (casinoState.lastRolls) {
      lines.push(`Last throw: ${casinoState.lastRolls.join(' ')}  —  ${casinoState.lastResult}  (${casinoState.lastWin >= 0 ? '+' : ''}${casinoState.lastWin} gp)`);
      lines.push('');
    }
    const opts = [
      { key: '1', label: 'Bet 10 gp',  go: () => rollDice(town, 10) },
      { key: '2', label: 'Bet 50 gp',  go: () => rollDice(town, 50) },
      { key: '3', label: 'Bet 100 gp', go: () => rollDice(town, 100) },
      { key: '4', label: 'Leave the casino', go: () => enterTown(town) },
    ];
    showModal({
      title: `${town.name} — Casino`,
      lines, opts,
      hint: 'Press 1-4.',
      backTo: () => enterTown(town),
    });
  }
  function rollDice(town, bet) {
    if (player.gold < bet) { log("You can't afford that bet."); showCasinoMenu(town); return; }
    player.gold -= bet;
    const d = [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)];
    const sum = d[0] + d[1] + d[2];
    const uniq = new Set(d).size;
    let mul = 0;
    let label = 'Bust';
    if (uniq === 1) { mul = 8; label = 'TRIPLE!'; }
    else if (uniq === 2) { mul = 1.5; label = 'Double'; }
    else if (sum >= 11) { mul = 1.2; label = 'High roll'; }
    const win = Math.floor(bet * mul);
    player.gold += win;
    casinoState.lastRolls = d;
    casinoState.lastBet = bet;
    casinoState.lastResult = label;
    casinoState.lastWin = win - bet;
    saveGame();
    showCasinoMenu(town);
  }

  // --- Castle ---
  function visitCastle() {
    const lines = !player.questAccepted ? CASTLE_LINES.slice()
      : (player.warlordDead && !player.questAccepted2) ? CASTLE_LINES_2.slice()
      : player.warlordDead && player.wyrmDead ? ['"You are a legend in this hall."']
      : ['"The Warlord still draws breath."'];
    const opts = [];
    if (!player.questAccepted) {
      opts.push({ key: '1', label: 'Accept the quest', go: () => acceptQuest() });
    } else if (player.warlordDead && !player.questAccepted2) {
      opts.push({ key: '1', label: 'Accept the second charge', go: () => acceptQuest2() });
    }
    opts.push({ key: String(opts.length + 1), label: 'Leave', go: () => leaveCastle() });
    showModal({ title: 'The High Keep', lines, opts, hint: 'Press 1-2.' });
  }
  function acceptQuest() {
    player.questAccepted = true;
    player.gold += 80;
    log('Seneschal hands you 80 gold. The quest is yours.', 'good');
    saveGame();
    renderQuestLog();
    leaveCastle();
  }
  function acceptQuest2() {
    player.questAccepted2 = true;
    player.gold += 200;
    log('200 gold and the King\'s blessing.', 'good');
    saveGame();
    renderQuestLog();
    leaveCastle();
  }
  function leaveCastle() {
    hideModal();
    const ny = player.y + 1;
    if (ny < ROWS && WALKABLE[world[ny][player.x]] && world[ny][player.x] !== T.CASTLE) {
      player.y = ny;
    }
    render();
  }

  // --- Inventory ---
  function showInventory() {
    const lines = [
      `HP: ${player.hp}/${totalMaxHp()}    MP: ${player.mp}/${totalMaxMp()}    Gold: ${player.gold}`,
      `Atk: ${totalAttack()}    Def: ${totalDefense()}`,
      `Level ${player.level} — XP ${player.xp}/${player.nextLevelXp}`,
      '',
      `Wielded: ${player.weapon ? player.weapon.name : '(nothing)'}`,
      `Worn:    ${player.armor  ? player.armor.name  : '(nothing)'}`,
      `Ring:    ${player.ring   ? player.ring.name   : '(none)'}`,
      `Amulet:  ${player.amulet ? player.amulet.name : '(none)'}`,
      '',
      'Spells:',
      ...(player.spells.length
        ? player.spells.map(s => `  ${s.name} (${s.mp} mp)`)
        : ['  (none)']),
      '',
      'Potions:',
      ...(player.potions.length
        ? player.potions.map((p, i) => `${i + 1}) ${p.name} (${p.mp ? `+${p.mp} MP` : `+${p.heal === 999 ? 'full' : p.heal} HP`})  ×${p.count}`)
        : ['  (none)']),
      '',
      'Quest:',
      ...(player.questAccepted ? [player.warlordDead ? '  Warlord — slain' : '  Slay the Iron Warlord (dungeon)'] : ['  (no active quest)']),
      ...(player.questAccepted2 ? [player.wyrmDead ? '  Wyrm — slain' : '  Slay the Drowned Wyrm (island)'] : []),
    ];
    const opts = player.potions.map((p, i) => ({
      key: String(i + 1), label: '', go: () => quaff(p),
    }));
    showModal({ title: 'Inventory', lines, opts, hint: 'Number to use potion. ESC close.' });
  }
  function quaff(p) {
    const before = player.hp;
    const beforeMp = player.mp;
    if (p.mp) {
      player.mp = Math.min(totalMaxMp(), player.mp + p.mp);
      log(`You drink the ${p.name}. (+${player.mp - beforeMp} MP)`, 'good');
    } else {
      player.hp = Math.min(totalMaxHp(), player.hp + p.heal);
      log(`You drink the ${p.name}. (+${player.hp - before} HP)`, 'good');
    }
    consumePotion(p);
    hideModal();
    saveGame();
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
      `${i + 1}) ${p.name} (${p.mp ? `+${p.mp} MP` : `+${p.heal === 999 ? 'full' : p.heal} HP`})  ×${p.count}`
    );
    showModal({ title: 'Quaff which?', lines, opts, hint: 'Number  / ESC cancel.' });
  }
  function quaffInCombat(p) {
    const before = player.hp, beforeMp = player.mp;
    if (p.mp) {
      player.mp = Math.min(totalMaxMp(), player.mp + p.mp);
      pushCombatLog(`You drink the ${p.name}. (+${player.mp - beforeMp} MP)`);
    } else {
      player.hp = Math.min(totalMaxHp(), player.hp + p.heal);
      pushCombatLog(`You drink the ${p.name}. (+${player.hp - before} HP)`);
    }
    consumePotion(p);
    hideModal();
    combat.turn = 'monster';
    monsterTurn();
  }

  // --- Death / win ---
  function die(cause) {
    if (mode === 'gameover') return;
    mode = 'gameover';
    log(`You die. (${cause})`, 'bad');
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    showModal({
      title: 'You have died',
      lines: [
        cause, '',
        `Final level: ${player.level}`,
        `XP: ${player.xp}    Gold: ${player.gold}`,
      ],
      opts: [
        { key: '1', label: 'New game', go: () => newGame() },
      ],
      hint: 'Press 1 to start over.',
    });
  }
  function winGame() {
    mode = 'win';
    log('Both threats are gone. The realm is at peace.', 'good');
    saveScore();
    const scores = getScores();
    const lines = [
      'You return to the High Keep crowned with twin victories.',
      '',
      `Level: ${player.level}    Gold: ${player.gold}`,
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
    return player.gold + player.xp * 3
      + (player.warlordDead ? 2000 : 0)
      + (player.wyrmDead ? 3000 : 0)
      + player.level * 50;
  }
  function getScores() {
    try { return JSON.parse(localStorage.getItem('realmquest-hs') || '[]'); }
    catch { return []; }
  }
  function saveScore() {
    const list = getScores();
    list.push({ score: score(), level: player.level, gold: player.gold,
      won: player.warlordDead && player.wyrmDead, date: Date.now() });
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
    const stat = [];
    stat.push(`HP <b>${player.hp}/${totalMaxHp()}</b>`);
    stat.push(`MP <b>${player.mp}/${totalMaxMp()}</b>`);
    stat.push(`Lv <b>${player.level}</b>`);
    stat.push(`Atk <b>${totalAttack()}</b>`);
    stat.push(`Def <b>${totalDefense()}</b>`);
    stat.push(`$ <b>${player.gold}</b>`);
    if (mode === 'dungeon' && dungeon) stat.push(`Floor <b>${dungeon.floor}</b>`);
    else stat.push('Overworld');
    if (player.poisoned > 0) stat.push('<b style="color:#86efac">Poisoned</b>');
    if (player.sleeping > 0) stat.push('<b style="color:#a78bfa">Asleep</b>');
    if (player.paralyzed > 0) stat.push('<b style="color:#fde047">Paralyzed</b>');
    if (player.shieldTurns > 0) stat.push('<b style="color:#5fd0ff">Shield</b>');
    const phase = getDaytimePhase();
    stat.push(`${phaseEmoji(phase)} ${formatClock(worldTime)}`);
    stat.push(weatherEmoji(weather.type));
    statsEl.innerHTML = stat.map(s => `<span>${s}</span>`).join('');
  }
  let frameCounter = 0;

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
    } else if (t === T.SAND) {
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#d4a44a';
      ctx.fillRect(sx + 4, sy + 6, 3, 2);
      ctx.fillRect(sx + 14, sy + 14, 3, 2);
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

  function renderOverworld() {
    frameCounter += 1;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        drawTerrainTile(world[y][x], x * TILE, y * TILE, frameCounter);
      }
    }
    const phase = getDaytimePhase();
    let overlay = null;
    if      (phase === 'dawn')  overlay = 'rgba(255,160,80,0.18)';
    else if (phase === 'dusk')  overlay = 'rgba(200,80,20,0.22)';
    else if (phase === 'night') overlay = 'rgba(10,10,60,0.55)';
    if (overlay) {
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, VW, VH);
    }
    // Weather particles (rain/storm), drawn after tiles + day/night, before fog and player
    if (weather.particles.length) {
      ctx.fillStyle = 'rgba(200,220,255,0.55)';
      for (const p of weather.particles) ctx.fillRect(p.x, p.y, 1, 6);
    }
    // Fog overlay
    if (weather.type === 'fog') {
      ctx.fillStyle = 'rgba(180,190,200,0.28)';
      ctx.fillRect(0, 0, VW, VH);
    }
    drawPlayer(player.x * TILE, player.y * TILE, player.hasBoat && world[player.y][player.x] === T.WATER);
    // Lightning flash sits above everything so it reads as a bright burst
    if (weather.lightning > 0) {
      ctx.fillStyle = 'rgba(255,255,220,0.08)';
      ctx.fillRect(0, 0, VW, VH);
    }
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
    drawPlayer(player.x * TILE, player.y * TILE, false);
    drawMiniMap();
  }
  function drawMiniMap() {
    const w = 80, h = 48;
    const px = VW - w - 10, py = 10;
    ctx.fillStyle = 'rgba(6,8,13,0.85)';
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = '#374151';
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    const cw = w / dungeon.w, ch = h / dungeon.h;
    for (let y = 0; y < dungeon.h; y++) {
      for (let x = 0; x < dungeon.w; x++) {
        if (!dungeon.seen[y][x]) continue;
        const t = dungeon.map[y][x];
        let col = '#1f2937';
        if (t === DT.FLOOR) col = '#374151';
        else if (t === DT.WALL) col = '#0f172a';
        else if (t === DT.CHEST) col = '#fde047';
        else if (t === DT.STAIRS_DOWN || t === DT.STAIRS_UP) col = '#38bdf8';
        else if (t === DT.BOSS_TILE) col = '#fb923c';
        else if (t === DT.EXIT) col = '#86efac';
        ctx.fillStyle = col;
        ctx.fillRect(px + x * cw, py + y * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }
    // Player marker
    ctx.fillStyle = '#fde047';
    ctx.fillRect(px + player.x * cw - 1, py + player.y * ch - 1, Math.max(3, cw + 1), Math.max(3, ch + 1));
  }

  function drawPlayer(sx, sy, onBoat) {
    if (onBoat) {
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(sx + 2, sy + 14, TILE - 4, 6);
      ctx.fillStyle = '#a16207';
      ctx.fillRect(sx + 4, sy + 11, TILE - 8, 4);
    }
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(sx + TILE / 2, sy + TILE / 2, TILE * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1500';
    ctx.fillRect(sx + 8, sy + 9, 2, 3);
    ctx.fillRect(sx + 14, sy + 9, 2, 3);
    ctx.fillRect(sx + 9, sy + 15, 6, 1);
  }

  function renderCombat() {
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#1a1428');
    grad.addColorStop(1, '#06080d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#0a1810';
    ctx.fillRect(0, VH - 100, VW, 100);

    // Monsters
    const enemies = combat.enemies;
    const total = enemies.length;
    for (let i = 0; i < total; i++) {
      const m = enemies[i];
      const cx = (VW * (i + 1)) / (total + 1);
      const cy = VH / 2 - 30;
      let r = combat.boss ? 70 : 38;
      if (total === 3) r -= 6;
      m._cx = cx; m._cy = cy; m._r = r;
      if (m.currentHp <= 0) {
        ctx.globalAlpha = 0.25;
        drawMonster(m, cx, cy, r);
        ctx.globalAlpha = 1;
        continue;
      }
      let drawX = cx, drawY = cy;
      let tint = null;
      if (m.flash) {
        m.flash.t += 1;
        if (m.flash.t < m.flash.max) {
          tint = m.flash.color;
          if (m.flash.t < 6) { drawX += 6; }
        } else m.flash = null;
      }
      if (m.status.sleep > 0) { tint = tint || '#a78bfa'; }
      drawMonster(m, drawX, drawY, r, tint);
      // Selection indicator
      if (i === combat.selected && combat.turn === 'player' && !combat.done) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy + r + 6, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Status icons
      let icoX = cx - r;
      const iconRow = cy - r - 18;
      if (m.status.sleep > 0) { ctx.fillStyle = '#a78bfa'; ctx.fillRect(icoX, iconRow, 8, 8); icoX += 12; }
    }

    // HP bars
    drawHpBar(40, 22, VW - 80, player.hp / totalMaxHp(), '#86efac', `You — HP ${player.hp}/${totalMaxHp()}    MP ${player.mp}/${totalMaxMp()}`);
    // Enemy bar (selected)
    if (ensureValidTarget()) {
      const sel = enemies[combat.selected];
      drawHpBar(40, 54, VW - 80, sel.currentHp / sel.maxHp, '#ef4444',
        `${sel.name} — HP ${Math.max(0, sel.currentHp)}/${sel.maxHp}` + (total > 1 ? `   (${combat.selected + 1}/${total})` : ''));
    }

    // Popups
    for (let i = combat.popups.length - 1; i >= 0; i--) {
      const pop = combat.popups[i];
      pop.t += 1;
      if (pop.t > pop.max) { combat.popups.splice(i, 1); continue; }
      let x, y;
      if (pop.target && pop.target.side === 'player') {
        x = 80; y = 110;
      } else if (pop.target && pop.target._cx) {
        x = pop.target._cx; y = pop.target._cy - 60;
      } else continue;
      ctx.globalAlpha = Math.max(0, 1 - pop.t / pop.max);
      ctx.fillStyle = pop.color;
      ctx.font = 'bold 18px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pop.text, x, y - pop.t * 1.2);
      ctx.globalAlpha = 1;
    }

    // Combat log box
    ctx.fillStyle = '#0e0e16';
    ctx.fillRect(40, VH - 220, VW - 80, 100);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px "SF Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = combat.log.slice(-6);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 50, VH - 215 + i * 16);
    }

    // Menu
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 15px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    if (!combat.done && combat.turn === 'player') {
      const line1 = '1) Attack  2) Defend  3) Item  4) Run  5) Spell';
      const line2 = total > 1 ? 'Tab / ←→ to change target' : '';
      ctx.fillText(line1, VW / 2, VH - 36);
      if (line2) ctx.fillText(line2, VW / 2, VH - 16);
    } else if (combat.done) {
      ctx.fillStyle = aliveEnemies().length === 0 ? '#86efac' : '#fca5a5';
      ctx.fillText(aliveEnemies().length === 0 ? 'Victory!' : '…', VW / 2, VH - 28);
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
  function drawMonster(m, cx, cy, r, tint) {
    ctx.fillStyle = tint || m.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.3, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (m.boss) {
      ctx.moveTo(cx - r * 0.35, cy + r * 0.35);
      ctx.lineTo(cx, cy + r * 0.45);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
    } else if (m.shape === 'dragon' || m.shape === 'troll') {
      ctx.moveTo(cx - r * 0.25, cy + r * 0.25);
      ctx.lineTo(cx - r * 0.15, cy + r * 0.45);
      ctx.lineTo(cx, cy + r * 0.30);
      ctx.lineTo(cx + r * 0.15, cy + r * 0.45);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.25);
    } else if (m.shape === 'undead') {
      ctx.moveTo(cx - r * 0.30, cy + r * 0.30);
      for (let i = -2; i <= 2; i++) {
        ctx.lineTo(cx + i * r * 0.15, cy + r * 0.30 + ((i % 2) ? r * 0.10 : -r * 0.05));
      }
    } else {
      ctx.moveTo(cx - r * 0.25, cy + r * 0.35);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.35);
    }
    ctx.stroke();
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
        const back = modalState.backTo;
        hideModal();
        if (back) back();
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
      if (combat.done) return;
      if (combat.turn !== 'player') return;
      if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { cycleTarget(1); e.preventDefault(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { cycleTarget(-1); e.preventDefault(); return; }
      if (e.key === '1') { playerAttack(); e.preventDefault(); return; }
      if (e.key === '2') { playerDefend(); e.preventDefault(); return; }
      if (e.key === '3') { playerItemPrompt(); e.preventDefault(); return; }
      if (e.key === '4') { playerRun(); e.preventDefault(); return; }
      if (e.key === '5') { playerSpellPrompt(); e.preventDefault(); return; }
      return;
    }

    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') dx = -1;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dx = 1;
    else if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') dy = -1;
    else if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') dy = 1;
    else if (e.key === 'i' || e.key === 'I') { showInventory(); e.preventDefault(); return; }
    else if ((e.key === 'q' || e.key === 'Q') && mode === 'overworld') { toggleQuestLog(); e.preventDefault(); return; }
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
      if (!modalState) return;
      const back = modalState.backTo;
      hideModal();
      if (back) back();
    }
  });

  function loop() {
    tickWorldTime();
    tickWeather();
    if (mode === 'overworld' || (mode === 'dungeon' && dungeon) || mode === 'combat') render();
    requestAnimationFrame(loop);
  }

  // Boot: try loading saved game
  if (hasSave() && !loadGame()) newGame();
  else if (!player) newGame();
  requestAnimationFrame(loop);
})();
