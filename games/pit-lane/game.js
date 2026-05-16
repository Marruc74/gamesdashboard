(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const lapEl = document.getElementById('lap');
  const posEl = document.getElementById('pos');
  const timeEl = document.getElementById('time');
  const fuelEl = document.getElementById('fuel');
  const tiresEl = document.getElementById('tires');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');
  const restartBtn = document.getElementById('restart');

  const TRACK = {
    cx: 360, cy: 240,
    outerRx: 330, outerRy: 200,
    innerRx: 180, innerRy: 90,
    raceRx: 255, raceRy: 145,
    pit: { x: 200, y: 410, w: 320, h: 75 },
    pitBox: { x: 332, y: 442, w: 56, h: 28 },
    finishX: 360,
    finishY1: 42,
    finishY2: 148,
    startAngle: -Math.PI / 2,
    bottomArcStart: 1.064,
    bottomArcEnd: 2.078,
  };

  const TIRE_COMPOUNDS = {
    soft:   { id: 'soft',   name: 'Soft',   wearRate: 1.65, grip: 1.08, color: '#ff6b6b' },
    medium: { id: 'medium', name: 'Medium', wearRate: 1.00, grip: 1.00, color: '#ffd43b' },
    hard:   { id: 'hard',   name: 'Hard',   wearRate: 0.55, grip: 0.85, color: '#dee2e6' },
  };

  const TOTAL_LAPS = 5;
  const NUM_RIVALS = 3;
  const COUNTDOWN_FRAMES = 180;
  const GO_FLASH_FRAMES = 36;
  const PIT_DURATION_FRAMES = 150;
  const LS_KEY_LAP = 'pitLaneBestLap';
  const LS_KEY_RACE = 'pitLaneBestRace';

  const RIVAL_COLORS = ['#ff6b6b', '#4dabf7', '#9775fa'];
  const RIVAL_T_START = [-1.500, -1.535, -1.570];
  const RIVAL_OFFSETS = [-18, 0, 18];
  const RIVAL_SPEEDS = [0.0096, 0.0102, 0.0093];
  const RIVAL_PIT_LAP = [1, 2, 1];
  const RIVAL_PIT_X = [240, 290, 460];

  const ACC = 0.085;
  const BRAKE = 0.20;
  const REVERSE = 0.05;
  const MAX_FWD = 4.2;
  const MAX_REV = 1.6;
  const FRICTION = 0.985;
  const STEER = 0.048;
  const PIT_SPEED_LIMIT = 1.7;

  const DRAFT_RANGE = 72;
  const DRAFT_FRICTION = 0.993;
  const DRAFT_MAX_FWD = 4.7;

  const FUEL_BURN_THROTTLE = 0.070;
  const FUEL_BURN_IDLE = 0.012;
  const TIRE_WEAR_CORNER = 0.060;
  const TIRE_WEAR_OFFTRACK = 0.080;
  const PIT_FUEL_RATE = 0.70;
  const PIT_TIRE_RATE = 0.55;

  let player, rivals;
  let raceTime, raceState;
  let countdownFrames, goFlashFrames;
  let pausedNow;
  let lapsForPlayer;
  let lapStartTime;
  let lapTimes;
  let bestLapThisRace;
  let bestLapAllTime;
  let bestRaceAllTime;
  let racePBSet, raceWasBestRace;
  let lastLapTimeS;
  let lastLapWasBestRace;
  let lastLapWasPB;
  let lastLapDisplayFrames;
  let finishedRivals;
  let playerFinishTime;
  let skidMarks;
  let smokeParticles;
  let skidEmitCounter;
  let cachedPositions;
  let draftingTarget;
  const keys = Object.create(null);

  function loadBest(key) {
    try {
      const v = localStorage.getItem(key);
      const n = v != null ? parseFloat(v) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  }
  function saveBest(key, seconds) {
    try { localStorage.setItem(key, String(seconds)); } catch {}
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pointInEllipse(x, y, cx, cy, rx, ry) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  function onMainTrack(x, y) {
    return pointInEllipse(x, y, TRACK.cx, TRACK.cy, TRACK.outerRx, TRACK.outerRy)
        && !pointInEllipse(x, y, TRACK.cx, TRACK.cy, TRACK.innerRx, TRACK.innerRy);
  }
  function inPitArea(x, y) {
    const p = TRACK.pit;
    return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
  }
  function inPitBox(x, y) {
    const p = TRACK.pitBox;
    return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
  }
  function onTrack(x, y) {
    return onMainTrack(x, y) || inPitArea(x, y);
  }

  function makePlayer() {
    return {
      x: 395, y: 95, angle: 0, speed: 0,
      fuel: 100, tires: 100,
      lap: 0,
      color: '#ffd43b',
      compound: TIRE_COMPOUNDS.medium,
    };
  }
  function makeRival(i) {
    return {
      t: RIVAL_T_START[i],
      tSpeed: RIVAL_SPEEDS[i],
      offset: RIVAL_OFFSETS[i],
      lap: 0,
      finished: false,
      finishTime: 0,
      color: RIVAL_COLORS[i],
      x: 0, y: 0, angle: 0,
      pitWhenLapEquals: RIVAL_PIT_LAP[i],
      hasPitted: false,
      pitTime: 0,
      pitBoxX: RIVAL_PIT_X[i],
    };
  }
  function placeRival(r) {
    const rx = TRACK.raceRx + r.offset;
    const ry = TRACK.raceRy + r.offset * 0.55;
    r.x = TRACK.cx + rx * Math.cos(r.t);
    r.y = TRACK.cy + ry * Math.sin(r.t);
    const tx = -rx * Math.sin(r.t);
    const ty = ry * Math.cos(r.t);
    r.angle = Math.atan2(ty, tx);
  }

  function init() {
    player = makePlayer();
    rivals = [];
    for (let i = 0; i < NUM_RIVALS; i++) {
      const r = makeRival(i);
      placeRival(r);
      rivals.push(r);
    }
    raceTime = 0;
    raceState = 'pre';
    countdownFrames = 0;
    goFlashFrames = 0;
    pausedNow = false;
    lapsForPlayer = 0;
    lapStartTime = 0;
    lapTimes = [];
    bestLapThisRace = null;
    racePBSet = false;
    raceWasBestRace = false;
    lastLapTimeS = 0;
    lastLapWasBestRace = false;
    lastLapWasPB = false;
    lastLapDisplayFrames = 0;
    finishedRivals = [];
    playerFinishTime = 0;
    skidMarks = [];
    smokeParticles = [];
    skidEmitCounter = 0;
    cachedPositions = null;
    draftingTarget = null;
    bestLapAllTime = loadBest(LS_KEY_LAP);
    bestRaceAllTime = loadBest(LS_KEY_RACE);
    updateHUD();
    showPreRaceOverlay();
  }

  function showPreRaceOverlay() {
    let msg = 'Choose tire compound:\n';
    msg += '1 — Soft   (fast grip, fast wear)\n';
    msg += '2 — Medium (balanced)\n';
    msg += '3 — Hard   (slow, durable)\n\n';
    msg += 'Press 1 / 2 / 3 to start, or Start = Medium.';
    if (bestLapAllTime !== null) msg += `\n\nBest lap: ${bestLapAllTime.toFixed(2)}s`;
    if (bestRaceAllTime !== null) msg += `   ·   Best race: ${bestRaceAllTime.toFixed(2)}s`;
    showOverlay('Ready?', msg, 'Start');
  }

  function startRace(compoundId) {
    if (compoundId && TIRE_COMPOUNDS[compoundId]) {
      player.compound = TIRE_COMPOUNDS[compoundId];
    }
    raceState = 'countdown';
    countdownFrames = COUNTDOWN_FRAMES;
    hideOverlay();
  }

  function showOverlay(title, msg, btnText) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlayBtn.textContent = btnText;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  function setBar(el, v, color) {
    el.style.width = `${clamp(v, 0, 100)}%`;
    el.style.background = color;
  }

  function updateHUD() {
    const displayLap = Math.min(lapsForPlayer + 1, TOTAL_LAPS);
    lapEl.textContent = `${displayLap}/${TOTAL_LAPS}`;
    const playerPos = cachedPositions ? cachedPositions.player : computePlayerPos();
    posEl.textContent = `${playerPos}/${1 + NUM_RIVALS}`;
    timeEl.textContent = (raceTime / 60).toFixed(1);
    const fuelColor = player.fuel < 20 ? '#ff6b6b' : (player.fuel < 40 ? '#ffa94d' : '#4dabf7');
    const tireColor = player.tires < 20 ? '#ff6b6b' : (player.tires < 40 ? '#ffa94d' : '#69db7c');
    setBar(fuelEl, player.fuel, fuelColor);
    setBar(tiresEl, player.tires, tireColor);
  }

  function normalizeFrac(t) {
    let d = t - TRACK.startAngle;
    const twoPi = Math.PI * 2;
    d = ((d % twoPi) + twoPi) % twoPi;
    return d / twoPi;
  }
  function playerFrac() {
    const t = Math.atan2((player.y - TRACK.cy) / TRACK.raceRy, (player.x - TRACK.cx) / TRACK.raceRx);
    return normalizeFrac(t);
  }
  function totalProgress(lap, frac) { return lap + frac; }

  function computePlayerPos() {
    const p = totalProgress(player.lap, playerFrac());
    let ahead = 0;
    for (const r of rivals) {
      const rp = totalProgress(r.lap, normalizeFrac(r.t));
      if (rp > p) ahead++;
    }
    return ahead + 1;
  }
  function computeAllPositions() {
    const list = [
      { id: 'player', progress: totalProgress(player.lap, playerFrac()) },
      ...rivals.map((r, i) => ({ id: `rival${i}`, progress: totalProgress(r.lap, normalizeFrac(r.t)) })),
    ];
    list.sort((a, b) => b.progress - a.progress);
    const out = {};
    list.forEach((c, idx) => { out[c.id] = idx + 1; });
    return out;
  }

  // ===== Particles =====
  function emitSkid(x, y, angle) {
    for (const side of [-3, 3]) {
      const ox = -7 * Math.cos(angle) - side * Math.sin(angle);
      const oy = -7 * Math.sin(angle) + side * Math.cos(angle);
      skidMarks.push({ x: x + ox, y: y + oy, life: 220, maxLife: 220, w: 3 });
    }
    while (skidMarks.length > 360) skidMarks.shift();
  }
  function emitSmoke(x, y, vxBias = 0) {
    if (smokeParticles.length > 90) return;
    smokeParticles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 1.0 + vxBias,
      vy: (Math.random() - 0.5) * 1.0 - 0.4,
      life: 45, maxLife: 45,
      size: 3 + Math.random() * 3,
    });
  }
  function updateParticles() {
    for (const s of skidMarks) s.life -= 1;
    while (skidMarks.length > 0 && skidMarks[0].life <= 0) skidMarks.shift();
    for (const p of smokeParticles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.size *= 1.025;
      p.life -= 1;
    }
    smokeParticles = smokeParticles.filter(p => p.life > 0);
  }

  // ===== Slipstream =====
  function detectDraft() {
    if (player.speed < 1.4) return null;
    for (const r of rivals) {
      if (r.finished || r.pitTime > 0) continue;
      const dx = r.x - player.x;
      const dy = r.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > DRAFT_RANGE || dist < 22) continue;
      const myFx = Math.cos(player.angle), myFy = Math.sin(player.angle);
      const theirFx = Math.cos(r.angle), theirFy = Math.sin(r.angle);
      const facingDot = myFx * theirFx + myFy * theirFy;
      if (facingDot < 0.7) continue;
      const aheadDot = (myFx * dx + myFy * dy) / dist;
      if (aheadDot < 0.6) continue;
      return r;
    }
    return null;
  }

  function updatePlayer() {
    const accAllowed = player.fuel > 0.01;

    draftingTarget = detectDraft();
    const drafting = draftingTarget !== null;
    const effFriction = drafting ? DRAFT_FRICTION : FRICTION;
    const effMaxFwd = drafting ? DRAFT_MAX_FWD : MAX_FWD;

    if (keys['ArrowUp'] && accAllowed) player.speed += ACC;
    if (keys['ArrowDown']) {
      if (player.speed > 0) player.speed -= BRAKE;
      else if (accAllowed) player.speed -= REVERSE;
    }
    player.speed *= effFriction;
    player.speed = clamp(player.speed, -MAX_REV, effMaxFwd);

    const compound = player.compound;
    const tireGrip = (player.tires / 100) * compound.grip;
    const grip = Math.max(0.30, tireGrip);
    const speedEff = Math.min(1, Math.abs(player.speed) / 1.8);
    let steered = 0;
    if (keys['ArrowLeft']) { player.angle -= STEER * speedEff * grip; steered = 1; }
    if (keys['ArrowRight']) { player.angle += STEER * speedEff * grip; steered = 1; }

    const oldX = player.x, oldY = player.y;
    player.x += Math.cos(player.angle) * player.speed;
    player.y += Math.sin(player.angle) * player.speed;

    let offTrack = false;
    if (!onTrack(player.x, player.y)) {
      if (onTrack(oldX, player.y)) {
        player.x = oldX;
        player.speed *= 0.6;
      } else if (onTrack(player.x, oldY)) {
        player.y = oldY;
        player.speed *= 0.6;
      } else {
        player.x = oldX; player.y = oldY;
        player.speed *= 0.4;
      }
      offTrack = true;
    } else if (inPitArea(player.x, player.y) && !onMainTrack(player.x, player.y)) {
      if (player.speed > PIT_SPEED_LIMIT) player.speed = PIT_SPEED_LIMIT;
    }

    if (keys['ArrowUp'] && accAllowed && player.speed > 0.05) {
      player.fuel = Math.max(0, player.fuel - FUEL_BURN_THROTTLE);
    } else if (Math.abs(player.speed) > 0.05) {
      player.fuel = Math.max(0, player.fuel - FUEL_BURN_IDLE);
    }
    if (steered && Math.abs(player.speed) > 0.5) {
      const wear = TIRE_WEAR_CORNER * (Math.abs(player.speed) / MAX_FWD) * compound.wearRate;
      player.tires = Math.max(0, player.tires - wear);
    }
    if (offTrack && Math.abs(player.speed) > 0.1) {
      const wear = TIRE_WEAR_OFFTRACK * (Math.abs(player.speed) / MAX_FWD) * compound.wearRate;
      player.tires = Math.max(0, player.tires - wear);
    }

    skidEmitCounter += 1;
    const speedAbs = Math.abs(player.speed);
    const cornering = steered && speedAbs > 2.0;
    const hardBrake = keys['ArrowDown'] && player.speed > 2.0;
    const lowGripCorner = cornering && (player.tires < 60 || compound.id === 'hard');
    if ((cornering || hardBrake || offTrack) && skidEmitCounter % 2 === 0) {
      emitSkid(player.x, player.y, player.angle);
    }
    if ((hardBrake || lowGripCorner || offTrack) && skidEmitCounter % 3 === 0) {
      emitSmoke(player.x, player.y, -Math.cos(player.angle) * 0.5);
    }

    if (inPitBox(player.x, player.y) && Math.abs(player.speed) < 0.18) {
      player.fuel = Math.min(100, player.fuel + PIT_FUEL_RATE);
      player.tires = Math.min(100, player.tires + PIT_TIRE_RATE);
    }

    const onLine = player.y >= TRACK.finishY1 && player.y <= TRACK.finishY2;
    if (onLine) {
      if (oldX < TRACK.finishX && player.x >= TRACK.finishX) {
        const currentLapFrames = raceTime - lapStartTime;
        const currentLapSec = currentLapFrames / 60;
        lapTimes.push(currentLapFrames);
        lapStartTime = raceTime;
        lastLapTimeS = currentLapSec;
        lastLapWasBestRace = (bestLapThisRace === null) || (currentLapFrames < bestLapThisRace);
        if (lastLapWasBestRace) bestLapThisRace = currentLapFrames;
        lastLapWasPB = bestLapAllTime === null || currentLapSec < bestLapAllTime - 0.001;
        if (lastLapWasPB) {
          bestLapAllTime = currentLapSec;
          saveBest(LS_KEY_LAP, currentLapSec);
          racePBSet = true;
        }
        lastLapDisplayFrames = 150;
        lapsForPlayer += 1;
        player.lap = lapsForPlayer;
        if (lapsForPlayer >= TOTAL_LAPS) finishPlayer();
      } else if (oldX > TRACK.finishX && player.x <= TRACK.finishX) {
        if (lapsForPlayer > 0) {
          lapsForPlayer -= 1;
          player.lap = lapsForPlayer;
        }
      }
    }
  }

  function updateRival(r) {
    if (r.finished) return;
    if (r.pitTime > 0) {
      r.pitTime -= 1;
      r.x = r.pitBoxX;
      r.y = TRACK.pit.y + 30;
      r.angle = Math.PI;
      return;
    }
    if (!r.hasPitted && r.lap === r.pitWhenLapEquals) {
      const frac = normalizeFrac(r.t);
      if (frac >= 0.42 && frac <= 0.55) {
        r.pitTime = PIT_DURATION_FRAMES;
        r.hasPitted = true;
        r.x = r.pitBoxX;
        r.y = TRACK.pit.y + 30;
        r.angle = Math.PI;
        return;
      }
    }
    const oldNorm = normalizeFrac(r.t);
    r.t += r.tSpeed;
    const newNorm = normalizeFrac(r.t);
    if (newNorm < oldNorm) {
      r.lap += 1;
      if (r.lap >= TOTAL_LAPS) {
        r.finished = true;
        r.finishTime = raceTime;
        finishedRivals.push(r);
      }
    }
    placeRival(r);
  }

  function handleCollisions() {
    for (const r of rivals) {
      if (r.finished || r.pitTime > 0) continue;
      const dx = player.x - r.x;
      const dy = player.y - r.y;
      const d = Math.hypot(dx, dy);
      if (d < 18 && d > 0.01) {
        const push = (18 - d) * 0.55;
        player.x += (dx / d) * push;
        player.y += (dy / d) * push;
        player.speed *= 0.82;
      }
    }
  }

  function finishPlayer() {
    if (raceState === 'finished') return;
    raceState = 'finished';
    playerFinishTime = raceTime;
    const raceSec = playerFinishTime / 60;
    if (bestRaceAllTime === null || raceSec < bestRaceAllTime - 0.001) {
      bestRaceAllTime = raceSec;
      saveBest(LS_KEY_RACE, raceSec);
      raceWasBestRace = true;
    }
    let ahead = 0;
    for (const r of rivals) {
      if (r.finished && r.finishTime < playerFinishTime) ahead++;
    }
    const finalPos = ahead + 1;
    const ord = ['1st', '2nd', '3rd', '4th'];
    const tag = ord[finalPos - 1] || `${finalPos}th`;
    const title = finalPos === 1 ? 'Checkered Flag' : 'Race Over';
    let msg = `Finished ${tag} of ${1 + NUM_RIVALS}`;
    msg += `\nTime: ${raceSec.toFixed(2)}s${raceWasBestRace ? '  ★ FASTEST!' : ''}`;
    if (bestLapThisRace !== null) {
      const bestSec = bestLapThisRace / 60;
      msg += `\nBest lap: ${bestSec.toFixed(2)}s${racePBSet ? '  ★ NEW PB!' : ''}`;
    }
    msg += `\nTires: ${player.compound.name}`;
    if (!raceWasBestRace && bestRaceAllTime !== null) msg += `\nAll-time best race: ${bestRaceAllTime.toFixed(2)}s`;
    if (!racePBSet && bestLapAllTime !== null) msg += `\nAll-time best lap: ${bestLapAllTime.toFixed(2)}s`;
    showOverlay(title, msg, 'Race Again');
  }

  document.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    keys[e.code] = true;
    if (raceState === 'pre') {
      if (e.code === 'Digit1' || e.code === 'Numpad1') { startRace('soft'); return; }
      if (e.code === 'Digit2' || e.code === 'Numpad2') { startRace('medium'); return; }
      if (e.code === 'Digit3' || e.code === 'Numpad3') { startRace('hard'); return; }
    }
    if (e.code === 'Space') {
      if (raceState === 'pre') {
        startRace('medium');
      } else if (raceState === 'racing') {
        pausedNow = !pausedNow;
        if (pausedNow) showOverlay('Paused', 'Press Space to resume.', 'Resume');
        else hideOverlay();
      } else if (raceState === 'finished') {
        init();
      }
    } else if (e.code === 'KeyR') {
      init();
    }
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });

  restartBtn.addEventListener('click', () => init());
  overlayBtn.addEventListener('click', () => {
    if (raceState === 'pre') startRace('medium');
    else if (raceState === 'finished') init();
    else if (pausedNow) { pausedNow = false; hideOverlay(); }
  });

  function update() {
    if (raceState === 'countdown') {
      countdownFrames -= 1;
      if (countdownFrames <= 0) {
        raceState = 'racing';
        countdownFrames = 0;
        goFlashFrames = GO_FLASH_FRAMES;
        raceTime = 0;
        lapStartTime = 0;
      }
      return;
    }
    if (raceState !== 'racing' || pausedNow) return;
    if (goFlashFrames > 0) goFlashFrames -= 1;
    raceTime += 1;
    updatePlayer();
    for (const r of rivals) updateRival(r);
    handleCollisions();
    updateParticles();
    if (lastLapDisplayFrames > 0) lastLapDisplayFrames -= 1;
    cachedPositions = computeAllPositions();
    updateHUD();
  }

  function drawCheckered(x, y, w, h) {
    const sq = 6;
    const cols = Math.ceil(w / sq);
    const rows = Math.ceil(h / sq);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? '#fff' : '#0a0c12';
        ctx.fillRect(x + col * sq, y + row * sq, sq, sq);
      }
    }
  }

  function drawTrack() {
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#1a2616';
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.outerRx + 30, TRACK.outerRy + 30, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2a2f3d';
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.outerRx, TRACK.outerRy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a2616';
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRx, TRACK.innerRy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.raceRx, TRACK.raceRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const p = TRACK.pit;
    ctx.fillStyle = '#363c50';
    ctx.fillRect(p.x, p.y, p.w, p.h);

    ctx.strokeStyle = '#fab005';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.ellipse(
      TRACK.cx, TRACK.cy, TRACK.outerRx, TRACK.outerRy, 0,
      TRACK.bottomArcStart, TRACK.bottomArcEnd
    );
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#11141c';
    ctx.fillRect(p.x, p.y + p.h, p.w, 3);
    ctx.fillStyle = '#fab005';
    for (let bx = p.x; bx < p.x + p.w; bx += 12) {
      ctx.fillRect(bx, p.y + p.h, 6, 3);
    }

    // AI pit boxes
    for (let i = 0; i < NUM_RIVALS; i++) {
      const rx = RIVAL_PIT_X[i];
      ctx.fillStyle = `${RIVAL_COLORS[i]}33`;
      ctx.fillRect(rx - 14, p.y + 18, 28, 24);
      ctx.strokeStyle = `${RIVAL_COLORS[i]}88`;
      ctx.lineWidth = 1;
      ctx.strokeRect(rx - 14, p.y + 18, 28, 24);
    }

    // Player pit box
    const pb = TRACK.pitBox;
    ctx.fillStyle = 'rgba(250, 176, 5, 0.14)';
    ctx.fillRect(pb.x, pb.y, pb.w, pb.h);
    ctx.strokeStyle = '#fab005';
    ctx.lineWidth = 2;
    ctx.strokeRect(pb.x, pb.y, pb.w, pb.h);
    ctx.fillStyle = '#fab005';
    ctx.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PIT BOX', pb.x + pb.w / 2, pb.y + pb.h / 2);

    ctx.fillStyle = 'rgba(250, 176, 5, 0.5)';
    ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PIT LANE', p.x + 6, p.y + p.h - 8);

    drawCheckered(TRACK.finishX - 4, TRACK.finishY1, 8, TRACK.finishY2 - TRACK.finishY1);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  function drawSkidMarks() {
    for (const s of skidMarks) {
      const alpha = (s.life / s.maxLife) * 0.55;
      ctx.fillStyle = `rgba(15, 18, 24, ${alpha})`;
      ctx.fillRect(s.x - s.w / 2, s.y - s.w / 2, s.w, s.w);
    }
  }

  function drawSmoke() {
    for (const p of smokeParticles) {
      const alpha = (p.life / p.maxLife) * 0.6;
      ctx.fillStyle = `rgba(190, 190, 200, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCar(c, color) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-10, -5, 22, 12);
    ctx.fillStyle = color;
    ctx.fillRect(-11, -6, 22, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(-11, -6, 22, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-11, 3, 22, 3);
    ctx.fillStyle = 'rgba(15, 18, 28, 0.85)';
    ctx.fillRect(-1, -5, 5, 10);
    ctx.fillStyle = '#fff3bf';
    ctx.fillRect(9, -5, 2, 2);
    ctx.fillRect(9, 3, 2, 2);
    ctx.restore();
  }

  function drawPositionNumber(c, posNum) {
    if (!posNum) return;
    const x = c.x, y = c.y - 16;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.85)';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.color || '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(posNum), x, y);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  function drawMinimap() {
    const mw = 110, mh = 80;
    const mx = W - mw - 10, my = 10;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);

    const worldMinX = TRACK.cx - TRACK.outerRx - 5;
    const worldMaxX = TRACK.cx + TRACK.outerRx + 5;
    const worldMinY = TRACK.cy - TRACK.outerRy - 5;
    const worldMaxY = TRACK.pit.y + TRACK.pit.h + 5;
    const sx = mw / (worldMaxX - worldMinX);
    const sy = mh / (worldMaxY - worldMinY);
    const wx = x => mx + (x - worldMinX) * sx;
    const wy = y => my + (y - worldMinY) * sy;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(wx(TRACK.cx), wy(TRACK.cy), TRACK.outerRx * sx, TRACK.outerRy * sy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(wx(TRACK.cx), wy(TRACK.cy), TRACK.innerRx * sx, TRACK.innerRy * sy, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(250, 176, 5, 0.55)';
    ctx.strokeRect(wx(TRACK.pit.x), wy(TRACK.pit.y), TRACK.pit.w * sx, TRACK.pit.h * sy);

    for (const r of rivals) {
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(wx(r.x), wy(r.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(wx(player.x), wy(player.y), 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawCountdown() {
    if (raceState === 'countdown') {
      const total = COUNTDOWN_FRAMES;
      let label;
      if (countdownFrames > total * 2 / 3) label = '3';
      else if (countdownFrames > total / 3) label = '2';
      else label = '1';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f59f00';
      ctx.font = 'bold 130px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, W / 2, H / 2);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    } else if (goFlashFrames > 0) {
      const alpha = goFlashFrames / GO_FLASH_FRAMES;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#51cf66';
      ctx.font = 'bold 110px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GO!', W / 2, H / 2);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  function drawLapBanner() {
    if (lastLapDisplayFrames <= 0) return;
    const t = lastLapDisplayFrames / 150;
    const alpha = Math.min(1, t * 4);
    const cx = W / 2;
    const cy = 64;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.6})`;
    ctx.fillRect(cx - 130, cy - 18, 260, 36);
    const color = lastLapWasPB ? '#51cf66' : lastLapWasBestRace ? '#74c0fc' : '#fff';
    ctx.fillStyle = color;
    ctx.font = 'bold 14px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tag = lastLapWasPB ? ' ★ NEW PB' : lastLapWasBestRace ? ' ★ best lap' : '';
    ctx.fillText(`Lap ${lapsForPlayer}: ${lastLapTimeS.toFixed(2)}s${tag}`, cx, cy);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  function drawDraftIndicator() {
    if (raceState !== 'racing' || !draftingTarget) return;
    ctx.strokeStyle = 'rgba(116, 192, 252, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(draftingTarget.x, draftingTarget.y);
    ctx.lineTo(player.x, player.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(116, 192, 252, 0.95)';
    ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRAFT', player.x, player.y - 30);
    ctx.textAlign = 'left';
  }

  function drawCompoundChip() {
    if (!player.compound || raceState === 'pre') return;
    const c = player.compound;
    const x = 12, y = 12;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fillRect(x - 4, y - 4, 100, 22);
    ctx.fillStyle = c.color;
    ctx.fillRect(x, y, 12, 12);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${c.name} tires`, x + 18, y + 6);
    ctx.textBaseline = 'alphabetic';
  }

  function drawWarning() {
    if (raceState !== 'racing') return;
    if (player.fuel >= 25 && player.tires >= 25) return;
    ctx.fillStyle = 'rgba(255, 107, 107, 0.9)';
    ctx.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const msg = player.fuel < 25 && player.tires < 25
      ? 'Fuel and tires low — pit!'
      : player.fuel < 25
        ? 'Fuel low — pit!'
        : 'Tires worn — pit!';
    ctx.fillText(msg, W / 2, 110);
    ctx.textAlign = 'left';
  }

  function draw() {
    drawTrack();
    drawSkidMarks();
    drawDraftIndicator();
    for (const r of rivals) drawCar(r, r.color);
    drawCar(player, player.color);
    drawSmoke();
    if (cachedPositions) {
      for (let i = 0; i < rivals.length; i++) {
        drawPositionNumber(rivals[i], cachedPositions[`rival${i}`]);
      }
      drawPositionNumber(player, cachedPositions.player);
    }
    drawMinimap();
    drawCompoundChip();
    drawWarning();
    drawLapBanner();
    drawCountdown();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  init();
  loop();
})();
