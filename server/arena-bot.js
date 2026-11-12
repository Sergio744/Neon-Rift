import { BTN, CELL, DT, MAT_BEDROCK, MAT_EMPTY, PHYS } from '../shared/constants.js';
import { ITEM } from '../shared/game/items.js';
import { COLLIDE, HARD } from '../shared/materials.js';
import { isWeaponForbidden } from '../shared/rules.js';
import { CONTINUOUS, W, WEAPONS } from '../shared/weapons.js';

export const BOT_CALLSIGNS = ['NOVA', 'VEX', 'VOLT', 'KIRA', 'ECHO', 'LYRA', 'AXEL', 'ZERO'];

export const BOT_SKILLS = {
  rookie: { aimErr: 0.14, react: 0.28, turn: 9.0, burst: 0.4, rest: 0.35, lead: 0.45, crateRange: 340 },
  veteran: { aimErr: 0.065, react: 0.12, turn: 15.0, burst: 0.65, rest: 0.18, lead: 0.8, crateRange: 520 },
  ace: { aimErr: 0.025, react: 0.05, turn: 22.0, burst: 0.95, rest: 0.08, lead: 0.98, crateRange: 720 },
};

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function cleanSkill(skill) {
  return BOT_SKILLS[skill] ? skill : 'veteran';
}

export function createArenaBot(slot, { name, skill = 'veteran', rng = Math.random } = {}) {
  return {
    slot,
    name: name || `BOT ${BOT_CALLSIGNS[slot % BOT_CALLSIGNS.length]}`,
    skill: cleanSkill(skill),
    order: 'attack', // 'attack' | 'follow' | 'hold'
    leader: -1,
    holdX: 0,
    holdY: 0,
    tgt: -1,
    tgtT: 0,
    los: false,
    losT: 0,
    seen: 0,
    aim: slot % 2 === 0 ? 0 : Math.PI,
    err: 0,
    errT: 0,
    strafe: 0,
    strafeT: 0,
    burstT: 0,
    restT: 0,
    wSwapT: 0,
    w: W.pistol,
    stuck: 0,
    detour: 0,
    detourT: 0,
    jumpHoldT: 0,
    flipDelayT: 0,
    flyT: 0,
    shaftX: null,
    shaftT: 0,
    prevB: 0,
    lastX: 0,
    lastY: 0,
    edge: rng() < 0.5 ? -1 : 1,
  };
}

function hasUsableAmmo(p, g, w) {
  if (!(p.owned & (1 << w))) return false;
  if (WEAPONS[w].ammo < 0 || g.infiniteAmmo) return true;
  return p.ammo[w] > 0;
}

function pickWeaponForDist(p, g, dist, rules, digging = false) {
  if (rules?.pistolOnly) return W.pistol;
  if (digging) {
    for (const w of [W.cutter, W.flame, W.smg, W.rifle, W.shotgun, W.pistol]) {
      if (!isWeaponForbidden(rules, w) && hasUsableAmmo(p, g, w)) return w;
    }
  }
  const candidates =
    dist < 155
      ? [W.shotgun, W.flame, W.smg, W.rifle, W.prism, W.pistol]
      : dist < 400
        ? [W.rifle, W.prism, W.smg, W.rocket, W.vortex, W.shotgun, W.rail, W.pistol]
        : [W.rail, W.sniper, W.prism, W.rifle, W.rocket, W.toomuch, W.smg, W.pistol];
  for (const w of candidates) {
    if (!isWeaponForbidden(rules, w) && hasUsableAmmo(p, g, w)) return w;
  }
  return W.pistol;
}

function isEnemy(room, slot, other) {
  if (slot === other) return false;
  if (room.mode === 'teams' && room.state !== 'idle') {
    return room.teams[slot] >= 0 && room.teams[other] >= 0 && room.teams[slot] !== room.teams[other];
  }
  return true;
}

