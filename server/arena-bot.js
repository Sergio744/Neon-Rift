import { BTN, DT, PHYS } from '../shared/constants.js';
import { ITEM } from '../shared/game/items.js';
import { isWeaponForbidden } from '../shared/rules.js';
import { W, WEAPONS } from '../shared/weapons.js';

export const BOT_CALLSIGNS = ['NOVA', 'VEX', 'VOLT', 'KIRA', 'ECHO', 'LYRA', 'AXEL', 'ZERO'];

export const BOT_SKILLS = {
  rookie: { aimErr: 0.16, react: 0.36, turn: 7.5, burst: 0.35, rest: 0.45, lead: 0.35, crateRange: 300 },
  veteran: { aimErr: 0.08, react: 0.18, turn: 12.0, burst: 0.55, rest: 0.24, lead: 0.75, crateRange: 480 },
  ace: { aimErr: 0.032, react: 0.08, turn: 18.0, burst: 0.85, rest: 0.12, lead: 0.96, crateRange: 660 },
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
    jumpLock: 0,
    lastX: 0,
    edge: rng() < 0.5 ? -1 : 1,
  };
}

function hasUsableAmmo(p, g, w) {
  if (!(p.owned & (1 << w))) return false;
  if (WEAPONS[w].ammo < 0 || g.infiniteAmmo) return true;
  return p.ammo[w] > 0;
}

// Picks the strongest owned & rule-legal weapon with remaining ammo for the engagement distance.
function pickWeaponForDist(p, g, dist, rules) {
  if (rules?.pistolOnly) return W.pistol;
  const candidates =
    dist < 150
      ? [W.shotgun, W.flame, W.smg, W.rifle, W.prism, W.pistol]
      : dist < 380
        ? [W.rifle, W.prism, W.rocket, W.vortex, W.smg, W.shotgun, W.rail, W.pistol]
        : [W.rail, W.sniper, W.prism, W.rifle, W.rocket, W.toomuch, W.smg, W.pistol];
  for (const w of candidates) {
    if (!isWeaponForbidden(rules, w) && hasUsableAmmo(p, g, w)) return w;
  }
  return W.pistol;
}

function isEnemy(room, slot, other) {
  if (slot === other) return false;
  if (room.mode === 'teams') return room.teams[slot] >= 0 && room.teams[other] >= 0 && room.teams[slot] !== room.teams[other];
  return true;
}

