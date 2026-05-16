import { TILE } from './engine.js';

export const CELL = 24;

export function render(canvas, state, animTick) {
  const ctx = canvas.getContext('2d');
  const { grid, width, height } = state;

  canvas.width = width * CELL;
  canvas.height = height * CELL;

  ctx.fillStyle = '#0d0805';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      drawCell(ctx, x, y, grid[y][x], animTick);
    }
  }
}

function drawCell(ctx, x, y, tile, tick) {
  const px = x * CELL;
  const py = y * CELL;

  switch (tile) {
    case TILE.EMPTY:
      ctx.fillStyle = '#0d0805';
      ctx.fillRect(px, py, CELL, CELL);
      break;

    case TILE.DIRT:
      ctx.fillStyle = '#4a2a14';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#5c3418';
      ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
      ctx.fillStyle = '#3a1f0e';
      ctx.fillRect(px + 4, py + 5, 3, 2);
      ctx.fillRect(px + 14, py + 10, 4, 2);
      ctx.fillRect(px + 8, py + 15, 3, 2);
      break;

    case TILE.WALL:
      ctx.fillStyle = '#4a3d36';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#5b4b42';
      ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = '#7a6557';
      ctx.fillRect(px + 1, py + 1, CELL - 2, 3);
      ctx.fillRect(px + 1, py + 1, 3, CELL - 2);
      ctx.fillStyle = '#2c241f';
      ctx.fillRect(px + CELL - 4, py + 1, 3, CELL - 2);
      ctx.fillRect(px + 1, py + CELL - 4, CELL - 2, 3);
      break;

    case TILE.ROCK: {
      ctx.fillStyle = '#0d0805';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#807268';
      ctx.beginPath();
      ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a0908a';
      ctx.beginPath();
      ctx.arc(px + CELL / 2 - 2, py + CELL / 2 - 3, CELL / 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c4b8b0';
      ctx.beginPath();
      ctx.arc(px + CELL / 2 - 4, py + CELL / 2 - 5, CELL / 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case TILE.CRYSTAL: {
      ctx.fillStyle = '#0d0805';
      ctx.fillRect(px, py, CELL, CELL);
      const flash = (tick + x * 3 + y * 5) % 8;
      const hue = 290 + flash * 6;
      ctx.fillStyle = `hsl(${hue}, 85%, 60%)`;
      const cx = px + CELL / 2;
      const cy = py + CELL / 2;
      const r = CELL / 2 - 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `hsl(${hue + 30}, 95%, 82%)`;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r / 2);
      ctx.lineTo(cx + r / 2, cy);
      ctx.lineTo(cx - r / 2, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case TILE.PLAYER: {
      ctx.fillStyle = '#0d0805';
      ctx.fillRect(px, py, CELL, CELL);
      // Body — orange jumpsuit
      ctx.fillStyle = '#e8721a';
      ctx.fillRect(px + 7, py + 11, 10, 9);
      // Head
      ctx.fillStyle = '#f4cda0';
      ctx.beginPath();
      ctx.arc(px + CELL / 2, py + 8, 6, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#000';
      ctx.fillRect(px + 9, py + 6, 2, 2);
      ctx.fillRect(px + 13, py + 6, 2, 2);
      // Red helmet with white lamp
      ctx.fillStyle = '#c92a2a';
      ctx.fillRect(px + 6, py + 2, 12, 5);
      ctx.fillRect(px + 8, py + 1, 8, 2);
      ctx.fillStyle = '#fff7a8';
      ctx.fillRect(px + 11, py + 3, 3, 2);
      break;
    }

    case TILE.EXIT_CLOSED:
      ctx.fillStyle = '#120c08';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.strokeStyle = '#3a2e26';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
      ctx.strokeStyle = '#241c16';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 5, py + 5);
      ctx.lineTo(px + CELL - 5, py + CELL - 5);
      ctx.moveTo(px + CELL - 5, py + 5);
      ctx.lineTo(px + 5, py + CELL - 5);
      ctx.stroke();
      break;

    case TILE.EXIT_OPEN: {
      ctx.fillStyle = '#0d0805';
      ctx.fillRect(px, py, CELL, CELL);
      const on = Math.floor(tick / 3) % 2 === 0;
      ctx.fillStyle = on ? '#ffcb38' : '#c89220';
      ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
      ctx.fillStyle = '#0d0805';
      ctx.fillRect(px + 6, py + 6, CELL - 12, CELL - 12);
      break;
    }

    case TILE.EXPLODE1:
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
      break;

    case TILE.EXPLODE2:
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#fff';
      ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
      break;

    case TILE.EXPLODE3:
      ctx.fillStyle = '#fff';
      ctx.fillRect(px, py, CELL, CELL);
      break;

    case TILE.CEXPLODE1:
      ctx.fillStyle = '#ff3380';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#ffd6f0';
      ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
      break;

    case TILE.CEXPLODE2:
      ctx.fillStyle = '#d050a0';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#ff99d8';
      ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
      break;

    case TILE.CEXPLODE3:
      ctx.fillStyle = '#a04080';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#e070b8';
      ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
      break;

    case TILE.ENEMY: {
      ctx.fillStyle = '#0d0805';
      ctx.fillRect(px, py, CELL, CELL);
      const pulse = (Math.sin(tick * 0.3 + x + y) + 1) / 2;
      const r = CELL / 2 - 3;
      const cx = px + CELL / 2;
      const cy = py + CELL / 2;
      // Outer glow
      ctx.fillStyle = `rgba(220, 60, 70, ${0.25 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.fillStyle = '#a02030';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // Spikes
      ctx.fillStyle = '#601018';
      const spikeTick = Math.floor(tick / 4) % 4;
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + spikeTick * 0.4;
        const sx = cx + Math.cos(ang) * r;
        const sy = cy + Math.sin(ang) * r;
        ctx.fillRect(sx - 1, sy - 1, 3, 3);
      }
      // Eyes
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(cx - 4, cy - 2, 2, 2);
      ctx.fillRect(cx + 2, cy - 2, 2, 2);
      break;
    }
  }
}
