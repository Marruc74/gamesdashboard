export const TILE = {
  EMPTY: 0,
  DIRT: 1,
  WALL: 2,
  ROCK: 3,
  CRYSTAL: 4,
  PLAYER: 5,
  EXIT_CLOSED: 6,
  EXIT_OPEN: 7,
  EXPLODE1: 8,
  EXPLODE2: 9,
  EXPLODE3: 10,
  ENEMY: 11,
  CEXPLODE1: 12,
  CEXPLODE2: 13,
  CEXPLODE3: 14,
  MAGIC_WALL: 15,
  MAGIC_WALL_ON: 16,
  GHOST: 17,
  BOMB: 18,
  BOMB_PICKUP: 19,
};

const CAVE_W = 40;
const CAVE_H = 22;

const BOMB_FUSE_TICKS = 10;       // 10 * 150ms = 1.5s
const MAGIC_WALL_DURATION = 100;  // ticks (~15s)
const GHOST_MOVE_EVERY = 3;       // ghost moves every 3 ticks

const ADJECTIVES = ['Crystal', 'Rocky', 'Forgotten', 'Deep', 'Sunken', 'Ancient', 'Echoing', 'Glowing', 'Hidden', 'Lost', 'Quiet', 'Molten', 'Frozen', 'Shadow', 'Twilight'];
const NOUNS = ['Cavern', 'Tunnel', 'Grotto', 'Hollow', 'Shaft', 'Vault', 'Burrow', 'Cave', 'Crypt', 'Pit', 'Maze', 'Den', 'Lair', 'Depths', 'Channel'];

export function levelName(num) {
  return `${ADJECTIVES[num % ADJECTIVES.length]} ${NOUNS[Math.floor(num / ADJECTIVES.length) % NOUNS.length]}`;
}

const DIRS = {
  up:    { dx: 0,  dy: -1 },
  right: { dx: 1,  dy: 0  },
  down:  { dx: 0,  dy: 1  },
  left:  { dx: -1, dy: 0  },
};
const TURN_LEFT   = { up: 'left',  left: 'down',  down: 'right', right: 'up'    };
const TURN_RIGHT  = { up: 'right', right: 'down', down: 'left',  left: 'up'     };
const TURN_AROUND = { up: 'down',  down: 'up',    left: 'right', right: 'left'  };

function pushEvent(state, ev) {
  state.events.push(ev);
}

function moveEnemy(grid, enemy, width, height) {
  const tryDir = (d) => {
    const { dx, dy } = DIRS[d];
    const nx = enemy.x + dx;
    const ny = enemy.y + dy;
    if (nx < 1 || nx >= width - 1 || ny < 1 || ny >= height - 1) return null;
    const cell = grid[ny][nx];
    if (cell === TILE.EMPTY) return { x: nx, y: ny, dir: d };
    return null;
  };
  const order = [TURN_LEFT[enemy.dir], enemy.dir, TURN_RIGHT[enemy.dir], TURN_AROUND[enemy.dir]];
  for (const d of order) {
    const r = tryDir(d);
    if (r) return r;
  }
  return { x: enemy.x, y: enemy.y, dir: TURN_AROUND[enemy.dir] };
}

function moveGhost(grid, ghost, state) {
  // Ghost walks through dirt + empty toward player. Cannot cross rocks/walls/crystals.
  const { player, width, height } = state;
  const targets = [];
  const dx = Math.sign(player.x - ghost.x);
  const dy = Math.sign(player.y - ghost.y);
  if (Math.abs(player.x - ghost.x) >= Math.abs(player.y - ghost.y)) {
    if (dx !== 0) targets.push([dx, 0]);
    if (dy !== 0) targets.push([0, dy]);
    if (dx !== 0) targets.push([-dx, 0]);
    if (dy !== 0) targets.push([0, -dy]);
  } else {
    if (dy !== 0) targets.push([0, dy]);
    if (dx !== 0) targets.push([dx, 0]);
    if (dy !== 0) targets.push([0, -dy]);
    if (dx !== 0) targets.push([-dx, 0]);
  }
  for (const [mx, my] of targets) {
    const nx = ghost.x + mx;
    const ny = ghost.y + my;
    if (nx < 1 || nx >= width - 1 || ny < 1 || ny >= height - 1) continue;
    const t = grid[ny][nx];
    if (t === TILE.EMPTY || t === TILE.DIRT || t === TILE.PLAYER) {
      return { x: nx, y: ny };
    }
  }
  return { x: ghost.x, y: ghost.y };
}

