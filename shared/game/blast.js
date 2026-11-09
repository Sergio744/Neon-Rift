import { DT, PHYS, RULES } from '../constants.js';
import { boxDist, playerBox, segAabb } from '../geom.js';
import {
  BLINK_P, BOMBLET, GONE, HIT_WALL, MIRV, PROJ, QUAKE, ROCKET, TIMER, VORTEX_P, mirvBomblets, stepProj,
} from '../projectiles.js';
import { CRUMBLE_F, IGNITE_F, OP } from '../sim.js';
import { BOOMS, GRENADE, VORTEX, WEAPONS } from '../weapons.js';

const BODY_MID = PHYS.HEIGHT / 2;
const BULLET_LIFE = 1.2;
const r1 = (v) => Math.round(v * 10) / 10;

const PADS = {
  [PROJ.ROCKET]: ROCKET.pad,
  [PROJ.MIRV]: MIRV.pad,
  [PROJ.BOMBLET]: BOMBLET.pad,
  [PROJ.QUAKE]: QUAKE.pad,
  [PROJ.BLINK]: BLINK_P.pad,
  [PROJ.VORTEX]: VORTEX_P.pad,
};
const BOOM_OF = {
  [PROJ.ROCKET]: 'rocket',
  [PROJ.MIRV]: 'mirv',
  [PROJ.BOMBLET]: 'bomblet',
  [PROJ.QUAKE]: 'quake',
  [PROJ.VORTEX]: 'vortex',
};

const BLINK_OFFSETS = [
  [0, 22], [0, 4], [0, 30], [0, -10], [-10, 16], [10, 16],
  [-16, 0], [16, 0], [0, -24], [-22, 12], [22, 12], [0, 38],
];

