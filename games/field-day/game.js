(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const medalsEl = document.getElementById('medals');
  const hintEl = document.getElementById('hint-text');
  const restartBtn = document.getElementById('restart');

  const keys = Object.create(null);
  let lastTime = performance.now();
  let mouseX = -1, mouseY = -1;

  const STATE = {
    screen: 'hub',
    currentEvent: null,
    results: { sprint: null, longJump: null, archery: null, diving: null, skeet: null, hurdles: null, highJump: null, weightlifting: null },
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function medalFromValue(val, thresholds, lowerIsBetter) {
    const [g, s, b] = thresholds;
    if (val === 0 && !lowerIsBetter) return null; // foul / miss
    if (lowerIsBetter) {
      if (val <= g) return 'gold';
      if (val <= s) return 'silver';
      if (val <= b) return 'bronze';
    } else {
      if (val >= g) return 'gold';
      if (val >= s) return 'silver';
      if (val >= b) return 'bronze';
    }
    return null;
  }
  const medalEmoji = m => m === 'gold' ? '🥇' : m === 'silver' ? '🥈' : m === 'bronze' ? '🥉' : '—';
  const medalLabel = m => m === 'gold' ? 'Gold' : m === 'silver' ? 'Silver' : m === 'bronze' ? 'Bronze' : 'No medal';
  const medalColor = m => m === 'gold' ? '#ffd43b' : m === 'silver' ? '#ced4da' : m === 'bronze' ? '#cd7f32' : '#9aa0b4';

  function updateMedalsHUD() {
    let g = 0, s = 0, b = 0;
    for (const r of Object.values(STATE.results)) {
      if (!r) continue;
      if (r.medal === 'gold') g++;
      else if (r.medal === 'silver') s++;
      else if (r.medal === 'bronze') b++;
    }
    medalsEl.textContent = `🥇${g} 🥈${s} 🥉${b}`;
  }

  function startEvent(id) {
    STATE.screen = 'event';
    STATE.currentEvent = id;
    EVENTS[id].start();
    hintEl.textContent = EVENTS[id].hint;
  }
  function endEvent(value) {
    const evt = EVENTS[STATE.currentEvent];
    const medal = medalFromValue(value, evt.thresholds, evt.lowerIsBetter);
    STATE.results[STATE.currentEvent] = { value, medal };
    STATE.screen = 'result';
    updateMedalsHUD();
    let g = 0, s = 0, b = 0;
    for (const r of Object.values(STATE.results)) {
      if (!r) continue;
      if (r.medal === 'gold') g++;
      else if (r.medal === 'silver') s++;
      else if (r.medal === 'bronze') b++;
    }
    const total = g * 3 + s * 2 + b;
    if (window.GD) window.GD.record('field-day', total, 'score');
    hintEl.textContent = 'Press Space or click to return.';
  }
  function returnToHub() {
    STATE.screen = 'hub';
    STATE.currentEvent = null;
    hintEl.textContent = 'Click an event to play.';
  }
  function resetAll() {
    for (const k in STATE.results) STATE.results[k] = null;
    updateMedalsHUD();
    returnToHub();
  }

  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    grad.addColorStop(0, '#4dabf7');
    grad.addColorStop(1, '#a5d8ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H * 0.6);
    // Sun
    ctx.fillStyle = 'rgba(255, 236, 153, 0.85)';
    ctx.beginPath(); ctx.arc(W - 100, 70, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 236, 153, 0.25)';
    ctx.beginPath(); ctx.arc(W - 100, 70, 42, 0, Math.PI * 2); ctx.fill();
  }

  function drawAthlete(x, y, t, intensity = 0, color = '#fff') {
    const swing = Math.sin(t * Math.max(6, intensity * 1.5)) * Math.min(1, intensity / 4);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y - 36, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 29); ctx.lineTo(x + 2, y - 8);
    ctx.moveTo(x + 2, y - 8); ctx.lineTo(x - 8, y + 16 - swing * 10);
    ctx.moveTo(x + 2, y - 8); ctx.lineTo(x + 12, y + 16 + swing * 10);
    ctx.moveTo(x + 1, y - 24); ctx.lineTo(x - 10, y - 14 + swing * 8);
    ctx.moveTo(x + 1, y - 24); ctx.lineTo(x + 12, y - 14 - swing * 8);
    ctx.stroke();
  }

  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  const EVENTS = {};

  // ============================================================
  // SPRINT (100m)
  // ============================================================
  EVENTS.sprint = {
    id: 'sprint',
    name: '100m Sprint',
    icon: '🏃',
    desc: 'Race the clock over 100 metres.',
    hint: 'Alternate ← / → as fast as you can. Under 10s = gold.',
    thresholds: [10.0, 11.0, 12.0],
    lowerIsBetter: true,
    formatValue: v => `${v.toFixed(2)} s`,
    state: null,
    start() {
      this.state = { dist: 0, speed: 0, time: 0, lastKey: null, finished: false, doneAt: 0, sent: false };
    },
    update(dt) {
      const s = this.state;
      if (s.finished) {
        if (!s.sent && performance.now() / 1000 - s.doneAt > 0.7) {
          s.sent = true;
          endEvent(s.time);
        }
        return;
      }
      s.speed *= Math.pow(0.5, dt * 2.2);
      s.dist += s.speed * dt;
      s.time += dt;
      if (s.dist >= 100) {
        s.dist = 100;
        s.finished = true;
        s.doneAt = performance.now() / 1000;
      }
    },
    onKeyDown(code) {
      const s = this.state;
      if (!s || s.finished) return;
      const left = code === 'ArrowLeft' || code === 'KeyA';
      const right = code === 'ArrowRight' || code === 'KeyD';
      if (left && s.lastKey !== 'L') { s.speed += 1.1; s.lastKey = 'L'; }
      if (right && s.lastKey !== 'R') { s.speed += 1.1; s.lastKey = 'R'; }
      s.speed = Math.min(s.speed, 13);
    },
    draw() {
      const s = this.state;
      drawSky();
      ctx.fillStyle = '#51cf66';
      ctx.fillRect(0, H * 0.5, W, H * 0.1);
      ctx.fillStyle = '#c92a2a';
      ctx.fillRect(0, H * 0.6, W, H * 0.32);
      ctx.fillStyle = '#a51111';
      ctx.fillRect(0, H * 0.92, W, H * 0.08);

      const scroll = (s.dist * 24) % 80;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = -scroll; x < W; x += 80) {
        ctx.fillRect(x, H * 0.72, 40, 2);
        ctx.fillRect(x, H * 0.84, 40, 2);
      }

      const RX = W * 0.28;
      const PPM = 14;
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      for (let m = 0; m <= 100; m += 10) {
        const mx = RX + (m - s.dist) * PPM;
        if (mx < -20 || mx > W + 20) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(mx - 1, H * 0.6, 2, H * 0.32);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`${m}`, mx, H * 0.6 - 4);
      }

      const fx = RX + (100 - s.dist) * PPM;
      if (fx > -20 && fx < W + 20) {
        for (let row = 0; row * 8 < H * 0.32; row++) {
          for (let col = 0; col < 3; col++) {
            ctx.fillStyle = (row + col) % 2 === 0 ? '#fff' : '#0a0c12';
            ctx.fillRect(fx + col * 8, H * 0.6 + row * 8, 8, 8);
          }
        }
      }

      drawAthlete(RX, H * 0.84, s.time, s.speed);

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${s.dist.toFixed(1)} m   ·   ${s.time.toFixed(2)} s   ·   ${s.speed.toFixed(1)} m/s`, W / 2, 28);

      if (s.finished) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, H / 2 - 30, W, 60);
        ctx.fillStyle = '#ffd43b';
        ctx.font = 'bold 28px -apple-system, sans-serif';
        ctx.fillText('Finish!', W / 2, H / 2 + 10);
      }
      ctx.textAlign = 'left';
    },
  };

  // ============================================================
  // LONG JUMP
  // ============================================================
  EVENTS.longJump = {
    id: 'longJump',
    name: 'Long Jump',
    icon: '🦘',
    desc: 'Sprint up the runway and leap from the line.',
    hint: 'Alternate ← / → to run. Space to jump before the white line. Distance from the line is measured.',
    thresholds: [8.5, 6.5, 5.0],
    lowerIsBetter: false,
    formatValue: v => v <= 0 ? 'Foul' : `${v.toFixed(2)} m`,
    state: null,
    FOUL: 30,
    JUMP_FACTOR: 0.85,
    start() {
      this.state = {
        phase: 'run',
        dist: 0, speed: 0, time: 0, lastKey: null,
        jumpAtDist: 0, jumpSpeed: 0, jumpT: 0, airDur: 0,
        jumpRange: 0, jumpHeight: 0,
        landX: 0, result: null, foul: false,
        doneAt: 0, sent: false,
      };
    },
    update(dt) {
      const s = this.state;
      const G = 9.8;
      if (s.phase === 'run') {
        s.speed *= Math.pow(0.5, dt * 2.2);
        s.dist += s.speed * dt;
        s.time += dt;
        if (s.dist >= this.FOUL) {
          s.foul = true;
          s.phase = 'land';
          s.result = 0;
          s.doneAt = performance.now() / 1000;
        }
      } else if (s.phase === 'air') {
        const effSpeed = s.jumpSpeed * this.JUMP_FACTOR;
        const vx = Math.cos(Math.PI / 4) * effSpeed;
        const vy = Math.sin(Math.PI / 4) * effSpeed;
        s.jumpT += dt;
        const t = s.jumpT;
        s.jumpRange = vx * t;
        s.jumpHeight = Math.max(0, vy * t - 0.5 * G * t * t);
        if (t >= s.airDur) {
          s.landX = s.jumpAtDist + vx * s.airDur;
          s.result = Math.max(0, s.landX - this.FOUL);
          s.phase = 'land';
          s.doneAt = performance.now() / 1000;
        }
      } else if (s.phase === 'land') {
        if (!s.sent && performance.now() / 1000 - s.doneAt > 1.3) {
          s.sent = true;
          endEvent(s.result);
        }
      }
    },
    onKeyDown(code) {
      const s = this.state;
      if (!s || s.phase !== 'run') return;
      const left = code === 'ArrowLeft' || code === 'KeyA';
      const right = code === 'ArrowRight' || code === 'KeyD';
      if (left && s.lastKey !== 'L') { s.speed += 1.1; s.lastKey = 'L'; }
      if (right && s.lastKey !== 'R') { s.speed += 1.1; s.lastKey = 'R'; }
      s.speed = Math.min(s.speed, 13);
      if (code === 'Space' && s.speed > 0.5) {
        s.jumpSpeed = s.speed;
        const effSpeed = s.speed * this.JUMP_FACTOR;
        const vy = Math.sin(Math.PI / 4) * effSpeed;
        s.airDur = 2 * vy / 9.8;
        s.phase = 'air';
        s.jumpAtDist = s.dist;
      }
    },
    draw() {
      const s = this.state;
      drawSky();
      ctx.fillStyle = '#51cf66';
      ctx.fillRect(0, H * 0.5, W, H * 0.15);

      const FOUL = this.FOUL;
      const PPM = 12;
      let camDist;
      if (s.phase === 'run') camDist = s.dist;
      else if (s.phase === 'air') camDist = Math.max(s.jumpAtDist, s.jumpAtDist + s.jumpRange - 6);
      else camDist = s.landX - 8;
      const RX = W * 0.35;
      const mToScreen = m => RX + (m - camDist) * PPM;

      // Runway
      ctx.fillStyle = '#c92a2a';
      ctx.fillRect(mToScreen(-5), H * 0.65, (FOUL + 5) * PPM, H * 0.25);
      ctx.fillStyle = '#a51111';
      ctx.fillRect(mToScreen(-5), H * 0.9, (FOUL + 5) * PPM, H * 0.03);

      // Sand pit
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(mToScreen(FOUL), H * 0.65, 16 * PPM, H * 0.25);
      ctx.strokeStyle = 'rgba(166, 99, 32, 0.45)';
      ctx.lineWidth = 1;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      for (let m = 0; m <= 14; m++) {
        const mx = mToScreen(FOUL + m);
        ctx.beginPath();
        ctx.moveTo(mx, H * 0.65); ctx.lineTo(mx, H * 0.9);
        ctx.stroke();
        if (m % 2 === 0 && m > 0) {
          ctx.fillStyle = '#5c3411';
          ctx.fillText(`${m}m`, mx, H * 0.65 - 3);
        }
      }

      // Foul line
      const fx = mToScreen(FOUL);
      ctx.fillStyle = '#fff';
      ctx.fillRect(fx - 2, H * 0.65, 4, H * 0.25);

      // Athlete
      if (s.phase === 'run') {
        drawAthlete(RX, H * 0.85, s.time, s.speed);
      } else if (s.phase === 'air') {
        const ax = mToScreen(s.jumpAtDist + s.jumpRange);
        const ay = H * 0.85 - s.jumpHeight * PPM * 2.5;
        const t = s.jumpT;
        const rot = -Math.PI / 8 + t * 0.6;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(rot);
        ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -28, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -22); ctx.lineTo(2, -2);
        ctx.moveTo(2, -2); ctx.lineTo(-7, 16);
        ctx.moveTo(2, -2); ctx.lineTo(13, 8);
        ctx.moveTo(0, -18); ctx.lineTo(-13, -8);
        ctx.moveTo(0, -18); ctx.lineTo(12, -22);
        ctx.stroke();
        ctx.restore();
      } else if (s.phase === 'land') {
        if (s.foul) {
          const ax = mToScreen(FOUL + 1);
          const ay = H * 0.86;
          ctx.fillStyle = '#ff6b6b';
          ctx.font = 'bold 16px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Foul!', ax, ay - 36);
          drawAthlete(ax, ay, 0, 0, '#ff6b6b');
        } else {
          const ax = mToScreen(s.landX);
          const ay = H * 0.86;
          drawAthlete(ax, ay, 0, 0);
          ctx.strokeStyle = '#fab005';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(fx, H * 0.94); ctx.lineTo(ax, H * 0.94);
          ctx.stroke();
          ctx.fillStyle = '#fab005';
          ctx.font = 'bold 14px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${s.result.toFixed(2)} m`, (fx + ax) / 2, H * 0.94 - 6);
        }
      }

      // HUD
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 17px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      let line;
      if (s.phase === 'run') {
        const toFoul = (FOUL - s.dist).toFixed(1);
        line = `${s.speed.toFixed(1)} m/s   ·   ${toFoul} m to line`;
      } else if (s.phase === 'air') {
        line = `Airborne — ${s.jumpRange.toFixed(1)} m`;
      } else {
        line = s.foul ? 'Foul — crossed the line' : `Distance: ${s.result.toFixed(2)} m`;
      }
      ctx.fillText(line, W / 2, 28);
      ctx.textAlign = 'left';
    },
  };

  // ============================================================
  // ARCHERY
  // ============================================================
  EVENTS.archery = {
    id: 'archery',
    name: 'Archery',
    icon: '🏹',
    desc: 'Five arrows. Compensate for wind.',
    hint: 'Move the crosshair with arrow keys. Space to fire. Wind is shown top-right.',
    thresholds: [42, 33, 24],
    lowerIsBetter: false,
    formatValue: v => `${v} / 50`,
    state: null,
    start() {
      this.state = {
        shotsLeft: 5,
        aimX: 0, aimY: 0,
        windX: 0, windY: 0,
        totalScore: 0,
        history: [],
        finished: false,
        doneAt: 0,
        sent: false,
        shotFlash: 0,
      };
      this._newWind();
    },
    _newWind() {
      const s = this.state;
      s.windX = (Math.random() - 0.5) * 110;
      s.windY = (Math.random() - 0.5) * 60;
      s.aimX *= 0.3;
      s.aimY *= 0.3;
    },
    update(dt) {
      const s = this.state;
      if (s.shotFlash > 0) s.shotFlash = Math.max(0, s.shotFlash - dt);
      if (s.finished) {
        if (!s.sent && performance.now() / 1000 - s.doneAt > 1.5) {
          s.sent = true;
          endEvent(s.totalScore);
        }
        return;
      }
      const sp = 120;
      if (keys['ArrowLeft'] || keys['KeyA']) s.aimX -= sp * dt;
      if (keys['ArrowRight'] || keys['KeyD']) s.aimX += sp * dt;
      if (keys['ArrowUp'] || keys['KeyW']) s.aimY -= sp * dt;
      if (keys['ArrowDown'] || keys['KeyS']) s.aimY += sp * dt;
      s.aimX = clamp(s.aimX, -150, 150);
      s.aimY = clamp(s.aimY, -100, 100);
    },
    onKeyDown(code) {
      const s = this.state;
      if (!s || s.finished) return;
      if (code === 'Space') {
        const hitX = s.aimX + s.windX;
        const hitY = s.aimY + s.windY;
        const d = Math.hypot(hitX, hitY);
        const score = this._ringScore(d);
        s.history.push({ x: hitX, y: hitY, score });
        s.totalScore += score;
        s.shotsLeft -= 1;
        s.shotFlash = 0.2;
        if (s.shotsLeft <= 0) {
          s.finished = true;
          s.doneAt = performance.now() / 1000;
        } else {
          this._newWind();
        }
      }
    },
    _ringScore(d) {
      if (d < 10) return 10;
      if (d < 20) return 9;
      if (d < 32) return 8;
      if (d < 46) return 7;
      if (d < 62) return 6;
      if (d < 80) return 5;
      if (d < 100) return 3;
      if (d < 130) return 1;
      return 0;
    },
    draw() {
      const s = this.state;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#4dabf7');
      grad.addColorStop(0.55, '#a5d8ff');
      grad.addColorStop(0.55, '#51cf66');
      grad.addColorStop(1, '#37b24d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Archer
      const archerX = 90, archerY = H * 0.74;
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(archerX, archerY - 50, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(archerX, archerY - 42); ctx.lineTo(archerX, archerY - 10);
      ctx.moveTo(archerX, archerY - 10); ctx.lineTo(archerX - 8, archerY + 18);
      ctx.moveTo(archerX, archerY - 10); ctx.lineTo(archerX + 10, archerY + 18);
      ctx.moveTo(archerX, archerY - 30); ctx.lineTo(archerX + 22, archerY - 32);
      ctx.moveTo(archerX, archerY - 30); ctx.lineTo(archerX - 6, archerY - 36);
      ctx.stroke();
      // Bow
      ctx.strokeStyle = '#8b5e3c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(archerX + 28, archerY - 32, 16, -Math.PI / 2 - 0.7, -Math.PI / 2 + 0.7, true);
      ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(archerX + 28, archerY - 48);
      ctx.lineTo(archerX + 12, archerY - 32);
      ctx.lineTo(archerX + 28, archerY - 16);
      ctx.stroke();

      // Target
      const tx = W - 130, ty = H * 0.42;
      const rings = [
        { r: 130, c: '#fff' },
        { r: 100, c: '#212529' },
        { r: 80, c: '#339af0' },
        { r: 62, c: '#fcc419' },
        { r: 46, c: '#fa5252' },
        { r: 32, c: '#fa5252' },
        { r: 20, c: '#fff3bf' },
        { r: 10, c: '#fff3bf' },
      ];
      for (const ring of rings) {
        ctx.fillStyle = ring.c;
        ctx.beginPath(); ctx.arc(tx, ty, ring.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(tx, ty, ring.r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fill();

      // Target stand
      ctx.fillStyle = '#5c3411';
      ctx.fillRect(tx - 4, ty + 130, 8, 100);

      // History
      for (const h of s.history) {
        ctx.fillStyle = '#212529';
        ctx.beginPath();
        ctx.arc(tx + h.x, ty + h.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fab005';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (!s.finished) {
        const cx = tx + s.aimX, cy = ty + s.aimY;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy); ctx.lineTo(cx - 5, cy);
        ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 18, cy);
        ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 5);
        ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 18);
        ctx.stroke();
      }

      if (s.shotFlash > 0 && s.history.length > 0) {
        const last = s.history[s.history.length - 1];
        const alpha = s.shotFlash * 4;
        ctx.fillStyle = `rgba(255, 212, 59, ${Math.max(0, Math.min(1, alpha))})`;
        ctx.beginPath();
        ctx.arc(tx + last.x, ty + last.y, 16 * (1 + (0.2 - s.shotFlash) * 8), 0, Math.PI * 2);
        ctx.fill();
      }

      // HUD
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Arrows left: ${s.shotsLeft}   Score: ${s.totalScore}`, 16, 28);
      ctx.textAlign = 'right';
      ctx.fillText(`Wind: ${this._windText(s.windX, s.windY)}`, W - 16, 28);
      ctx.textAlign = 'left';

      if (s.finished) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, H / 2 - 30, W, 60);
        ctx.fillStyle = '#ffd43b';
        ctx.font = 'bold 26px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Final: ${s.totalScore} / 50`, W / 2, H / 2 + 8);
        ctx.textAlign = 'left';
      }
    },
    _windText(wx, wy) {
      const mag = Math.hypot(wx, wy);
      if (mag < 8) return 'Calm';
      let dir = '';
      if (Math.abs(wx) > 12) dir += wx > 0 ? '→' : '←';
      if (Math.abs(wy) > 8) dir += wy > 0 ? '↓' : '↑';
      return `${mag.toFixed(0)} ${dir || '·'}`;
    },
  };

  // ============================================================
  // DIVING
  // ============================================================
  EVENTS.diving = {
    id: 'diving',
    name: 'Diving',
    icon: '🤿',
    desc: 'One dive off the platform. Land head-first.',
    hint: 'Space to jump. Hold ← / → to rotate. ↓ slows your spin. Aim for π (head-down) on entry.',
    thresholds: [38, 28, 18],
    lowerIsBetter: false,
    formatValue: v => `${v.toFixed(1)} pts`,
    state: null,
    start() {
      this.state = {
        phase: 'platform',
        x: 110, y: 122, vx: 0, vy: 0,
        angle: 0, angVel: 0, totalRot: 0,
        score: 0, splashTime: 0, sent: false,
      };
    },
    update(dt) {
      const s = this.state;
      const WATER_Y = H - 100;
      if (s.phase === 'platform') return;
      if (s.phase === 'air') {
        if (keys['ArrowLeft'] || keys['KeyA']) s.angVel -= 10 * dt;
        if (keys['ArrowRight'] || keys['KeyD']) s.angVel += 10 * dt;
        if (keys['ArrowDown'] || keys['KeyS']) s.angVel *= Math.pow(0.25, dt);
        s.angVel = clamp(s.angVel, -10, 10);
        s.vy += 180 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.angle += s.angVel * dt;
        s.totalRot += Math.abs(s.angVel) * dt;
        if (s.y >= WATER_Y) {
          s.y = WATER_Y;
          s.phase = 'splash';
          s.score = this._scoreDive();
          s.splashTime = 0;
        }
      } else if (s.phase === 'splash') {
        s.splashTime += dt;
        if (s.splashTime > 1.6 && !s.sent) {
          s.sent = true;
          endEvent(s.score);
        }
      }
    },
    onKeyDown(code) {
      const s = this.state;
      if (!s) return;
      if (s.phase === 'platform' && code === 'Space') {
        s.phase = 'air';
        s.vx = 45;
        s.vy = -100;
      }
    },
    _scoreDive() {
      const s = this.state;
      const TWO_PI = Math.PI * 2;
      let modA = ((s.angle % TWO_PI) + TWO_PI) % TWO_PI;
      let dev = Math.abs(modA - Math.PI);
      if (dev > Math.PI) dev = TWO_PI - dev;
      const entry = Math.max(0, 32 * (1 - dev / Math.PI));
      const rotations = s.totalRot / TWO_PI;
      const diff = Math.min(18, rotations * 6);
      return entry + diff;
    },
    draw() {
      const s = this.state;
      const grad = ctx.createLinearGradient(0, 0, 0, H - 100);
      grad.addColorStop(0, '#1864ab');
      grad.addColorStop(1, '#74c0fc');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H - 100);
      ctx.fillStyle = '#1864ab';
      ctx.fillRect(0, H - 100, W, 100);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      const t0 = performance.now() / 1000;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        for (let x = 0; x < W; x += 6) {
          const y = H - 100 + i * 18 + Math.sin(x * 0.05 + t0 * 1.2 + i) * 2;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Platform
      ctx.fillStyle = '#495057';
      ctx.fillRect(0, 130, 140, 16);
      ctx.fillStyle = '#343a40';
      ctx.fillRect(0, 146, 22, H - 246);
      ctx.strokeStyle = '#868e96';
      ctx.beginPath();
      for (let y = 160; y < H - 120; y += 18) {
        ctx.moveTo(2, y); ctx.lineTo(20, y);
      }
      ctx.stroke();

      // Diver
      const dx = s.x, dy = s.y;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(s.angle);
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -22, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(0, 14);
      const tuck = s.phase === 'air' ? Math.min(1, s.totalRot / 6) : 0;
      ctx.moveTo(0, -10); ctx.lineTo(-9 + tuck * 6, -2 + tuck * 4);
      ctx.moveTo(0, -10); ctx.lineTo(9 - tuck * 6, -2 + tuck * 4);
      ctx.moveTo(0, 14); ctx.lineTo(-7 + tuck * 4, 22 - tuck * 6);
      ctx.moveTo(0, 14); ctx.lineTo(7 - tuck * 4, 22 - tuck * 6);
      ctx.stroke();
      ctx.restore();

      // Splash
      if (s.phase === 'splash') {
        const t = s.splashTime;
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.7 - t * 0.4)})`;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI;
          const r = 12 + t * 80;
          const xx = s.x + Math.cos(a) * r * 0.6;
          const yy = H - 100 - Math.sin(a) * r * 0.5 + t * 25;
          ctx.beginPath();
          ctx.arc(xx, yy, Math.max(0, 7 - t * 4), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const TWO_PI = Math.PI * 2;
      let modA = ((s.angle % TWO_PI) + TWO_PI) % TWO_PI;
      const orientDeg = (modA * 180 / Math.PI).toFixed(0);
      const rots = (s.totalRot / TWO_PI).toFixed(2);
      let line;
      if (s.phase === 'platform') line = 'Press Space to dive';
      else if (s.phase === 'air') line = `${rots} rotations  ·  pose ${orientDeg}°`;
      else line = `Score: ${s.score.toFixed(1)} / 50`;
      ctx.fillText(line, W / 2, 28);
      ctx.textAlign = 'left';
    },
  };

  // ============================================================
  // SKEET SHOOTING
  // ============================================================
  EVENTS.skeet = {
    id: 'skeet',
    name: 'Skeet Shoot',
    icon: '💥',
    desc: 'Shoot clay disks as they fly past.',
    hint: 'Aim with mouse or arrow keys. Space to fire. 12 shots, 10 disks.',
    thresholds: [40, 30, 20],
    lowerIsBetter: false,
    formatValue: v => `${v} / 50`,
    state: null,
    DISK_TOTAL: 10,
    SHOTS_TOTAL: 12,
    start() {
      this.state = {
        shotsLeft: this.SHOTS_TOTAL,
        disksSpawned: 0,
        score: 0,
        aimX: W / 2, aimY: H / 2,
        disks: [],
        shotFlash: 0,
        lastShotAt: 0,
        spawnTimer: 0.6,
        finished: false,
        doneAt: 0,
        sent: false,
        mouseLastX: -1, mouseLastY: -1,
      };
    },
    update(dt) {
      const s = this.state;
      if (s.shotFlash > 0) s.shotFlash = Math.max(0, s.shotFlash - dt);
      if (s.finished) {
        if (!s.sent && performance.now() / 1000 - s.doneAt > 1.4) {
          s.sent = true;
          endEvent(s.score);
        }
        return;
      }
      // Aim: mouse takes priority when it moved
      const sp = 320;
      if (mouseX >= 0 && mouseY >= 0 && (mouseX !== s.mouseLastX || mouseY !== s.mouseLastY)) {
        s.aimX = mouseX;
        s.aimY = clamp(mouseY, 0, H * 0.72);
        s.mouseLastX = mouseX; s.mouseLastY = mouseY;
      } else {
        if (keys['ArrowLeft'] || keys['KeyA']) s.aimX -= sp * dt;
        if (keys['ArrowRight'] || keys['KeyD']) s.aimX += sp * dt;
        if (keys['ArrowUp'] || keys['KeyW']) s.aimY -= sp * dt;
        if (keys['ArrowDown'] || keys['KeyS']) s.aimY += sp * dt;
        s.aimX = clamp(s.aimX, 0, W);
        s.aimY = clamp(s.aimY, 0, H * 0.72);
      }

      // Spawn disks
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0 && s.disksSpawned < this.DISK_TOTAL) {
        s.disksSpawned++;
        s.spawnTimer = 0.9 + Math.random() * 0.7;
        const fromLeft = Math.random() < 0.5;
        const sx = fromLeft ? -20 : W + 20;
        const sy = H * 0.7 - 8 - Math.random() * 40;
        const vy = -260 - Math.random() * 80;
        const vx = (fromLeft ? 1 : -1) * (190 + Math.random() * 140);
        s.disks.push({ x: sx, y: sy, vx, vy, alive: true, exploded: false, explodeT: 0, rot: 0 });
      }

      for (const d of s.disks) {
        if (d.exploded) {
          d.explodeT += dt;
          if (d.explodeT > 0.45) d.alive = false;
          continue;
        }
        d.vy += 420 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += dt * 9;
        if (d.x < -40 || d.x > W + 40 || d.y > H) d.alive = false;
      }
      s.disks = s.disks.filter(d => d.alive);

      const noMoreDisks = s.disksSpawned >= this.DISK_TOTAL && s.disks.length === 0;
      const outOfShots = s.shotsLeft <= 0 && !s.disks.some(d => !d.exploded);
      if (noMoreDisks || outOfShots) {
        s.finished = true;
        s.doneAt = performance.now() / 1000;
      }
    },
    onKeyDown(code) {
      const s = this.state;
      if (!s || s.finished) return;
      if (code === 'Space') {
        const now = performance.now() / 1000;
        if (s.shotsLeft <= 0 || now - s.lastShotAt < 0.18) return;
        s.lastShotAt = now;
        s.shotsLeft--;
        s.shotFlash = 0.18;
        let hit = null;
        let bestD = 32;
        for (const d of s.disks) {
          if (d.exploded) continue;
          const dist = Math.hypot(d.x - s.aimX, d.y - s.aimY);
          if (dist < bestD) { bestD = dist; hit = d; }
        }
        if (hit) {
          hit.exploded = true;
          hit.explodeT = 0;
          s.score += 5;
        }
      }
    },
    draw() {
      const s = this.state;
      drawSky();
      ctx.fillStyle = '#51cf66';
      ctx.fillRect(0, H * 0.7, W, H * 0.3);
      // Tree silhouettes
      ctx.fillStyle = '#2b8a3e';
      for (let i = 0; i < 6; i++) {
        const tx = 60 + i * 130;
        ctx.beginPath();
        ctx.moveTo(tx - 22, H * 0.7);
        ctx.lineTo(tx, H * 0.7 - 38);
        ctx.lineTo(tx + 22, H * 0.7);
        ctx.fill();
      }

      // Hunter
      const hx = 90, hy = H * 0.85;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(hx, hy - 36, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx, hy - 29); ctx.lineTo(hx, hy);
      ctx.moveTo(hx, hy); ctx.lineTo(hx - 6, hy + 22);
      ctx.moveTo(hx, hy); ctx.lineTo(hx + 6, hy + 22);
      ctx.moveTo(hx, hy - 22); ctx.lineTo(hx + 24, hy - 30);
      ctx.stroke();
      ctx.strokeStyle = '#5c3411'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hx + 12, hy - 22);
      ctx.lineTo(hx + 38, hy - 32);
      ctx.stroke();

      // Disks
      for (const d of s.disks) {
        if (d.exploded) {
          const t = d.explodeT;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = t * 50;
            const px = d.x + Math.cos(a) * r;
            const py = d.y + Math.sin(a) * r;
            ctx.fillStyle = `rgba(253, 126, 20, ${Math.max(0, 1 - t * 2.2)})`;
            ctx.beginPath();
            ctx.arc(px, py, Math.max(0, 5 - t * 9), 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate(d.rot);
          ctx.fillStyle = '#fd7e14';
          ctx.beginPath();
          ctx.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e8590c';
          ctx.beginPath();
          ctx.ellipse(0, -1.5, 12, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Crosshair
      if (!s.finished) {
        const cx = s.aimX, cy = s.aimY;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 12, cy);
        ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + 26, cy);
        ctx.moveTo(cx, cy - 26); ctx.lineTo(cx, cy - 12);
        ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + 26);
        ctx.stroke();
        if (s.shotFlash > 0) {
          ctx.strokeStyle = `rgba(255, 212, 59, ${Math.max(0, s.shotFlash * 5)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, 28, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // HUD
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Shots: ${s.shotsLeft}   Score: ${s.score}`, 16, 28);
      ctx.textAlign = 'right';
      const remaining = Math.max(0, this.DISK_TOTAL - s.disksSpawned);
      ctx.fillText(`Disks remaining: ${remaining}`, W - 16, 28);
      ctx.textAlign = 'left';

      if (s.finished) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, H / 2 - 30, W, 60);
        ctx.fillStyle = '#ffd43b';
        ctx.font = 'bold 26px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Final: ${s.score} / 50`, W / 2, H / 2 + 8);
        ctx.textAlign = 'left';
      }
    },
  };

  // ============================================================
  // HURDLES
  // ============================================================
  EVENTS.hurdles = {
    id: 'hurdles',
    name: 'Hurdles',
    icon: '🚧',
    desc: 'Sprint 100m and clear 8 hurdles.',
    hint: 'Alternate ← / → to run. Space to jump each hurdle. Hitting one slows you.',
    thresholds: [13.0, 14.5, 16.0],
    lowerIsBetter: true,
    formatValue: v => `${v.toFixed(2)} s`,
    state: null,
    start() {
      const HURDLES = [];
      for (let i = 0; i < 8; i++) HURDLES.push({ at: 14 + i * 10, hit: false, jumped: false });
      this.state = {
        dist: 0, speed: 0, time: 0, lastKey: null,
        jumping: false, jumpT: 0, jumpDur: 0.5,
        hurdlesHit: 0, hurdlesCleared: 0,
        hurdles: HURDLES,
        finished: false, doneAt: 0, sent: false,
      };
    },
    update(dt) {
      const s = this.state;
      if (s.finished) {
        if (!s.sent && performance.now() / 1000 - s.doneAt > 0.7) {
          s.sent = true;
          endEvent(s.time);
        }
        return;
      }
      s.speed *= Math.pow(0.5, dt * 2.2);
      s.dist += s.speed * dt;
      s.time += dt;
      if (s.jumping) {
        s.jumpT += dt;
        if (s.jumpT >= s.jumpDur) s.jumping = false;
      }
      for (const h of s.hurdles) {
        if (h.hit || h.jumped) continue;
        if (s.dist >= h.at) {
          if (s.jumping && s.jumpT < s.jumpDur * 0.88) {
            h.jumped = true;
            s.hurdlesCleared++;
          } else {
            h.hit = true;
            s.hurdlesHit++;
            s.speed *= 0.35;
          }
        }
      }
      if (s.dist >= 100) {
        s.dist = 100;
        s.finished = true;
        s.doneAt = performance.now() / 1000;
      }
    },
    onKeyDown(code) {
      const s = this.state;
      if (!s || s.finished) return;
      const left = code === 'ArrowLeft' || code === 'KeyA';
      const right = code === 'ArrowRight' || code === 'KeyD';
      if (left && s.lastKey !== 'L') { s.speed += 1.1; s.lastKey = 'L'; }
      if (right && s.lastKey !== 'R') { s.speed += 1.1; s.lastKey = 'R'; }
      s.speed = Math.min(s.speed, 13);
      if (code === 'Space' && !s.jumping) {
        s.jumping = true;
        s.jumpT = 0;
      }
    },
    draw() {
      const s = this.state;
      drawSky();
      ctx.fillStyle = '#51cf66';
      ctx.fillRect(0, H * 0.5, W, H * 0.1);
      ctx.fillStyle = '#c92a2a';
      ctx.fillRect(0, H * 0.6, W, H * 0.32);
      ctx.fillStyle = '#a51111';
      ctx.fillRect(0, H * 0.92, W, H * 0.08);

      const scroll = (s.dist * 24) % 80;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = -scroll; x < W; x += 80) {
        ctx.fillRect(x, H * 0.72, 40, 2);
        ctx.fillRect(x, H * 0.84, 40, 2);
      }

      const RX = W * 0.28;
      const PPM = 14;
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      for (let m = 0; m <= 100; m += 10) {
        const mx = RX + (m - s.dist) * PPM;
        if (mx < -20 || mx > W + 20) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(mx - 1, H * 0.6, 2, H * 0.32);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`${m}`, mx, H * 0.6 - 4);
      }

      // Hurdles
      for (const h of s.hurdles) {
        const hx = RX + (h.at - s.dist) * PPM;
        if (hx < -40 || hx > W + 40) continue;
        const top = H * 0.84 - 30;
        if (h.hit) {
          ctx.save();
          ctx.translate(hx, H * 0.84);
          ctx.rotate(-0.5);
          ctx.fillStyle = '#adb5bd';
          ctx.fillRect(-12, -30, 24, 4);
          ctx.fillStyle = '#495057';
          ctx.fillRect(-12, -30, 4, 30);
          ctx.fillRect(8, -30, 4, 30);
          ctx.restore();
        } else if (h.jumped) {
          ctx.fillStyle = 'rgba(173, 181, 189, 0.5)';
          ctx.fillRect(hx - 12, top, 24, 4);
          ctx.fillStyle = 'rgba(73, 80, 87, 0.5)';
          ctx.fillRect(hx - 12, top, 4, 30);
          ctx.fillRect(hx + 8, top, 4, 30);
        } else {
          ctx.fillStyle = '#adb5bd';
          ctx.fillRect(hx - 12, top, 24, 4);
          ctx.fillStyle = '#495057';
          ctx.fillRect(hx - 12, top, 4, 30);
          ctx.fillRect(hx + 8, top, 4, 30);
        }
      }

      const fx = RX + (100 - s.dist) * PPM;
      if (fx > -20 && fx < W + 20) {
        for (let row = 0; row * 8 < H * 0.32; row++) {
          for (let col = 0; col < 3; col++) {
            ctx.fillStyle = (row + col) % 2 === 0 ? '#fff' : '#0a0c12';
            ctx.fillRect(fx + col * 8, H * 0.6 + row * 8, 8, 8);
          }
        }
      }

      let ay = H * 0.84;
      if (s.jumping) {
        const tt = s.jumpT / s.jumpDur;
        ay -= Math.sin(tt * Math.PI) * 52;
      }
      drawAthlete(RX, ay, s.time, s.speed);

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${s.dist.toFixed(1)} m  ·  ${s.time.toFixed(2)} s  ·  cleared ${s.hurdlesCleared}/8  ·  hit ${s.hurdlesHit}`,
        W / 2, 28
      );

      if (s.finished) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, H / 2 - 30, W, 60);
        ctx.fillStyle = '#ffd43b';
        ctx.font = 'bold 28px -apple-system, sans-serif';
        ctx.fillText('Finish!', W / 2, H / 2 + 10);
      }
      ctx.textAlign = 'left';
    },
  };

  // ============================================================
  // HIGH JUMP
  // ============================================================
  EVENTS.highJump = {
    id: 'highJump',
    name: 'High Jump',
    icon: '⬆️',
    desc: 'Three attempts at rising bars.',
    hint: 'Alternate ← / → to run. Space to jump before the white line. Clear all three bars for gold.',
    thresholds: [2.1, 1.8, 1.5],
    lowerIsBetter: false,
    formatValue: v => v <= 0 ? 'No bar cleared' : `${v.toFixed(2)} m`,
    state: null,
    TAKEOFF: 15,
    BARS: [1.5, 1.8, 2.1],
    JUMP_FACTOR: 0.65,
    start() {
      this._resetAttempt();
      this.state.attempt = 0;
      this.state.bestCleared = 0;
      this.state.finished = false;
      this.state.doneAt = 0;
      this.state.sent = false;
    },
    _resetAttempt() {
      this.state = this.state || {};
      Object.assign(this.state, {
        phase: 'run',
        dist: 0, speed: 0, time: 0, lastKey: null,
        jumpAtDist: 0, jumpSpeed: 0, jumpT: 0, airDur: 0,
        maxHeight: 0,
        cleared: false,
        attemptDoneAt: 0,
      });
    },
    update(dt) {
      const s = this.state;
      const G = 9.8;
      if (s.finished) {
        if (!s.sent && performance.now() / 1000 - s.doneAt > 1.4) {
          s.sent = true;
          endEvent(s.bestCleared);
        }
        return;
      }
      if (s.phase === 'run') {
        s.speed *= Math.pow(0.5, dt * 2.2);
        s.dist += s.speed * dt;
        s.time += dt;
        if (s.dist >= this.TAKEOFF) {
          this._endAttempt(false);
        }
      } else if (s.phase === 'air') {
        s.jumpT += dt;
        if (s.jumpT >= s.airDur) {
          this._endAttempt(s.cleared);
        }
      } else if (s.phase === 'show') {
        if (performance.now() / 1000 - s.attemptDoneAt > 1.3) {
          s.attempt++;
          if (s.attempt >= this.BARS.length) {
            s.finished = true;
            s.doneAt = performance.now() / 1000;
          } else {
            const a = s.attempt, best = s.bestCleared;
            this._resetAttempt();
            s.attempt = a;
            s.bestCleared = best;
            s.finished = false;
            s.sent = false;
          }
        }
      }
    },
    _endAttempt(cleared) {
      const s = this.state;
      if (cleared) s.bestCleared = Math.max(s.bestCleared, this.BARS[s.attempt]);
      s.cleared = cleared;
      s.phase = 'show';
      s.attemptDoneAt = performance.now() / 1000;
    },
    onKeyDown(code) {
      const s = this.state;
      if (!s || s.phase !== 'run') return;
      const left = code === 'ArrowLeft' || code === 'KeyA';
      const right = code === 'ArrowRight' || code === 'KeyD';
      if (left && s.lastKey !== 'L') { s.speed += 1.1; s.lastKey = 'L'; }
      if (right && s.lastKey !== 'R') { s.speed += 1.1; s.lastKey = 'R'; }
      s.speed = Math.min(s.speed, 13);
      if (code === 'Space' && s.speed > 0.5) {
        const G = 9.8;
        const ang = Math.PI / 2.4;
        const effSpeed = s.speed * this.JUMP_FACTOR;
        const vy = Math.sin(ang) * effSpeed;
        s.jumpSpeed = s.speed;
        s.jumpAtDist = s.dist;
        s.maxHeight = vy * vy / (2 * G);
        s.airDur = 2 * vy / G;
        s.cleared = s.maxHeight >= this.BARS[s.attempt];
        s.phase = 'air';
        s.jumpT = 0;
      }
    },
    draw() {
      const s = this.state;
      drawSky();
      ctx.fillStyle = '#51cf66';
      ctx.fillRect(0, H * 0.5, W, H * 0.15);
      ctx.fillStyle = '#c92a2a';
      ctx.fillRect(0, H * 0.65, W, H * 0.27);

      const PPM = 14;
      const RX = W * 0.3;
      const camDist = s.phase === 'run' ? s.dist : s.jumpAtDist;
      const mToScreen = m => RX + (m - camDist) * PPM;

      // Pit (after takeoff)
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(mToScreen(this.TAKEOFF), H * 0.7, 14 * PPM, H * 0.22);

      // Takeoff line
      const tx = mToScreen(this.TAKEOFF);
      ctx.fillStyle = '#fff';
      ctx.fillRect(tx - 2, H * 0.65, 4, H * 0.25);

      const barHeight = this.BARS[s.attempt];
      const barPxPerM = 50;
      const barY = H * 0.85 - barHeight * barPxPerM;
      const barX = mToScreen(this.TAKEOFF + 2);
      const barX2 = mToScreen(this.TAKEOFF + 7);
      ctx.fillStyle = '#495057';
      ctx.fillRect(barX - 3, barY - 2, 6, H * 0.85 - barY + 2);
      ctx.fillRect(barX2 - 3, barY - 2, 6, H * 0.85 - barY + 2);
      ctx.fillStyle = (s.cleared && s.phase === 'show') ? '#51cf66'
                    : (!s.cleared && s.phase === 'show') ? '#fa5252'
                    : '#fff';
      ctx.fillRect(barX, barY - 1, barX2 - barX, 4);

      // Height labels at bar
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${barHeight.toFixed(2)} m`, barX2 + 6, barY + 4);

      // Athlete
      if (s.phase === 'run') {
        drawAthlete(RX, H * 0.85, s.time, s.speed);
      } else if (s.phase === 'air' || s.phase === 'show') {
        const G = 9.8;
        const ang = Math.PI / 2.4;
        const effSpeed = s.jumpSpeed * this.JUMP_FACTOR;
        const vx = Math.cos(ang) * effSpeed;
        const vy = Math.sin(ang) * effSpeed;
        const tA = s.phase === 'show' ? s.airDur : s.jumpT;
        const dx = vx * tA;
        const dy = Math.max(0, vy * tA - 0.5 * G * tA * tA);
        const ax = mToScreen(s.jumpAtDist + dx);
        const ay = H * 0.85 - dy * barPxPerM;
        const rot = -Math.PI / 8 + tA * 0.5;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(rot);
        ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -28, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -22); ctx.lineTo(2, -2);
        ctx.moveTo(2, -2); ctx.lineTo(-6, 12);
        ctx.moveTo(2, -2); ctx.lineTo(10, 14);
        ctx.moveTo(0, -18); ctx.lineTo(-12, -10);
        ctx.moveTo(0, -18); ctx.lineTo(12, -22);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      let line;
      if (s.phase === 'run') {
        line = `Attempt ${s.attempt + 1}/3  ·  Bar: ${barHeight.toFixed(2)} m  ·  ${s.speed.toFixed(1)} m/s`;
      } else if (s.phase === 'air') {
        line = `Attempt ${s.attempt + 1}/3  ·  Bar: ${barHeight.toFixed(2)} m`;
      } else {
        line = s.cleared ? `Cleared ${barHeight.toFixed(2)} m` : `Missed ${barHeight.toFixed(2)} m`;
      }
      ctx.fillText(line, W / 2, 28);
      ctx.textAlign = 'left';

      if (s.finished) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, H / 2 - 30, W, 60);
        ctx.fillStyle = '#ffd43b';
        ctx.font = 'bold 26px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.bestCleared > 0 ? `Best: ${s.bestCleared.toFixed(2)} m` : 'No bar cleared', W / 2, H / 2 + 8);
        ctx.textAlign = 'left';
      }
    },
  };

  // ============================================================
  // WEIGHTLIFTING
  // ============================================================
  EVENTS.weightlifting = {
    id: 'weightlifting',
    name: 'Weightlifting',
    icon: '🏋️',
    desc: 'Stop the power bar at the centre.',
    hint: 'A marker oscillates left–right. Press Space at the centre for maximum power.',
    thresholds: [220, 170, 120],
    lowerIsBetter: false,
    formatValue: v => `${v.toFixed(0)} kg`,
    state: null,
    start() {
      this.state = {
        barX: -1,
        barVel: 1.7,
        phase: 'aim',
        power: 0,
        weight: 0,
        doneAt: 0,
        sent: false,
      };
    },
    update(dt) {
      const s = this.state;
      if (s.phase === 'aim') {
        s.barX += s.barVel * dt;
        if (s.barX > 1) { s.barX = 1; s.barVel = -Math.abs(s.barVel); }
        if (s.barX < -1) { s.barX = -1; s.barVel = Math.abs(s.barVel); }
      } else if (s.phase === 'lifted') {
        if (!s.sent && performance.now() / 1000 - s.doneAt > 1.8) {
          s.sent = true;
          endEvent(s.weight);
        }
      }
    },
    onKeyDown(code) {
      const s = this.state;
      if (!s || s.phase !== 'aim') return;
      if (code === 'Space') {
        const dev = Math.abs(s.barX);
        s.power = 1 - dev;
        const adj = Math.pow(s.power, 1.5);
        s.weight = 50 + adj * 200;
        s.phase = 'lifted';
        s.doneAt = performance.now() / 1000;
      }
    },
    draw() {
      const s = this.state;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#212529');
      grad.addColorStop(1, '#343a40');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Stage
      ctx.fillStyle = '#1a1c20';
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      ctx.fillStyle = '#fab005';
      ctx.fillRect(0, H * 0.78, W, 2);

      // Spotlight
      const spotGrad = ctx.createRadialGradient(W / 2, H * 0.4, 60, W / 2, H * 0.4, 280);
      spotGrad.addColorStop(0, 'rgba(255, 248, 220, 0.18)');
      spotGrad.addColorStop(1, 'rgba(255, 248, 220, 0)');
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 0, W, H);

      // Lifter
      const lx = W / 2, ly = H * 0.78;
      const lifting = s.phase === 'lifted';
      const barY = lifting ? H * 0.30 : H * 0.55;
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(lx, ly - 70, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(lx, ly - 62); ctx.lineTo(lx, ly - 30);
      ctx.moveTo(lx, ly - 30); ctx.lineTo(lx - 12, ly);
      ctx.moveTo(lx, ly - 30); ctx.lineTo(lx + 12, ly);
      ctx.moveTo(lx, ly - 56); ctx.lineTo(lx - 24, barY + 8);
      ctx.moveTo(lx, ly - 56); ctx.lineTo(lx + 24, barY + 8);
      ctx.stroke();

      // Barbell
      ctx.fillStyle = '#adb5bd';
      ctx.fillRect(lx - 90, barY, 180, 4);
      ctx.fillStyle = '#212529';
      ctx.fillRect(lx - 90, barY - 12, 18, 30);
      ctx.fillRect(lx + 72, barY - 12, 18, 30);
      ctx.fillStyle = '#fa5252';
      ctx.fillRect(lx - 105, barY - 18, 16, 40);
      ctx.fillRect(lx + 89, barY - 18, 16, 40);

      // Power gauge
      if (s.phase === 'aim') {
        const gx = W / 2, gy = H * 0.88;
        const gw = 420;
        ctx.fillStyle = '#000';
        ctx.fillRect(gx - gw / 2 - 4, gy - 16, gw + 8, 24);
        for (let i = 0; i < 24; i++) {
          const t = i / 23;
          const dev = Math.abs(t * 2 - 1);
          const color = dev < 0.12 ? '#51cf66' : dev < 0.4 ? '#fcc419' : '#fa5252';
          ctx.fillStyle = color;
          ctx.fillRect(gx - gw / 2 + i * (gw / 24) + 1, gy - 12, gw / 24 - 2, 16);
        }
        const mx = gx + s.barX * gw / 2;
        ctx.fillStyle = '#fff';
        ctx.fillRect(mx - 2, gy - 20, 4, 32);
        ctx.fillStyle = '#000';
        ctx.fillRect(mx - 1, gy - 19, 2, 30);
      }

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 17px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const line = s.phase === 'aim' ? 'Press Space at the centre' : `Lifted ${s.weight.toFixed(0)} kg`;
      ctx.fillText(line, W / 2, 28);
      ctx.textAlign = 'left';
    },
  };

  // ============================================================
  // HUB
  // ============================================================
  const HUB_ORDER = ['sprint', 'longJump', 'archery', 'diving', 'skeet', 'hurdles', 'highJump', 'weightlifting'];
  const CARD_W = 160, CARD_H = 130, CARD_GAP = 16;
  const HUB_COLS = 4, HUB_ROWS = 2;
  function cardRect(i) {
    const col = i % HUB_COLS, row = Math.floor(i / HUB_COLS);
    const startX = (W - CARD_W * HUB_COLS - CARD_GAP * (HUB_COLS - 1)) / 2;
    const startY = 130;
    return {
      x: startX + col * (CARD_W + CARD_GAP),
      y: startY + row * (CARD_H + CARD_GAP),
      w: CARD_W, h: CARD_H,
    };
  }
  function isMouseOver(r) {
    return mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h;
  }

  function drawHub() {
    ctx.fillStyle = '#0e1015';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FIELD DAY', W / 2, 60);
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillStyle = '#9aa0b4';
    ctx.fillText('Four short events. Try for medals.', W / 2, 84);

    HUB_ORDER.forEach((id, i) => {
      const r = cardRect(i);
      const result = STATE.results[id];
      const evt = EVENTS[id];
      const hot = isMouseOver(r);
      ctx.fillStyle = hot ? '#1f2330' : '#171a22';
      ctx.strokeStyle = hot ? '#74c0fc' : '#2a2f3d';
      ctx.lineWidth = hot ? 2 : 1;
      roundRect(r.x, r.y, r.w, r.h, 10);
      ctx.fill(); ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#74c0fc';
      ctx.font = '36px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillText(evt.icon, r.x + r.w / 2, r.y + 54);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.fillText(evt.name, r.x + r.w / 2, r.y + 82);

      const footY = r.y + r.h - 18;
      if (result) {
        ctx.fillStyle = medalColor(result.medal);
        ctx.font = 'bold 13px -apple-system, sans-serif';
        ctx.fillText(`${medalEmoji(result.medal)} ${evt.formatValue(result.value)}`, r.x + r.w / 2, footY);
      } else {
        ctx.fillStyle = '#fab005';
        ctx.font = 'bold 12px -apple-system, sans-serif';
        ctx.fillText('▶ Click to play', r.x + r.w / 2, footY);
      }
      ctx.textAlign = 'left';
    });

    const all = HUB_ORDER.every(id => STATE.results[id] !== null);
    if (all) {
      const y = 130 + CARD_H * HUB_ROWS + CARD_GAP + 12;
      ctx.fillStyle = '#171a22';
      ctx.strokeStyle = '#fab005';
      ctx.lineWidth = 1;
      roundRect(40, y, W - 80, 48, 8);
      ctx.fill(); ctx.stroke();
      let g = 0, sv = 0, b = 0, n = 0;
      for (const id of HUB_ORDER) {
        const m = STATE.results[id].medal;
        if (m === 'gold') g++;
        else if (m === 'silver') sv++;
        else if (m === 'bronze') b++;
        else n++;
      }
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`All events complete — 🥇${g}  🥈${sv}  🥉${b}  ·  ${n} unmedalled`, W / 2, y + 30);
    }

    ctx.textAlign = 'left';
  }

  function drawResult() {
    const evt = EVENTS[STATE.currentEvent];
    evt.draw();

    ctx.fillStyle = 'rgba(10, 12, 18, 0.85)';
    ctx.fillRect(0, 0, W, H);
    const r = STATE.results[STATE.currentEvent];

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.fillText(evt.name, W / 2, 110);

    ctx.font = 'bold 88px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.fillText(medalEmoji(r.medal), W / 2, 220);

    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.fillStyle = medalColor(r.medal);
    ctx.fillText(medalLabel(r.medal), W / 2, 260);

    ctx.font = '18px -apple-system, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(evt.formatValue(r.value), W / 2, 295);

    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillStyle = '#9aa0b4';
    ctx.fillText('Press Space or click to return', W / 2, H - 50);
    ctx.textAlign = 'left';
  }

  // ============================================================
  // INPUT
  // ============================================================
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (W / rect.width);
    mouseY = (e.clientY - rect.top) * (H / rect.height);
  });
  canvas.addEventListener('mouseleave', () => { mouseX = -1; mouseY = -1; });
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);
    if (STATE.screen === 'hub') {
      HUB_ORDER.forEach((id, i) => {
        const r = cardRect(i);
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          startEvent(id);
        }
      });
    } else if (STATE.screen === 'result') {
      returnToHub();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
      e.preventDefault();
    }
    keys[e.code] = true;
    if (STATE.screen === 'event') {
      const evt = EVENTS[STATE.currentEvent];
      if (evt.onKeyDown) evt.onKeyDown(e.code);
    } else if (STATE.screen === 'result' && e.code === 'Space') {
      returnToHub();
    }
    if (e.code === 'KeyR' && STATE.screen === 'event') {
      EVENTS[STATE.currentEvent].start();
    } else if (e.code === 'Escape' && (STATE.screen === 'event' || STATE.screen === 'result')) {
      returnToHub();
    }
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });

  restartBtn.addEventListener('click', () => {
    if (STATE.screen === 'event') {
      EVENTS[STATE.currentEvent].start();
    } else {
      resetAll();
    }
  });

  // ============================================================
  // LOOP
  // ============================================================
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (STATE.screen === 'hub') {
      drawHub();
    } else if (STATE.screen === 'event') {
      EVENTS[STATE.currentEvent].update(dt);
      EVENTS[STATE.currentEvent].draw();
    } else if (STATE.screen === 'result') {
      drawResult();
    }
    requestAnimationFrame(loop);
  }

  updateMedalsHUD();
  requestAnimationFrame(loop);
})();