function burstToCrystals(grid, cx, cy, width, height) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ex = cx + dx;
      const ey = cy + dy;
      if (ex >= 1 && ex < width - 1 && ey >= 1 && ey < height - 1) {
        const t = grid[ey][ex];
        if (t !== TILE.WALL && t !== TILE.PLAYER && t !== TILE.EXIT_CLOSED && t !== TILE.EXIT_OPEN && t !== TILE.MAGIC_WALL && t !== TILE.MAGIC_WALL_ON) {
          grid[ey][ex] = TILE.CEXPLODE1;
        }
      }
    }
  }
}

function spawnEnemies(grid, levelNum, width, height, playerX, playerY, exitX, exitY) {
  const chance = Math.min(0.45 + (levelNum - 1) * 0.04, 0.7);
  if (Math.random() > chance) return [];

  const maxCount = Math.min(1 + Math.floor((levelNum - 1) / 4), 3);
  const count = 1 + Math.floor(Math.random() * maxCount);

  const enemies = [];
  let attempts = 0;
  while (enemies.length < count && attempts < 200) {
    attempts++;
    const ex = 5 + Math.floor(Math.random() * (width - 10));
    const ey = 3 + Math.floor(Math.random() * (height - 6));
    if (Math.abs(ex - playerX) + Math.abs(ey - playerY) < 9) continue;
    if (Math.abs(ex - exitX) + Math.abs(ey - exitY) < 5) continue;
    if (grid[ey][ex] !== TILE.DIRT && grid[ey][ex] !== TILE.EMPTY) continue;
    if (enemies.some(e => Math.abs(e.x - ex) + Math.abs(e.y - ey) < 5)) continue;

    // Clear a 3-wide column above so falling rocks don't insta-kill the enemy.
    for (let sy = 1; sy < ey; sy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const sx = ex + dx;
        if (sx < 1 || sx >= width - 1) continue;
        const t = grid[sy][sx];
        if (t === TILE.ROCK || t === TILE.CRYSTAL || t === TILE.EMPTY) {
          grid[sy][sx] = TILE.DIRT;
        }
      }
    }

    grid[ey][ex] = TILE.ENEMY;
    // Carve a small empty pocket so the enemy can actually move.
    for (const d of ['up', 'down', 'left', 'right']) {
      const { dx, dy } = DIRS[d];
      const nx = ex + dx;
      const ny = ey + dy;
      if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
        if (grid[ny][nx] === TILE.DIRT) grid[ny][nx] = TILE.EMPTY;
      }
    }
    enemies.push({ x: ex, y: ey, dir: 'right' });
  }
  return enemies;
}

function spawnGhosts(grid, levelNum, width, height, playerX, playerY, exitX, exitY) {
  // Ghosts start appearing from level 4 onward, ~40% chance.
  if (levelNum < 4) return [];
  if (Math.random() > Math.min(0.35 + (levelNum - 4) * 0.05, 0.6)) return [];
  const count = 1;  // start with one; more in later levels could be added

  const ghosts = [];
  let attempts = 0;
  while (ghosts.length < count && attempts < 200) {
    attempts++;
    const gx = 4 + Math.floor(Math.random() * (width - 8));
    const gy = 3 + Math.floor(Math.random() * (height - 6));
    // Far from player so they don't ambush on tick 1
    if (Math.abs(gx - playerX) + Math.abs(gy - playerY) < 12) continue;
    if (Math.abs(gx - exitX) + Math.abs(gy - exitY) < 4) continue;
    if (grid[gy][gx] !== TILE.DIRT && grid[gy][gx] !== TILE.EMPTY) continue;
    grid[gy][gx] = TILE.GHOST;
    ghosts.push({ x: gx, y: gy, moveTimer: GHOST_MOVE_EVERY });
  }
  return ghosts;
}

