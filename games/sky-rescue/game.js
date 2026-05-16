(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');
  const statsEl = document.getElementById('stats');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');
  const restartBtn = document.getElementById('restart');

  const VW = canvas.width;       // 800
  const VH = canvas.height;      // 500
  const MW = mini.width;         // 800
  const MH = mini.height;        // 50
  const WORLD_W = 3600;
  const GROUND_Y = 430;
  const TOP_Y = 40;

  const rnd  = n => Math.random() * n;
  const rint = n => Math.floor(Math.random() * n);
  const pick = arr => arr[rint(arr.length)];
  const sign = x => x < 0 ? -1 : 1;

  function wrap(x) {
    x %= WORLD_W;
    if (x < 0) x += WORLD_W;
    return x;
  }
  function wrapDelta(d) {
    if (d >  WORLD_W / 2) d -= WORLD_W;
    if (d < -WORLD_W / 2) d += WORLD_W;
    return d;
  }
  function wrapDist(a, b) { return Math.abs(wrapDelta(a - b)); }

  // --- World state ---
  let player, camera, bullets, foeBullets, enemies, civilians, particles, stars, terrain;
  let score, lives, wave, gameOver, won, paused, warpFlash, waveBanner;
  let civiliansRemaining, civiliansSavedThisWave;
  let keys = Object.create(null);
  let fireCooldown = 0;
  let warpCooldown = 0;
  let last = 0;

  function newGame() {
    player = {
      x: WORLD_W / 2,
      y: VH / 2,
      vx: 0, vy: 0,
      face: 1,
      hit: 0,
      alive: true,
    };
    camera = { x: player.x };
    bullets = [];
    foeBullets = [];
    enemies = [];
    civilians = [];
    particles = [];
    score = 0;
    lives = 3;
    wave = 0;
    gameOver = false;
    won = false;
    paused = false;
    warpFlash = 0;
    waveBanner = 0;

    buildStars();
    buildTerrain();
    spawnCivilians(10);
    nextWave();
    hideOverlay();
  }

  function buildStars() {
    stars = [];
    for (let i = 0; i < 140; i++) {
      stars.push({
        x: rnd(WORLD_W),
        y: TOP_Y + rnd(GROUND_Y - TOP_Y - 60),
        depth: 0.3 + rnd(0.7),
        size: rnd(2) < 1.5 ? 1 : 2,
      });
    }
  }

  function buildTerrain() {
    // Procedural jagged terrain along the bottom; one point every 24px.
    terrain = [];
    const step = 24;
    let y = GROUND_Y;
    for (let x = 0; x <= WORLD_W; x += step) {
      y += rnd(14) - 7;
      y = Math.max(GROUND_Y - 14, Math.min(GROUND_Y + 8, y));
      terrain.push({ x, y });
    }
    terrain[terrain.length - 1].y = terrain[0].y; // seamless wrap
  }

  function spawnCivilians(n) {
    for (let i = 0; i < n; i++) {
      civilians.push({
        x: rnd(WORLD_W),
        y: GROUND_Y - 6,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.2 + rnd(0.3)),
        state: 'walk',     // walk | carried | falling
        carrier: null,
        walkTimer: rint(120),
      });
    }
    civiliansRemaining = civilians.length;
  }

  function nextWave() {
    wave += 1;
    civiliansSavedThisWave = 0;
    const raiders = 4 + Math.floor(wave * 1.5);
    const drones  = 1 + Math.floor(wave / 2);
    for (let i = 0; i < raiders; i++) spawnEnemy('raider');
    for (let i = 0; i < drones;  i++) spawnEnemy('drone');
    waveBanner = 90;
  }

  function spawnEnemy(type) {
    // Place at a random world x, well above the ground; avoid the player's screen.
    let x, tries = 30;
    do {
      x = rnd(WORLD_W);
      tries--;
    } while (tries > 0 && Math.abs(wrapDelta(x - player.x)) < 280);
    const y = TOP_Y + 30 + rnd(GROUND_Y - TOP_Y - 120);
    if (type === 'raider') {
      enemies.push({
        type, x, y,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.6 + rnd(0.5)),
        vy: 0,
        target: null,
        state: 'hunt',     // hunt | grab | carry
        carry: null,
        hp: 1,
      });
    } else if (type === 'drone') {
      enemies.push({
        type, x, y,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.4 + rnd(0.4)),
        vy: (Math.random() < 0.5 ? -1 : 1) * (0.3 + rnd(0.3)),
        bobT: rnd(Math.PI * 2),
        fireT: 60 + rint(120),
        hp: 1,
      });
    } else if (type === 'hunter') {
      enemies.push({
        type, x, y,
        vx: 0, vy: 0,
        hp: 2,
        fireT: 90,
      });
    }
  }

  function nearestCivilianFree(x, y) {
    let best = null, bestD = Infinity;
    for (const c of civilians) {
      if (c.state !== 'walk') continue;
      const d = wrapDist(c.x, x);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // --- Input ---
  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyP' && !gameOver) paused = !paused;
    if (e.code === 'KeyR') newGame();
    if (e.code === 'KeyZ' && !paused && !gameOver) tryWarp();
  });
  document.addEventListener('keyup', e => {
    keys[e.code] = false;
  });
  restartBtn.addEventListener('click', () => newGame());
  overlayBtn.addEventListener('click', () => newGame());

  function tryWarp() {
    if (warpCooldown > 0) return;
    player.x = wrap(player.x + (rnd(WORLD_W * 0.6) - WORLD_W * 0.3));
    player.vx *= 0.3;
    player.vy *= 0.3;
    warpFlash = 18;
    warpCooldown = 180;
  }

  // --- Update ---
  function update() {
    if (paused || gameOver) return;

    // Player thrust & movement
    const accelX = 0.32;
    const accelY = 0.42;
    if (keys['ArrowLeft']  || keys['KeyA']) { player.vx -= accelX; player.face = -1; }
    if (keys['ArrowRight'] || keys['KeyD']) { player.vx += accelX; player.face =  1; }
    if (keys['ArrowUp']    || keys['KeyW']) player.vy -= accelY;
    if (keys['ArrowDown']  || keys['KeyS']) player.vy += accelY;

    player.vx *= 0.97;
    player.vy *= 0.93;
    const maxVx = 7.5, maxVy = 5.5;
    player.vx = Math.max(-maxVx, Math.min(maxVx, player.vx));
    player.vy = Math.max(-maxVy, Math.min(maxVy, player.vy));
    player.x = wrap(player.x + player.vx);
    player.y += player.vy;
    if (player.y < TOP_Y) { player.y = TOP_Y; player.vy = 0; }
    if (player.y > GROUND_Y - 8) { player.y = GROUND_Y - 8; player.vy = 0; }

    if (player.hit > 0) player.hit -= 1;
    if (warpFlash > 0) warpFlash -= 1;
    if (warpCooldown > 0) warpCooldown -= 1;
    if (waveBanner > 0) waveBanner -= 1;

    // Camera lead in facing direction
    const targetCamX = wrap(player.x + player.face * 140);
    let dx = wrapDelta(targetCamX - camera.x);
    camera.x = wrap(camera.x + dx * 0.08);

    // Firing
    if (fireCooldown > 0) fireCooldown -= 1;
    if (keys['Space'] && fireCooldown <= 0) {
      bullets.push({
        x: wrap(player.x + player.face * 14),
        y: player.y,
        vx: player.face * 12 + player.vx * 0.4,
        life: 60,
      });
      fireCooldown = 7;
    }

    // Bullets
    for (const b of bullets) {
      b.x = wrap(b.x + b.vx);
      b.life -= 1;
    }
    bullets = bullets.filter(b => b.life > 0);
    for (const b of foeBullets) {
      b.x = wrap(b.x + b.vx);
      b.y += b.vy;
      b.life -= 1;
    }
    foeBullets = foeBullets.filter(b => b.life > 0 && b.y > TOP_Y - 10 && b.y < GROUND_Y + 10);

    // Civilians
    for (const c of civilians) {
      if (c.state === 'walk') {
        c.walkTimer -= 1;
        if (c.walkTimer <= 0) {
          c.vx = (Math.random() < 0.5 ? -1 : 1) * (0.15 + rnd(0.3));
          c.walkTimer = 60 + rint(120);
        }
        c.x = wrap(c.x + c.vx);
      } else if (c.state === 'falling') {
        c.vy += 0.35;
        c.y += c.vy;
        // Caught by player?
        if (
          c.vy > 0 &&
          wrapDist(c.x, player.x) < 22 &&
          Math.abs(player.y - c.y) < 18
        ) {
          c.state = 'walk';
          c.y = GROUND_Y - 6;
          c.vy = 0;
          score += 500;
          civiliansSavedThisWave += 1;
          spawnParticles(player.x, player.y, '#86efac', 14);
        } else if (c.y >= GROUND_Y - 6) {
          // Survived the fall on its own if from low altitude
          if (c.vy < 6) {
            c.y = GROUND_Y - 6;
            c.vy = 0;
            c.state = 'walk';
          } else {
            // Splat
            c.state = 'dead';
            spawnParticles(c.x, c.y, '#ef4444', 10);
          }
        }
      }
    }
    civilians = civilians.filter(c => c.state !== 'dead');
    civiliansRemaining = civilians.length;

    // Enemies
    for (const e of enemies) {
      if (e.type === 'raider') updateRaider(e);
      else if (e.type === 'drone') updateDrone(e);
      else if (e.type === 'hunter') updateHunter(e);
    }

    // Bullets vs enemies
    for (const b of bullets) {
      for (const e of enemies) {
        if (wrapDist(b.x, e.x) < 14 && Math.abs(b.y - e.y) < 14) {
          e.hp -= 1;
          b.life = 0;
          spawnParticles(e.x, e.y, '#ffd43b', 6);
          if (e.hp <= 0) onEnemyKilled(e);
          break;
        }
      }
    }
    enemies = enemies.filter(e => e.hp > 0);

    // Enemy bullets vs player
    for (const b of foeBullets) {
      if (wrapDist(b.x, player.x) < 12 && Math.abs(b.y - player.y) < 12) {
        b.life = 0;
        playerHit('hit by enemy fire');
      }
    }

    // Enemy collisions with player
    for (const e of enemies) {
      if (wrapDist(e.x, player.x) < 18 && Math.abs(e.y - player.y) < 18) {
        // Killing collision either way: enemy dies, player takes damage
        e.hp = 0;
        onEnemyKilled(e);
        playerHit(`rammed by ${e.type}`);
        spawnParticles(player.x, player.y, '#fb923c', 22);
        break;
      }
    }
    enemies = enemies.filter(e => e.hp > 0);

    // Particles
    for (const p of particles) {
      p.x = wrap(p.x + p.vx);
      p.y += p.vy;
      p.vy += 0.08;
      p.life -= 1;
    }
    particles = particles.filter(p => p.life > 0);

    // Win/lose checks
    if (civilians.length === 0 && wave > 0) {
      gameOver = true;
      finalScreen('All Civilians Lost', `The skies are silent.\nFinal score: ${score}`);
      return;
    }
    if (enemies.length === 0) {
      // Wave clear bonus
      const bonus = 500 + civiliansSavedThisWave * 200 + civiliansRemaining * 50;
      score += bonus;
      if (wave >= 8) {
        won = true;
        gameOver = true;
        finalScreen('Mission Complete', `You held the line through ${wave} waves.\nFinal score: ${score}`);
        return;
      }
      nextWave();
    }
  }

  function updateRaider(e) {
    if (e.state === 'hunt' || e.state === 'grab') {
      if (!e.target || e.target.state !== 'walk') {
        e.target = nearestCivilianFree(e.x, e.y);
      }
    }
    if (e.state === 'hunt') {
      if (!e.target) {
        e.vx += (Math.random() - 0.5) * 0.04;
        e.vy += (Math.random() - 0.5) * 0.04;
      } else {
        const dx = wrapDelta(e.target.x - e.x);
        e.vx += sign(dx) * 0.08;
        e.vy += sign((e.target.y - 30) - e.y) * 0.04;
        if (Math.abs(dx) < 12 && Math.abs(e.target.y - e.y) < 40) {
          e.state = 'grab';
        }
      }
    } else if (e.state === 'grab') {
      // Descend to grab civilian
      if (!e.target || e.target.state !== 'walk') {
        e.state = 'hunt';
      } else {
        const dx = wrapDelta(e.target.x - e.x);
        e.vx += sign(dx) * 0.08;
        e.vy += 0.12;
        if (Math.abs(dx) < 8 && Math.abs(e.target.y - e.y) < 10) {
          e.carry = e.target;
          e.target.state = 'carried';
          e.target.carrier = e;
          e.state = 'carry';
        }
      }
    } else if (e.state === 'carry') {
      e.vy -= 0.18;
      e.vx += (Math.random() - 0.5) * 0.04;
      if (e.carry) {
        e.carry.x = e.x;
        e.carry.y = e.y + 10;
      }
      if (e.y < TOP_Y + 6) {
        // Promoted to hunter; civilian is consumed
        if (e.carry) {
          e.carry.state = 'dead';
          e.carry.carrier = null;
        }
        e.carry = null;
        e.type = 'hunter';
        e.hp = 2;
        e.fireT = 60;
      }
    }
    e.vx *= 0.97;
    e.vy *= 0.95;
    e.vx = Math.max(-2.6, Math.min(2.6, e.vx));
    e.vy = Math.max(-2.2, Math.min(2.2, e.vy));
    e.x = wrap(e.x + e.vx);
    e.y = Math.max(TOP_Y, Math.min(GROUND_Y - 6, e.y + e.vy));
  }

  function updateDrone(e) {
    e.bobT += 0.08;
    e.x = wrap(e.x + e.vx);
    e.y += e.vy + Math.sin(e.bobT) * 0.4;
    if (Math.random() < 0.01) e.vy *= -1;
    if (e.y < TOP_Y + 20) e.vy = Math.abs(e.vy);
    if (e.y > GROUND_Y - 60) e.vy = -Math.abs(e.vy);
    if (Math.random() < 0.005) e.vx *= -1;
    e.fireT -= 1;
    if (e.fireT <= 0 && wrapDist(e.x, player.x) < 420) {
      const dx = wrapDelta(player.x - e.x);
      const dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      foeBullets.push({
        x: e.x, y: e.y,
        vx: (dx / d) * 4,
        vy: (dy / d) * 4,
        life: 110,
      });
      e.fireT = 110 + rint(80);
    }
  }

  function updateHunter(e) {
    const dx = wrapDelta(player.x - e.x);
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.vx += (dx / d) * 0.15;
    e.vy += (dy / d) * 0.10;
    e.vx *= 0.96;
    e.vy *= 0.96;
    e.vx = Math.max(-3.5, Math.min(3.5, e.vx));
    e.vy = Math.max(-3.0, Math.min(3.0, e.vy));
    e.x = wrap(e.x + e.vx);
    e.y = Math.max(TOP_Y, Math.min(GROUND_Y - 6, e.y + e.vy));
    e.fireT -= 1;
    if (e.fireT <= 0 && wrapDist(e.x, player.x) < 380) {
      foeBullets.push({
        x: e.x, y: e.y,
        vx: (dx / d) * 4.5,
        vy: (dy / d) * 4.5,
        life: 100,
      });
      e.fireT = 70 + rint(50);
    }
  }

  function onEnemyKilled(e) {
    if (e.type === 'raider') score += 150;
    else if (e.type === 'drone') score += 200;
    else if (e.type === 'hunter') score += 300;
    spawnParticles(e.x, e.y, '#fb923c', 18);
    // If carrying civilian, drop it
    if (e.carry) {
      e.carry.state = 'falling';
      e.carry.vy = e.vy * 0.3;
      e.carry.carrier = null;
      e.carry = null;
    }
  }

  function playerHit(cause) {
    if (player.hit > 0) return;
    lives -= 1;
    player.hit = 70;
    spawnParticles(player.x, player.y, '#ef4444', 24);
    player.vx *= -0.4;
    player.vy *= -0.4;
    if (lives < 0) {
      gameOver = true;
      finalScreen('Your Ship Was Lost', `${cause}.\nFinal score: ${score}`);
    }
  }

  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd(Math.PI * 2);
      const s = 1 + rnd(3);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 0.5,
        life: 18 + rint(20),
        color,
      });
    }
  }

  function finalScreen(title, msg) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  // --- Rendering ---
  function worldToScreen(wx) {
    let d = wrapDelta(wx - camera.x);
    return d + VW / 2;
  }
  function onScreen(sx, margin = 60) {
    return sx > -margin && sx < VW + margin;
  }

  function render() {
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, VW, VH);

    // Top/bottom strip indicators
    ctx.fillStyle = '#0a0e16';
    ctx.fillRect(0, 0, VW, TOP_Y - 10);
    ctx.fillRect(0, GROUND_Y + 4, VW, VH - GROUND_Y - 4);

    // Stars
    for (const s of stars) {
      const sx = worldToScreen(s.x);
      if (!onScreen(sx, 8)) continue;
      ctx.fillStyle = s.depth > 0.7 ? '#cbd5e1' : '#475569';
      ctx.fillRect(sx, s.y, s.size, s.size);
    }

    // Terrain
    drawTerrain();

    // Civilians
    for (const c of civilians) {
      const sx = worldToScreen(c.x);
      if (!onScreen(sx, 20)) continue;
      drawCivilian(sx, c.y, c.state);
    }

    // Enemies
    for (const e of enemies) {
      const sx = worldToScreen(e.x);
      if (!onScreen(sx, 30)) continue;
      if (e.type === 'raider') drawRaider(sx, e.y);
      else if (e.type === 'drone') drawDrone(sx, e.y);
      else if (e.type === 'hunter') drawHunter(sx, e.y);
    }

    // Bullets
    for (const b of bullets) {
      const sx = worldToScreen(b.x);
      if (!onScreen(sx, 20)) continue;
      ctx.fillStyle = '#fde047';
      ctx.fillRect(sx - 3, b.y - 1, 6, 2);
    }
    for (const b of foeBullets) {
      const sx = worldToScreen(b.x);
      if (!onScreen(sx, 20)) continue;
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(sx, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particles
    for (const p of particles) {
      const sx = worldToScreen(p.x);
      if (!onScreen(sx, 10)) continue;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 30));
      ctx.fillRect(sx - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Player
    drawPlayer();

    // Warp flash
    if (warpFlash > 0) {
      ctx.fillStyle = `rgba(34,211,238,${warpFlash / 18 * 0.4})`;
      ctx.fillRect(0, 0, VW, VH);
    }

    // Wave banner
    if (waveBanner > 0) {
      ctx.fillStyle = `rgba(34,211,238,${Math.min(1, waveBanner / 30)})`;
      ctx.font = 'bold 28px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Wave ${wave}`, VW / 2, 90);
    }

    if (paused && !gameOver) {
      ctx.fillStyle = 'rgba(4,6,11,0.6)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = '#e6e8ee';
      ctx.font = 'bold 30px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Paused', VW / 2, VH / 2);
    }

    drawMinimap();
    renderStats();
  }

  function drawTerrain() {
    ctx.strokeStyle = '#1f2937';
    ctx.fillStyle = '#0b121a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, VH);
    let started = false;
    const camLeft = camera.x - VW / 2 - 32;
    for (let i = 0; i < terrain.length; i++) {
      const tNow = terrain[i];
      const sx = worldToScreen(tNow.x);
      if (sx < -32 || sx > VW + 32) {
        if (started) { ctx.lineTo(sx, tNow.y); }
        continue;
      }
      if (!started) { ctx.moveTo(sx, tNow.y); started = true; }
      else ctx.lineTo(sx, tNow.y);
    }
    ctx.lineTo(VW + 32, VH);
    ctx.lineTo(-32, VH);
    ctx.closePath();
    ctx.fill();
    // Edge line
    ctx.beginPath();
    let begun = false;
    for (let i = 0; i < terrain.length; i++) {
      const t = terrain[i];
      const sx = worldToScreen(t.x);
      if (sx < -32 || sx > VW + 32) continue;
      if (!begun) { ctx.moveTo(sx, t.y); begun = true; }
      else ctx.lineTo(sx, t.y);
    }
    ctx.stroke();
  }

  function drawPlayer() {
    const sx = VW / 2 + wrapDelta(player.x - camera.x);
    const sy = player.y;
    const flash = player.hit > 0 && (player.hit % 6 < 3);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(player.face, 1);
    ctx.fillStyle = flash ? '#ef4444' : '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -7);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0e7490';
    ctx.fillRect(-10, -2, 6, 4);
    // Engine flame when thrusting
    const thrusting = keys['ArrowLeft'] || keys['ArrowRight'] || keys['KeyA'] || keys['KeyD'];
    if (thrusting) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-10, -3);
      ctx.lineTo(-16 - rnd(6), 0);
      ctx.lineTo(-10, 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRaider(sx, sy) {
    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 7);
    ctx.lineTo(sx + 7, sy);
    ctx.lineTo(sx, sy + 7);
    ctx.lineTo(sx - 7, sy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fbcfe8';
    ctx.fillRect(sx - 2, sy - 1, 4, 2);
  }
  function drawDrone(sx, sy) {
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - 6, sy);
    ctx.lineTo(sx - 9, sy - 4);
    ctx.moveTo(sx + 6, sy);
    ctx.lineTo(sx + 9, sy - 4);
    ctx.stroke();
  }
  function drawHunter(sx, sy) {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 9);
    ctx.lineTo(sx + 9, sy + 6);
    ctx.lineTo(sx - 9, sy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fee2e2';
    ctx.fillRect(sx - 2, sy - 2, 4, 4);
  }
  function drawCivilian(sx, sy, state) {
    ctx.fillStyle = state === 'falling' ? '#fde047' : '#86efac';
    ctx.fillRect(sx - 2, sy - 6, 4, 4);  // head/torso
    ctx.fillRect(sx - 3, sy - 2, 6, 4);  // body
    ctx.fillRect(sx - 3, sy + 2, 2, 4);  // leg
    ctx.fillRect(sx + 1, sy + 2, 2, 4);  // leg
  }

  function drawMinimap() {
    mctx.fillStyle = '#06080d';
    mctx.fillRect(0, 0, MW, MH);
    const scale = MW / WORLD_W;
    // Ground line
    mctx.strokeStyle = '#1f2937';
    mctx.beginPath();
    for (let i = 0; i < terrain.length; i++) {
      const t = terrain[i];
      const x = t.x * scale;
      const y = ((t.y - TOP_Y) / (GROUND_Y - TOP_Y)) * (MH - 4) + 2;
      if (i === 0) mctx.moveTo(x, y);
      else mctx.lineTo(x, y);
    }
    mctx.stroke();
    // Camera window
    const camLeft = wrap(camera.x - VW / 2);
    const camRight = wrap(camera.x + VW / 2);
    mctx.strokeStyle = 'rgba(34,211,238,0.5)';
    mctx.lineWidth = 1;
    if (camRight > camLeft) {
      mctx.strokeRect(camLeft * scale, 1, (camRight - camLeft) * scale, MH - 2);
    } else {
      mctx.strokeRect(camLeft * scale, 1, (WORLD_W - camLeft) * scale, MH - 2);
      mctx.strokeRect(0, 1, camRight * scale, MH - 2);
    }
    // Civilians
    mctx.fillStyle = '#86efac';
    for (const c of civilians) {
      mctx.fillRect(c.x * scale - 1, MH - 6, 2, 4);
    }
    // Enemies
    for (const e of enemies) {
      mctx.fillStyle = e.type === 'hunter' ? '#ef4444' : e.type === 'drone' ? '#fb923c' : '#f472b6';
      const ey = ((e.y - TOP_Y) / (GROUND_Y - TOP_Y)) * (MH - 4) + 2;
      mctx.fillRect(e.x * scale - 1, ey - 1, 2, 2);
    }
    // Player
    mctx.fillStyle = '#22d3ee';
    const py = ((player.y - TOP_Y) / (GROUND_Y - TOP_Y)) * (MH - 4) + 2;
    mctx.beginPath();
    mctx.moveTo(player.x * scale - 3 * player.face, py - 3);
    mctx.lineTo(player.x * scale + 5 * player.face, py);
    mctx.lineTo(player.x * scale - 3 * player.face, py + 3);
    mctx.closePath();
    mctx.fill();
  }

  function renderStats() {
    statsEl.innerHTML = `
      <span>Score: <b>${score}</b></span>
      <span>Lives: <b>${Math.max(0, lives)}</b></span>
      <span>Wave: <b>${wave}</b></span>
      <span>Saved: <b>${civiliansRemaining}</b></span>
      <span>Warp: <b>${warpCooldown > 0 ? Math.ceil(warpCooldown / 60) + 's' : 'ready'}</b></span>
    `;
  }

  function loop(t) {
    update();
    render();
    requestAnimationFrame(loop);
  }

  newGame();
  requestAnimationFrame(loop);
})();
