import { bodyCells, freeCells, partHits, planPiece, unpackBuild } from '../build.js';
import { CELL, DT, MAT_BUILD, MAT_SAND, PHYS } from '../constants.js';
import { COLLIDE, HARD } from '../materials.js';
import { playerBox, prismTrace, railTrace, segAabb } from '../geom.js';
import { PROJ, ROCKET, VORTEX_P } from '../projectiles.js';
import { OP } from '../sim.js';
import { BEAM, C4, FLAME, GRENADE, MELEE, PRISM, RAIL, SPRAY, WEAPONS, pelletDirs } from '../weapons.js';

const BODY_MID = PHYS.HEIGHT / 2;
const BUILD_COLORS = 3; // TEAM style: brick, steel, sandstone (palette BUILD order), one per player slot
const BRUSH_MAX = 40; // loose bits up to this many cells are brushed aside when they stop a player
const r1 = (v) => Math.round(v * 10) / 10;

// Extra lateral tolerance so the flame cone also catches the head and feet of the target.
const flameSlack = (along) => (along < 30 ? 10 : 6);

// Weapons: discrete shots, thrown charges and the continuous tools (flamer, cutter, sandstorm).
export const combat = {
  // `k`: the input's builder choice (mode, style, cursor distance; see build.js).
  fire(slot, a, seq, lag, k = 0) {
    const W = WEAPONS[a.w];
    this.emit({ e: 'f', s: slot, w: a.w, a: Math.round(a.a * 1000) / 1000, sq: seq, x: r1(a.x), y: r1(a.y), k: this.tick });
    const dx = Math.cos(a.a);
    const dy = Math.sin(a.a);
    switch (W.kind) {
      case 'bullet':
        for (const [ang, sp] of pelletDirs(a.w, slot, seq, a.a)) {
          this.bullets.push({
            o: slot, w: a.w, x: a.x, y: a.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            dmg: W.dmg, carve: W.carve, lag, t: 0,
          });
        }
        break;
      case 'rail':
        this.rail(slot, a.w, a.x, a.y, a.a, lag);
        break;
      case 'rocket':
      case 'mirv':
      case 'quake':
        this.launch(slot, a, W, seq, lag);
        break;
      case 'build':
        this.build(slot, a.w, a.a, k);
        break;
      case 'c4':
        this.throwC4(slot, a, W, seq);
        break;
      case 'blink':
        this.launchBlink(slot, a, W, seq);
        break;
      case 'prism':
        this.prism(slot, a.w, a.x, a.y, a.a, lag);
        break;
      case 'vortex':
        this.launchVortex(slot, a, W, seq, lag);
        break;
    }
  },

  // Rockets, the MIRV and quake shells leave from the muzzle, or burst at once when it is blocked.
  launch(slot, a, W, seq, lag) {
    const dx = Math.cos(a.a);
    const dy = Math.sin(a.a);
    const wall = this.terrain.raycast(a.x, a.y, dx, dy, W.muzzle);
    const dist = wall >= 0 ? Math.max(0, wall - 3) : W.muzzle;
    const ex = a.x + dx * dist;
    const ey = a.y + dy * dist;
    const boom = W.kind === 'rocket' ? 'rocket' : W.kind;
    const hit = this.firstHit(slot, a.x, a.y, ex, ey, ROCKET.pad, lag);
    if (hit) return this.explode(a.x + (ex - a.x) * hit.f, a.y + (ey - a.y) * hit.f, boom, slot);
    if (wall >= 0 && wall < 10) return this.explode(a.x + dx * wall, a.y + dy * wall, boom, slot);
    const k = W.kind === 'rocket' ? PROJ.ROCKET : W.kind === 'mirv' ? PROJ.MIRV : PROJ.QUAKE;
    this.projs.push({
      id: this.nextId++, k, o: slot, x: ex, y: ey, fx: ex, fy: ey,
      vx: dx * W.speed + (k !== PROJ.ROCKET ? a.vx * 0.3 : 0), vy: dy * W.speed, t: 0, sq: seq,
    });
  },

  throwNade(slot, a, seq) {
    const dx = Math.cos(a.a);
    const dy = Math.sin(a.a);
    this.projs.push({
      id: this.nextId++, k: PROJ.GRENADE, o: slot, x: a.x, y: a.y, fx: a.x, fy: a.y,
      vx: dx * GRENADE.speed + a.vx * 0.4, vy: dy * GRENADE.speed + a.vy * 0.3 - 120, t: 0, sq: seq,
    });
    this.emit({ e: 'n', s: slot, sq: seq, k: this.tick });
  },

  // Sticky charge: clings to the first surface it touches until its owner detonates it (ALT).
  throwC4(slot, a, W, seq) {
    const mine = this.projs.filter((pr) => pr.k === PROJ.C4 && pr.o === slot);
    if (mine.length >= C4.max) {
      this.players[slot].ammo[a.w]++;
      return;
    }
    this.projs.push({
      id: this.nextId++, k: PROJ.C4, o: slot, x: a.x, y: a.y, fx: a.x, fy: a.y,
      vx: Math.cos(a.a) * W.speed + a.vx * 0.3, vy: Math.sin(a.a) * W.speed + a.vy * 0.2 - 60, t: 0, sq: seq, st: 0,
    });
  },

  detonateC4(slot) {
    let n = 0;
    for (const pr of this.projs) {
      if (pr.k !== PROJ.C4 || pr.o !== slot || pr.cook) continue;
      pr.cook = 1 + n++ * 3; // ripple: one charge every 3 ticks
    }
    if (n) this.emit({ e: 'det', s: slot });
  },

  // Blink Disc: launches a teleportation disc; firing a new one replaces any in-flight disc of this slot.
  launchBlink(slot, a, W, seq) {
    this.projs = this.projs.filter((pr) => !(pr.k === PROJ.BLINK && pr.o === slot));
    const dx = Math.cos(a.a);
    const dy = Math.sin(a.a);
    const wall = this.terrain.raycast(a.x, a.y, dx, dy, W.muzzle);
    const dist = wall >= 0 ? Math.max(0, wall - 3) : W.muzzle;
    const ex = a.x + dx * dist;
    const ey = a.y + dy * dist;
    this.projs.push({
      id: this.nextId++, k: PROJ.BLINK, o: slot, x: ex, y: ey, fx: ex, fy: ey,
      vx: dx * W.speed, vy: dy * W.speed, t: 0, sq: seq, st: 0,
    });
  },

  // ALT (right-click) while holding Blink Disc blinks immediately to the in-flight disc.
  activateBlink(slot) {
    const idx = this.projs.findIndex((pr) => pr.k === PROJ.BLINK && pr.o === slot);
    if (idx < 0) return;
    const [pr] = this.projs.splice(idx, 1);
    this.completeBlink(slot, pr.fx ?? pr.x, pr.fy ?? pr.y, true);
  },

  // Vortex Orb: launches a dark-matter orb that anchors into a gravitational singularity.
  launchVortex(slot, a, W, seq, lag) {
    const dx = Math.cos(a.a);
    const dy = Math.sin(a.a);
    const wall = this.terrain.raycast(a.x, a.y, dx, dy, W.muzzle);
    const dist = wall >= 0 ? Math.max(0, wall - 3) : W.muzzle;
    const ex = a.x + dx * dist;
    const ey = a.y + dy * dist;
    const hit = this.firstHit(slot, a.x, a.y, ex, ey, 4, lag);
    const anchorNow = Boolean(hit) || (wall >= 0 && wall < 10);
    this.projs.push({
      id: this.nextId++, k: PROJ.VORTEX, o: slot, x: ex, y: ey, fx: ex, fy: ey,
      vx: anchorNow ? 0 : dx * W.speed + a.vx * 0.25,
      vy: anchorNow ? 0 : dy * W.speed,
      t: anchorNow ? VORTEX_P.flight : 0,
      sq: seq,
      st: anchorNow ? 1 : 0,
    });
  },

  // Prism Rifle: multi-bounce neon laser beam (+15% damage per ricochet).
  prism(slot, w, x, y, ang, lag) {
    const { pts, hits } = prismTrace(this.terrain, x, y, ang, PRISM.range, PRISM.bounces);
    const W = WEAPONS[w];
    const hitSet = new Set();
    const segs = (pts.length >> 1) - 1;
    for (let seg = 0; seg < segs; seg++) {
      const x1 = pts[seg * 2];
      const y1 = pts[seg * 2 + 1];
      const x2 = pts[seg * 2 + 2];
      const y2 = pts[seg * 2 + 3];
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const dmg = Math.round(W.dmg * (1 + seg * PRISM.boost));
      for (const s of this.targets(slot)) {
        if (hitSet.has(s)) continue;
        const o = this.rewound(s, lag);
        if (!o.alive) continue;
        const t = segAabb(x1, y1, x2, y2, ...playerBox(o.x, o.y, 2));
        if (t >= 0) {
          hitSet.add(s);
          this.damage(s, dmg, slot, w, ux * 260, uy * 260 - 80, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
        }
      }
    }
    for (const h of hits) this.op(slot, OP.CARVE, h.x, h.y, PRISM.carve, 0);
    this.emit({ e: 'pr', s: slot, pts: pts.map(r1) });
  },

  // The beam pierces every enemy on its path and bores a tunnel through the terrain.
  rail(slot, w, x, y, ang, lag) {
    const tr = railTrace(this.terrain, x, y, ang, RAIL.range, RAIL.maxPen);
    const W = WEAPONS[w];
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    for (const s of this.targets(slot)) {
      const o = this.rewound(s, lag);
      if (!o.alive) continue;
      const t = segAabb(x, y, tr.x2, tr.y2, ...playerBox(o.x, o.y, 2));
      if (t >= 0) this.damage(s, W.dmg, slot, w, dx * 420, dy * 420 - 120, x + (tr.x2 - x) * t, y + (tr.y2 - y) * t);
    }
    this.op(slot, OP.CAPSULE, x + dx * 10, y + dy * 10, tr.x2, tr.y2, RAIL.carve);
    this.emit({ e: 'r', s: slot, x1: r1(x), y1: r1(y), x2: r1(tr.x2), y2: r1(tr.y2) });
  },

  // Builder: one click raises a whole anchored piece (see shared/build.js for modes and styles).
  // Refunded when it would bury a player or nothing is free. Planned from where the builder stands
  // now (after this tick's move) so it never buries them.
  build(slot, w, ang, k) {
    const p = this.players[slot];
    const { mode, style, dist } = unpackBuild(k);
    const plan = planPiece(this.terrain, p.x, p.y, ang, mode, dist);
    const refund = () => {
      if (p.ammo[w] >= 0) p.ammo[w]++;
    };
    if (!plan.parts.length || !freeCells(this.terrain, plan.parts)) return refund();
    for (let s = 0; s < this.n; s++) {
      const q = this.players[s];
      if (!this.present[s] || q.dead) continue;
      const box = bodyCells(q.x, q.y);
      if (plan.parts.some((part) => partHits(part, ...box))) return refund();
    }
    const col = style ? style - 1 : slot % BUILD_COLORS;
    for (const part of plan.parts) this.op(slot, OP.PLACE, part.x, part.y, part.w, part.h, MAT_BUILD, col);
    const [x0, y0, x1, y1] = plan.box;
    this.emit({ e: 'bl', s: slot, k: plan.kind, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 });
  },

  // F shove: breaks the terrain just in front of the chest (bedrock excepted) and knocks back
  // enemies in reach, so nobody stays walled in by a bunker or a pile of rubble.
  melee(slot, ang) {
    const p = this.players[slot];
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const hx = p.x + dx * MELEE.reach;
    const hy = p.y - BODY_MID + dy * (MELEE.reach + 10);
    this.op(slot, OP.CARVE, hx, hy, MELEE.r, 0);
    for (const s of this.targets(slot)) {
      const q = this.players[s];
      if (q.dead || Math.hypot(q.x - hx, q.y - BODY_MID - hy) > MELEE.hitR + MELEE.r) continue;
      this.damage(s, MELEE.dmg, slot, 0, dx * MELEE.push, dy * MELEE.push - 160, q.x, q.y - BODY_MID);
    }
    this.emit({ e: 'mel', s: slot, x: r1(hx), y: r1(hy), a: Math.round(ang * 100) / 100 });
  },

  // A player pushing into something (`d` = -1/1 sideways, 0 = head first) that is only a loose
  // scrap - fewer than BRUSH_MAX connected cells, all breakable - brushes it aside.
  brush(slot, d) {
    const p = this.players[slot];
    const t = this.terrain;
    const hw = PHYS.HALF_W;
    let x0;
    let x1;
    let y0;
    let y1;
    if (d) {
      x0 = d > 0 ? p.x + hw : p.x - hw - 3;
      x1 = x0 + 3;
      y0 = p.y - PHYS.HEIGHT;
      y1 = p.y - 1;
    } else {
      x0 = p.x - hw;
      x1 = p.x + hw;
      y0 = p.y - PHYS.HEIGHT - 3;
      y1 = p.y - PHYS.HEIGHT;
    }
    const seen = new Set();
    const stack = [];
    for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        const m = t.cell(cx, cy);
        if (!COLLIDE[m]) continue;
        const i = cy * t.w + cx;
        if (!seen.has(i)) {
          seen.add(i);
          stack.push(i);
        }
      }
    }
    if (!stack.length) return;
    while (stack.length) {
      const i = stack.pop();
      if (!HARD[t.mat[i]]) return; // bedrock: never
      const cx = i % t.w;
      const cy = (i / t.w) | 0;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (!COLLIDE[t.cell(nx, ny)]) continue;
        const j = ny * t.w + nx;
        if (seen.has(j)) continue;
        if (seen.size >= BRUSH_MAX) return; // part of something real
        seen.add(j);
        stack.push(j);
      }
    }
    let ax0 = Infinity;
    let ay0 = Infinity;
    let ax1 = -Infinity;
    let ay1 = -Infinity;
    for (const i of seen) {
      const cx = i % t.w;
      const cy = (i / t.w) | 0;
      ax0 = Math.min(ax0, cx);
      ay0 = Math.min(ay0, cy);
      ax1 = Math.max(ax1, cx + 1);
      ay1 = Math.max(ay1, cy + 1);
    }
    const r = (Math.hypot(ax1 - ax0, ay1 - ay0) * CELL) / 2 + 2;
    this.op(slot, OP.CARVE, ((ax0 + ax1) * CELL) / 2, ((ay0 + ay1) * CELL) / 2, r, 0);
  },

  // One tick of a held continuous tool.
  continuous(slot, lag) {
    const p = this.players[slot];
    const kind = WEAPONS[p.w].kind;
    const ox = p.x;
    const oy = p.y - PHYS.AIM_Y;
    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    const n = ++this.flameTick[slot];
    this.flameW[slot] = p.w;
    if (kind === 'flame') this.flame(slot, ox, oy, dx, dy, n, lag);
    else if (kind === 'beam') this.beam(slot, ox, oy, dx, dy, n, lag);
    else if (kind === 'spray') this.spray(slot, ox, oy, dx, dy, n);
  },

  flame(slot, ox, oy, dx, dy, n, lag) {
    const wall = this.terrain.raycast(ox, oy, dx, dy, FLAME.range);
    const reach = wall >= 0 ? wall : FLAME.range;
    const acc = this.flameAcc[slot];
    const dps = WEAPONS[this.flameW[slot]].dps;
    for (const s of this.targets(slot)) {
      const o = this.rewound(s, lag);
      if (!o.alive || this.players[s].shield > 0) continue;
      const bx = o.x - ox;
      const by = o.y - BODY_MID - oy;
      const along = bx * dx + by * dy;
      const lat = Math.abs(bx * dy - by * dx);
      if (along > -6 && along < reach + 10 && lat < 14 + Math.max(0, along) * 0.18 + flameSlack(along)) {
        const dist = Math.hypot(bx, by);
        const los = this.terrain.raycast(ox, oy, bx / (dist || 1), by / (dist || 1), dist);
        if (los < 0 || los > dist - 10) acc.set(s, (acc.get(s) || 0) + dps * DT);
      }
    }
    const tip = reach + (wall >= 0 ? 2 : 0);
    if (n % FLAME.igniteEvery === 0) this.op(slot, OP.IGNITE, ox + dx * tip, oy + dy * tip, 12);
    if (n % FLAME.carveEvery === 0) {
      const tx = ox + dx * tip;
      const ty = oy + dy * tip;
      const side = wall >= 0 ? Math.abs(dx) : 0;
      if (side > 0.3) {
        this.op(slot, OP.CAPSULE, tx, ty - FLAME.tunnel[0] * side, tx, ty + FLAME.tunnel[1] * side, FLAME.carveR);
      } else {
        this.op(slot, OP.CARVE, tx, ty, FLAME.carveR, 0);
      }
    }
    if (n % FLAME.hitEvery === 0) this.flushFlame(slot);
  },

  // Cutter: a thin beam that slices through terrain and burns the first enemy it touches.
  beam(slot, ox, oy, dx, dy, n, lag) {
    const wall = this.terrain.raycast(ox, oy, dx, dy, BEAM.range);
    const reach = wall >= 0 ? wall : BEAM.range;
    const hit = this.firstHit(slot, ox, oy, ox + dx * reach, oy + dy * reach, 1, lag);
    if (hit && this.players[hit.s].shield <= 0) {
      const acc = this.flameAcc[slot];
      acc.set(hit.s, (acc.get(hit.s) || 0) + WEAPONS[this.flameW[slot]].dps * DT);
    } else if (wall >= 0 && n % BEAM.carveEvery === 0) {
      this.op(slot, OP.CARVE, ox + dx * (wall + 2), oy + dy * (wall + 2), BEAM.carveR, 0);
    }
    if (n % BEAM.hitEvery === 0) this.flushFlame(slot);
  },

  // Sandstorm: pours loose sand at the nozzle tip; it piles up, buries and flows like the real thing.
  spray(slot, ox, oy, dx, dy, n) {
    if (n % SPRAY.every) return;
    const wall = this.terrain.raycast(ox, oy, dx, dy, SPRAY.reach);
    const d = wall >= 0 ? Math.max(10, wall - 4) : SPRAY.reach;
    const jit = ((n * 7) % 5) - 2;
    const cx = Math.floor((ox + dx * d - dy * jit) / CELL) - 1;
    const cy = Math.floor((oy + dy * d + dx * jit) / CELL) - 1;
    this.op(slot, OP.PLACE, cx, cy, SPRAY.size, SPRAY.size, MAT_SAND, 0);
  },

  flushFlame(slot) {
    const acc = this.flameAcc[slot];
    if (!acc.size) return;
    const dx = Math.cos(this.players[slot].aim);
    const kind = WEAPONS[this.flameW[slot]].kind;
    for (const [s, amount] of acc) {
      const q = this.players[s];
      if (amount > 0) this.damage(s, amount, slot, this.flameW[slot], dx * (kind === 'flame' ? FLAME.push : 40), -20, q.x, q.y - BODY_MID);
    }
    acc.clear();
  },
};