function placeMagicWall(grid, levelNum, width, height, playerY, exitY) {
  // Magic walls appear from level 3+, ~50% chance.
  if (levelNum < 3) return false;
  if (Math.random() > 0.55) return false;

  // Find a horizontal slot in the middle of the level (between exit and player rows)
  const minY = Math.max(exitY + 3, 6);
  const maxY = Math.min(playerY - 3, height - 4);
  if (minY >= maxY) return false;
  const wy = minY + Math.floor(Math.random() * (maxY - minY + 1));
  const len = 3 + Math.floor(Math.random() * 3); // 3-5 wide
  const startX = 4 + Math.floor(Math.random() * (width - 8 - len));

  for (let i = 0; i < len; i++) {
    const wx = startX + i;
    if (wx < 1 || wx >= width - 1) continue;
    grid[wy][wx] = TILE.MAGIC_WALL;
    // Ensure cell BELOW the magic wall is empty so generated crystals land cleanly
    if (wy + 1 < height - 1 && grid[wy + 1][wx] === TILE.ROCK) {
      grid[wy + 1][wx] = TILE.EMPTY;
    }
  }
  return true;
}

function placeBombPickups(grid, levelNum, width, height) {
  // Drop 1-2 bomb pickup tiles on dirt cells starting at level 2.
  if (levelNum < 2) return;
  const count = 1 + (levelNum >= 5 ? 1 : 0);
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < 200) {
    attempts++;
    const bx = 2 + Math.floor(Math.random() * (width - 4));
    const by = 2 + Math.floor(Math.random() * (height - 4));
    if (grid[by][bx] === TILE.DIRT) {
      grid[by][bx] = TILE.BOMB_PICKUP;
      placed++;
    }
  }
}

export function generateLevel(levelNum, lives = 3) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = generateLevelOnce(levelNum, lives);
    if (isStartSafe(state)) return state;
  }
  return generateLevelOnce(levelNum, lives);
}

function isStartSafe(state) {
  let s = { ...state, grid: state.grid.map(r => r.slice()), events: [] };
  for (let t = 0; t < 6; t++) {
    s = runPhysics(s);
    if (s.status !== 'playing') return false;
  }
  return true;
}

function generateLevelOnce(levelNum, lives) {
  const rockChance = Math.min(0.18 + levelNum * 0.015, 0.33);
  const crystalChance = Math.min(0.10 + levelNum * 0.008, 0.18);
  const crystalsNeeded = 8 + levelNum * 2;
  const timeLimit = Math.max(80, 200 - levelNum * 10);

  const grid = [];
  for (let y = 0; y < CAVE_H; y++) {
    const row = [];
    for (let x = 0; x < CAVE_W; x++) {
      if (y === 0 || y === CAVE_H - 1 || x === 0 || x === CAVE_W - 1) {
        row.push(TILE.WALL);
      } else {
        const r = Math.random();
        if (r < 0.08) row.push(TILE.EMPTY);
        else if (r < 0.08 + rockChance) row.push(TILE.ROCK);
        else if (r < 0.08 + rockChance + crystalChance) row.push(TILE.CRYSTAL);
        else row.push(TILE.DIRT);
      }
    }
    grid.push(row);
  }

  const playerX = 2;
  const playerY = CAVE_H - 2;
  const exitX = CAVE_W - 3;
  const exitY = 1 + (levelNum % 5) + 1;

  for (let y = playerY; y >= exitY; y--) {
    removeRock(grid, playerX, y);
    removeRock(grid, playerX + 1, y);
    removeRock(grid, playerX, y - 1);
    removeRock(grid, playerX + 1, y - 1);
  }
  for (let x = playerX; x <= exitX; x++) {
    removeRock(grid, x, exitY);
    removeRock(grid, x, exitY - 1);
  }

  // Player safety zone
  for (let dy = -2; dy <= 0; dy++) {
    for (let dx = -1; dx <= 2; dx++) {
      const sx = playerX + dx;
      const sy = playerY + dy;
      if (sx < 1 || sx >= CAVE_W - 1 || sy < 1 || sy >= CAVE_H - 1) continue;
      if (grid[sy][sx] !== TILE.CRYSTAL) grid[sy][sx] = TILE.DIRT;
    }
  }

  grid[playerY][playerX] = TILE.PLAYER;
  grid[playerY][playerX + 1] = TILE.EMPTY;
  grid[exitY][exitX] = TILE.EXIT_CLOSED;

  const enemies = spawnEnemies(grid, levelNum, CAVE_W, CAVE_H, playerX, playerY, exitX, exitY);
  const ghosts = spawnGhosts(grid, levelNum, CAVE_W, CAVE_H, playerX, playerY, exitX, exitY);
  placeMagicWall(grid, levelNum, CAVE_W, CAVE_H, playerY, exitY);
  placeBombPickups(grid, levelNum, CAVE_W, CAVE_H);

  // Path crystal seeding
  let pathCrystals = 0;
  for (let y = exitY; y <= playerY; y++) {
    if (grid[y][playerX] === TILE.CRYSTAL || grid[y][playerX + 1] === TILE.CRYSTAL) pathCrystals++;
  }
  for (let x = playerX + 2; x < exitX; x++) {
    if (grid[exitY][x] === TILE.CRYSTAL) pathCrystals++;
  }
  const minOnPath = Math.ceil(crystalsNeeded * 0.6);
  let placed = 0;
  for (let y = playerY - 2; y >= exitY + 1 && placed < minOnPath - pathCrystals; y -= 2) {
    if (grid[y][playerX] === TILE.DIRT) {
      grid[y][playerX] = TILE.CRYSTAL;
      placed++;
    }
  }
  for (let x = playerX + 2; x < exitX - 1 && placed < minOnPath - pathCrystals; x += 3) {
    if (grid[exitY][x] === TILE.DIRT) {
      grid[exitY][x] = TILE.CRYSTAL;
      placed++;
    }
  }

  return {
    grid,
    width: CAVE_W,
    height: CAVE_H,
    player: { x: playerX, y: playerY },
    enemies,
    ghosts,
    bombs: [],
    bombInventory: 0,
    crystalsCollected: 0,
    crystalsNeeded,
    score: 0,
    lives,
    timeLeft: timeLimit,
    status: 'playing',
    exitOpen: false,
    level: levelNum,
    dyingTicks: 0,
    tickCount: 0,
    magicWallActive: false,
    magicWallTicks: 0,
    events: [],
  };
}

