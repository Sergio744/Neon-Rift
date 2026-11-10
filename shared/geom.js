import { CELL, HITBOX } from './constants.js';
import { HARD, SHOT } from './materials.js';

// Entry fraction t in [0, 1] of the segment (x1,y1)->(x2,y2) into the box, or -1 (Liang-Barsky).
export function segAabb(x1, y1, x2, y2, minX, minY, maxX, maxY) {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const ps = [-dx, dx, -dy, dy];
  const qs = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
  for (let i = 0; i < 4; i++) {
    const p = ps[i];
    const q = qs[i];
    if (p === 0) {
      if (q < 0) return -1;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return -1;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return -1;
      if (r < t1) t1 = r;
    }
  }
  return t0;
}

// Hit box of a player whose feet are at (x, y), optionally inflated by `pad`.
export function playerBox(x, y, pad = 0) {
  return [x - HITBOX.HW - pad, y - HITBOX.H - pad, x + HITBOX.HW + pad, y + pad];
}

// Distance from a point to the player's box (0 when inside).
export function boxDist(px, py, x, y) {
  const [x0, y0, x1, y1] = playerBox(x, y);
  const dx = Math.max(x0 - px, 0, px - x1);
  const dy = Math.max(y0 - py, 0, py - y1);
  return Math.hypot(dx, dy);
}

// Railgun beam: punches through up to `maxPen` px of terrain, stops at bedrock or the world edge.
export function railTrace(t, x, y, a, range, maxPen) {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let pen = 0;
  let d = 0;
  const W = t.w * CELL;
  const H = t.h * CELL;
  for (; d < range; d++) {
    const px = x + dx * d;
    const py = y + dy * d;
    if (py < -400 || px < 0 || px > W || py > H) break;
    const m = t.matAt(px, py);
    if (SHOT[m] && !HARD[m]) break;
    if (SHOT[m]) {
      pen += HARD[m] < 0.5 ? 3 : 1;
      if (pen > maxPen) break;
    }
  }
  return { x2: x + dx * d, y2: y + dy * d, len: d };
}

// Prism Rifle beam: deterministic multi-bounce ricochet ray off solid terrain/walls.
// Returns `pts` = [x0, y0, x1, y1, ...] (vertices of polyline) and `hits` = [{ x, y }] bounce points.
export function prismTrace(t, x, y, a, range, maxBounces) {
  let cx = x;
  let cy = y;
  let dx = Math.cos(a);
  let dy = Math.sin(a);
  let rem = range;
  const W = t.w * CELL;
  const H = t.h * CELL;
  const pts = [x, y];
  const hits = [];
  const step = 2;

  for (let b = 0; b <= maxBounces && rem > 0; b++) {
    let bounced = false;
    while (rem > 0) {
      const nx = cx + dx * step;
      const ny = cy + dy * step;
      rem -= step;
      if (ny < -400 || nx < 0 || nx > W || ny > H) {
        pts.push(nx, ny);
        rem = 0;
        break;
      }
      if (t.blocksShot(nx, ny)) {
        pts.push(nx, ny);
        hits.push({ x: nx, y: ny });
        if (b === maxBounces) {
          rem = 0;
          break;
        }
        const bx = t.blocksShot(cx + dx * step, cy);
        const by = t.blocksShot(cx, cy + dy * step);
        if (bx && !by) {
          dx = -dx;
        } else if (by && !bx) {
          dy = -dy;
        } else {
          // Estimate local surface normal from 5x5 cell neighbourhood for slopes/craters.
          let gx = 0;
          let gy = 0;
          const hc = Math.floor(nx / CELL);
          const hr = Math.floor(ny / CELL);
          for (let oy = -2; oy <= 2; oy++) {
            for (let ox = -2; ox <= 2; ox++) {
              if (!ox && !oy) continue;
              if (SHOT[t.cell(hc + ox, hr + oy)]) {
                gx -= ox;
                gy -= oy;
              }
            }
          }
          const glen = Math.hypot(gx, gy);
          if (glen > 0.5 && (gx * dx + gy * dy) / glen < -0.05) {
            const mx = gx / glen;
            const my = gy / glen;
            const dot = dx * mx + dy * my;
            dx -= 2 * dot * mx;
            dy -= 2 * dot * my;
          } else {
            dx = -dx;
            dy = -dy;
          }
        }
        cx += dx * step;
        cy += dy * step;
        bounced = true;
        break;
      }
      cx = nx;
      cy = ny;
    }
    if (!bounced && rem <= 0 && pts[pts.length - 2] !== cx && pts[pts.length - 1] !== cy) {
      pts.push(cx, cy);
    }
  }
  if (pts.length < 4) pts.push(cx, cy);
  return { pts, hits };
}
