import { GRID_H, GRID_W } from '../constants.js';
import {
  D, MAT_GLASS, MAT_METAL, MAT_ROCK, MAT_WOOD, S, bedrock, core, islandCore,
} from './painter.js';
import { crate, crateStack, glassCase } from './props.js';

// NEON CITY: cyberpunk rooftop arena with twin neon skyscrapers, a central Rift Reactor,
// destructible glass tubes, holographic billboards and three anchored hover-decks.
export function buildNeon(P, rnd) {
  const VOID = '#14102b';
  const CONCRETE = '#1f193d';
  const STEEL = '#2d2654';
  const CYAN = '#3ee6ff';
  const MAGENTA = '#ff4d9d';
  const LIME = '#b4ff5a';
  const GOLD = '#ffd23f';
  const WHITE = '#f4f1ff';

  // ---------- Street plaza & bedrock ----------
  const FLOOR = 392;
  P.rect(0, FLOOR, GRID_W, GRID_H - 12, S, CONCRETE);
  P.rect(0, FLOOR, GRID_W, FLOOR + 3, null, STEEL);
  // Glowing street trim strips (Neon left, Rift right).
  for (let x = 8; x < 340; x++) if (x % 8 < 6) P.put(x, FLOOR + 1, null, CYAN);
  for (let x = 460; x < 792; x++) if (x % 8 < 6) P.put(x, FLOOR + 1, null, MAGENTA);
  for (let i = 0; i < 65; i++) {
    const x = Math.floor(rnd() * GRID_W);
    const y = FLOOR + 6 + Math.floor(rnd() * (GRID_H - 20 - FLOOR));
    P.disc(x, y, 1.5 + rnd() * 2, null, '#29214d');
  }
  bedrock(P, rnd, '#0b081a', '#161130');

  // ---------- Background cyberpunk megacity silhouettes ----------
  P.behind(() => {
    const bgTowers = [
      [152, 224, 210, '#161130', CYAN],
      [284, 248, 336, '#181236', MAGENTA],
      [464, 248, 516, '#181236', CYAN],
      [590, 224, 648, '#161130', MAGENTA],
    ];
    for (const [x0, y0, x1, bodyCol, glow] of bgTowers) {
      P.rect(x0, y0, x1, FLOOR, D, bodyCol);
      P.rect(x0, y0, x1, y0 + 2, D, glow);
      for (let wy = y0 + 10; wy < FLOOR - 12; wy += 12) {
        for (let wx = x0 + 6; wx < x1 - 8; wx += 10) {
          if (rnd() < 0.68) P.rect(wx, wy, wx + 4, wy + 5, D, rnd() < 0.25 ? WHITE : glow);
        }
      }
    }
  });

  // ---------- Twin Skyscrapers (Neon West & Rift East) ----------
  for (const side of [1, -1]) {
    const accent = side > 0 ? CYAN : MAGENTA;
    const x0 = side > 0 ? 18 : GRID_W - 144;
    const x1 = x0 + 126;
    const roofY = 258;

    // Main solid tower shell anchored directly into street floor.
    P.rect(x0, roofY, x1, FLOOR, S, '#221c44');
    P.frame(x0, roofY, x1, FLOOR, STEEL);
    P.rect(x0, roofY, x1, roofY + 3, null, accent);

    // Indestructible structural beam under the rooftop so spawns always keep high ground.
    core(P, x0 + 16, roofY + 3, x1 - 16, roofY + 10, null);

    // Open ground-floor cyber arcade lobby (carved out to decor, leaving thick outer/inner pillars).
    P.rect(x0 + 16, 338, x1 - 16, FLOOR, D, VOID);
    // Mid-level window gallery (decor backdrop + glass panes on the inner wall).
    P.rect(x0 + 18, 282, x1 - 18, 324, D, '#120d26');
    for (let wy = 288; wy < 320; wy += 10) {
      for (let wx = x0 + 24; wx < x1 - 24; wx += 14) {
        P.rect(wx, wy, wx + 7, wy + 5, D, (wx + wy) % 3 === 0 ? GOLD : accent);
      }
    }
    // Destructible neon glass window facing the arena center.
    const gx = side > 0 ? x1 - 4 : x0;
    P.rect(gx, 284, gx + 4, 322, MAT_GLASS, '#b8f7ff');

    // Rooftop sniper parapet on arena-facing edge + antenna spire in decor.
    const px = side > 0 ? x1 - 12 : x0;
    P.rect(px, roofY - 12, px + 12, roofY, MAT_METAL, STEEL);
    P.rect(px, roofY - 12, px + 12, roofY - 10, null, accent);

    const antX = side > 0 ? x0 + 22 : x1 - 24;
    P.behind(() => {
      P.rect(antX, roofY - 38, antX + 2, roofY, D, STEEL);
      P.disc(antX + 1, roofY - 40, 3, D, accent);
    });

    // Cover crates on rooftop & street outside tower.
    crateStack(P, side > 0 ? x0 + 34 : x1 - 54, roofY, 2, 10);
    crate(P, side > 0 ? 256 : GRID_W - 267, FLOOR, 11);

    // Low street cyber-barricades (metal).
    const bx = side > 0 ? 218 : GRID_W - 248;
    P.round(bx, FLOOR - 22, bx + 30, FLOOR, 2, MAT_METAL, STEEL);
    P.rect(bx + 2, FLOOR - 20, bx + 28, FLOOR - 18, null, accent);
  }

  // ---------- Central Dimensional Rift Reactor (x: 344..456) ----------
  P.round(344, 322, 456, FLOOR, 4, S, '#241d4a');
  P.rect(346, 322, 454, 325, null, CYAN);
  // Unbreakable reactor crown core.
  core(P, 358, 325, 442, 333, null);
  core(P, 380, 333, 420, 350, null);

  // Hollow reactor plasma chamber behind destructible glass walls.
  P.rect(362, 352, 438, FLOOR - 4, D, '#100b24');
  for (let y = 356; y < FLOOR - 6; y += 4) {
    P.rect(392, y, 408, y + 2, D, y % 8 === 0 ? CYAN : MAGENTA);
  }
  P.rect(356, 354, 362, FLOOR - 4, MAT_GLASS, '#9bf2ff');
  P.rect(438, 354, 444, FLOOR - 4, MAT_GLASS, '#ff9ed0');
  // Burnable energy capacitor rods inside the chamber.
  P.rect(374, 360, 380, FLOOR - 4, MAT_WOOD, GOLD);
  P.rect(420, 360, 426, FLOOR - 4, MAT_WOOD, GOLD);

  // Glass trophy case on top of the reactor crown.
  glassCase(P, 386, 414, 322, 22);
  crate(P, 395, 320, 10);

  // ---------- One-way neon skybridges ----------
  P.plat(156, 316, 234, 321, 2, CYAN);
  P.plat(566, 316, 644, 321, 2, MAGENTA);
  P.plat(266, 272, 332, 277, 2, LIME);
  P.plat(468, 272, 534, 277, 2, LIME);

  // ---------- Three Floating Hover-Decks ----------
  const decks = [
    [236, 204, 76, CYAN, 'SECTOR-01'],
    [564, 204, 76, MAGENTA, 'SECTOR-02'],
    [400, 128, 96, GOLD, 'NEON RIFT'],
  ];
  for (const [cx, cy, w, accent, label] of decks) {
    const half = w / 2;
    for (let x = cx - half; x < cx + half; x++) {
      const t = (x - cx) / half;
      const depth = Math.round((1 - t * t) * 14) + 8;
      for (let d = 0; d < depth; d++) {
        const col = d < 2 ? accent : d < 5 ? STEEL : '#1a1438';
        P.put(x, cy + d, d > depth - 3 ? MAT_ROCK : S, col);
      }
    }
    // Thruster glow plumes in decor underneath.
    P.behind(() => {
      for (const tx of [cx - Math.round(half * 0.55), cx + Math.round(half * 0.55)]) {
        P.rect(tx - 3, cy + 12, tx + 3, cy + 24, D, accent);
        P.rect(tx - 1, cy + 14, tx + 1, cy + 28, D, WHITE);
      }
    });
    P.textCenter(label, cx, cy + 5, 1, null, WHITE);
    islandCore(P, cx, cy, w);
  }

  // Holographic billboard sign above the top center deck (decor + destructible frame sitting cleanly on cy=128).
  P.behind(() => {
    P.round(344, 82, 456, 124, 3, D, '#161033');
    P.frame(344, 82, 456, 124, CYAN);
    P.textCenter('NEON', 376, 94, 2, D, CYAN);
    P.textCenter('RIFT', 426, 94, 2, D, MAGENTA);
    P.textCenter('OPEN ARENA', 400, 112, 1, D, GOLD);
  });
}