function removeRock(grid, x, y) {
  if (x < 1 || x >= CAVE_W - 1 || y < 1 || y >= CAVE_H - 1) return;
  if (grid[y][x] === TILE.ROCK) grid[y][x] = TILE.DIRT;
}

function isRound(t) {
  return t === TILE.ROCK || t === TILE.CRYSTAL;
}

function cloneGrid(grid) {
  return grid.map(row => row.slice());
}

export function applyInput(state, dir) {
  state = { ...state, events: [] };
  if (state.status !== 'playing' || dir === null) return state;

  const { x, y } = state.player;
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
  const nx = x + dx;
  const ny = y + dy;

  if (nx < 0 || nx >= state.width || ny < 0 || ny >= state.height) return state;

  const grid = cloneGrid(state.grid);
  let { score, crystalsCollected, status, exitOpen, bombInventory } = state;
  const target = grid[ny][nx];
  let moved = false;

  if (target === TILE.EMPTY) {
    grid[y][x] = TILE.EMPTY;
    grid[ny][nx] = TILE.PLAYER;
    moved = true;
  } else if (target === TILE.DIRT) {
    grid[y][x] = TILE.EMPTY;
    grid[ny][nx] = TILE.PLAYER;
    moved = true;
    state.events.push({ kind: 'dig', x: nx, y: ny });
  } else if (target === TILE.CRYSTAL) {
    grid[y][x] = TILE.EMPTY;
    grid[ny][nx] = TILE.PLAYER;
    crystalsCollected++;
    score += 10;
    moved = true;
    state.events.push({ kind: 'crystal', x: nx, y: ny });
  } else if (target === TILE.BOMB_PICKUP) {
    grid[y][x] = TILE.EMPTY;
    grid[ny][nx] = TILE.PLAYER;
    bombInventory++;
    moved = true;
    state.events.push({ kind: 'bomb-pickup', x: nx, y: ny });
  } else if (target === TILE.EXIT_OPEN) {
    grid[y][x] = TILE.EMPTY;
    status = 'won';
    moved = true;
    state.events.push({ kind: 'level-clear' });
  } else if (target === TILE.ROCK && dy === 0) {
    const bx = nx + dx;
    if (bx >= 0 && bx < state.width && grid[ny][bx] === TILE.EMPTY) {
      grid[ny][bx] = TILE.ROCK;
      grid[y][x] = TILE.EMPTY;
      grid[ny][nx] = TILE.PLAYER;
      moved = true;
      state.events.push({ kind: 'rock-push', x: nx, y: ny });
    }
  } else if (target === TILE.ENEMY || target === TILE.GHOST) {
    explode(grid, nx, ny, state.width, state.height);
    const enemies = (state.enemies || []).filter(e => !(e.x === nx && e.y === ny));
    const ghosts = (state.ghosts || []).filter(g => !(g.x === nx && g.y === ny));
    state.events.push({ kind: 'player-die', x: state.player.x, y: state.player.y });
    return { ...state, grid, enemies, ghosts, status: 'dying', dyingTicks: 0 };
  }

  if (!moved) return state;

  const newPlayer = status === 'won' ? state.player : { x: nx, y: ny };

  if (!exitOpen && crystalsCollected >= state.crystalsNeeded) {
    exitOpen = true;
    for (let gy = 0; gy < state.height; gy++) {
      for (let gx = 0; gx < state.width; gx++) {
        if (grid[gy][gx] === TILE.EXIT_CLOSED) grid[gy][gx] = TILE.EXIT_OPEN;
      }
    }
    state.events.push({ kind: 'exit-open' });
  }

  return { ...state, grid, player: newPlayer, score, crystalsCollected, status, exitOpen, bombInventory };
}

