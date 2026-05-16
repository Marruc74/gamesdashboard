(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');

  // ── Difficulty configs ────────────────────────────────────────────────────

  const DIFF_CONFIGS = {
    easy: {
      name: 'Easy',
      cols: 11, rows: 8, cell: 44,
      startGold: 200, startLives: 25, totalWaves: 12,
      enemyMult: 0.75, spawnMult: 0.7,
      // S-curve: entry left row 4, exit right row 3
      waypoints: [[-1,4],[2,4],[2,1],[6,1],[6,6],[9,6],[9,3],[11,3]],
    },
    medium: {
      name: 'Medium',
      cols: 13, rows: 10, cell: 40,
      startGold: 150, startLives: 20, totalWaves: 15,
      enemyMult: 1.0, spawnMult: 1.0,
      // S-curve: entry left row 5, exit right row 3
      waypoints: [[-1,5],[2,5],[2,1],[7,1],[7,8],[11,8],[11,3],[13,3]],
    },
    hard: {
      name: 'Hard',
      cols: 17, rows: 12, cell: 34,
      startGold: 120, startLives: 15, totalWaves: 20,
      enemyMult: 1.3, spawnMult: 1.5,
      // Extended S-curve: entry left row 6, exit right row 4, longer path
      waypoints: [[-1,6],[3,6],[3,1],[9,1],[9,10],[14,10],[14,4],[17,4]],
    },
  };

  // Dynamic globals — set by applyDiff()
  let CELL, COLS, ROWS, WP, PATH_CELLS, diffConfig;

  function applyDiff(key) {
    const d = DIFF_CONFIGS[key];
    diffConfig = d;
    CELL = d.cell;
    COLS = d.cols;
    ROWS = d.rows;

    WP = d.waypoints.map(([c, r]) => ({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL }));

    PATH_CELLS = new Set();
    for (let i = 0; i < d.waypoints.length - 1; i++) {
      const [c1, r1] = d.waypoints[i], [c2, r2] = d.waypoints[i + 1];
      if (c1 === c2) {
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
          if (c1 >= 0 && c1 < COLS && r >= 0 && r < ROWS) PATH_CELLS.add(`${c1},${r}`);
      } else {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++)
          if (c >= 0 && c < COLS && r1 >= 0 && r1 < ROWS) PATH_CELLS.add(`${c},${r1}`);
      }
    }

    canvas.width  = COLS * CELL;
    canvas.height = ROWS * CELL;
    document.getElementById('total-waves').textContent = d.totalWaves;
  }

  // ── Tower / enemy definitions ─────────────────────────────────────────────

  const T_DEFS = {
    gun: {
      name: 'Gun', label: 'GUN', cost: 50, color: '#3ddc97',
      levels: [
        { dmg: 12, rate: 2.0, range: 2.5, upgCost: 60 },
        { dmg: 22, rate: 2.6, range: 3.0, upgCost: 80 },
        { dmg: 36, rate: 3.4, range: 3.5, upgCost: null },
      ],
    },
    sniper: {
      name: 'Sniper', label: 'SNP', cost: 80, color: '#ffd93d',
      levels: [
        { dmg: 55,  rate: 0.7,  range: 5.5, upgCost: 90  },
        { dmg: 90,  rate: 0.85, range: 6.5, upgCost: 110 },
        { dmg: 140, rate: 1.0,  range: 8.0, upgCost: null },
      ],
    },
    frost: {
      name: 'Frost', label: 'ICE', cost: 65, color: '#00d4ff',
      levels: [
        { dmg: 6,  rate: 1.0, range: 2.5, slow: 0.45, upgCost: 70  },
        { dmg: 10, rate: 1.3, range: 3.0, slow: 0.60, upgCost: 90  },
        { dmg: 15, rate: 1.6, range: 3.5, slow: 0.75, upgCost: null },
      ],
    },
    bomb: {
      name: 'Bomb', label: 'BOM', cost: 110, color: '#ff9f43',
      levels: [
        { dmg: 40,  rate: 0.5,  range: 3.0, aoe: 1.5, upgCost: 120  },
        { dmg: 65,  rate: 0.65, range: 3.5, aoe: 2.0, upgCost: 145  },
        { dmg: 100, rate: 0.8,  range: 4.0, aoe: 2.5, upgCost: null },
      ],
    },
  };

  const E_DEFS = {
    grunt:  { hp: 80,   speed: 70,  reward: 5,  color: '#ff5d6c', r: 7  },
    runner: { hp: 45,   speed: 130, reward: 8,  color: '#ff9f43', r: 5  },
    tank:   { hp: 400,  speed: 35,  reward: 20, color: '#c77dff', r: 12 },
    boss:   { hp: 1500, speed: 25,  reward: 50, color: '#ff3838', r: 16 },
  };

  // ── Game state ────────────────────────────────────────────────────────────

  let gold, lives, wave, phase;
  let towers = [], enemies = [], projectiles = [], particles = [];
  let spawnQueue = [], spawnTimer = 0;
  let waveEnemyTotal = 0, waveEnemyDone = 0;
  let selectedType, selectedTower, hoverCell;

  // DOM refs
  const livesEl      = document.getElementById('lives');
  const goldEl       = document.getElementById('gold');
  const waveEl       = document.getElementById('wave-num');
  const wpText       = document.getElementById('wp-text');
  const wpFill       = document.getElementById('wp-fill');
  const waveBtn      = document.getElementById('wave-btn');
  const tiBody       = document.getElementById('ti-body');
  const towerInfo    = document.getElementById('tower-info');
  const overlay      = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg   = document.getElementById('overlay-msg');
  const overlayBtn   = document.getElementById('overlay-btn');
  const diffOverlay  = document.getElementById('diff-overlay');

  const tStats = t => T_DEFS[t.type].levels[t.level];

  // ── Init ──────────────────────────────────────────────────────────────────

  function reset() {
    gold = diffConfig.startGold;
    lives = diffConfig.startLives;
    wave = 0; phase = 'prep';
    towers = []; enemies = []; projectiles = []; particles = [];
    spawnQueue = []; spawnTimer = 0;
    waveEnemyTotal = 0; waveEnemyDone = 0;
    selectedType = null; selectedTower = null; hoverCell = null;
    overlay.classList.add('hidden');
    waveBtn.textContent = 'Start Wave 1';
    waveBtn.disabled = false;
    updateHUD();
    updateWaveProgress();
    refreshTowerInfo();
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  function updateHUD() {
    livesEl.textContent = lives;
    goldEl.textContent  = gold;
    waveEl.textContent  = wave;
    document.querySelectorAll('.tower-btn').forEach(btn => {
      btn.classList.toggle('unaffordable', gold < T_DEFS[btn.dataset.type].cost);
    });
  }

  function updateWaveProgress() {
    if (!diffConfig) {
      wpText.textContent = 'Select a difficulty to start';
      wpFill.style.width = '0%';
      return;
    }
    const total = diffConfig.totalWaves;

    if (phase === 'prep' && wave === 0) {
      wpText.textContent = 'Ready — send the first wave';
      wpFill.style.width = '0%';
      wpFill.style.background = '';
      return;
    }

    if (phase === 'prep') {
      const left = total - wave;
      wpText.textContent = `Wave ${wave}/${total} complete${left > 0 ? ` — ${left} wave${left > 1 ? 's' : ''} remaining` : ''}`;
      wpFill.style.width = `${(wave / total) * 100}%`;
      wpFill.style.background = '#5ddb6f';
      return;
    }

    if (phase === 'wave') {
      const pct = waveEnemyTotal > 0 ? waveEnemyDone / waveEnemyTotal : 0;
      wpText.textContent = `Wave ${wave}/${total} — ${waveEnemyDone} / ${waveEnemyTotal} enemies cleared`;
      wpFill.style.width = `${pct * 100}%`;
      wpFill.style.background = pct < 0.5 ? '#dc2626' : pct < 0.85 ? '#ffd93d' : '#5ddb6f';
    }
  }

  function refreshTowerInfo() {
    if (!selectedTower) {
      towerInfo.classList.add('hidden');
      return;
    }
    towerInfo.classList.remove('hidden');
    const def   = T_DEFS[selectedTower.type];
    const st    = tStats(selectedTower);
    const lvl   = selectedTower.level;
    const isMax = st.upgCost === null;
    const sell  = Math.floor(selectedTower.spent * 0.5);
    const canUpg = !isMax && gold >= st.upgCost;

    tiBody.innerHTML = `
      <div class="ti-header">
        <span style="color:${def.color}">${def.name}</span>
        <span class="ti-badge">${isMax ? 'MAX' : `Lv${lvl + 1}`}</span>
      </div>
      <div class="ti-stats">
        <div>DMG <b>${st.dmg}</b></div>
        <div>Rate <b>${st.rate}/s</b></div>
        <div>Range <b>${st.range}</b></div>
        ${st.slow ? `<div>Slow <b>${Math.round(st.slow * 100)}%</b></div>` : ''}
        ${st.aoe  ? `<div>AoE <b>${st.aoe}</b></div>` : ''}
      </div>
      <div class="ti-actions">
        ${!isMax ? `<button class="btn-upgrade" id="btn-upg" ${canUpg ? '' : 'disabled'}>Upgrade ${st.upgCost}g</button>` : ''}
        <button class="btn-sell" id="btn-sell">Sell ${sell}g</button>
      </div>`;

    document.getElementById('btn-sell').addEventListener('click', sellTower);
    if (!isMax) document.getElementById('btn-upg').addEventListener('click', upgradeTower);
  }

  // ── Tower actions ──────────────────────────────────────────────────────────

  function upgradeTower() {
    if (!selectedTower) return;
    const st = tStats(selectedTower);
    if (!st.upgCost || gold < st.upgCost) return;
    gold -= st.upgCost;
    selectedTower.spent += st.upgCost;
    selectedTower.level++;
    updateHUD();
    refreshTowerInfo();
  }

  function sellTower() {
    if (!selectedTower) return;
    gold += Math.floor(selectedTower.spent * 0.5);
    towers = towers.filter(t => t !== selectedTower);
    selectedTower = null;
    updateHUD();
    refreshTowerInfo();
  }

  // ── Waves ─────────────────────────────────────────────────────────────────

  function buildWave(waveNum, eMult, sMult) {
    const entries = [];
    const hpMult  = (1 + (waveNum - 1) * 0.18) * eMult;
    let t = 0;

    const gCount = Math.round((4 + waveNum * 2) * sMult);
    for (let i = 0; i < gCount; i++) { entries.push({ type: 'grunt', at: t, hpMult }); t += 1.4; }

    if (waveNum >= 3) {
      const rStart = t * 0.5;
      const rCount = Math.round((2 + Math.floor(waveNum / 2)) * sMult);
      for (let i = 0; i < rCount; i++) entries.push({ type: 'runner', at: rStart + i * 0.85, hpMult });
    }

    if (waveNum >= 5) {
      const tStart = t + 1.5;
      const tCount = Math.round((1 + Math.floor((waveNum - 4) / 2)) * sMult);
      for (let i = 0; i < tCount; i++) entries.push({ type: 'tank', at: tStart + i * 3, hpMult });
      t = tStart + tCount * 3;
    }

    if (waveNum >= 10) {
      entries.push({ type: 'boss', at: t + 2, hpMult: hpMult * 1.5 });
    }

    return entries.sort((a, b) => a.at - b.at);
  }

  function startWave() {
    if (phase !== 'prep') return;
    wave++;
    phase = 'wave';
    waveBtn.disabled = true;
    waveBtn.textContent = `Wave ${wave} in progress…`;
    spawnQueue = buildWave(wave, diffConfig.enemyMult, diffConfig.spawnMult);
    spawnTimer = 0;
    waveEnemyTotal = spawnQueue.length;
    waveEnemyDone  = 0;
    updateHUD();
    updateWaveProgress();
  }

  function spawnEnemy(type, hpMult) {
    const def = E_DEFS[type];
    const hp  = def.hp * hpMult;
    const r   = Math.round(def.r * CELL / 40);
    enemies.push({
      type, hp, maxHp: hp,
      baseSpeed: def.speed, reward: def.reward,
      color: def.color, r,
      segIdx: 0, segProgress: 0,
      x: WP[0].x, y: WP[0].y,
      slow: 0, slowTimer: 0,
      dead: false,
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  function updateSpawner(dt) {
    if (spawnQueue.length === 0) return;
    spawnTimer += dt;
    while (spawnQueue.length > 0 && spawnTimer >= spawnQueue[0].at) {
      const e = spawnQueue.shift();
      spawnEnemy(e.type, e.hpMult);
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (e.dead) continue;

      if (e.slowTimer > 0) { e.slowTimer -= dt; if (e.slowTimer <= 0) e.slow = 0; }

      let toMove = e.baseSpeed * (1 - e.slow) * dt;
      while (toMove > 0 && e.segIdx < WP.length - 1) {
        const from = WP[e.segIdx], to = WP[e.segIdx + 1];
        const segLen = Math.hypot(to.x - from.x, to.y - from.y);
        const rem    = segLen - e.segProgress;
        if (toMove < rem) { e.segProgress += toMove; toMove = 0; }
        else              { toMove -= rem; e.segIdx++; e.segProgress = 0; }
      }

      if (e.segIdx >= WP.length - 1) {
        e.dead = true;
        lives = Math.max(0, lives - 1);
        waveEnemyDone++;
        updateHUD();
        updateWaveProgress();
        if (lives <= 0) { gameOver(); return; }
        continue;
      }

      const from = WP[e.segIdx], to = WP[e.segIdx + 1];
      const segLen = Math.hypot(to.x - from.x, to.y - from.y);
      const frac   = segLen > 0 ? e.segProgress / segLen : 0;
      e.x = from.x + (to.x - from.x) * frac;
      e.y = from.y + (to.y - from.y) * frac;
    }
  }

  function updateTowers(dt) {
    for (const t of towers) {
      t.cooldown = Math.max(0, (t.cooldown || 0) - dt);
      if (t.cooldown > 0) continue;
      const st     = tStats(t);
      const target = findTarget(t, st.range * CELL);
      if (!target) continue;
      t.cooldown = 1 / st.rate;
      fireAt(t, target, st);
    }
  }

  function findTarget(tower, rangePx) {
    const cx = (tower.col + 0.5) * CELL, cy = (tower.row + 0.5) * CELL;
    const r2 = rangePx * rangePx;
    let best = null, bestProg = -1;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - cx, dy = e.y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const prog = e.segIdx * 1e6 + e.segProgress;
      if (prog > bestProg) { bestProg = prog; best = e; }
    }
    return best;
  }

  function fireAt(tower, target, st) {
    const cx = (tower.col + 0.5) * CELL, cy = (tower.row + 0.5) * CELL;
    projectiles.push({
      x: cx, y: cy, target,
      dmg: st.dmg, slow: st.slow || 0, aoe: st.aoe || 0,
      color: T_DEFS[tower.type].color,
      speed: tower.type === 'bomb' ? 200 : 360,
      dead: false,
    });
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      if (p.dead) continue;
      const t = p.target;
      if (!t || t.dead) { p.dead = true; continue; }

      const dx = t.x - p.x, dy = t.y - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step + 5) {
        if (p.aoe > 0) {
          doAoe(t.x, t.y, p.dmg, p.aoe * CELL);
          addParticle(t.x, t.y, p.aoe * CELL, p.color);
        } else {
          t.hp -= p.dmg;
          if (p.slow) { t.slow = p.slow; t.slowTimer = 2.0; }
          if (t.hp <= 0) killEnemy(t);
        }
        p.dead = true;
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
  }

  function doAoe(cx, cy, dmg, radiusPx) {
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - cx, dy = e.y - cy;
      if (dx * dx + dy * dy <= radiusPx * radiusPx) {
        e.hp -= dmg;
        if (e.hp <= 0) killEnemy(e);
      }
    }
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    gold += e.reward;
    waveEnemyDone++;
    updateHUD();
    updateWaveProgress();
    if (selectedTower) refreshTowerInfo();
    addParticle(e.x, e.y, e.r * 1.8, e.color);
  }

  function addParticle(x, y, r, color) {
    particles.push({ x, y, r, color, life: 0.35 });
  }

  function updateParticles(dt) {
    for (const p of particles) p.life -= dt;
    particles = particles.filter(p => p.life > 0);
  }

  function checkWaveEnd() {
    if (phase !== 'wave') return;
    if (spawnQueue.length > 0) return;
    if (enemies.some(e => !e.dead)) return;
    phase = 'prep';
    if (wave >= diffConfig.totalWaves) {
      showVictory();
    } else {
      updateWaveProgress();
      waveBtn.textContent = `Start Wave ${wave + 1}`;
      waveBtn.disabled = false;
    }
  }

  function gameOver() {
    phase = 'gameover';
    overlayTitle.textContent = 'Base Overrun';
    overlayMsg.textContent   = `You survived ${wave} wave${wave !== 1 ? 's' : ''} on ${diffConfig.name}. Good fight.`;
    overlayBtn.textContent   = 'Try Again';
    overlay.classList.remove('hidden');
  }

  function showVictory() {
    phase = 'victory';
    overlayTitle.textContent = 'Outpost Secured!';
    overlayMsg.textContent   = `All ${diffConfig.totalWaves} waves repelled on ${diffConfig.name} with ${lives} lives remaining.`;
    overlayBtn.textContent   = 'Play Again';
    overlay.classList.remove('hidden');
  }

  function showDiffOverlay() {
    overlay.classList.add('hidden');
    diffOverlay.classList.remove('hidden');
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!diffConfig) return;
    drawGrid();
    drawTowers();
    if (selectedType && hoverCell) drawGhost();
    if (selectedTower) drawRange(selectedTower);
    drawEnemies();
    drawProjectiles();
    drawParticles();
    drawLabels();
  }

  function drawGrid() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const isPath = PATH_CELLS.has(`${c},${r}`);
        ctx.fillStyle   = isPath ? '#a06830' : '#1e2535';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        ctx.strokeStyle = isPath ? 'rgba(220,160,70,0.6)' : 'rgba(255,255,255,0.10)';
        ctx.strokeRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1);
      }
    }
    if (hoverCell && selectedType) {
      const { col, row } = hoverCell;
      const blocked = PATH_CELLS.has(`${col},${row}`) || towers.some(t => t.col === col && t.row === row);
      ctx.fillStyle = blocked ? 'rgba(255,60,60,0.18)' : 'rgba(255,255,255,0.09)';
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
  }

  function drawTowers() {
    for (const t of towers) {
      const def = T_DEFS[t.type];
      const sel = t === selectedTower;
      const x   = t.col * CELL, y = t.row * CELL;
      const cx  = x + CELL / 2, cy = y + CELL / 2;
      const pad = Math.max(3, Math.round(CELL * 0.1));

      ctx.fillStyle = sel ? def.color : dimColor(def.color, 0.55);
      ctx.fillRect(x + pad, y + pad, CELL - pad * 2, CELL - pad * 2);

      if (sel) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(x + pad - 1, y + pad - 1, CELL - pad * 2 + 2, CELL - pad * 2 + 2);
        ctx.lineWidth = 1;
      }

      const fs = Math.max(7, Math.round(CELL * 0.22));
      ctx.fillStyle    = sel ? '#000' : 'rgba(0,0,0,0.7)';
      ctx.font         = `bold ${fs}px "SF Mono", Menlo, monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.label, cx, cy - fs * 0.6);
      ctx.fillText(`L${t.level + 1}`, cx, cy + fs * 0.7);
    }
    ctx.textAlign = 'left';
  }

  function drawRange(tower) {
    const def = T_DEFS[tower.type];
    const st  = tStats(tower);
    const cx  = (tower.col + 0.5) * CELL, cy = (tower.row + 0.5) * CELL;
    ctx.beginPath();
    ctx.arc(cx, cy, st.range * CELL, 0, Math.PI * 2);
    ctx.strokeStyle = def.color + '66';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.fillStyle   = def.color + '12';
    ctx.fill();
    ctx.lineWidth = 1;
  }

  function drawGhost() {
    const { col, row } = hoverCell;
    const def     = T_DEFS[selectedType];
    const blocked = PATH_CELLS.has(`${col},${row}`) || towers.some(t => t.col === col && t.row === row);
    const pad     = Math.max(3, Math.round(CELL * 0.1));
    ctx.globalAlpha = 0.45;
    ctx.fillStyle   = blocked ? '#ff4444' : def.color;
    ctx.fillRect(col * CELL + pad, row * CELL + pad, CELL - pad * 2, CELL - pad * 2);
    if (!blocked) {
      ctx.beginPath();
      ctx.arc((col + 0.5) * CELL, (row + 0.5) * CELL, def.levels[0].range * CELL, 0, Math.PI * 2);
      ctx.strokeStyle = def.color + 'aa';
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth   = 1;
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (e.dead) continue;

      ctx.shadowColor = e.slow > 0 ? '#00d4ff' : 'transparent';
      ctx.shadowBlur  = e.slow > 0 ? 8 : 0;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = e.color;
      ctx.fill();
      ctx.shadowBlur = 0;

      const bw = e.r * 2.6, bh = Math.max(3, Math.round(e.r * 0.5));
      const bx = e.x - bw / 2, by = e.y - e.r - bh - 3;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(bx, by, bw, bh);
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = pct > 0.5 ? '#5ddb6f' : pct > 0.25 ? '#ffd93d' : '#ff5d6c';
      ctx.fillRect(bx, by, bw * pct, bh);
    }
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      if (p.dead) continue;
      const r = p.aoe > 0 ? Math.max(4, CELL * 0.12) : Math.max(2, CELL * 0.07);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.35) * 0.65;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + (1 - p.life / 0.35) * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawLabels() {
    const fs = Math.max(9, Math.round(CELL * 0.25));
    ctx.font          = `${fs}px "SF Mono", Menlo, monospace`;
    ctx.textBaseline  = 'middle';
    ctx.fillStyle     = '#5ddb6f';
    ctx.textAlign     = 'left';
    ctx.fillText('IN',  3, WP[0].y);
    ctx.fillStyle     = '#ff5d6c';
    ctx.textAlign     = 'right';
    ctx.fillText('OUT', canvas.width - 3, WP[WP.length - 1].y);
    ctx.textAlign     = 'left';
  }

  function dimColor(hex, f) {
    const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
    return `rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`;
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  canvas.addEventListener('mousemove', e => {
    if (!diffConfig) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const col = Math.floor((e.clientX - rect.left) * sx / CELL);
    const row = Math.floor((e.clientY - rect.top)  * sy / CELL);
    hoverCell = (col >= 0 && col < COLS && row >= 0 && row < ROWS) ? { col, row } : null;
  });

  canvas.addEventListener('mouseleave', () => { hoverCell = null; });

  canvas.addEventListener('click', e => {
    if (!diffConfig || phase === 'gameover' || phase === 'victory') return;
    const rect = canvas.getBoundingClientRect();
    const sx  = canvas.width / rect.width, sy = canvas.height / rect.height;
    const col = Math.floor((e.clientX - rect.left) * sx / CELL);
    const row = Math.floor((e.clientY - rect.top)  * sy / CELL);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    const existing = towers.find(t => t.col === col && t.row === row);
    if (existing) {
      selectedTower = existing;
      selectedType  = null;
      document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('active'));
      refreshTowerInfo();
      return;
    }

    if (selectedType && !PATH_CELLS.has(`${col},${row}`)) {
      const def = T_DEFS[selectedType];
      if (gold < def.cost) return;
      gold -= def.cost;
      towers.push({ type: selectedType, level: 0, col, row, cooldown: 0, spent: def.cost });
      selectedType = null; selectedTower = null;
      document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('active'));
      updateHUD();
      refreshTowerInfo();
      return;
    }

    selectedTower = null;
    refreshTowerInfo();
  });

  document.getElementById('tower-btns').addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    const type = btn.dataset.type;
    if (gold < T_DEFS[type].cost) return;
    selectedType  = selectedType === type ? null : type;
    selectedTower = null;
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.toggle('active', b.dataset.type === selectedType));
    refreshTowerInfo();
  });

  waveBtn.addEventListener('click', startWave);

  overlayBtn.addEventListener('click', showDiffOverlay);

  document.getElementById('change-diff-btn').addEventListener('click', showDiffOverlay);

  document.querySelectorAll('[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyDiff(btn.dataset.diff);
      diffOverlay.classList.add('hidden');
      reset();
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    selectedType = null; selectedTower = null;
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('active'));
    refreshTowerInfo();
  });

  // ── Game loop ─────────────────────────────────────────────────────────────

  let lastTime = null;

  function tick(ts) {
    const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;

    if (phase === 'wave') {
      updateSpawner(dt);
      updateEnemies(dt);
      updateTowers(dt);
      updateProjectiles(dt);
      enemies     = enemies.filter(e => !e.dead);
      projectiles = projectiles.filter(p => !p.dead);
      checkWaveEnd();
    }

    updateParticles(dt);
    draw();
    requestAnimationFrame(tick);
  }

  // Start with difficulty overlay visible, no game yet
  updateWaveProgress();
  requestAnimationFrame(tick);
})();
