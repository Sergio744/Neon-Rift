import { BUFF, BUFF_INFO, DT, PHYS, RULES } from '../constants.js';
import { GRENADE, UNLOCKS, W, WEAPONS, owns, poolList } from '../weapons.js';

// Item kinds (wire format, 5th field of snapshot `c` entries):
// 0: classic crate, 1: ammo box, 2: death pack, 3: mystery weapon crate, 4: Rift boost orb.
export const ITEM = { CRATE: 0, AMMO: 1, PACK: 2, MYSTERY: 3, ORB: 4 };
const SIZE = [24, 16, 14, 24, 16];
const GRAV = 1200;
const MAX_ITEMS = 12;
const r1 = (v) => Math.round(v * 10) / 10;

// Pickups falling from the sky or dropped by the dead, contextual mystery weapon drops, and Rift boost orbs.
export const items = {
  dropItem(kind, x, y = -30) {
    if (this.items.length >= MAX_ITEMS) return null;
    x = Math.max(40, Math.min(this.worldW - 40, x));
    const it = { id: this.nextId++, kind, x, y, vy: 0, t: 0 };
    this.items.push(it);
    if (kind === ITEM.CRATE || kind === ITEM.MYSTERY) this.emit({ e: 'crate', x: r1(x), mys: kind === ITEM.MYSTERY ? 1 : 0 });
    return it;
  },

  dropCrate(x) {
    return this.dropItem(this.riftDrops ? ITEM.MYSTERY : ITEM.CRATE, x ?? this.contextualDropX());
  },

  dropMystery(x) {
    return this.dropItem(ITEM.MYSTERY, x ?? this.contextualDropX());
  },

  dropOrb(x, y = -30) {
    return this.dropItem(ITEM.ORB, x ?? this.randomDropX(), y);
  },

  dropPack(x, y) {
    return this.dropItem(ITEM.PACK, x, y);
  },

  randomDropX() {
    const [sx] = this.spawns[Math.floor(this.rng() * this.spawns.length)];
    return sx + (this.rng() - 0.5) * 320;
  },

  // Drops near a pressured living looter ~65% of the time (still out in the open so anyone can contest it).
  contextualDropX() {
    const looters = [];
    for (let s = 0; s < this.n; s++) {
      const p = this.players[s];
      if (this.present[s] && !p.dead && this.canLoot[s]) looters.push(s);
    }
    if (!looters.length || this.rng() < 0.35) return this.randomDropX();
    let target = looters[0];
    let bestNeed = -1;
    for (const s of looters) {
      const p = this.players[s];
      let closeFoes = 0;
      for (const f of this.targets(s)) {
        const q = this.players[f];
        if (!q.dead && Math.hypot(q.x - p.x, q.y - p.y) < 300) closeFoes++;
      }
      const ownedCount = poolList(this.pool).filter((w) => owns(p.owned, w)).length;
      const need = (100 - p.hp) * 1.2 + closeFoes * 35 + Math.max(0, 5 - ownedCount) * 15 + this.rng() * 25;
      if (need > bestNeed) {
        bestNeed = need;
        target = s;
      }
    }
    const px = this.players[target].x + (this.rng() - 0.5) * 380;
    return Math.max(48, Math.min(this.worldW - 48, px));
  },

  nextMysteryDelay() {
    let humans = 0;
    for (let s = 0; s < this.n; s++) if (this.present[s] && this.canLoot[s]) humans++;
    const scale = Math.max(1, Math.sqrt(Math.max(1, humans) * 0.65));
    return (7.5 + this.rng() * 9.5) / scale;
  },

  nextOrbDelay() {
    return 9.5 + this.rng() * 10.5;
  },

  nextAmmoDelay() {
    return 4.5 + this.rng() * 5.5;
  },

  // Evaluates the real-time battlefield situation around `slot` to select a helpful weapon from `pool`.
  pickContextualWeapon(slot) {
    const p = this.players[slot];
    const candidates = poolList(this.pool).filter((w) => w !== W.pistol);
    if (!candidates.length) return -1;

    let closeFoes = 0;
    let nearestDist = Infinity;
    let nearest = null;
    let enemyAbove = false;
    for (const s of this.targets(slot)) {
      const q = this.players[s];
      if (q.dead) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 270) closeFoes++;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = q;
      }
      if (Math.abs(q.x - p.x) < 440 && q.y < p.y - 85) enemyAbove = true;
    }

    const trappedLow = p.y > this.worldH * 0.7;
    let blockedSight = false;
    if (nearest && nearestDist > 30 && nearestDist < 900) {
      const dx = (nearest.x - p.x) / nearestDist;
      const dy = (nearest.y - p.y) / nearestDist;
      blockedSight = this.terrain.raycast(p.x, p.y - 30, dx, dy, nearestDist - 12) >= 0;
    }
    const criticalHp = p.hp <= 42;

    const weights = candidates.map((w) => {
      const has = owns(p.owned, w);
      let wt = !has ? 3.8 : p.ammo[w] === 0 ? 2.6 : 0.45;
      const id = WEAPONS[w].id;

      // Surrounded / outnumbered: crowd-control & escape tools.
      if (closeFoes >= 2) {
        if (id === 'vortex') wt *= 2.8;
        else if (id === 'flame') wt *= 2.5;
        else if (id === 'toomuch' || id === 'rocket') wt *= 2.3;
        else if (id === 'blink' || id === 'shotgun') wt *= 2.0;
      }
      // Tight close-quarters duel.
      if (nearestDist < 190) {
        if (id === 'shotgun' || id === 'flame') wt *= 2.2;
        else if (id === 'blink' || id === 'smg' || id === 'c4') wt *= 1.85;
      }
      // Trapped in a crater / enemy holds high ground: mobility & fortification.
      if (trappedLow || enemyAbove) {
        if (id === 'blink') wt *= 3.0;
        else if (id === 'builder') wt *= 2.3;
        else if (id === 'prism' || id === 'rocket') wt *= 2.0;
      }
      // Enemy behind cover or heavy player fortifications: bank-shots & wallbreakers.
      if (blockedSight || this.buildN >= 8) {
        if (id === 'prism') wt *= 2.8;
        else if (id === 'rail' || id === 'c4') wt *= 2.35;
        else if (id === 'toomuch' || id === 'rocket') wt *= 1.95;
      }
      // Long-range sightline standoff.
      if (nearestDist > 420 && nearestDist < Infinity) {
        if (id === 'sniper') wt *= 2.8;
        else if (id === 'rail') wt *= 2.5;
        else if (id === 'prism' || id === 'rifle') wt *= 1.95;
      }
      // Low HP clutch comeback potential.
      if (criticalHp) {
        if (id === 'toomuch' || id === 'vortex' || id === 'blink') wt *= 2.25;
        else if (id === 'rail' || id === 'rocket') wt *= 1.9;
      }
      return wt;
    });

    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  },

  // Picks one of the 4 short-duration Rift Orb boosts, nudged slightly by the picker's state.
  pickOrbBuff(slot) {
    const p = this.players[slot];
    const buffs = [BUFF.TURBO, BUFF.OVERDRIVE, BUFF.SHIELD, BUFF.FRENZY];
    let lowAmmo = false;
    for (let w = 1; w < WEAPONS.length; w++) {
      if (owns(p.owned, w) && WEAPONS[w].ammo > 0 && p.ammo[w] >= 0 && p.ammo[w] <= Math.ceil(WEAPONS[w].ammo * 0.35)) {
        lowAmmo = true;
        break;
      }
    }
    const weights = buffs.map((b) => {
      let wt = 1;
      if (b === BUFF.SHIELD && p.hp <= 65) wt *= 1.9;
      if (b === BUFF.FRENZY && lowAmmo) wt *= 1.85;
      if (b === BUFF.TURBO && (p.fuel < 55 || p.stamina < 55)) wt *= 1.5;
      if (b === BUFF.OVERDRIVE && p.hp > 65) wt *= 1.35;
      if (p.buff === b && p.buffT > 2) wt *= 0.35;
      return wt;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (let i = 0; i < buffs.length; i++) {
      r -= weights[i];
      if (r <= 0) return buffs[i];
    }
    return BUFF.TURBO;
  },

  applyOrbBuff(slot, buff) {
    const p = this.players[slot];
    const info = BUFF_INFO[buff];
    p.buff = buff;
    p.buffT = info.dur;
    if (buff === BUFF.SHIELD) {
      p.hp = Math.min(RULES.HP, p.hp + info.heal);
      p.eshield = info.hp;
    } else {
      p.eshield = 0;
    }
    if (buff === BUFF.TURBO) {
      p.fuel = RULES.FUEL;
      p.stamina = RULES.STAMINA;
      p.flips = Math.max(p.flips, PHYS.FLIPS);
    } else if (buff === BUFF.FRENZY) {
      p.nades = Math.min(GRENADE.count, p.nades + 1);
    }
  },

  // Next weapon of the pool, in unlock order, that `slot` does not own yet, or -1.
  nextLocked(slot) {
    const mask = this.players[slot].owned;
    for (const w of UNLOCKS) if (owns(this.pool, w) && !owns(mask, w)) return w;
    return -1;
  },

  // Gives `slot` weapon `w` with a full magazine and switches to it when it is an upgrade.
  grant(slot, w, silent, extra) {
    const p = this.players[slot];
    if (w < 0 || owns(p.owned, w)) return false;
    p.owned |= 1 << w;
    p.ammo[w] = this.infiniteAmmo ? -1 : WEAPONS[w].ammo;
    if (!silent) this.emit({ e: 'u', s: slot, w, ...extra });
    return true;
  },

  // Everyone present gets the next pool weapon of the global unlock track.
  armoryUnlock() {
    const w = UNLOCKS.find((u) => owns(this.pool, u) && !owns(this.baseOwned, u));
    if (w === undefined) return;
    this.baseOwned |= 1 << w;
    for (let s = 0; s < this.n; s++) if (this.present[s]) this.grant(s, w, true);
    this.emit({ e: 'u', s: -1, w });
  },

  pickup(s, c) {
    const p = this.players[s];
    if (c.kind === ITEM.MYSTERY) {
      p.hp = Math.min(RULES.HP, p.hp + 25);
      p.fuel = RULES.FUEL;
      p.nades = Math.min(GRENADE.count, p.nades + 1);
      const w = this.pickContextualWeapon(s);
      if (w >= 0) {
        if (!this.grant(s, w, false, { mys: 1 })) {
          const full = WEAPONS[w].ammo;
          if (full > 0 && p.ammo[w] >= 0) p.ammo[w] = Math.max(p.ammo[w], Math.ceil(full * 1.5));
          this.emit({ e: 'u', s, w, mys: 1, ref: 1 });
        }
      }
      this.emit({ e: 'k', s, id: c.id, kind: c.kind, x: r1(c.x), y: r1(c.y), hp: Math.round(p.hp) });
      return;
    }
    if (c.kind === ITEM.ORB) {
      const buff = c.buff || this.pickOrbBuff(s);
      this.applyOrbBuff(s, buff);
      this.emit({ e: 'orb', s, b: buff, id: c.id, x: r1(c.x), y: r1(c.y), hp: Math.round(p.hp) });
      return;
    }
    if (c.kind === ITEM.CRATE) {
      p.hp = Math.min(RULES.HP, p.hp + RULES.CRATE_HEAL);
      for (let w = 0; w < WEAPONS.length; w++) if (owns(p.owned, w) && p.ammo[w] >= 0) p.ammo[w] = WEAPONS[w].ammo;
      p.nades = GRENADE.count;
      p.fuel = RULES.FUEL;
      this.grant(s, this.nextLocked(s));
    } else {
      const share = c.kind === ITEM.AMMO ? 0.5 : 0.35;
      for (let w = 0; w < WEAPONS.length; w++) {
        const full = WEAPONS[w].ammo;
        if (full > 0 && owns(p.owned, w) && p.ammo[w] >= 0) p.ammo[w] = Math.min(full, p.ammo[w] + Math.ceil(full * share));
      }
      p.nades = Math.min(GRENADE.count, p.nades + 1);
    }
    this.emit({ e: 'k', s, id: c.id, kind: c.kind, x: r1(c.x), y: r1(c.y), hp: Math.round(p.hp) });
  },

  timers() {
    if (this.armoryOn) {
      this.armoryT -= DT;
      if (this.armoryT <= 0) {
        this.armoryT = this.armoryEvery;
        this.armoryUnlock();
      }
    }
    if (!this.cratesOn) return;
    if (this.riftDrops) {
      this.crateT -= DT;
      if (this.crateT <= 0) {
        this.crateT = this.nextMysteryDelay();
        if (this.items.filter((c) => c.kind === ITEM.MYSTERY).length < 3) this.dropMystery();
      }
      this.orbT -= DT;
      if (this.orbT <= 0) {
        this.orbT = this.nextOrbDelay();
        if (this.items.filter((c) => c.kind === ITEM.ORB).length < 3) this.dropOrb();
      }
      this.ammoT -= DT;
      if (this.ammoT <= 0) {
        this.ammoT = this.nextAmmoDelay();
        if (this.items.filter((c) => c.kind === ITEM.AMMO).length < 3) this.dropItem(ITEM.AMMO, this.randomDropX());
      }
      return;
    }
    this.crateT -= DT;
    if (this.crateT <= 0) {
      this.crateT = RULES.CRATE_EVERY;
      if (this.items.filter((c) => c.kind === ITEM.CRATE).length < 2) this.dropItem(ITEM.CRATE, this.randomDropX());
    }
    this.ammoT -= DT;
    if (this.ammoT <= 0) {
      this.ammoT = RULES.AMMO_EVERY;
      if (this.items.filter((c) => c.kind === ITEM.AMMO).length < 3) this.dropItem(ITEM.AMMO, this.randomDropX());
    }
  },

  updateItems() {
    this.timers();
    const keep = [];
    const t = this.terrain;
    for (const c of this.items) {
      c.t += DT;
      const life = c.kind === ITEM.CRATE || c.kind === ITEM.MYSTERY ? RULES.CRATE_LIFE : RULES.AMMO_LIFE;
      if (c.t > life) continue;
      const half = (SIZE[c.kind] || 16) / 2;
      // Items rest on anything that blocks shots, so they ride sand piles and fall when the floor goes.
      if (t.rectBlocksShot(c.x - half, c.y - 1, c.x + half, c.y)) c.y -= 1; // buried: pop up
      if (!t.rectBlocksShot(c.x - half, c.y, c.x + half, c.y + 1)) {
        const maxVy = c.kind === ITEM.MYSTERY ? 420 : 900;
        c.vy = Math.min(maxVy, c.vy + GRAV * DT);
        let dy = c.vy * DT;
        while (dy > 0) {
          const s = Math.min(1, dy);
          if (t.rectBlocksShot(c.x - half, c.y + s - 0.01, c.x + half, c.y + s)) {
            c.vy = 0;
            break;
          }
          c.y += s;
          dy -= s;
        }
        if (c.y > this.worldH) continue;
      } else {
        c.vy = 0;
      }
      let taken = false;
      for (let s = 0; s < this.n && !taken; s++) {
        const p = this.players[s];
        if (!this.present[s] || p.dead || !this.canLoot[s]) continue;
        if (Math.abs(p.x - c.x) < half + 8 && c.y > p.y - PHYS.HEIGHT - 2 && c.y - (SIZE[c.kind] || 16) < p.y + 2) {
          taken = true;
          this.pickup(s, c);
        }
      }
      if (!taken) keep.push(c);
    }
    this.items = keep;
  },
};

export const ITEM_SIZE = SIZE;