export function dropBomb(state) {
  if (state.status !== 'playing') return state;
  if (state.bombInventory <= 0) return state;
  const px = state.player.x;
  const py = state.player.y;
  if (state.bombs && state.bombs.some(b => b.x === px && b.y === py)) return state;
  const bombs = [...(state.bombs || []), { x: px, y: py, fuse: BOMB_FUSE_TICKS }];
  return {
    ...state,
    bombs,
    bombInventory: state.bombInventory - 1,
    events: [...(state.events || []), { kind: 'bomb-place', x: px, y: py }],
  };
}

function explode(grid, cx, cy, width, height) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ex = cx + dx;
      const ey = cy + dy;
      if (ex >= 0 && ex < width && ey >= 0 && ey < height && grid[ey][ex] !== TILE.WALL) {
        grid[ey][ex] = TILE.EXPLODE1;
      }
    }
  }
}

export function runPhysics(state) {
  if (state.status !== 'playing' && state.status !== 'dying') return state;

  state = { ...state, events: state.events ? [...state.events] : [] };

  if (state.status === 'dying') {
    const grid = cloneGrid(state.grid);
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if (grid[y][x] === TILE.EXPLODE1) grid[y][x] = TILE.EXPLODE2;
        else if (grid[y][x] === TILE.EXPLODE2) grid[y][x] = TILE.EXPLODE3;
        else if (grid[y][x] === TILE.EXPLODE3) grid[y][x] = TILE.EMPTY;
        else if (grid[y][x] === TILE.CEXPLODE1) grid[y][x] = TILE.CEXPLODE2;
        else if (grid[y][x] === TILE.CEXPLODE2) grid[y][x] = TILE.CEXPLODE3;
        else if (grid[y][x] === TILE.CEXPLODE3) grid[y][x] = TILE.CRYSTAL;
      }
    }
    const dyingTicks = state.dyingTicks + 1;
    if (dyingTicks >= 4) {
      const lives = state.lives - 1;
      return { ...state, grid, lives, status: lives <= 0 ? 'gameover' : 'dead', dyingTicks };
    }
    return { ...state, grid, dyingTicks };
  }

  const grid = cloneGrid(state.grid);
  const { width, height, player } = state;
  let { status, exitOpen, tickCount } = state;
  let enemies = (state.enemies || []).map(e => ({ ...e }));
  let ghosts = (state.ghosts || []).map(g => ({ ...g }));
  let bombs = (state.bombs || []).map(b => ({ ...b }));
  let magicWallActive = state.magicWallActive;
  let magicWallTicks = state.magicWallTicks;

  // Age explosion tiles
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === TILE.EXPLODE1) grid[y][x] = TILE.EXPLODE2;
      else if (grid[y][x] === TILE.EXPLODE2) grid[y][x] = TILE.EXPLODE3;
      else if (grid[y][x] === TILE.EXPLODE3) grid[y][x] = TILE.EMPTY;
      else if (grid[y][x] === TILE.CEXPLODE1) grid[y][x] = TILE.CEXPLODE2;
      else if (grid[y][x] === TILE.CEXPLODE2) grid[y][x] = TILE.CEXPLODE3;
      else if (grid[y][x] === TILE.CEXPLODE3) grid[y][x] = TILE.CRYSTAL;
    }
  }

  // Magic wall lifecycle
  if (magicWallActive) {
    magicWallTicks -= 1;
    if (magicWallTicks <= 0) {
      magicWallActive = false;
      // Deactivate visible magic walls
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (grid[y][x] === TILE.MAGIC_WALL_ON) grid[y][x] = TILE.MAGIC_WALL;
        }
      }
    }
  }

  // Tick bomb fuses; explode any that reach zero
  const explodedBombs = [];
  bombs = bombs.filter(b => {
    b.fuse -= 1;
    if (b.fuse <= 0) {
      explodedBombs.push(b);
      return false;
    }
    return true;
  });
  for (const b of explodedBombs) {
    bombExplode(grid, b.x, b.y, width, height, state);
    // Remove any enemies/ghosts in 3x3 blast
    enemies = enemies.filter(e => Math.abs(e.x - b.x) > 1 || Math.abs(e.y - b.y) > 1);
    ghosts = ghosts.filter(g => Math.abs(g.x - b.x) > 1 || Math.abs(g.y - b.y) > 1);
    // Bomb hit player?
    if (Math.abs(player.x - b.x) <= 1 && Math.abs(player.y - b.y) <= 1) {
      status = 'dying';
      state.events.push({ kind: 'player-die', x: player.x, y: player.y });
    }
  }

  grid[player.y][player.x] = TILE.EMPTY;

  const moved = Array.from({ length: height }, () => new Uint8Array(width));

  // Rock physics — bottom-up scan
  for (let y = height - 2; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const tile = grid[y][x];
      if ((tile !== TILE.ROCK && tile !== TILE.CRYSTAL) || moved[y][x]) continue;

      const below = grid[y + 1][x];

      if (below === TILE.EMPTY && !moved[y + 1][x]) {
        grid[y + 1][x] = tile;
        grid[y][x] = TILE.EMPTY;
        moved[y + 1][x] = 1;
        // 'rock-land' fires only when the next cell can't fall further; we emit
        // unconditionally per-fall but throttle in game.js if necessary.
        state.events.push({ kind: 'rock-fall', x, y: y + 1 });
      } else if (below === TILE.ENEMY && !moved[y + 1][x]) {
        burstToCrystals(grid, x, y + 1, width, height);
        enemies = enemies.filter(e => !(e.x === x && e.y === y + 1));
        grid[y][x] = TILE.EMPTY;
        moved[y + 1][x] = 1;
        state.events.push({ kind: 'enemy-crush', x, y: y + 1 });
      } else if (below === TILE.GHOST && !moved[y + 1][x]) {
        burstToCrystals(grid, x, y + 1, width, height);
        ghosts = ghosts.filter(g => !(g.x === x && g.y === y + 1));
        grid[y][x] = TILE.EMPTY;
        moved[y + 1][x] = 1;
        state.events.push({ kind: 'ghost-crush', x, y: y + 1 });
      } else if ((below === TILE.MAGIC_WALL || below === TILE.MAGIC_WALL_ON) && tile === TILE.ROCK) {
        // Activate magic wall and consume rock
        if (!magicWallActive) {
          magicWallActive = true;
          magicWallTicks = MAGIC_WALL_DURATION;
          state.events.push({ kind: 'magic-wall-activate' });
        }
        if (below === TILE.MAGIC_WALL) grid[y + 1][x] = TILE.MAGIC_WALL_ON;
        // Produce crystal at the cell below the wall, if empty.
        const belowBelow = y + 2 < height ? grid[y + 2][x] : null;
        if (belowBelow === TILE.EMPTY && magicWallActive) {
          grid[y + 2][x] = TILE.CRYSTAL;
          moved[y + 2][x] = 1;
          state.events.push({ kind: 'crystal-from-magic', x, y: y + 2 });
        }
        grid[y][x] = TILE.EMPTY;
      } else if (isRound(below)) {
        const canRight =
          x + 1 < width &&
          grid[y][x + 1] === TILE.EMPTY && !moved[y][x + 1] &&
          grid[y + 1][x + 1] === TILE.EMPTY && !moved[y + 1][x + 1];

        if (canRight) {
          grid[y][x + 1] = tile;
          grid[y][x] = TILE.EMPTY;
          moved[y][x + 1] = 1;
        } else {
          const canLeft =
            x - 1 >= 0 &&
            grid[y][x - 1] === TILE.EMPTY && !moved[y][x - 1] &&
            grid[y + 1][x - 1] === TILE.EMPTY && !moved[y + 1][x - 1];
          if (canLeft) {
            grid[y][x - 1] = tile;
            grid[y][x] = TILE.EMPTY;
            moved[y][x - 1] = 1;
          }
        }
      }
    }
  }

  // Move enemies (Boulder-Dash style firefly wall-following)
  enemies = enemies
    .filter(e => grid[e.y][e.x] === TILE.ENEMY)
    .map(e => {
      grid[e.y][e.x] = TILE.EMPTY;
      const next = moveEnemy(grid, e, width, height);
      grid[next.y][next.x] = TILE.ENEMY;
      return next;
    });

  // Move ghosts toward player (slower, walk through dirt)
  ghosts = ghosts
    .filter(g => grid[g.y][g.x] === TILE.GHOST)
    .map(g => {
      g.moveTimer = (g.moveTimer || 0) - 1;
      if (g.moveTimer > 0) return g;
      g.moveTimer = GHOST_MOVE_EVERY;
      grid[g.y][g.x] = TILE.EMPTY;
      const next = moveGhost(grid, g, state);
      grid[next.y][next.x] = TILE.GHOST;
      return { ...g, x: next.x, y: next.y };
    });

  // Player vs other-entity collision check (player cell currently temp-empty)
  const playerCell = grid[player.y][player.x];
  if (playerCell === TILE.ROCK || playerCell === TILE.CRYSTAL || playerCell === TILE.ENEMY || playerCell === TILE.GHOST) {
    enemies = enemies.filter(e => Math.abs(e.x - player.x) > 1 || Math.abs(e.y - player.y) > 1);
    ghosts = ghosts.filter(g => Math.abs(g.x - player.x) > 1 || Math.abs(g.y - player.y) > 1);
    explode(grid, player.x, player.y, width, height);
    status = 'dying';
    state.events.push({ kind: 'player-die', x: player.x, y: player.y });
  } else {
    grid[player.y][player.x] = TILE.PLAYER;
  }

  // Re-paint bomb positions (so they stay visible in the grid)
  for (const b of bombs) {
    if (grid[b.y][b.x] === TILE.EMPTY) grid[b.y][b.x] = TILE.BOMB;
  }

  // Time
  const timeLeft = tickCount % 7 === 0 ? Math.max(0, state.timeLeft - 1) : state.timeLeft;
  if (timeLeft === 0 && status === 'playing') {
    explode(grid, player.x, player.y, width, height);
    status = 'dying';
    state.events.push({ kind: 'player-die', x: player.x, y: player.y });
  }

  return {
    ...state,
    grid,
    enemies,
    ghosts,
    bombs,
    status,
    exitOpen,
    timeLeft,
    tickCount: tickCount + 1,
    magicWallActive,
    magicWallTicks,
  };
}

function bombExplode(grid, cx, cy, width, height, state) {
  state.events.push({ kind: 'bomb-explode', x: cx, y: cy });
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ex = cx + dx;
      const ey = cy + dy;
      if (ex < 0 || ex >= width || ey < 0 || ey >= height) continue;
      const t = grid[ey][ex];
      // Preserve outer walls, magic walls, and exit
      if (t === TILE.WALL || t === TILE.MAGIC_WALL || t === TILE.MAGIC_WALL_ON || t === TILE.EXIT_CLOSED || t === TILE.EXIT_OPEN) continue;
      grid[ey][ex] = TILE.EXPLODE1;
    }
  }
}

export function tick(state, inputDir) {
  let s = applyInput(state, inputDir);
  s = runPhysics(s);
  return s;
}
