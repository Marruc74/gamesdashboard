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

  const TOTAL_LAPS = 5;
  const NUM_RIVALS = 3;
  const RIVAL_COLORS = ['#ff6b6b', '#4dabf7', '#9775fa'];
  const RIVAL_T_START = [-1.500, -1.535, -1.570];
  const RIVAL_OFFSETS = [-18, 0, 18];
  const RIVAL_SPEEDS = [0.0096, 0.0102, 0.0093];

  const ACC = 0.085;
  const BRAKE = 0.20;
  const REVERSE = 0.05;
  const MAX_FWD = 4.2;
  const MAX_REV = 1.6;
  const FRICTION = 0.985;
  const STEER = 0.048;
  const PIT_SPEED_LIMIT = 1.7;

  const FUEL_BURN_THROTTLE = 0.070;
  const FUEL_BURN_IDLE = 0.012;
  const TIRE_WEAR_CORNER = 0.060;
  const TIRE_WEAR_OFFTRACK = 0.080;
  const PIT_FUEL_RATE = 0.70;
  const PIT_TIRE_RATE = 0.55;

  let player, rivals;
  let raceTime, raceState; // 'pre' | 'racing' | 'finished'
  let pausedNow;
  let lapsForPlayer;
  let finishedRivals;
  let playerFinishTime;
  const keys = Object.create(null);

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
    lapsForPlayer = 0;
    finishedRivals = [];
    playerFinishTime = 0;
    pausedNow = false;
    updateHUD();
    showOverlay('Ready?', 'Five laps. Refuel and change tires in the pit box.\n\nGo clockwise — keep right at the top.', 'Start');
  }

  function startRace() {
    raceState = 'racing';
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
    posEl.textContent = `${computePos()}/${1 + NUM_RIVALS}`;
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

  function computePos() {
    const p = totalProgress(player.lap, playerFrac());
    let ahead = 0;
    for (const r of rivals) {
      const rp = totalProgress(r.lap, normalizeFrac(r.t));
      if (rp > p) ahead++;
    }
    return ahead + 1;
  }

  function updatePlayer() {
    const accAllowed = player.fuel > 0.01;

    if (keys['ArrowUp'] && accAllowed) player.speed += ACC;
    if (keys['ArrowDown']) {
      if (player.speed > 0) player.speed -= BRAKE;
      else if (accAllowed) player.speed -= REVERSE;
    }
    player.speed *= FRICTION;
    player.speed = clamp(player.speed, -MAX_REV, MAX_FWD);

    const grip = Math.max(0.45, player.tires / 100);
    const speedEff = Math.min(1, Math.abs(player.speed) / 1.8);
    let steered = 0;
    if (keys['ArrowLeft']) { player.angle -= STEER * speedEff * grip; steered = 1; }
    if (keys['ArrowRight']) { player.angle += STEER * speedEff * grip; steered = 1; }

    const oldX = player.x, oldY = player.y;
    const moveX = Math.cos(player.angle) * player.speed;
    const moveY = Math.sin(player.angle) * player.speed;
    player.x += moveX;
    player.y += moveY;

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
      player.tires = Math.max(0, player.tires - TIRE_WEAR_CORNER * (Math.abs(player.speed) / MAX_FWD));
    }
    if (offTrack && Math.abs(player.speed) > 0.1) {
      player.tires = Math.max(0, player.tires - TIRE_WEAR_OFFTRACK * (Math.abs(player.speed) / MAX_FWD));
    }

    if (inPitBox(player.x, player.y) && Math.abs(player.speed) < 0.18) {
      player.fuel = Math.min(100, player.fuel + PIT_FUEL_RATE);
      player.tires = Math.min(100, player.tires + PIT_TIRE_RATE);
    }

    const onLine = player.y >= TRACK.finishY1 && player.y <= TRACK.finishY2;
    if (onLine) {
      if (oldX < TRACK.finishX && player.x >= TRACK.finishX) {
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
      if (r.finished) continue;
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
    let ahead = 0;
    for (const r of rivals) {
      if (r.finished && r.finishTime < playerFinishTime) ahead++;
    }
    const finalPos = ahead + 1;
    const ord = ['1st', '2nd', '3rd', '4th'];
    const tag = ord[finalPos - 1] || `${finalPos}th`;
    const title = finalPos === 1 ? 'Checkered Flag' : 'Race Over';
    const msg = `Finished ${tag} of ${1 + NUM_RIVALS}\nTime: ${(playerFinishTime / 60).toFixed(1)}s`;
    showOverlay(title, msg, 'Race Again');
  }

  document.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    keys[e.code] = true;
    if (e.code === 'Space') {
      if (raceState === 'pre') {
        startRace();
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
    if (raceState === 'pre') startRace();
    else if (raceState === 'finished') init();
    else if (pausedNow) { pausedNow = false; hideOverlay(); }
  });

  function update() {
    if (raceState !== 'racing' || pausedNow) return;
    raceTime += 1;
    updatePlayer();
    for (const r of rivals) updateRival(r);
    handleCollisions();
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

    // Outer infield/grass apron
    ctx.fillStyle = '#1a2616';
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.outerRx + 30, TRACK.outerRy + 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // Asphalt
    ctx.fillStyle = '#2a2f3d';
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.outerRx, TRACK.outerRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Infield cutout
    ctx.fillStyle = '#1a2616';
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRx, TRACK.innerRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Track centerline (dashed white)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.raceRx, TRACK.raceRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pit lane
    const p = TRACK.pit;
    ctx.fillStyle = '#363c50';
    ctx.fillRect(p.x, p.y, p.w, p.h);

    // Pit lane separator: yellow dashed line along the bottom curve of outer ellipse
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

    // Pit wall (bottom of pit lane)
    ctx.fillStyle = '#11141c';
    ctx.fillRect(p.x, p.y + p.h, p.w, 3);
    ctx.fillStyle = '#fab005';
    for (let bx = p.x; bx < p.x + p.w; bx += 12) {
      ctx.fillRect(bx, p.y + p.h, 6, 3);
    }

    // Pit box
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

    // Pit lane label
    ctx.fillStyle = 'rgba(250, 176, 5, 0.5)';
    ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PIT LANE', p.x + 6, p.y + p.h - 8);

    // Finish line
    drawCheckered(TRACK.finishX - 4, TRACK.finishY1, 8, TRACK.finishY2 - TRACK.finishY1);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  function drawCar(c, color) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-10, -5, 22, 12);
    // body
    ctx.fillStyle = color;
    ctx.fillRect(-11, -6, 22, 12);
    // hood gradient hint
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(-11, -6, 22, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-11, 3, 22, 3);
    // windshield
    ctx.fillStyle = 'rgba(15, 18, 28, 0.85)';
    ctx.fillRect(-1, -5, 5, 10);
    // headlights
    ctx.fillStyle = '#fff3bf';
    ctx.fillRect(9, -5, 2, 2);
    ctx.fillRect(9, 3, 2, 2);
    ctx.restore();
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
    ctx.fillText(msg, W / 2, 24);
    ctx.textAlign = 'left';
  }

  function draw() {
    drawTrack();
    for (const r of rivals) drawCar(r, r.color);
    drawCar(player, player.color);
    drawWarning();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  init();
  loop();
})();
