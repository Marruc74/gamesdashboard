(() => {
  // ─── Constants ───────────────────────────────────────────────────────────
  const TILE = 24;
  const WORLD_W = 60;
  const WORLD_H = 40;
  const VIEW_W = 20;
  const VIEW_H = 14;
  const CANVAS_W = VIEW_W * TILE;
  const CANVAS_H = VIEW_H * TILE;
  const REVEAL_RADIUS = 4;

  const TOTAL_RUINS = 5;
  const TOTAL_VILLAGES = 4;
  const TRADES_PER_VILLAGE = 3;
  const PROVISIONS_PER_TRADE = 30;
  const GOLD_PER_TRADE = 10;
  const RUIN_GOLD_REWARD = 25;

  const PROV_DRAIN_RATE = 1.5;  // per second
  const MOVE_SPEED = 3.5;        // tiles per second
  const FOREST_SPEED_MULT = 0.55;

  // Tile types
  const T_DEEP = 0;
  const T_SHALLOW = 1;
  const T_BEACH = 2;
  const T_GRASS = 3;
  const T_FOREST = 4;
  const T_MOUNTAIN = 5;
  const T_VILLAGE = 6;
  const T_RUIN = 7;
  const T_RUIN_FOUND = 8;

  // ─── DOM ─────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('board');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  const provEl = document.getElementById('prov');
  const goldEl = document.getElementById('gold');
  const ruinsEl = document.getElementById('ruins');
  const ruinsTotalEl = document.getElementById('ruins-total');
  const daysEl = document.getElementById('days');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');
  const restartBtn = document.getElementById('restart');
  const dialog = document.getElementById('dialog');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogMsg = document.getElementById('dialog-msg');
  const dialogActions = document.getElementById('dialog-actions');

  ruinsTotalEl.textContent = TOTAL_RUINS;

  // ─── State ───────────────────────────────────────────────────────────────
  let world;         // 2D array of tile types
  let discovered;    // 2D bool array
  let villages;      // [{x,y,tradesLeft}]
  let ruins;         // [{x,y,found}]
  let player;        // {x, y} in tile units (float)
  let resources;     // {provisions, gold, ruinsFound}
  let daysPassed;
  let camera;        // {x, y} top-left in tile units (float)
  let gameStatus;    // 'playing' | 'won' | 'lost'
  let lastTime;
  let dialogOpen;
  let lastDialogTile;  // {x, y} of last tile that opened a dialog (to prevent re-opening)

  // ─── Input ───────────────────────────────────────────────────────────────
  const keys = {};
  document.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys[e.key.toLowerCase()] = true;
  });
  document.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  function inputVec() {
    let dx = 0, dy = 0;
    if (keys['arrowleft'] || keys['a']) dx -= 1;
    if (keys['arrowright'] || keys['d']) dx += 1;
    if (keys['arrowup'] || keys['w']) dy -= 1;
    if (keys['arrowdown'] || keys['s']) dy += 1;
    // Normalize diagonals
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }
    return { dx, dy };
  }

  // ─── World generation ────────────────────────────────────────────────────
  function generateTerrain() {
    world = [];
    discovered = [];
    const seedA = Math.random() * 100;
    const seedB = Math.random() * 100;
    const seedC = Math.random() * 100;
    for (let y = 0; y < WORLD_H; y++) {
      const row = [];
      const drow = [];
      for (let x = 0; x < WORLD_W; x++) {
        const cx = (x / WORLD_W) - 0.5;
        const cy = (y / WORLD_H) - 0.5;
        const dist = Math.sqrt(cx * cx + cy * cy) * 1.8;
        const noise =
          Math.sin(x * 0.31 + seedA) * Math.cos(y * 0.28 + seedB) * 0.16 +
          Math.sin(x * 0.61 + y * 0.42 + seedC) * 0.09 +
          Math.cos(x * 0.13 - y * 0.17 + seedA) * 0.07;
        const elevation = 0.7 - dist + noise;

        let t;
        if (elevation < 0.05) t = T_DEEP;
        else if (elevation < 0.18) t = T_SHALLOW;
        else if (elevation < 0.24) t = T_BEACH;
        else if (elevation < 0.45) t = T_GRASS;
        else if (elevation < 0.6) t = T_FOREST;
        else t = T_MOUNTAIN;
        row.push(t);
        drow.push(false);
      }
      world.push(row);
      discovered.push(drow);
    }
  }

  function findLargestLandmass() {
    // Flood-fill on player-passable terrain (beach/grass/forest).
    // Mountains and water block, so this finds connected reachable regions.
    const visited = Array.from({ length: WORLD_H }, () => new Array(WORLD_W).fill(false));
    let largest = [];
    for (let sy = 0; sy < WORLD_H; sy++) {
      for (let sx = 0; sx < WORLD_W; sx++) {
        if (visited[sy][sx] || !isLand(world[sy][sx])) continue;
        const island = [];
        const stack = [[sx, sy]];
        while (stack.length) {
          const [cx, cy] = stack.pop();
          if (cx < 0 || cx >= WORLD_W || cy < 0 || cy >= WORLD_H) continue;
          if (visited[cy][cx] || !isLand(world[cy][cx])) continue;
          visited[cy][cx] = true;
          island.push({ x: cx, y: cy });
          stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
        if (island.length > largest.length) largest = island;
      }
    }
    return largest;
  }

  function isLand(t) {
    return t === T_BEACH || t === T_GRASS || t === T_FOREST;
  }
  function isPassable(t) {
    return isLand(t) || t === T_VILLAGE || t === T_RUIN || t === T_RUIN_FOUND;
  }

  function placeFeatures() {
    villages = [];
    ruins = [];

    // Find the single largest connected reachable landmass.
    const mainIsland = findLargestLandmass();
    const minNeeded = TOTAL_RUINS * 8 + TOTAL_VILLAGES * 8 + 20;
    if (mainIsland.length < minNeeded) return false;

    // Candidate pools, restricted to the main island.
    const beachCandidates = mainIsland.filter(t =>
      world[t.y][t.x] === T_BEACH && t.x >= 2 && t.x < WORLD_W - 2 && t.y >= 2 && t.y < WORLD_H - 2);
    const inlandCandidates = mainIsland.filter(t =>
      (world[t.y][t.x] === T_GRASS || world[t.y][t.x] === T_FOREST) &&
      t.x >= 2 && t.x < WORLD_W - 2 && t.y >= 2 && t.y < WORLD_H - 2);

    if (beachCandidates.length < TOTAL_VILLAGES || inlandCandidates.length < TOTAL_RUINS) {
      return false;
    }

    // Villages
    shuffle(beachCandidates);
    for (const c of beachCandidates) {
      if (villages.length >= TOTAL_VILLAGES) break;
      if (villages.every(v => Math.hypot(v.x - c.x, v.y - c.y) > 10)) {
        villages.push({ x: c.x, y: c.y, tradesLeft: TRADES_PER_VILLAGE });
        world[c.y][c.x] = T_VILLAGE;
      }
    }
    if (villages.length < TOTAL_VILLAGES) {
      for (const c of beachCandidates) {
        if (villages.length >= TOTAL_VILLAGES) break;
        if (world[c.y][c.x] !== T_VILLAGE &&
            villages.every(v => Math.hypot(v.x - c.x, v.y - c.y) > 5)) {
          villages.push({ x: c.x, y: c.y, tradesLeft: TRADES_PER_VILLAGE });
          world[c.y][c.x] = T_VILLAGE;
        }
      }
    }

    // Ruins
    shuffle(inlandCandidates);
    for (const c of inlandCandidates) {
      if (ruins.length >= TOTAL_RUINS) break;
      const farFromVillage = villages.every(v => Math.hypot(v.x - c.x, v.y - c.y) > 6);
      const farFromRuin = ruins.every(r => Math.hypot(r.x - c.x, r.y - c.y) > 7);
      if (farFromVillage && farFromRuin && world[c.y][c.x] !== T_VILLAGE) {
        ruins.push({ x: c.x, y: c.y, found: false });
        world[c.y][c.x] = T_RUIN;
      }
    }
    if (ruins.length < TOTAL_RUINS) {
      for (const c of inlandCandidates) {
        if (ruins.length >= TOTAL_RUINS) break;
        if (world[c.y][c.x] === T_GRASS || world[c.y][c.x] === T_FOREST) {
          ruins.push({ x: c.x, y: c.y, found: false });
          world[c.y][c.x] = T_RUIN;
        }
      }
    }

    if (villages.length < TOTAL_VILLAGES || ruins.length < TOTAL_RUINS) {
      return false;
    }

    // Spawn on a beach on the main island, ideally near a corner for visual variety.
    const spawnPool = beachCandidates.filter(c => world[c.y][c.x] === T_BEACH);
    const spawnList = spawnPool.length ? spawnPool : mainIsland.filter(c => isLand(world[c.y][c.x]));
    if (spawnList.length === 0) return false;
    const spawn = spawnList[Math.floor(Math.random() * spawnList.length)];
    player = { x: spawn.x + 0.5, y: spawn.y + 0.5 };
    revealAround(player.x, player.y);
    return true;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function revealAround(px, py) {
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    for (let dy = -REVEAL_RADIUS; dy <= REVEAL_RADIUS; dy++) {
      for (let dx = -REVEAL_RADIUS; dx <= REVEAL_RADIUS; dx++) {
        if (dx * dx + dy * dy > REVEAL_RADIUS * REVEAL_RADIUS) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H) {
          discovered[y][x] = true;
        }
      }
    }
  }

  // ─── Game flow ───────────────────────────────────────────────────────────
  function newGame() {
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      generateTerrain();
      ok = placeFeatures();
    }
    if (!ok) {
      // Last-resort: keep the final world even if it's awkward.
      // This basically never happens with 30 attempts.
      generateTerrain();
      placeFeatures();
    }
    resources = { provisions: 100, gold: 30, ruinsFound: 0 };
    daysPassed = 0;
    camera = { x: player.x - VIEW_W / 2, y: player.y - VIEW_H / 2 };
    gameStatus = 'playing';
    dialogOpen = false;
    lastDialogTile = null;
    hideOverlay();
    hideDialog();
    updateHud();
  }

  function showOverlay(title, msg, btnText, onBtn) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlayBtn.textContent = btnText;
    overlayBtn.onclick = onBtn;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  function showDialog(title, msg, actions) {
    dialogTitle.textContent = title;
    dialogMsg.textContent = msg;
    dialogActions.innerHTML = '';
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.textContent = a.label;
      if (a.cancel) btn.className = 'cancel';
      btn.onclick = () => {
        a.onClick();
      };
      dialogActions.appendChild(btn);
    }
    dialog.classList.remove('hidden');
    dialogOpen = true;
  }
  function hideDialog() {
    dialog.classList.add('hidden');
    dialogOpen = false;
  }

  function updateHud() {
    provEl.textContent = Math.ceil(resources.provisions);
    goldEl.textContent = resources.gold;
    ruinsEl.textContent = resources.ruinsFound;
    daysEl.textContent = daysPassed;
  }

  function onEnterTile(tx, ty) {
    if (lastDialogTile && lastDialogTile.x === tx && lastDialogTile.y === ty) return;
    const t = world[ty][tx];
    if (t === T_VILLAGE) {
      lastDialogTile = { x: tx, y: ty };
      openVillageDialog(tx, ty);
    } else if (t === T_RUIN) {
      lastDialogTile = { x: tx, y: ty };
      discoverRuin(tx, ty);
    }
  }

  function openVillageDialog(tx, ty) {
    const v = villages.find(v => v.x === tx && v.y === ty);
    if (!v) return;
    const canTrade = v.tradesLeft > 0 && resources.gold >= GOLD_PER_TRADE;
    const msg = v.tradesLeft > 0
      ? `A small settlement. They'll trade ${PROVISIONS_PER_TRADE} provisions for ${GOLD_PER_TRADE} gold. (${v.tradesLeft} trades left.)`
      : 'The villagers have nothing more to spare. Safe travels.';
    const actions = [];
    if (canTrade) {
      actions.push({
        label: `Trade (${GOLD_PER_TRADE}g → ${PROVISIONS_PER_TRADE}p)`,
        onClick: () => {
          resources.gold -= GOLD_PER_TRADE;
          resources.provisions = Math.min(150, resources.provisions + PROVISIONS_PER_TRADE);
          v.tradesLeft--;
          updateHud();
          openVillageDialog(tx, ty);
        },
      });
    }
    actions.push({ label: 'Move on', cancel: true, onClick: () => hideDialog() });
    showDialog('Village', msg, actions);
  }

  function discoverRuin(tx, ty) {
    const r = ruins.find(r => r.x === tx && r.y === ty);
    if (!r || r.found) return;
    r.found = true;
    resources.ruinsFound++;
    resources.gold += RUIN_GOLD_REWARD;
    world[ty][tx] = T_RUIN_FOUND;
    updateHud();
    const remaining = TOTAL_RUINS - resources.ruinsFound;
    if (remaining === 0) {
      gameStatus = 'won';
      showOverlay(
        'All ruins found!',
        `You charted the island in ${daysPassed} days with ${Math.ceil(resources.provisions)} provisions to spare.`,
        'New Island',
        newGame,
      );
    } else {
      showDialog(
        'Lost Ruin Discovered',
        `An overgrown ruin marked on your map. +${RUIN_GOLD_REWARD} gold. ${remaining} more to find.`,
        [{ label: 'Onward', cancel: true, onClick: () => hideDialog() }],
      );
    }
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  function update(dt) {
    if (gameStatus !== 'playing' || dialogOpen) return;

    const { dx, dy } = inputVec();
    if (dx || dy) {
      const onForest = world[Math.floor(player.y)][Math.floor(player.x)] === T_FOREST;
      const speed = MOVE_SPEED * (onForest ? FOREST_SPEED_MULT : 1);
      let nx = player.x + dx * speed * dt;
      let ny = player.y + dy * speed * dt;
      nx = Math.max(0.4, Math.min(WORLD_W - 0.4, nx));
      ny = Math.max(0.4, Math.min(WORLD_H - 0.4, ny));

      const ocol = Math.floor(player.x);
      const orow = Math.floor(player.y);
      const fcol = Math.floor(nx);
      const frow = Math.floor(ny);

      // 1. Try full diagonal: if the destination tile is passable, just go.
      if (isPassable(world[frow][fcol])) {
        player.x = nx;
        player.y = ny;
      } else {
        // 2. Slide: which axis-only move is allowed?
        const xpass = isPassable(world[orow][fcol]);
        const ypass = isPassable(world[frow][ocol]);
        if (xpass && !ypass) {
          player.x = nx;
        } else if (ypass && !xpass) {
          player.y = ny;
        } else if (xpass && ypass) {
          // Both axis tiles open but the diagonal is blocked — slide along
          // the dominant input direction.
          if (Math.abs(dx) >= Math.abs(dy)) player.x = nx;
          else player.y = ny;
        }
        // else: outer corner, no movement
      }

      revealAround(player.x, player.y);

      const fx = Math.floor(player.x);
      const fy = Math.floor(player.y);
      if (!lastDialogTile || lastDialogTile.x !== fx || lastDialogTile.y !== fy) {
        if (lastDialogTile && (world[fy][fx] !== T_VILLAGE && world[fy][fx] !== T_RUIN)) {
          lastDialogTile = null;
        }
        onEnterTile(fx, fy);
      }
    }

    // Camera follows player
    const targetCamX = player.x - VIEW_W / 2;
    const targetCamY = player.y - VIEW_H / 2;
    camera.x += (targetCamX - camera.x) * Math.min(1, dt * 6);
    camera.y += (targetCamY - camera.y) * Math.min(1, dt * 6);
    camera.x = Math.max(0, Math.min(WORLD_W - VIEW_W, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_H - VIEW_H, camera.y));

    // Provisions drain
    resources.provisions -= PROV_DRAIN_RATE * dt;
    daysPassed = Math.floor((100 - resources.provisions + (resources.ruinsFound * 0)) / 8);
    // Simpler day counter: track real time since start
    daysPassed = Math.floor(totalElapsed);

    if (resources.provisions <= 0) {
      resources.provisions = 0;
      gameStatus = 'lost';
      showOverlay(
        'Provisions ran out',
        `You found ${resources.ruinsFound} of ${TOTAL_RUINS} ruins before the party gave up.`,
        'Try Again',
        newGame,
      );
    }
    updateHud();
  }

  let totalElapsed = 0;

  // ─── Rendering ───────────────────────────────────────────────────────────
  function draw() {
    drawTerrain();
    drawPlayer();
    drawMinimap();
  }

  function drawTerrain() {
    const camX = Math.floor(camera.x * TILE);
    const camY = Math.floor(camera.y * TILE);
    ctx.fillStyle = '#082030';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    for (let vy = -1; vy < VIEW_H + 1; vy++) {
      for (let vx = -1; vx < VIEW_W + 1; vx++) {
        const wx = Math.floor(camera.x) + vx;
        const wy = Math.floor(camera.y) + vy;
        if (wx < 0 || wx >= WORLD_W || wy < 0 || wy >= WORLD_H) continue;
        const px = wx * TILE - camX;
        const py = wy * TILE - camY;
        if (!discovered[wy][wx]) {
          ctx.fillStyle = '#000';
          ctx.fillRect(px, py, TILE, TILE);
          continue;
        }
        drawTile(px, py, world[wy][wx], wx, wy);
      }
    }

    // Soft fog edge around undiscovered tiles
    for (let vy = -1; vy < VIEW_H + 1; vy++) {
      for (let vx = -1; vx < VIEW_W + 1; vx++) {
        const wx = Math.floor(camera.x) + vx;
        const wy = Math.floor(camera.y) + vy;
        if (wx < 0 || wx >= WORLD_W || wy < 0 || wy >= WORLD_H) continue;
        if (discovered[wy][wx]) continue;
        // Adjacent to a discovered tile? Draw soft edge.
        const adj =
          (wy > 0 && discovered[wy - 1][wx]) ||
          (wy < WORLD_H - 1 && discovered[wy + 1][wx]) ||
          (wx > 0 && discovered[wy][wx - 1]) ||
          (wx < WORLD_W - 1 && discovered[wy][wx + 1]);
        if (adj) {
          const px = wx * TILE - camX;
          const py = wy * TILE - camY;
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
  }

  function drawTile(px, py, t, wx, wy) {
    switch (t) {
      case T_DEEP:
        ctx.fillStyle = '#0c2a40';
        ctx.fillRect(px, py, TILE, TILE);
        // wave specks
        const w1 = ((wx * 7 + wy * 13) % 4);
        if (w1 === 0) {
          ctx.fillStyle = 'rgba(120,180,220,0.15)';
          ctx.fillRect(px + 6, py + 10, 6, 1);
        }
        break;
      case T_SHALLOW:
        ctx.fillStyle = '#1a567a';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(140,200,230,0.12)';
        ctx.fillRect(px + 4, py + 16, 8, 1);
        break;
      case T_BEACH:
        ctx.fillStyle = '#e8d09a';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#d4b878';
        ctx.fillRect(px + ((wx * 5) % TILE), py + ((wy * 7) % TILE), 2, 2);
        break;
      case T_GRASS:
        ctx.fillStyle = '#4a8438';
        ctx.fillRect(px, py, TILE, TILE);
        // tuft
        const tuftPattern = (wx * 3 + wy * 5) % 5;
        if (tuftPattern === 0) {
          ctx.fillStyle = '#5fa040';
          ctx.fillRect(px + 5, py + 8, 2, 2);
          ctx.fillRect(px + 14, py + 16, 2, 2);
        }
        break;
      case T_FOREST:
        ctx.fillStyle = '#2c5a28';
        ctx.fillRect(px, py, TILE, TILE);
        // tree trunks/canopies
        ctx.fillStyle = '#1c3818';
        ctx.fillRect(px + 4, py + 4, 6, 8);
        ctx.fillRect(px + 14, py + 12, 6, 8);
        ctx.fillStyle = '#3e7838';
        ctx.fillRect(px + 5, py + 5, 4, 6);
        ctx.fillRect(px + 15, py + 13, 4, 6);
        break;
      case T_MOUNTAIN:
        ctx.fillStyle = '#6e6b66';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#8a877f';
        ctx.beginPath();
        ctx.moveTo(px + 2, py + TILE - 2);
        ctx.lineTo(px + TILE / 2, py + 4);
        ctx.lineTo(px + TILE - 2, py + TILE - 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#dcdacf';
        ctx.beginPath();
        ctx.moveTo(px + TILE / 2 - 4, py + 8);
        ctx.lineTo(px + TILE / 2, py + 4);
        ctx.lineTo(px + TILE / 2 + 4, py + 8);
        ctx.closePath();
        ctx.fill();
        break;
      case T_VILLAGE:
        ctx.fillStyle = '#4a8438';
        ctx.fillRect(px, py, TILE, TILE);
        // house roof
        ctx.fillStyle = '#a85822';
        ctx.fillRect(px + 4, py + 6, TILE - 8, 6);
        ctx.beginPath();
        ctx.moveTo(px + 3, py + 7);
        ctx.lineTo(px + TILE / 2, py + 2);
        ctx.lineTo(px + TILE - 3, py + 7);
        ctx.closePath();
        ctx.fill();
        // wall
        ctx.fillStyle = '#d8c298';
        ctx.fillRect(px + 6, py + 12, TILE - 12, 8);
        // door
        ctx.fillStyle = '#3a2a14';
        ctx.fillRect(px + TILE / 2 - 2, py + 14, 4, 6);
        break;
      case T_RUIN:
        ctx.fillStyle = '#2c5a28';
        ctx.fillRect(px, py, TILE, TILE);
        // hidden — looks like overgrown stone
        ctx.fillStyle = '#5a6258';
        ctx.fillRect(px + 5, py + 8, 4, 10);
        ctx.fillRect(px + 12, py + 6, 5, 12);
        ctx.fillStyle = '#3a4538';
        ctx.fillRect(px + 6, py + 11, 2, 4);
        break;
      case T_RUIN_FOUND:
        ctx.fillStyle = '#2c5a28';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#d9a05b';
        ctx.fillRect(px + 5, py + 8, 4, 10);
        ctx.fillRect(px + 12, py + 6, 5, 12);
        ctx.fillStyle = '#fbd084';
        ctx.fillRect(px + 6, py + 9, 2, 3);
        // marker dot
        ctx.fillStyle = '#ffd066';
        ctx.beginPath();
        ctx.arc(px + TILE - 5, py + 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  function drawPlayer() {
    const px = (player.x - camera.x) * TILE;
    const py = (player.y - camera.y) * TILE;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px, py + 8, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = '#6a4a28';
    ctx.fillRect(px - 5, py - 2, 10, 9);
    // head
    ctx.fillStyle = '#e6c39a';
    ctx.fillRect(px - 4, py - 9, 8, 7);
    // hat
    ctx.fillStyle = '#3a2a14';
    ctx.fillRect(px - 6, py - 12, 12, 4);
    ctx.fillRect(px - 4, py - 13, 8, 2);
    // pack
    ctx.fillStyle = '#a76a32';
    ctx.fillRect(px - 7, py - 1, 3, 6);
    // eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(px - 2, py - 6, 1, 2);
    ctx.fillRect(px + 1, py - 6, 1, 2);
  }

  function drawMinimap() {
    const mmW = 90;
    const mmH = Math.floor(mmW * WORLD_H / WORLD_W);
    const mmX = CANVAS_W - mmW - 8;
    const mmY = 8;
    const sx = mmW / WORLD_W;
    const sy = mmH / WORLD_H;

    // bg
    ctx.fillStyle = 'rgba(8, 18, 28, 0.85)';
    ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
    ctx.strokeStyle = '#3a3528';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);

    // tiles
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        if (!discovered[y][x]) continue;
        const t = world[y][x];
        let c;
        if (t === T_DEEP) c = '#0c2a40';
        else if (t === T_SHALLOW) c = '#1a567a';
        else if (t === T_BEACH) c = '#e8d09a';
        else if (t === T_GRASS) c = '#4a8438';
        else if (t === T_FOREST) c = '#2c5a28';
        else if (t === T_MOUNTAIN) c = '#8a877f';
        else if (t === T_VILLAGE) c = '#e8a050';
        else if (t === T_RUIN) c = '#5a6258';
        else if (t === T_RUIN_FOUND) c = '#ffd066';
        else c = '#000';
        ctx.fillStyle = c;
        ctx.fillRect(Math.floor(mmX + x * sx), Math.floor(mmY + y * sy), Math.ceil(sx), Math.ceil(sy));
      }
    }
    // player dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(mmX + player.x * sx, mmY + player.y * sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── Loop ────────────────────────────────────────────────────────────────
  function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (gameStatus === 'playing' && !dialogOpen) totalElapsed += dt;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  restartBtn.addEventListener('click', newGame);

  // Boot
  newGame();
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
