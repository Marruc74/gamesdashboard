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
};

const CAVE_W = 40;
const CAVE_H = 22;

const ADJECTIVES = ['Crystal', 'Rocky', 'Forgotten', 'Deep', 'Sunken', 'Ancient', 'Echoing', 'Glowing', 'Hidden', 'Lost', 'Quiet', 'Molten', 'Frozen', 'Shadow', 'Twilight'];
const NOUNS = ['Cavern', 'Tunnel', 'Grotto', 'Hollow', 'Shaft', 'Vault', 'Burrow', 'Cave', 'Crypt', 'Pit', 'Maze', 'Den', 'Lair', 'Depths', 'Channel'];

export function levelName(num) {
  return `${ADJECTIVES[num % ADJECTIVES.length]} ${NOUNS[Math.floor(num / ADJECTIVES.length) % NOUNS.length]}`;
}

export function generateLevel(levelNum, lives = 3) {
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

  grid[playerY][playerX] = TILE.PLAYER;
  grid[playerY][playerX + 1] = TILE.EMPTY;
  grid[exitY][exitX] = TILE.EXIT_CLOSED;

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

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === TILE.EXPLODE1) grid[y][x] = TILE.EXPLODE2;
      else if (grid[y][x] === TILE.EXPLODE2) grid[y][x] = TILE.EXPLODE3;
      else if (grid[y][x] === TILE.EXPLODE3) grid[y][x] = TILE.EMPTY;
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

  const playerCell = grid[player.y][player.x];
  if (playerCell === TILE.ROCK || playerCell === TILE.CRYSTAL) {
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

  return { ...state, grid, status, exitOpen, timeLeft, tickCount: tickCount + 1 };
}

export function tick(state, inputDir) {
  let s = applyInput(state, inputDir);
  s = runPhysics(s);
  return s;
}