// Damage, deaths, explosions, bullets and projectile flight.
export const blasts = {
  // `raw` marks world hazards (TNT chains, burning terrain): no shooter multipliers, half damage,
  // and never below RULES.WORLD_FLOOR - only weapons can finish a player.
  damage(v, amount, by, w, kx, ky, hx, hy, raw) {
    const p = this.players[v];
    if (!this.present[v] || p.dead) return;
    if (p.shield > 0) {
      this.emit({ e: 'i', x: r1(hx), y: r1(hy), a: 0, sh: 1 });
      return;
    }
    let dmg = raw ? amount * RULES.WORLD_DAMAGE : by === v ? amount * RULES.SELF_DAMAGE : amount * (this.dealMul[by] ?? 1);
    dmg *= this.takeMul[v];
    p.hp = Math.max(raw ? Math.min(p.hp, RULES.WORLD_FLOOR) : 0, p.hp - dmg);
    p.vx += kx;
    p.vy += ky;
    if (ky < -60) p.grounded = false;
    this.emit({ e: 'h', s: v, d: Math.round(dmg * 10) / 10, by, x: r1(hx), y: r1(hy), hp: Math.round(p.hp * 10) / 10 });
    if (p.hp <= 0) this.kill(v, by, w);
  },

  kill(v, by, w) {
    const p = this.players[v];
    p.dead = true;
    p.hp = 0;
    p.jetOn = false;
    p.jetK = 0;
    p.flaming = false;
    p.respawnT = this.autoRespawn ? RULES.RESPAWN : 0;
    this.flameAcc[v].clear();
    this.emit({ e: 'd', s: v, by, w, x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy) });
    this.dropPack(p.x, p.y - 20);
    if (this.onKill) this.onKill(v, by, w);
  },

  // Knockback hits everyone in range; damage only the owner's enemies and the owner itself
  // (unless `B.noSelf` is set, e.g. Blink Disc arrival pulse).
  explode(x, y, type, owner, radius) {
    const B = BOOMS[type];
    const R = radius ?? B.r;
    const scale = Math.min(1.6, R / B.r);
    this.op(owner, OP.CARVE, x, y, R, CRUMBLE_F | (B.fire ? IGNITE_F : 0));
    if (B.quake) this.op(owner, OP.QUAKE, x, y, B.quake);
    this.emit({ e: 'b', x: r1(x), y: r1(y), r: Math.round(R), k: type, o: owner });
    for (let s = 0; s < this.n; s++) {
      if (B.noSelf && s === owner) continue;
      const p = this.players[s];
      if (!this.present[s] || p.dead) continue;
      const d = boxDist(x, y, p.x, p.y);
      const cx = p.x - x;
      const cy = p.y - BODY_MID - y;
      const len = Math.hypot(cx, cy) || 1;
      let kx = 0;
      let ky = 0;
      if (d < 2.6 * R) {
        const S = 1350 * B.power * (1 - d / (2.6 * R)) ** 0.75;
        kx = (cx / len) * S;
        ky = (cy / len) * S - S * 0.4;
      }
      // A TNT chain never hurts whoever set it off.
      const hurts = owner < 0 || (s === owner && type !== 'tnt') || this.hostile(owner, s);
      if (hurts && d < 1.5 * R) {
        const by = owner < 0 ? s : owner;
        this.damage(s, B.dmg * scale * (1 - d / (1.5 * R)), by, B.w, kx, ky, p.x, p.y - BODY_MID, owner < 0 || type === 'tnt');
      } else if (kx || ky) {
        const k = hurts ? 1 : 0.5;
        p.vx += kx * k;
        p.vy += ky * k;
        if (ky * k < -60) p.grounded = false;
      }
    }
    // Chain reactions: grenades cook off, charges go up a tick later.
    for (const pr of this.projs) {
      const near = Math.hypot(pr.x - x, pr.y - y) < R * 0.8;
      if (!near) continue;
      if (pr.k === PROJ.GRENADE) pr.t = Math.max(pr.t, GRENADE.fuse - 0.08);
      else if (pr.k === PROJ.C4 && !pr.cook) pr.cook = 2;
    }
  },

  // Resolves a safe arrival position around (tx, ty), teleports `slot` and releases a rift shockwave.
  completeBlink(slot, tx, ty, midAir = false) {
    if (slot < 0 || !this.present[slot]) return;
    const p = this.players[slot];
    if (p.dead) return;
    const minX = PHYS.HALF_W + 6;
    const maxX = this.worldW - PHYS.HALF_W - 6;
    const minY = PHYS.CEIL_Y + PHYS.HEIGHT + 6;
    const maxY = this.worldH - 26;
    const clampX = (v) => Math.max(minX, Math.min(maxX, v));
    const clampY = (v) => Math.max(minY, Math.min(maxY, v));

    let bx = clampX(tx);
    let by = clampY(ty + 18);
    let free = false;
    for (const [ox, oy] of BLINK_OFFSETS) {
      const cx = clampX(tx + ox);
      const cy = clampY(ty + oy);
      if (!this.terrain.rectSolid(cx - PHYS.HALF_W, cy - PHYS.HEIGHT, cx + PHYS.HALF_W, cy)) {
        bx = cx;
        by = cy;
        free = true;
        break;
      }
    }
    if (!free) {
      this.op(slot, OP.CARVE, bx, by - BODY_MID, 22, 0);
    }
    const oldX = p.x;
    const oldY = p.y;
    p.x = bx;
    p.y = by;
    p.grounded = false;
    p.flips = PHYS.FLIPS;
    p.vx *= 0.25;
    p.vy = midAir ? Math.min(p.vy, -210) : -120;
    this.emit({ e: 'tp', s: slot, x1: r1(oldX), y1: r1(oldY - BODY_MID), x2: r1(bx), y2: r1(by - BODY_MID) });
    this.explode(bx, by - BODY_MID, 'blink', slot);
  },

  // Gravitational pull & terrain erosion while a Vortex Orb is anchored in singularity state.
  stepVortexPull(pr) {
    pr.ticks = (pr.ticks || 0) + 1;
    if (pr.ticks % VORTEX.carveEvery === 1) {
      this.op(pr.o, OP.CARVE, pr.x, pr.y, VORTEX.carveR, CRUMBLE_F);
    }
    for (let s = 0; s < this.n; s++) {
      const p = this.players[s];
      if (!this.present[s] || p.dead) continue;
      const dx = pr.x - p.x;
      const dy = pr.y - (p.y - BODY_MID);
      const dist = Math.hypot(dx, dy);
      if (dist >= VORTEX.pullR || dist < 1e-3) continue;
      const falloff = 1 - dist / VORTEX.pullR;
      const enemy = this.hostile(pr.o, s);
      const acc = enemy ? VORTEX.pullEnemy * (0.35 + 0.65 * falloff) : VORTEX.pullAlly * falloff;
      const dv = acc * DT;
      if (enemy && p.grounded && falloff > 0.12) {
        p.grounded = false;
        p.vy = Math.min(p.vy, -95);
      }
      p.vx += (dx / dist) * dv;
      p.vy += (dy / dist) * dv - (enemy ? 16 * falloff : 0);
      if (dy < -8) p.grounded = false;
      if (enemy && pr.ticks % VORTEX.carveEvery === 0 && dist < VORTEX.pullR * 0.75) {
        this.damage(s, VORTEX.dps * VORTEX.carveEvery * DT, pr.o, WEAPONS.findIndex((w) => w.id === 'vortex'), 0, 0, p.x, p.y - BODY_MID);
      }
    }
  },

  updateBullets() {
    const t = this.terrain;
    const keep = [];
    for (const b of this.bullets) {
      b.t += DT;
      const x2 = b.x + b.vx * DT;
      const y2 = b.y + b.vy * DT;
      const len = Math.hypot(x2 - b.x, y2 - b.y);
      const ux = (x2 - b.x) / len;
      const uy = (y2 - b.y) / len;
      let wallD = -1;
      for (let d = 0; d <= len; d += 1.5) {
        if (t.blocksShot(b.x + ux * d, b.y + uy * d)) {
          wallD = d;
          break;
        }
      }
      const hit = this.firstHit(b.o, b.x, b.y, x2, y2, 1, b.lag);
      const hitD = hit ? hit.f * len : -1;
      if (hit && (wallD < 0 || hitD <= wallD)) {
        const kb = b.dmg * 5;
        const hx = b.x + ux * hitD;
        const hy = b.y + uy * hitD;
        const headMul = WEAPONS[b.w].head;
        const head = headMul && hy < this.rewound(hit.s, b.lag).y - PHYS.HEIGHT + 17;
        if (head) this.emit({ e: 'hs', s: hit.s, by: b.o, x: r1(hx), y: r1(hy) });
        this.damage(hit.s, head ? b.dmg * headMul : b.dmg, b.o, b.w, ux * kb, uy * kb - kb * 0.15, hx, hy);
        continue;
      }
      if (wallD >= 0) {
        const hx = b.x + ux * wallD;
        const hy = b.y + uy * wallD;
        this.emit({ e: 'i', x: r1(hx), y: r1(hy), a: Math.round(Math.atan2(uy, ux) * 100) / 100 });
        this.op(b.o, OP.CARVE, hx, hy, b.carve, 0);
        continue;
      }
      b.x = x2;
      b.y = y2;
      if (b.t < BULLET_LIFE && b.x > -20 && b.x < this.worldW + 20 && b.y > -420 && b.y < this.worldH + 20) keep.push(b);
    }
    this.bullets = keep;
  },

  updateProjs() {
    const keep = [];
    const spawned = [];
    for (const pr of this.projs) {
      if (pr.k === PROJ.C4 && pr.cook && --pr.cook <= 0) {
        this.explode(pr.x, pr.y, 'c4', pr.o);
        continue;
      }
      const px = pr.x;
      const py = pr.y;
      const wasAnchored = pr.k === PROJ.VORTEX && pr.st;
      const res = stepProj(pr, this.terrain, DT);
      if (res === GONE) continue;

      if (pr.k === PROJ.VORTEX && pr.st) {
        if (res === TIMER) {
          this.explode(pr.x, pr.y, 'vortex', pr.o);
          continue;
        }
        this.stepVortexPull(pr);
        keep.push(pr);
        continue;
      }

      if (PADS[pr.k] && !wasAnchored) {
        let best = -1;
        for (let s = 0; s < this.n; s++) {
          const p = this.players[s];
          if (!this.present[s] || p.dead) continue;
          if (s === pr.o ? pr.k !== PROJ.BOMBLET || pr.t < 0.35 : !this.hostile(pr.o, s)) continue;
          const f = segAabb(px, py, pr.x, pr.y, ...playerBox(p.x, p.y, PADS[pr.k]));
          if (f >= 0 && (best < 0 || f < best)) best = f;
        }
        if (best >= 0) {
          pr.x = px + (pr.x - px) * best;
          pr.y = py + (pr.y - py) * best;
          pr.fx = pr.x;
          pr.fy = pr.y;
          if (pr.k === PROJ.BLINK) {
            this.completeBlink(pr.o, pr.fx, pr.fy, false);
          } else if (pr.k === PROJ.VORTEX) {
            pr.st = 1;
            pr.vx = 0;
            pr.vy = 0;
            pr.t = VORTEX_P.flight;
            this.stepVortexPull(pr);
            keep.push(pr);
          } else {
            this.burst(pr, spawned);
          }
          continue;
        }
      }
      if (res === HIT_WALL) {
        if (pr.k === PROJ.BLINK) this.completeBlink(pr.o, pr.fx ?? pr.x, pr.fy ?? pr.y, false);
        else this.burst(pr, spawned);
        continue;
      }
      if (res === TIMER) {
        if (pr.k === PROJ.GRENADE) this.explode(pr.x, pr.y - 2, 'grenade', pr.o);
        else if (pr.k === PROJ.MIRV) spawned.push(...this.split(pr));
        else if (pr.k === PROJ.VORTEX) this.explode(pr.x, pr.y, 'vortex', pr.o);
        continue;
      }
      keep.push(pr);
    }
    this.projs = keep.concat(spawned);
  },

  burst(pr, spawned) {
    this.explode(pr.x, pr.y, BOOM_OF[pr.k], pr.o);
    if (pr.k === PROJ.MIRV) spawned.push(...this.split(pr));
  },

  split(pr) {
    const bombs = mirvBomblets(pr, this.nextId);
    this.nextId += bombs.length;
    this.emit({ e: 'split', x: r1(pr.fx ?? pr.x), y: r1(pr.fy ?? pr.y), o: pr.o });
    return bombs;
  },
};