// Polite teammate rule: bots yield nearby Mystery Crates / Orbs if a human ally is closer.
function pickHelpfulItem(room, slot, p, maxRange) {
  const g = room.game;
  if (!g.items?.length) return null;
  const needHp = p.hp < 80;
  const lowWeapons = (p.owned & ~((1 << W.pistol) | (1 << W.builder))) === 0;
  let best = null;
  let bestScore = Infinity;

  for (const it of g.items) {
    if (it.kind === ITEM.CRATE && !needHp && !lowWeapons) continue;
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (d > maxRange) continue;

    // Yield to an allied human who is already closer to this drop.
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
    if (it.kind === ITEM.MYSTERY) weight = lowWeapons ? 0.42 : 0.65;
    else if (it.kind === ITEM.ORB) weight = 0.52;
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
  bot.tgtT = 0.45;
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
    const score = dSelf * 0.65 + dAnchor * 0.35 - (s === cur ? 140 : 0);
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

  const ox = p.x;
  const oy = p.y - PHYS.AIM_Y;
  let dist = Infinity;
  let desired = bot.aim;

  bot.strafeT -= DT;
  if (bot.strafeT <= 0) {
    const r = rng();
    bot.strafe = r < 0.25 ? 0 : r < 0.62 ? -1 : 1;
    bot.strafeT = 0.45 + rng() * 0.9;
  }

  if (target) {
    const tx = target.x;
    const ty = target.y - 28;
    const dx = tx - ox;
    const dy = ty - oy;
    dist = Math.hypot(dx, dy) || 1;

    if (--bot.losT <= 0) {
      bot.losT = 3 + (slot % 3);
      const hit = t.raycast(ox, oy, dx / dist, dy / dist, dist);
      bot.los = hit < 0 || hit > dist - 10;
    }
    bot.seen = bot.los ? Math.min(3, bot.seen + DT) : Math.max(0, bot.seen - DT * 2.2);

    bot.wSwapT -= DT;
    if (bot.wSwapT <= 0 || !hasUsableAmmo(p, g, bot.w) || isWeaponForbidden(rules, bot.w)) {
      bot.w = pickWeaponForDist(p, g, dist, rules);
      bot.wSwapT = 0.65 + rng() * 0.6;
    }
    const WDef = WEAPONS[bot.w];

    let ax = tx;
    let ay = ty;
    if (WDef.speed && (WDef.kind === 'rocket' || WDef.kind === 'mirv' || WDef.kind === 'vortex')) {
      const lt = dist / WDef.speed;
      ax += target.vx * lt * S.lead;
      ay = target.grounded ? target.y - 6 : ty;
    } else if (WDef.speed && WDef.kind === 'bullet') {
      ax += target.vx * (dist / WDef.speed) * S.lead;
    }

    bot.errT -= DT;
    if (bot.errT <= 0) {
      bot.errT = 0.24 + rng() * 0.38;
      bot.err = (rng() * 2 - 1) * S.aimErr;
    }
    desired = Math.atan2(ay - oy, ax - ox) + bot.err;

    const hd = target.x - p.x;
    const dirTo = hd >= 0 ? 1 : -1;
    const prefNear = bot.w === W.shotgun || bot.w === W.flame ? 70 : 150;
    const prefFar = bot.w === W.shotgun || bot.w === W.flame ? 175 : bot.w === W.sniper || bot.w === W.rail ? 460 : 320;

    if (!bot.los || dist > prefFar) move = Math.abs(hd) > 28 ? dirTo : 0;
    else if (dist < prefNear) move = -dirTo;
    else move = bot.strafe;

    wantUp = target.y - p.y < -70 && (Math.abs(hd) < 420 || !bot.los);
    wantDown = target.y - p.y > 80 && Math.abs(hd) < 320;
  } else {
    move = bot.strafe;
    bot.los = false;
    bot.seen = 0;
  }

  // Squad tactical orders override or bias movement when appropriate.
  if (bot.order === 'follow' && bot.leader >= 0 && g.present[bot.leader] && !g.players[bot.leader].dead) {
    const lead = g.players[bot.leader];
    const ld = lead.x - p.x;
    if (Math.abs(ld) > 165) {
      move = ld > 0 ? 1 : -1;
      wantUp = lead.y - p.y < -65;
      wantDown = lead.y - p.y > 85;
    }
  } else if (bot.order === 'hold') {
    const hd = bot.holdX - p.x;
    if (Math.abs(hd) > 190) {
      move = hd > 0 ? 1 : -1;
      wantUp = bot.holdY - p.y < -75;
    }
  } else if (item && (!bot.los || p.hp < 55 || Math.hypot(item.x - p.x, item.y - p.y) < 220)) {
    const id = item.x - p.x;
    move = Math.abs(id) > 16 ? (id > 0 ? 1 : -1) : 0;
    wantUp = item.y - p.y < -55;
    wantDown = item.y - p.y > 70;
  }

  // Unstick & obstacle jumping
  if (bot.detourT > 0) {
    bot.detourT -= DT;
    move = bot.detour;
  }
  if (move !== 0 && Math.abs(p.x - bot.lastX) < 0.35) bot.stuck += DT;
  else bot.stuck = Math.max(0, bot.stuck - DT);
  bot.lastX = p.x;

  if (bot.stuck > 0.75) {
    bot.detour = -(move || bot.edge);
    bot.detourT = 0.75 + rng() * 0.5;
    bot.stuck = 0;
  }

  bot.jumpLock = Math.max(0, bot.jumpLock - DT);
  const blocked = move !== 0 && t.rectSolid(p.x + move * 14 - 3, p.y - 40, p.x + move * 14 + 3, p.y - 12);
  if (wantUp && p.fuel > 0.15 && !rules?.noJetpack) {
    if (!p.grounded || bot.jumpLock <= 0) b |= BTN.JUMP;
  } else if (blocked && p.grounded && bot.jumpLock <= 0) {
    b |= BTN.JUMP;
    bot.jumpLock = 0.26;
  }
  if (wantDown) b |= BTN.DOWN;
  if (move < 0) b |= BTN.LEFT;
  else if (move > 0) b |= BTN.RIGHT;
  if (move !== 0 && dist > 260 && p.stamina > 0.35) b |= BTN.SPRINT;
  if (bot.stuck > 0.35 && move !== 0) b |= BTN.MELEE;

  const da = wrap(desired - bot.aim);
  const maxStep = S.turn * DT;
  bot.aim = wrap(bot.aim + Math.max(-maxStep, Math.min(maxStep, da)));

  // Trigger discipline: wait for reaction window, respect friendly line of fire, fire in human-like bursts.
  if (room.state === 'playing' && target && bot.los && bot.seen >= S.react && Math.abs(da) < 0.34) {
    const WDef = WEAPONS[bot.w];
    const safeSplash = (WDef.kind !== 'rocket' && WDef.kind !== 'mirv' && WDef.kind !== 'vortex') || dist > 95;
    if (safeSplash) {
      if (bot.restT > 0) {
        bot.restT -= DT;
      } else {
        if (bot.burstT <= 0) bot.burstT = S.burst * (0.7 + rng() * 0.6);
        bot.burstT -= DT;
        if (WDef.auto || p.cd <= 0) b |= BTN.FIRE;
        if (bot.burstT <= 0) bot.restT = S.rest * (0.6 + rng() * 0.8);
      }
      if (bot.skill === 'ace' && !rules?.noExplosives && p.nadeCd <= 0 && dist > 150 && dist < 390 && rng() < 0.008) {
        b |= BTN.ALT;
      }
    }
  }

  return { s: g.tick, b, a: bot.aim, w: bot.w, v: g.tick };
}