// Scans the full 58px player body height ahead in `dirX` (-1 or +1) up to `range` world px.
// Distinguishes `'breakable'` (earth, wood, sand, rock) from `'armored'` (MAT_METAL/MAT_ANCHOR,
// which melee cannot breach down to floor level) and `'bedrock'`.
function findDigPoint(t, p, dirX, range = 36) {
  const bands = [-54, -42, -30, -18, -8];
  let sawBreakable = null;
  for (let d = 8; d <= range; d += 5) {
    const wx = p.x + dirX * d;
    const cx = Math.floor(wx / CELL);
    if (cx < 0 || cx >= t.w) return { kind: 'bedrock', wx, wy: p.y - 29 };
    for (const off of bands) {
      const wy = p.y + off;
      const cy = Math.floor(wy / CELL);
      if (cy < 0 || cy >= t.h) continue;
      const m = t.mat[cy * t.w + cx];
      if (m === MAT_EMPTY || !COLLIDE[m]) continue;
      if (m === MAT_BEDROCK || HARD[m] === 0) return { kind: 'bedrock', wx, wy };
      if (HARD[m] < 0.6) return { kind: 'armored', wx, wy };
      if (!sawBreakable) sawBreakable = { kind: 'breakable', wx, wy };
    }
  }
  return sawBreakable || { kind: 'clear', wx: p.x + dirX * range, wy: p.y - 29 };
}

// Searches nearby X positions for an overhead shaft / open ceiling (e.g. bunker roof shafts on THE MINE).
function findVerticalShaft(t, x, y) {
  for (let step = 0; step <= 220; step += 20) {
    for (const sgn of step === 0 ? [1] : [-1, 1]) {
      const sx = x + sgn * step;
      if (sx < 40 || sx > t.w * CELL - 40) continue;
      if (!t.rectSolid(sx - 6, y - 195, sx + 6, y - 142)) {
        return sx;
      }
    }
  }
  return null;
}

// Inspects terrain ahead of `(x, y)` in direction `(dx, dy)` up to `range` world px.
function probeAhead(t, x, y, dx, dy, range = 34) {
  for (let d = 10; d <= range; d += 6) {
    const cx = Math.floor((x + dx * d) / CELL);
    const cy = Math.floor((y + dy * d) / CELL);
    if (cx < 0 || cx >= t.w || cy < 0 || cy >= t.h) return 'bedrock';
    const m = t.mat[cy * t.w + cx];
    if (m === MAT_EMPTY || !COLLIDE[m]) continue;
    if (m === MAT_BEDROCK) return 'bedrock';
    return 'breakable';
  }
  return 'clear';
}

