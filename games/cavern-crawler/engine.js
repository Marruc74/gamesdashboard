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
};

const DIRS = {
  up:    { dx: 0,  dy: -1 },
  right: { dx: 1,  dy: 0  },
  down:  { dx: 0,  dy: 1  },
  left:  { dx: -1, dy: 0  },
};
const TURN_LEFT   = { up: 'left',  left: 'down',  down: 'right', right: 'up'    };
const TURN_RIGHT  = { up: 'right', right: 'down', down: 'left',  left: 'up'     };
const TURN_AROUND = { up: 'down',  down: 'up',    left: 'right', right: 'left'  };

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

function burstToCrystals(grid, cx, cy, width, height) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ex = cx + dx;
      const ey = cy + dy;
      if (ex >= 1 && ex < width - 1 && ey >= 1 && ey < height - 1) {
        const t = grid[ey][ex];
        if (t !== TILE.WALL && t !== TILE.PLAYER && t !== TILE.EXIT_CLOSED && t !== TILE.EXIT_OPEN) {
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

    // Clear a 3-wide column of rocks/crystals/empties above the enemy down to its row.
    // Forcing DIRT (not EMPTY) blocks both falls (nothing above to fall) and slides
    // (slides require EMPTY cells in the destination column).
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
    // Carve a small empty pocket so the enemy can actually move
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

const CAVE_W = 40;
const CAVE_H = 22;

const ADJECTIVES = ['Crystal', 'Rocky', 'Forgotten', 'Deep', 'Sunken', 'Ancient', 'Echoing', 'Glowing', 'Hidden', 'Lost', 'Quiet', 'Molten', 'Frozen', 'Shadow', 'Twilight'];
const NOUNS = ['Cavern', 'Tunnel', 'Grotto', 'Hollow', 'Shaft', 'Vault', 'Burrow', 'Cave', 'Crypt', 'Pit', 'Maze', 'Den', 'Lair', 'Depths', 'Channel'];

export function levelName(num) {
  return `${ADJECTIVES[num % ADJECTIVES.length]} ${NOUNS[Math.floor(num / ADJECTIVES.length) % NOUNS.length]}`;
}

export function generateLevel(levelNum, lives = 3) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = generateLevelOnce(levelNum, lives);
    if (isStartSafe(state)) return state;
  }
  return generateLevelOnce(levelNum, lives);
}

function isStartSafe(state) {
  let s = { ...state, grid: state.grid.map(r => r.slice()) };
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

  // Force a 4-wide, 3-tall dirt safety zone around the player.
  // Dirt blocks physics slides/falls (slides need EMPTY cells, not DIRT).
  // Preserve crystals so the level's crystal supply isn't gutted.
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
  if (state.status !== 'playing' || dir === null) return state;

  const { x, y } = state.player;
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
  const nx = x + dx;
  const ny = y + dy;

  if (nx < 0 || nx >= state.width || ny < 0 || ny >= state.height) return state;

  const grid = cloneGrid(state.grid);
  let { score, crystalsCollected, status, exitOpen } = state;
  const target = grid[ny][nx];
  let moved = false;

  if (target === TILE.EMPTY || target === TILE.DIRT) {
    grid[y][x] = TILE.EMPTY;
    grid[ny][nx] = TILE.PLAYER;
    moved = true;
  } else if (target === TILE.CRYSTAL) {
    grid[y][x] = TILE.EMPTY;
    grid[ny][nx] = TILE.PLAYER;
    crystalsCollected++;
    score += 10;
    moved = true;
  } else if (target === TILE.EXIT_OPEN) {
    grid[y][x] = TILE.EMPTY;
    status = 'won';
    moved = true;
  } else if (target === TILE.ROCK && dy === 0) {
    const bx = nx + dx;
    if (bx >= 0 && bx < state.width && grid[ny][bx] === TILE.EMPTY) {
      grid[ny][bx] = TILE.ROCK;
      grid[y][x] = TILE.EMPTY;
      grid[ny][nx] = TILE.PLAYER;
      moved = true;
    }
  } else if (target === TILE.ENEMY) {
    explode(grid, nx, ny, state.width, state.height);
    const enemies = (state.enemies || []).filter(e => !(e.x === nx && e.y === ny));
    return { ...state, grid, enemies, status: 'dying', dyingTicks: 0 };
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
  }

  return { ...state, grid, player: newPlayer, score, crystalsCollected, status, exitOpen };
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

  grid[player.y][player.x] = TILE.EMPTY;

  const moved = Array.from({ length: height }, () => new Uint8Array(width));

  for (let y = height - 2; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const tile = grid[y][x];
      if ((tile !== TILE.ROCK && tile !== TILE.CRYSTAL) || moved[y][x]) continue;

      const below = grid[y + 1][x];

      if (below === TILE.EMPTY && !moved[y + 1][x]) {
        grid[y + 1][x] = tile;
        grid[y][x] = TILE.EMPTY;
        moved[y + 1][x] = 1;
      } else if (below === TILE.ENEMY && !moved[y + 1][x]) {
        burstToCrystals(grid, x, y + 1, width, height);
        enemies = enemies.filter(e => !(e.x === x && e.y === y + 1));
        grid[y][x] = TILE.EMPTY;
        moved[y + 1][x] = 1;
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

  // Move surviving enemies after rocks settle
  enemies = enemies
    .filter(e => grid[e.y][e.x] === TILE.ENEMY)
    .map(e => {
      grid[e.y][e.x] = TILE.EMPTY;
      const next = moveEnemy(grid, e, width, height);
      grid[next.y][next.x] = TILE.ENEMY;
      return next;
    });

  const playerCell = grid[player.y][player.x];
  if (playerCell === TILE.ROCK || playerCell === TILE.CRYSTAL || playerCell === TILE.ENEMY) {
    enemies = enemies.filter(e => Math.abs(e.x - player.x) > 1 || Math.abs(e.y - player.y) > 1);
    explode(grid, player.x, player.y, width, height);
    status = 'dying';
  } else {
    grid[player.y][player.x] = TILE.PLAYER;
  }

  const timeLeft = tickCount % 7 === 0 ? Math.max(0, state.timeLeft - 1) : state.timeLeft;
  if (timeLeft === 0 && status === 'playing') {
    explode(grid, player.x, player.y, width, height);
    status = 'dying';
  }

  return { ...state, grid, enemies, status, exitOpen, timeLeft, tickCount: tickCount + 1 };
}

export function tick(state, inputDir) {
  let s = applyInput(state, inputDir);
  s = runPhysics(s);
  return s;
}
