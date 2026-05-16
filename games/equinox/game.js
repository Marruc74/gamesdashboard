(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const statsEl = document.getElementById('stats');
  const restartBtn = document.getElementById('restart');

  const VW = canvas.width;
  const VH = canvas.height;
  const BSIZE = 8;
  const TILE = 56;
  const BOARD_W = BSIZE * TILE;
  const BOARD_X = (VW - BOARD_W) / 2;
  const BOARD_Y = 60;

  const ARENA_X = 20;
  const ARENA_Y = 60;
  const ARENA_W = VW - 40;
  const ARENA_H = VH - 100;

  const SOLAR = 'solar';
  const LUNAR = 'lunar';

  const COLORS = {
    solar: '#fbbf24',
    lunar: '#a78bfa',
  };

  // Piece templates. range = board step range. shot = arena projectile speed.
  // cool = frames between shots. atk = damage per shot. speed = arena px/frame.
  // sigil = glyph drawn on board piece. preferred = arena AI ideal distance.
  const PIECES = {
    leader:   { name: 'Leader',   range: 2, hp: 100, speed: 1.4, atk: 14, cool: 28, shot: 4.8, sigil: '★', preferred: 180 },
    champion: { name: 'Champion', range: 3, hp: 150, speed: 1.1, atk: 18, cool: 22, shot: 3.6, sigil: '◆', preferred:  70 },
    knight:   { name: 'Knight',   range: 5, hp:  80, speed: 2.7, atk:  9, cool: 11, shot: 5.0, sigil: '♞', preferred: 110 },
    archer:   { name: 'Archer',   range: 4, hp:  65, speed: 2.0, atk: 11, cool: 18, shot: 7.2, sigil: '➹', preferred: 240 },
    footman:  { name: 'Footman',  range: 2, hp:  55, speed: 1.8, atk:  7, cool: 15, shot: 4.6, sigil: '♟', preferred: 130 },
  };

  // --- State ---
  let mode;          // 'menu' | 'board' | 'arena' | 'win'
  let pieces;        // array of {x, y, type, side, hp}
  let board;         // 2D array of piece refs
  let turn;          // 'solar' | 'lunar'
  let selected;      // piece ref or null
  let validMoves;    // array of {x, y, combat}
  let winner;        // 'solar' | 'lunar' | null
  let arena;         // arena state
  let banner;        // {text, t}
  const input = Object.create(null);
  let aiCooldown = 0;

  // --- Init ---
  function newGame() {
    pieces = [];
    board = Array.from({ length: BSIZE }, () => Array(BSIZE).fill(null));

    const backRow   = ['archer', 'knight', 'footman', 'champion', 'leader', 'footman', 'knight', 'archer'];
    const frontRow  = ['footman','footman','footman', 'footman',  'footman','footman', 'footman','footman'];

    for (let x = 0; x < BSIZE; x++) {
      addPiece(x, 0, backRow[x], LUNAR);
      addPiece(x, 1, frontRow[x], LUNAR);
      addPiece(x, BSIZE - 1, backRow[x], SOLAR);
      addPiece(x, BSIZE - 2, frontRow[x], SOLAR);
    }

    turn = SOLAR;
    selected = null;
    validMoves = [];
    winner = null;
    arena = null;
    banner = { text: 'Your move — Solar', t: 120 };
    mode = 'board';
    aiCooldown = 0;
  }

  function addPiece(x, y, type, side) {
    const p = { x, y, type, side, hp: PIECES[type].hp };
    pieces.push(p);
    board[y][x] = p;
  }

  // --- Board logic ---
  function computeMoves(p) {
    const moves = [];
    const range = PIECES[p.type].range;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for (const [dx, dy] of dirs) {
      for (let step = 1; step <= range; step++) {
        const nx = p.x + dx * step;
        const ny = p.y + dy * step;
        if (nx < 0 || nx >= BSIZE || ny < 0 || ny >= BSIZE) break;
        const blocker = board[ny][nx];
        if (blocker) {
          if (blocker.side !== p.side) moves.push({ x: nx, y: ny, combat: true });
          break;
        }
        moves.push({ x: nx, y: ny, combat: false });
      }
    }
    return moves;
  }

  function executeMove(p, tx, ty) {
    const target = board[ty][tx];
    if (target) {
      startArena(p, target, tx, ty);
    } else {
      board[p.y][p.x] = null;
      p.x = tx; p.y = ty;
      board[ty][tx] = p;
      endTurn();
    }
  }

  function endTurn() {
    selected = null;
    validMoves = [];

    const solarLeader = pieces.find(p => p.side === SOLAR && p.type === 'leader');
    const lunarLeader = pieces.find(p => p.side === LUNAR && p.type === 'leader');
    const solarLive   = pieces.some(p => p.side === SOLAR);
    const lunarLive   = pieces.some(p => p.side === LUNAR);
    if (!solarLeader || !solarLive) { winner = LUNAR; mode = 'win'; return; }
    if (!lunarLeader || !lunarLive) { winner = SOLAR; mode = 'win'; return; }

    turn = turn === SOLAR ? LUNAR : SOLAR;
    banner = { text: turn === SOLAR ? 'Your move — Solar' : 'Lunar is thinking…', t: 90 };
    if (turn === LUNAR) aiCooldown = 30;
  }

  function aiMove() {
    if (turn !== LUNAR || mode !== 'board') return;
    const myPieces = pieces.filter(p => p.side === LUNAR);
    if (myPieces.length === 0) return;

    const solarLeader = pieces.find(p => p.side === SOLAR && p.type === 'leader');
    let best = null, bestScore = -Infinity;
    for (const p of myPieces) {
      const moves = computeMoves(p);
      for (const m of moves) {
        let score = 0;
        const target = board[m.y][m.x];
        if (target) {
          const our = PIECES[p.type];
          const their = PIECES[target.type];
          // Power ratio approximates duel odds
          const ourPow = (our.hp + our.atk * 6 / our.cool) * (p.hp / our.hp);
          const theirPow = (their.hp + their.atk * 6 / their.cool) * (target.hp / their.hp);
          score = 30 + (ourPow - theirPow) * 0.5;
          if (target.type === 'leader') score += 250;
          if (target.type === 'champion') score += 30;
        } else if (solarLeader) {
          const dCur = Math.abs(p.x - solarLeader.x) + Math.abs(p.y - solarLeader.y);
          const dNew = Math.abs(m.x - solarLeader.x) + Math.abs(m.y - solarLeader.y);
          score = (dCur - dNew) * 4;
          // Slight nudge to keep leader back
          if (p.type === 'leader') score -= 8;
        }
        score += Math.random() * 4;
        if (score > bestScore) { bestScore = score; best = { piece: p, move: m }; }
      }
    }
    if (best) {
      executeMove(best.piece, best.move.x, best.move.y);
    } else {
      // No moves: forfeit
      winner = SOLAR;
      mode = 'win';
    }
  }

  // --- Arena ---
  function startArena(attacker, defender, tx, ty) {
    mode = 'arena';
    const atkT = PIECES[attacker.type];
    const defT = PIECES[defender.type];
    arena = {
      attacker, defender, tx, ty,
      // Attacker on the left side of the arena, defender on the right
      atk: {
        x: ARENA_X + 80, y: ARENA_Y + ARENA_H / 2,
        vx: 0, vy: 0,
        hp: attacker.hp, maxHp: atkT.hp,
        type: attacker.type, side: attacker.side,
        cool: 30, flash: 0,
        face: { x: 1, y: 0 },
      },
      def: {
        x: ARENA_X + ARENA_W - 80, y: ARENA_Y + ARENA_H / 2,
        vx: 0, vy: 0,
        hp: defender.hp, maxHp: defT.hp,
        type: defender.type, side: defender.side,
        cool: 30, flash: 0,
        face: { x: -1, y: 0 },
      },
      bullets: [],
      done: false,
      endHold: 0,
      timer: 60 * 30, // 30 second cap
      countdown: 90,  // ~1.5s prep before fighting
    };
    // Player always controls the Solar piece, whether attacker or defender
    arena.playerSide = SOLAR;
    arena.playerKey  = attacker.side === SOLAR ? 'atk' : 'def';
    arena.aiKey      = arena.playerKey === 'atk' ? 'def' : 'atk';
  }

  function arenaUpdate() {
    if (!arena || arena.done) return;
    if (arena.countdown > 0) { arena.countdown -= 1; return; }
    arena.timer -= 1;

    const player = arena[arena.playerKey];
    const ai     = arena[arena.aiKey];
    const pT = PIECES[player.type];
    const aT = PIECES[ai.type];

    // Player input
    let mx = 0, my = 0;
    if (input['ArrowLeft']  || input['KeyA']) mx -= 1;
    if (input['ArrowRight'] || input['KeyD']) mx += 1;
    if (input['ArrowUp']    || input['KeyW']) my -= 1;
    if (input['ArrowDown']  || input['KeyS']) my += 1;
    if (mx || my) {
      const norm = Math.hypot(mx, my);
      mx /= norm; my /= norm;
      player.vx = mx * pT.speed * 1.6;
      player.vy = my * pT.speed * 1.6;
      player.face = { x: mx, y: my };
    } else {
      player.vx *= 0.6; player.vy *= 0.6;
    }
    player.x = clamp(ARENA_X + 18, ARENA_X + ARENA_W - 18, player.x + player.vx);
    player.y = clamp(ARENA_Y + 18, ARENA_Y + ARENA_H - 18, player.y + player.vy);

    if (player.cool > 0) player.cool -= 1;
    if (input['Space'] && player.cool <= 0) {
      arena.bullets.push(makeBullet(player, pT));
      player.cool = pT.cool;
    }

    // AI: maintain preferred range and shoot when in range
    const dx = player.x - ai.x;
    const dy = player.y - ai.y;
    const d  = Math.hypot(dx, dy) || 0.001;
    const want = aT.preferred;
    let chase = 0;
    if (d > want + 30) chase = 1;
    else if (d < want - 30) chase = -1;
    if (chase) {
      ai.vx = (dx / d) * aT.speed * 1.3 * chase;
      ai.vy = (dy / d) * aT.speed * 1.3 * chase;
    } else {
      // Strafe slightly
      ai.vx = -dy / d * aT.speed;
      ai.vy =  dx / d * aT.speed;
    }
    ai.x = clamp(ARENA_X + 18, ARENA_X + ARENA_W - 18, ai.x + ai.vx);
    ai.y = clamp(ARENA_Y + 18, ARENA_Y + ARENA_H - 18, ai.y + ai.vy);
    ai.face = { x: dx / d, y: dy / d };

    if (ai.cool > 0) ai.cool -= 1;
    if (ai.cool <= 0 && d < aT.preferred * 1.6) {
      arena.bullets.push(makeBullet(ai, aT));
      ai.cool = aT.cool + Math.floor(Math.random() * 6);
    }

    // Bullets
    for (const b of arena.bullets) {
      b.x += b.vx; b.y += b.vy;
      b.life -= 1;
      if (b.x < ARENA_X || b.x > ARENA_X + ARENA_W ||
          b.y < ARENA_Y || b.y > ARENA_Y + ARENA_H) b.life = 0;
    }
    for (const b of arena.bullets) {
      if (b.life <= 0) continue;
      const target = b.owner === 'atk' ? arena.def : arena.atk;
      const ddx = target.x - b.x, ddy = target.y - b.y;
      if (ddx * ddx + ddy * ddy < 20 * 20) {
        target.hp -= b.dmg;
        target.flash = 8;
        b.life = 0;
      }
    }
    arena.bullets = arena.bullets.filter(b => b.life > 0);

    if (arena.atk.flash > 0) arena.atk.flash -= 1;
    if (arena.def.flash > 0) arena.def.flash -= 1;

    if (arena.atk.hp <= 0 || arena.def.hp <= 0 || arena.timer <= 0) {
      let winKey;
      if (arena.atk.hp <= 0 && arena.def.hp <= 0) winKey = 'def';
      else if (arena.atk.hp <= 0) winKey = 'def';
      else if (arena.def.hp <= 0) winKey = 'atk';
      else winKey = arena.atk.hp >= arena.def.hp ? 'atk' : 'def';
      arena.done = true;
      arena.winKey = winKey;
      arena.endHold = 70;
    }
  }

  function makeBullet(unit, tpl) {
    return {
      x: unit.x, y: unit.y,
      vx: unit.face.x * tpl.shot,
      vy: unit.face.y * tpl.shot,
      dmg: tpl.atk,
      owner: unit === arena.atk ? 'atk' : 'def',
      life: 100,
      color: COLORS[unit.side],
    };
  }

  function resolveArena() {
    const winKey = arena.winKey;
    const winnerPiece = winKey === 'atk' ? arena.attacker : arena.defender;
    const loserPiece  = winKey === 'atk' ? arena.defender : arena.attacker;

    pieces = pieces.filter(p => p !== loserPiece);
    board[loserPiece.y][loserPiece.x] = null;

    if (winKey === 'atk') {
      board[arena.attacker.y][arena.attacker.x] = null;
      arena.attacker.x = arena.tx;
      arena.attacker.y = arena.ty;
      board[arena.ty][arena.tx] = arena.attacker;
      arena.attacker.hp = Math.max(1, Math.round(arena.atk.hp));
    } else {
      arena.defender.hp = Math.max(1, Math.round(arena.def.hp));
    }

    mode = 'board';
    arena = null;
    endTurn();
  }

  function clamp(min, max, v) { return Math.max(min, Math.min(max, v)); }

  // --- Input ---
  document.addEventListener('keydown', e => {
    input[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code.startsWith('Key')) {
      e.preventDefault();
    }
    if (e.code === 'KeyR') {
      newGame();
    }
  });
  document.addEventListener('keyup', e => { input[e.code] = false; });
  restartBtn.addEventListener('click', () => newGame());

  canvas.addEventListener('click', (e) => {
    if (mode === 'win') { newGame(); return; }
    if (mode === 'arena') return;
    if (mode !== 'board') return;
    if (turn !== SOLAR) return;

    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (VW / rect.width);
    const cy = (e.clientY - rect.top)  * (VH / rect.height);
    const tx = Math.floor((cx - BOARD_X) / TILE);
    const ty = Math.floor((cy - BOARD_Y) / TILE);
    if (tx < 0 || tx >= BSIZE || ty < 0 || ty >= BSIZE) {
      selected = null; validMoves = []; return;
    }

    if (selected) {
      const move = validMoves.find(m => m.x === tx && m.y === ty);
      if (move) {
        executeMove(selected, tx, ty);
        return;
      }
      const piece = board[ty][tx];
      if (piece && piece.side === SOLAR) {
        selected = piece;
        validMoves = computeMoves(piece);
      } else {
        selected = null;
        validMoves = [];
      }
    } else {
      const piece = board[ty][tx];
      if (piece && piece.side === SOLAR) {
        selected = piece;
        validMoves = computeMoves(piece);
      }
    }
  });

  // --- Render ---
  function render() {
    ctx.fillStyle = '#06080d';
    ctx.fillRect(0, 0, VW, VH);
    if (mode === 'arena') renderArena();
    else renderBoard();
  }

  function renderBoard() {
    // Board background
    ctx.fillStyle = '#0d1119';
    ctx.fillRect(BOARD_X - 6, BOARD_Y - 6, BOARD_W + 12, BOARD_W + 12);

    // Squares
    for (let y = 0; y < BSIZE; y++) {
      for (let x = 0; x < BSIZE; x++) {
        const sx = BOARD_X + x * TILE;
        const sy = BOARD_Y + y * TILE;
        const light = (x + y) % 2 === 0;
        ctx.fillStyle = light ? '#1f2433' : '#141a25';
        ctx.fillRect(sx, sy, TILE, TILE);
      }
    }

    // Move highlights
    if (selected) {
      for (const m of validMoves) {
        const sx = BOARD_X + m.x * TILE;
        const sy = BOARD_Y + m.y * TILE;
        ctx.fillStyle = m.combat ? 'rgba(239,68,68,0.30)' : 'rgba(34,211,238,0.20)';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = m.combat ? '#ef4444' : '#22d3ee';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
      }
      const sx = BOARD_X + selected.x * TILE;
      const sy = BOARD_Y + selected.y * TILE;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      ctx.strokeRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
    }

    // Pieces
    for (const p of pieces) {
      const sx = BOARD_X + p.x * TILE + TILE / 2;
      const sy = BOARD_Y + p.y * TILE + TILE / 2;
      drawPiece(sx, sy, p);
    }

    // Border
    ctx.strokeStyle = '#2a2f3d';
    ctx.lineWidth = 1;
    ctx.strokeRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_W);

    // Banner
    if (banner) {
      banner.t -= 1;
      if (banner.t <= 0) banner = null;
      else {
        ctx.fillStyle = `rgba(251,191,36,${Math.min(1, banner.t / 30)})`;
        ctx.font = 'bold 20px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(banner.text, VW / 2, BOARD_Y - 18);
      }
    } else {
      ctx.fillStyle = COLORS[turn];
      ctx.font = 'bold 18px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(turn === SOLAR ? 'Solar to move' : 'Lunar to move', VW / 2, BOARD_Y - 18);
    }

    // Win overlay
    if (mode === 'win') {
      ctx.fillStyle = 'rgba(6,8,13,0.78)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = COLORS[winner];
      ctx.font = 'bold 36px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${winner === SOLAR ? 'Solar' : 'Lunar'} prevails`, VW / 2, VH / 2 - 14);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '15px -apple-system, "Segoe UI", sans-serif';
      ctx.fillText('Click or press R for a new game', VW / 2, VH / 2 + 18);
    }
  }

  function drawPiece(sx, sy, p) {
    const tpl = PIECES[p.type];
    const color = COLORS[p.side];
    // Disc
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, TILE * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(6,8,13,0.85)';
    ctx.beginPath();
    ctx.arc(sx, sy, TILE * 0.30, 0, Math.PI * 2);
    ctx.fill();
    // Sigil
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.floor(TILE * 0.4)}px "SF Mono", Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tpl.sigil, sx, sy + 2);
    // HP bar (if damaged)
    if (p.hp < tpl.hp) {
      const w = TILE * 0.7;
      const x0 = sx - w / 2;
      const y0 = sy + TILE * 0.36;
      ctx.fillStyle = '#0f1623';
      ctx.fillRect(x0, y0, w, 3);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, w * (p.hp / tpl.hp), 3);
    }
  }

  function renderArena() {
    // Frame
    ctx.fillStyle = '#0d1119';
    ctx.fillRect(ARENA_X - 6, ARENA_Y - 6, ARENA_W + 12, ARENA_H + 12);
    ctx.fillStyle = '#06080d';
    ctx.fillRect(ARENA_X, ARENA_Y, ARENA_W, ARENA_H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = ARENA_X; x < ARENA_X + ARENA_W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, ARENA_Y); ctx.lineTo(x, ARENA_Y + ARENA_H); ctx.stroke();
    }
    for (let y = ARENA_Y; y < ARENA_Y + ARENA_H; y += 40) {
      ctx.beginPath(); ctx.moveTo(ARENA_X, y); ctx.lineTo(ARENA_X + ARENA_W, y); ctx.stroke();
    }

    // HP bars (atk on left, def on right)
    drawArenaHud();

    // Bullets
    for (const b of arena.bullets) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Units
    drawArenaUnit(arena.atk);
    drawArenaUnit(arena.def);

    // Countdown or end banner
    if (arena.countdown > 0) {
      ctx.fillStyle = 'rgba(6,8,13,0.5)';
      ctx.fillRect(ARENA_X, ARENA_Y, ARENA_W, ARENA_H);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 42px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      const label = arena.countdown > 30 ? `Ready… ${Math.ceil(arena.countdown / 30)}` : 'Fight!';
      ctx.fillText(label, VW / 2, ARENA_Y + ARENA_H / 2);
    } else if (arena.done) {
      ctx.fillStyle = 'rgba(6,8,13,0.55)';
      ctx.fillRect(ARENA_X, ARENA_Y, ARENA_W, ARENA_H);
      const winSide = (arena.winKey === 'atk' ? arena.atk : arena.def).side;
      ctx.fillStyle = COLORS[winSide];
      ctx.font = 'bold 32px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${winSide === SOLAR ? 'Solar' : 'Lunar'} wins the square`, VW / 2, ARENA_Y + ARENA_H / 2);
      arena.endHold -= 1;
      if (arena.endHold <= 0) resolveArena();
    }
  }

  function drawArenaHud() {
    const atkT = PIECES[arena.atk.type];
    const defT = PIECES[arena.def.type];
    ctx.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS[arena.atk.side];
    ctx.fillText(`${atkT.name} (${arena.atk.side === SOLAR ? 'Solar' : 'Lunar'})`, ARENA_X, ARENA_Y - 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS[arena.def.side];
    ctx.fillText(`${defT.name} (${arena.def.side === SOLAR ? 'Solar' : 'Lunar'})`, ARENA_X + ARENA_W, ARENA_Y - 12);
    // HP bars
    drawHpBar(ARENA_X, ARENA_Y - 8, 200, arena.atk.hp / atkT.hp, COLORS[arena.atk.side]);
    drawHpBar(ARENA_X + ARENA_W - 200, ARENA_Y - 8, 200, arena.def.hp / defT.hp, COLORS[arena.def.side]);
  }

  function drawHpBar(x, y, w, frac, color) {
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, frac), 4);
  }

  function drawArenaUnit(u) {
    const tpl = PIECES[u.type];
    ctx.fillStyle = u.flash > 0 ? '#ffffff' : COLORS[u.side];
    ctx.beginPath();
    ctx.arc(u.x, u.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(6,8,13,0.85)';
    ctx.beginPath();
    ctx.arc(u.x, u.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS[u.side];
    ctx.font = 'bold 16px "SF Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tpl.sigil, u.x, u.y + 1);
    // Facing tick
    ctx.strokeStyle = COLORS[u.side];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.x + u.face.x * 20, u.y + u.face.y * 20);
    ctx.stroke();
  }

  // --- Stats line ---
  function renderStats() {
    if (mode === 'arena' && arena) {
      const atkT = PIECES[arena.atk.type];
      const defT = PIECES[arena.def.type];
      statsEl.innerHTML = `
        <span class="solar-text">Solar pieces: <b>${pieces.filter(p => p.side === SOLAR).length}</b></span>
        <span class="lunar-text">Lunar pieces: <b>${pieces.filter(p => p.side === LUNAR).length}</b></span>
        <span>Duel: <b>${atkT.name}</b> vs <b>${defT.name}</b></span>
      `;
    } else {
      statsEl.innerHTML = `
        <span class="solar-text">Solar: <b>${pieces.filter(p => p.side === SOLAR).length}</b></span>
        <span class="lunar-text">Lunar: <b>${pieces.filter(p => p.side === LUNAR).length}</b></span>
        <span>Turn: <b style="color:${COLORS[turn]}">${turn === SOLAR ? 'Solar' : 'Lunar'}</b></span>
        ${selected ? `<span>Selected: <b>${PIECES[selected.type].name}</b></span>` : ''}
      `;
    }
  }

  function loop() {
    if (mode === 'arena') arenaUpdate();
    else if (mode === 'board' && turn === LUNAR) {
      if (aiCooldown > 0) aiCooldown -= 1;
      else aiMove();
    }
    render();
    renderStats();
    requestAnimationFrame(loop);
  }

  newGame();
  requestAnimationFrame(loop);
})();