function pickHelpfulItem(room, slot, p, maxRange) {
  const g = room.game;
  if (!g.items?.length) return null;
  const needHp = p.hp < 80;
  const lowWeapons = (p.owned & ~((1 << W.pistol) | (1 << W.builder))) === 0;
  let best = null;
  let bestScore = Infinity;

  for (const it of g.items) {
    if (it.kind === ITEM.CRATE && !needHp && !lowWeapons) continue;
    const dx = it.x - p.x;
    const dy = (it.y - 12) - (p.y - 30);
    const d = Math.hypot(dx, dy) || 1;
    if (d > maxRange) continue;
    // Ignore items buried behind solid walls so bots never abandon tunnel pushing for sealed crates!
    const hit = g.terrain.raycast(p.x, p.y - 30, dx / d, dy / d, d);
    if (hit >= 0 && hit < d - 16) continue;

    let yielded = false;
    if (room.mode === 'teams') {
      for (let s = 0; s < room.max; s++) {
        if (!room.clients[s] || room.teams[s] !== room.teams[slot]) continue;
        const ally = g.players[s];
        if (!ally || ally.dead) continue;
        if (Math.hypot(it.x - ally.x, it.y - ally.y) + 40 < d) {
          yielded = true;
          break;
        }
      }
    }
    if (yielded) continue;

    let weight = 1;
    if (it.kind === ITEM.MYSTERY) weight = lowWeapons ? 0.4 : 0.62;
    else if (it.kind === ITEM.ORB) weight = 0.5;
    else if (it.kind === ITEM.CRATE) weight = needHp ? 0.55 : 0.75;
    else if (it.kind === ITEM.AMMO || it.kind === ITEM.PACK) weight = 0.85;
    const score = d * weight;
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

function pickEnemy(room, slot, p, bot) {
  const g = room.game;
  bot.tgtT -= DT;
  const cur = bot.tgt;
  if (cur >= 0 && g.present[cur] && !g.players[cur].dead && isEnemy(room, slot, cur) && bot.tgtT > 0) {
    return g.players[cur];
  }
  bot.tgtT = 0.4;
  let best = -1;
  let bestD = Infinity;
  const anchor =
    bot.order === 'follow' && bot.leader >= 0 && g.present[bot.leader] && !g.players[bot.leader].dead
      ? g.players[bot.leader]
      : p;

  for (let s = 0; s < room.max; s++) {
    if (!g.present[s] || !isEnemy(room, slot, s)) continue;
    const q = g.players[s];
    if (!q || q.dead) continue;
    const dSelf = Math.hypot(q.x - p.x, q.y - p.y);
    const dAnchor = Math.hypot(q.x - anchor.x, q.y - anchor.y);
    const score = dSelf * 0.7 + dAnchor * 0.3 - (s === cur ? 120 : 0);
    if (score < bestD) {
      bestD = score;
      best = s;
    }
  }
  bot.tgt = best;
  return best >= 0 ? g.players[best] : null;
}

export function stepArenaBot(room, slot, bot, rng = Math.random) {
  const g = room.game;
  const p = g.players[slot];
  if (!p || p.dead || !g.present[slot]) {
    bot.seen = 0;
    bot.prevB = 0;
    return { s: g.tick, b: 0, a: bot.aim, w: W.pistol, v: g.tick };
  }

  const S = BOT_SKILLS[bot.skill] || BOT_SKILLS.veteran;
  const rules = room.activeRules || null;
  const t = g.terrain;
  const target = pickEnemy(room, slot, p, bot);
  const item = room.state === 'playing' && !rules?.noOrbs ? pickHelpfulItem(room, slot, p, S.crateRange) : null;

  let b = 0;
  let move = 0;
  let wantUp = false;
  let wantDown = false;
  let wantDig = false;

  const ox = p.x;
  const oy = p.y - PHYS.AIM_Y;
  let dist = Infinity;
  let desired = bot.aim;

  bot.strafeT -= DT;
  if (bot.strafeT <= 0) {
    const r = rng();
    bot.strafe = r < 0.2 ? 0 : r < 0.6 ? -1 : 1;
    bot.strafeT = 0.38 + rng() * 0.75;
  }

  if (target) {
    const tx = target.x;
    const ty = target.y - 26;
    const dx = tx - ox;
    const dy = ty - oy;
    dist = Math.hypot(dx, dy) || 1;

    if (--bot.losT <= 0) {
      bot.losT = 3 + (slot % 3);
      const hit = t.raycast(ox, oy, dx / dist, dy / dist, dist);
      bot.los = hit < 0 || hit > dist - 12;
    }
    bot.seen = bot.los ? Math.min(3, bot.seen + DT) : Math.max(0, bot.seen - DT * 2.0);

    const hd = target.x - p.x;
    const dirTo = hd >= 0 ? 1 : -1;
    const prefNear = bot.w === W.shotgun || bot.w === W.flame ? 68 : 135;
    const prefFar = bot.w === W.shotgun || bot.w === W.flame ? 170 : bot.w === W.sniper || bot.w === W.rail ? 460 : 300;

    if (!bot.los || dist > prefFar) move = Math.abs(hd) > 22 ? dirTo : 0;
    else if (dist < prefNear) move = -dirTo;
    else move = bot.strafe;

    wantUp = target.y - p.y < -55 && (Math.abs(hd) < 520 || !bot.los);
    wantDown = target.y - p.y > 75 && Math.abs(hd) < 340;

    // Check if destructible or armored terrain (e.g. THE MINE bunkers, walls, crates) blocks our 58px body!
    let digPoint = null;
    let digUp = false;
    if (bot.shaftT > 0) {
      bot.shaftT = Math.max(0, bot.shaftT - DT);
      if (bot.los || bot.shaftT <= 0) bot.shaftX = null;
    }

    if (!bot.los && bot.shaftX !== null) {
      const roofAbove = probeAhead(t, p.x, p.y - 56, 0, -1, 52);
      if (Math.abs(bot.shaftX - p.x) > 12) {
        move = bot.shaftX > p.x ? 1 : -1;
        // Break any crate/pillar blocking the floor on the way to the shaft!
        const way = findDigPoint(t, p, move, 28);
        if (way.kind === 'breakable') {
          wantDig = true;
          digPoint = way;
        }
      } else {
        move = 0;
        wantUp = true;
        if (roofAbove === 'breakable') {
          wantDig = true;
          digUp = true;
        }
      }
    } else if (!bot.los && move !== 0) {
      const scan = findDigPoint(t, p, move, 36);
      const roofProbe = probeAhead(t, p.x, p.y - 56, 0, -1, 70);
      if (scan.kind === 'armored' || scan.kind === 'bedrock') {
        // Armored wall (e.g. MAT_METAL bunker shield): commit to a nearby vertical shaft for 2.8s!
        const shaftX = findVerticalShaft(t, p.x, p.y);
        if (shaftX !== null) {
          bot.shaftX = shaftX;
          bot.shaftT = 2.8;
          move = Math.abs(shaftX - p.x) > 12 ? (shaftX > p.x ? 1 : -1) : 0;
          if (move === 0) wantUp = true;
        } else if (roofProbe === 'breakable') {
          wantUp = true;
          wantDig = true;
          digUp = true;
        } else {
          wantUp = true;
        }
      } else if (scan.kind === 'breakable') {
        if (roofProbe === 'clear' && target.y < p.y - 60 && !rules?.noJetpack && p.fuel > 20) {
          wantUp = true;
        } else if (p.y > 140 && roofProbe === 'breakable') {
          // Underground in earth/rock: carve upward toward the open surface, stepping into a ledge when fuel dips so fuel recharges!
          wantDig = true;
          if (!p.grounded && p.fuel < 12) {
            digPoint = scan;
          } else {
            wantUp = true;
            digUp = true;
          }
        } else {
          wantDig = true;
          digPoint = scan;
        }
      }
    }

    bot.wSwapT -= DT;
    if (bot.wSwapT <= 0 || !hasUsableAmmo(p, g, bot.w) || isWeaponForbidden(rules, bot.w) || (wantDig && WEAPONS[bot.w].carve === undefined && !CONTINUOUS.has(WEAPONS[bot.w].kind))) {
      bot.w = pickWeaponForDist(p, g, dist, rules, wantDig);
      bot.wSwapT = 0.55 + rng() * 0.5;
    }
    const WDef = WEAPONS[bot.w];

    let ax = tx;
    let ay = ty;
    if (!wantDig && WDef.speed && (WDef.kind === 'rocket' || WDef.kind === 'mirv' || WDef.kind === 'vortex')) {
      const lt = dist / WDef.speed;
      ax += target.vx * lt * S.lead;
      ay = target.grounded ? target.y - 6 : ty;
    } else if (!wantDig && WDef.speed && WDef.kind === 'bullet') {
      ax += target.vx * (dist / WDef.speed) * S.lead;
    }

    bot.errT -= DT;
    if (bot.errT <= 0) {
      bot.errT = 0.22 + rng() * 0.34;
      bot.err = (rng() * 2 - 1) * S.aimErr;
    }
    if (wantDig && digUp) {
      // Carve straight overhead (`-90 deg`) so even hard MAT_ROCK veins (`r = 11.2px`) clear the 12px-wide body symmetrically!
      desired = -Math.PI / 2;
    } else if (wantDig && digPoint) {
      const sinA = Math.max(-0.55, Math.min(0.62, (digPoint.wy - (p.y - 29)) / 30));
      const pitch = Math.asin(sinA);
      desired = move >= 0 ? pitch : wrap(Math.PI - pitch);
      // Hop lightly when lower wall blocks us so horizontal melee sweeps both floor-level and head-level cells!
      if (digPoint.wy > p.y - 16 && p.grounded) wantUp = true;
    } else if (wantDig) {
      const digPitch = Math.max(-0.55, Math.min(0.45, dy / Math.max(80, Math.abs(dx))));
      desired = move >= 0 ? digPitch : wrap(Math.PI - digPitch);
    } else {
      desired = Math.atan2(ay - oy, ax - ox) + bot.err;
    }
  } else {
    move = bot.strafe;
    bot.los = false;
    bot.seen = 0;
  }

  // Squad tactical orders
  if (bot.order === 'follow' && bot.leader >= 0 && g.present[bot.leader] && !g.players[bot.leader].dead) {
    const lead = g.players[bot.leader];
    const ld = lead.x - p.x;
    if (Math.abs(ld) > 165) {
      move = ld > 0 ? 1 : -1;
      wantUp = lead.y - p.y < -60;
      wantDown = lead.y - p.y > 80;
    }
  } else if (bot.order === 'hold') {
    const hd = bot.holdX - p.x;
    if (Math.abs(hd) > 190) {
      move = hd > 0 ? 1 : -1;
      wantUp = bot.holdY - p.y < -70;
    }
  } else if (item && (!bot.los || p.hp < 55 || Math.hypot(item.x - p.x, item.y - p.y) < 230)) {
    const id = item.x - p.x;
    move = Math.abs(id) > 16 ? (id > 0 ? 1 : -1) : 0;
    wantUp = item.y - p.y < -50;
    wantDown = item.y - p.y > 65;
  }

  // Keep bots away from outer bedrock map borders so they never corner themselves!
  if (p.x < 48 && move < 0) {
    move = 1;
    bot.detourT = 0;
  } else if (p.x > g.worldW - 48 && move > 0) {
    move = -1;
    bot.detourT = 0;
  }

  // Unstick & smart vertical escape
  if (bot.detourT > 0) {
    bot.detourT -= DT;
    move = bot.detour;
    if ((p.x < 56 && move < 0) || (p.x > g.worldW - 56 && move > 0)) {
      bot.detour = -move;
      move = bot.detour;
    }
  }

  const movedDist = Math.hypot(p.x - bot.lastX, p.y - bot.lastY);
  if (move !== 0 && movedDist < 0.45 && !wantDig) bot.stuck += DT;
  else bot.stuck = Math.max(0, bot.stuck - DT * 1.5);
  bot.lastX = p.x;
  bot.lastY = p.y;

  if (bot.stuck > 0.65) {
    bot.stuck = 0;
    const ahead = move !== 0 ? findDigPoint(t, p, move, 40) : { kind: 'clear' };
    if (ahead.kind === 'breakable') {
      wantDig = true;
      desired = Math.atan2(ahead.wy - (p.y - 29), ahead.wx - p.x);
    } else {
      if (!rules?.noJetpack && p.fuel > 22) bot.flyT = 0.55;
      const toCenter = p.x < g.worldW / 2 ? 1 : -1;
      bot.detour = move ? -move : toCenter;
      bot.detourT = 0.6 + rng() * 0.45;
    }
  }

  // Full-height Jump + Double-Jump Flip + Jetpack Thrust (`p.fuel` is 0..100!)
  const blockedLow = move !== 0 && t.rectSolid(p.x + move * 16 - 3, p.y - 56, p.x + move * 16 + 3, p.y - 11);
  const blockedHigh = move !== 0 && t.rectSolid(p.x + move * 18 - 3, p.y - 84, p.x + move * 18 + 3, p.y - 52);

  if (bot.flyT > 0) {
    bot.flyT = Math.max(0, bot.flyT - DT);
    wantUp = true;
  }

  if (bot.jumpHoldT > 0) {
    bot.jumpHoldT = Math.max(0, bot.jumpHoldT - DT);
    b |= BTN.JUMP;
  } else if (wantUp && !rules?.noJetpack && p.fuel > 16) {
    // Release for 1 tick if grounded so `pressed & BTN.JUMP` initiates lift-off, then hold to ignite jetpack!
    if (p.grounded && (bot.prevB & BTN.JUMP)) {
      b &= ~BTN.JUMP;
    } else {
      b |= BTN.JUMP;
    }
  } else if ((blockedLow || (wantUp && rules?.noJetpack)) && p.grounded && !wantDig) {
    // Ensure rising edge on BTN.JUMP and hold for 0.24s so jump is NEVER cut in half!
    if (!(bot.prevB & BTN.JUMP)) {
      b |= BTN.JUMP;
      bot.jumpHoldT = 0.24;
      bot.flipDelayT = blockedHigh ? 0.28 : 0;
    }
  } else if (!p.grounded && p.flips > 0 && (wantUp || bot.flipDelayT > 0)) {
    if (bot.flipDelayT > 0) bot.flipDelayT = Math.max(0, bot.flipDelayT - DT);
    if (bot.flipDelayT <= 0 && p.vy > -120) {
      // Release 1 tick if held, then tap BTN.JUMP for the full-power air flip!
      if (!(bot.prevB & BTN.JUMP)) {
        b |= BTN.JUMP;
        bot.jumpHoldT = 0.08;
      }
    }
  }

  if (wantDown) b |= BTN.DOWN;
  if (move < 0) b |= BTN.LEFT;
  else if (move > 0) b |= BTN.RIGHT;
  if (move !== 0 && (dist > 220 || !bot.los) && p.stamina > 25) b |= BTN.SPRINT;

  const da = wrap(desired - bot.aim);
  const maxStep = (wantDig ? 18 : S.turn) * DT;
  bot.aim = wrap(bot.aim + Math.max(-maxStep, Math.min(maxStep, da)));

  // Pulse helper for semi-auto actions requiring `pressed & flag` rising edges in shared/player.js!
  const pulse = (flag) => {
    if (!(bot.prevB & flag)) b |= flag;
  };

  // Close-quarters melee shove OR active tunnel carving!
  if ((wantDig || (target && dist < 46 && bot.los)) && p.mcd <= 0) {
    pulse(BTN.MELEE);
  }

  // Weapon firing: either engaging visible enemy (including Open Ring 'idle' warm-up!) OR carving through breakable terrain!
  const activeCombat = room.state === 'playing' || room.state === 'idle';
  const canEngage = activeCombat && target && bot.los && bot.seen >= S.react && Math.abs(da) < 0.36;
  const canTunnelFire = activeCombat && wantDig && Math.abs(da) < 0.45;

  if (canEngage || canTunnelFire) {
    const WDef = WEAPONS[bot.w];
    const explosive = WDef.kind === 'rocket' || WDef.kind === 'mirv' || WDef.kind === 'vortex' || WDef.kind === 'quake';
    const safeSplash = !explosive || (canEngage && dist > 95);
    if (safeSplash) {
      if (canTunnelFire) {
        if (WDef.auto || CONTINUOUS.has(WDef.kind)) b |= BTN.FIRE;
        else if (p.cd <= 0.02) pulse(BTN.FIRE);
      } else if (bot.restT > 0) {
        bot.restT -= DT;
      } else {
        if (bot.burstT <= 0) bot.burstT = S.burst * (0.7 + rng() * 0.6);
        bot.burstT -= DT;
        if (WDef.auto || CONTINUOUS.has(WDef.kind)) b |= BTN.FIRE;
        else if (p.cd <= 0.02) pulse(BTN.FIRE);
        if (bot.burstT <= 0) bot.restT = S.rest * (0.6 + rng() * 0.8);
      }
      if (
        canEngage &&
        bot.skill !== 'rookie' &&
        !rules?.noExplosives &&
        p.gcd <= 0 &&
        p.nades > 0 &&
        dist > 140 &&
        dist < 410 &&
        rng() < 0.014
      ) {
        pulse(BTN.ALT);
      }
    }
  }

  bot.prevB = b;
  return { s: g.tick, b, a: bot.aim, w: bot.w, v: g.tick };
}
