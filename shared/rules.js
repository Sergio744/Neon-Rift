import { BTN } from './constants.js';
import { W } from './weapons.js';

export const TIME_LIMITS = [0, 60, 120, 180, 300]; // seconds; 0 = unlimited

export const RULE_DEFS = [
  { id: 'noExplosives', icon: '💥✕' },
  { id: 'noJetpack', icon: '🚀✕' },
  { id: 'noBuild', icon: '🧱✕' },
  { id: 'pistolOnly', icon: '🔫!' },
  { id: 'noOrbs', icon: '🔮✕' },
  { id: 'noSos', icon: '🆘✕' },
];

export const RULE_IDS = RULE_DEFS.map((r) => r.id);

const EXPLOSIVE_WEAPONS = new Set([W.rocket, W.toomuch, W.c4, W.quake, W.vortex]);

export function sanitizeRules(raw = {}) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of RULE_IDS) {
    if (raw[id]) out[id] = true;
  }
  return out;
}

export function sanitizeTimeLimit(val, fallback = 0) {
  const n = Number(val);
  return TIME_LIMITS.includes(n) ? n : fallback;
}

export function hasAnyRule(rules) {
  return Boolean(rules && RULE_IDS.some((id) => rules[id]));
}

export function isWeaponForbidden(rules, w) {
  if (!rules) return false;
  if (rules.pistolOnly && w !== W.pistol) return true;
  if (rules.noBuild && w === W.builder) return true;
  if (rules.noExplosives && EXPLOSIVE_WEAPONS.has(w)) return true;
  return false;
}

// Validates and scrubs a 60 Hz input packet against the active Challenge Rules.
// Returns `{ inp, foul }` where `foul` is the violated rule id if the player actively tried
// to trigger a banned action (firing a banned weapon, throwing a banned grenade, burning jetpack).
export function enforceRulesOnInput(rules, player, inp) {
  if (!rules || !player || player.dead) return { inp, foul: null };
  let b = inp.b | 0;
  let w = inp.w | 0;
  let foul = null;

  if (rules.pistolOnly && w !== W.pistol) {
    if (b & BTN.FIRE) foul = 'pistolOnly';
    w = W.pistol;
  }
  if (rules.noBuild && w === W.builder) {
    if (b & BTN.FIRE) foul = foul || 'noBuild';
    w = W.pistol;
    b &= ~BTN.FIRE;
  }
  if (rules.noExplosives) {
    if (EXPLOSIVE_WEAPONS.has(w)) {
      if (b & BTN.FIRE) foul = foul || 'noExplosives';
      w = W.pistol;
      b &= ~BTN.FIRE;
    }
    if (b & BTN.ALT) {
      foul = foul || 'noExplosives';
      b &= ~BTN.ALT;
    }
  }
  if (rules.noJetpack) {
    player.fuel = 0;
    if (!player.grounded && player.flips === 0 && (b & BTN.JUMP) && player.jetHold > 0.14) {
      foul = foul || 'noJetpack';
      b &= ~BTN.JUMP;
    }
  }

  return {
    inp: b === inp.b && w === inp.w ? inp : { ...inp, b, w },
    foul,
  };
}

export function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
