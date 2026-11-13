import { MAT_BEDROCK, MAT_BOUNCE, MAT_SAND } from '../constants.js';
import {
  D, MAT_BEAM, MAT_EMPTY, MAT_GLASS, MAT_PLANK, MAT_ROCK, MAT_WOOD, S, bedrock, core, islandCore, ledge, smooth,
} from './painter.js';
import { bridge, crate, crateStack, footing, glassCase, house, sandbags, watchtower } from './props.js';

// AMAZON JUNGLE (1800x740 cells = 3600x1480 world px):
// Lush panoramic multi-screen rainforest counterpart to RED CANYON:
// - Tier 1 (Canopy): Colossal Kapok trees, perched wooden treehouses, and destructible rope bridges.
// - Tier 2 (Jungle Floor & Gorge): Expedition outposts, bouncy giant jungle mushrooms (MAT_BOUNCE),
//   turquoise waterfall basins + misty updraft geysers (lifts), and a Central Stepped Mayan Temple.
// - Tier 3 (Underground): Subterranean root caverns & secret catacombs beneath the Temple.

const LEAF_HI = '#b4ff5a';
const LEAF_L = '#45d483';
const LEAF_M = '#2aa862';
const LEAF_D = '#2f7a57';
const JUNGLE_BG1 = '#142922';
const JUNGLE_BG2 = '#1d3a2e';
const SOIL_TOP = '#5c4028';
const SOIL_M = '#47301f';
const SOIL_D = '#362317';
const BARK = '#6b4128';
const BARK_D = '#4e2e1c';
const WOOD = '#a4683a';
const WOOD_L = '#c8894f';
const WOOD_D = '#7c4a2a';
const TEMPLE = '#8c8aa3';
const TEMPLE_D = '#6f6d86';
const TEMPLE_L = '#a9a7bf';
const GOLD = '#ffd23f';
const BRASS = '#d9b264';
const WATER_A = '#3fc6e0';
const WATER_B = '#7ef9ff';
const GLASS = '#9fe7ff';
const SHROOM_A = '#ff4d9d';
const SHROOM_B = '#3ee6ff';
const RED_URN = '#ff5a5a';

// Glowing bouncy giant jungle mushroom (MAT_BOUNCE cap on a wooden stalk):
// step or drop onto it to spring effortlessly up into the tree canopy!
function bounceMushroom(P, cx, gy, r = 9, capCol = SHROOM_A, spotCol = '#f4f1ff') {
  P.rect(cx - 2, gy - 7, cx + 2, gy, MAT_WOOD, WOOD_L);
  P.round(cx - r, gy - 12, cx + r, gy - 7, 3, MAT_BOUNCE, capCol);
  P.put(cx - Math.floor(r * 0.5), gy - 11, null, spotCol);
  P.put(cx + Math.floor(r * 0.4), gy - 10, null, spotCol);
  P.put(cx, gy - 12, null, spotCol);
}

// Colossal rainforest Kapok tree: background trunk (so ground movement stays fluid), sprawling
// canopy leaf crowns, walkable limb platforms, hanging vines, and an optional perched treehouse!
function giantTree(P, cx, gy, topY, hasTreehouse, rnd) {
  // Buttress roots at base + tall grooved trunk in background decor
  for (let y = topY + 18; y < gy; y++) {
    const t = (y - topY) / Math.max(1, gy - topY);
    const hw = Math.round(7 + t * 5 + (t > 0.82 ? (t - 0.82) * 42 : 0));
    for (let x = cx - hw; x <= cx + hw; x++) {
      const stripe = ((x - cx + 20) % 4 === 0);
      P.put(x, y, D, stripe ? BARK_D : BARK);
    }
  }

  // Lush layered emerald foliage canopy clouds (background decor so fighters stay visible)
  const blobs = [
    [cx, topY - 14, 34, LEAF_M],
    [cx - 32, topY + 2, 26, LEAF_D],
    [cx + 32, topY + 2, 26, LEAF_D],
    [cx - 18, topY - 8, 24, LEAF_L],
    [cx + 18, topY - 8, 24, LEAF_L],
    [cx, topY - 22, 18, LEAF_HI],
  ];
  P.behind(() => {
    for (const [bx, by, br, col] of blobs) P.disc(bx, by, br, D, col);
    // Hanging jungle lianas / vines beneath the boughs
    for (const vx of [cx - 36, cx - 22, cx + 21, cx + 35]) {
      const vLen = 24 + Math.floor(rnd() * 26);
      for (let vy = topY + 12; vy < topY + 12 + vLen; vy++) {
        P.put(vx + ((vy >> 2) & 1), vy, D, vy % 5 === 0 ? LEAF_HI : LEAF_M);
      }
    }
  });

  // Walkable wooden branch platforms & unbreakable main canopy heart
  P.plat(cx - 42, topY + 8, cx + 42, topY + 12, 1, WOOD_L, 2, MAT_PLANK, MAT_BEAM);
  P.rect(cx - 14, topY + 8, cx + 14, topY + 12, S, BARK);
  core(P, cx - 14, topY + 8, cx + 14, topY + 12, null);

  // Mid-trunk stepping limb + bouncy mushroom half-way up the trunk
  const midY = Math.round((gy + topY) * 0.54);
  P.plat(cx - 24, midY, cx + 24, midY + 4, 1, WOOD_L, 2, MAT_PLANK, MAT_BEAM);
  bounceMushroom(P, cx + (cx < 900 ? 14 : -14), midY, 7, SHROOM_B);

  if (hasTreehouse) {
    const hx0 = cx - 22;
    const hx1 = cx + 22;
    const hy = topY + 8;
    const hTop = hy - 34;
    P.rect(hx0, hTop, hx1, hy, D, BARK_D);
    // Side walls with open doorways (29-cell stickman walks straight through!)
    P.rect(hx0, hTop, hx0 + 3, hy - 30, MAT_WOOD, WOOD);
    P.rect(hx1 - 3, hTop, hx1, hy - 30, MAT_WOOD, WOOD);
    // Thatch-leaf pitched roof
    for (let r = 0; r < 9; r++) {
      P.rect(hx0 - 5 + r * 3, hTop - 3 - r * 2, hx1 + 5 - r * 3, hTop - r * 2, MAT_WOOD, r & 1 ? LEAF_D : LEAF_M);
    }
    crate(P, cx - 5, hy, 9);
  }
}

// Central Ancient Mayan / Aztec Stepped Stone Pyramid Temple with interior Golden Idol Shrine!
function jungleTemple(P, cx, gy) {
  const tiers = [
    [124, 18],
    [98, 36],
    [72, 54],
    [48, 72],
  ];
  for (let t = 0; t < tiers.length; t++) {
    const [hw, h] = tiers[t];
    const y0 = gy - h;
    const y1 = t === 0 ? gy + 6 : gy - tiers[t - 1][1];
    P.rect(cx - hw, y0, cx + hw, y1, MAT_ROCK, TEMPLE);
    P.rect(cx - hw, y0, cx + hw, y0 + 2, null, LEAF_M); // moss-grown stone steps!
    P.rect(cx - hw, y0 + 2, cx + hw, y0 + 4, null, TEMPLE_L);
  }
  // Anchor pyramid foundation edges with bedrock + standable unbreakable summit altar slab
  P.rect(cx - 110, gy, cx - 80, gy + 5, MAT_BEDROCK, TEMPLE_D);
  P.rect(cx + 80, gy, cx + 110, gy + 5, MAT_BEDROCK, TEMPLE_D);

  // Carve open the Ground-Level Inner Sanctum Chamber (36 cells tall so fighters sprint right through!)
  P.round(cx - 76, gy - 36, cx + 76, gy, 6, MAT_EMPTY, '#000000');
  P.round(cx - 76, gy - 36, cx + 76, gy, 6, D, '#221c2b');
  // Open East & West Temple Portals
  P.rect(cx - 126, gy - 34, cx - 70, gy, D, '#221c2b');
  P.rect(cx + 70, gy - 34, cx + 126, gy, D, '#221c2b');
  // Carved stone columns inside the sanctum
  for (const px of [cx - 56, cx + 52]) {
    P.rect(px, gy - 36, px + 4, gy, D, TEMPLE_D);
  }

  // Golden Idol Shrine in the exact centre: glass case filled with gold treasure (MAT_SAND)!
  glassCase(P, cx - 14, cx + 14, gy, 24);
  for (let y = gy - 18; y < gy - 2; y++) {
    for (let x = cx - 11; x < cx + 11; x++) {
      P.put(x, y, MAT_SAND, (x + y) & 1 ? GOLD : BRASS);
    }
  }
  // Smashable ancient treasure amphorae filled with gold dust flanking the idol!
  for (const ax of [cx - 34, cx + 28]) {
    P.rect(ax, gy - 10, ax + 6, gy, MAT_GLASS, RED_URN);
    P.rect(ax + 1, gy - 12, ax + 5, gy - 10, MAT_ROCK, GOLD);
    for (let y = gy - 8; y < gy - 1; y++) {
      for (let x = ax + 1; x < ax + 5; x++) P.put(x, y, MAT_SAND, GOLD);
    }
  }

  // Summit Altar atop the Pyramid (y = gy - 72)
  const topY = gy - 72;
  core(P, cx - 20, topY, cx + 20, topY + 5, null);
  P.rect(cx - 26, topY - 26, cx - 22, topY, MAT_ROCK, TEMPLE_D);
  P.rect(cx + 22, topY - 26, cx + 26, topY, MAT_ROCK, TEMPLE_D);
  P.plat(cx - 30, topY - 30, cx + 30, topY - 26, 1, TEMPLE_L, 2, MAT_PLANK, MAT_ROCK);
  // Flaming golden braziers on the summit
  for (const bx of [cx - 38, cx + 34]) {
    P.rect(bx, topY - 8, bx + 4, topY, MAT_ROCK, GOLD);
    P.rect(bx - 1, topY - 11, bx + 5, topY - 8, D, RED_URN);
  }
  crate(P, cx - 6, topY, 11);
}

export function buildJungle(P, rnd) {
  const W = P.t.w; // 1800
  const floor = P.t.h - 12; // 728
  const MID = W / 2; // 900
  const s1 = rnd() * 6.28;
  const s2 = rnd() * 6.28;
  const s3 = rnd() * 6.28;

  const RIDGE = 580; // Jungle ridge plateau centres (580 & 1220)
  const RIDGE_TOP = 456;
  const TEMPLE_FLOOR = 548;

  const H = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const m = Math.min(x, W - 1 - x);
    let h = 532 + 8 * Math.sin(x * 0.016 + s1) + 4 * Math.sin(x * 0.049 + s2) + 1.5 * Math.sin(x * 0.14 + s3);
    // Raised expedition terraces at far West & East edges
    h += (468 + 2 * Math.sin(x * 0.06 + s2) - h) * smooth((205 - m) / 70);
    // Mid-jungle cliff ridges
    h += (RIDGE_TOP + Math.sin(x * 0.09 + s3) - h) * smooth((95 - Math.abs(m - RIDGE)) / 28);
    // Twin river gorges flanking the Central Temple
    h += (616 - h) * smooth((68 - Math.abs(m - 725)) / 24);
    // Flat ceremonial basin for the Central Mayan Pyramid
    h += (TEMPLE_FLOOR - h) * smooth((138 - Math.abs(x - MID)) / 26);
    H[x] = Math.round(h);
  }
  const ground = (x) => H[Math.max(0, Math.min(W - 1, Math.round(x)))];

  // Rich tropical jungle turf: bright emerald grass rim over rich rainforest soil & limestone strata
  const soil = (x, y, d) => {
    if (d < 2) return (x + y) % 5 === 0 ? LEAF_HI : LEAF_L;
    if (d < 5) return LEAF_M;
    if (d < 8) return LEAF_D;
    const band = (y + Math.round(4 * Math.sin(x * 0.022 + s2))) % 24;
    if (band < 3) return BARK_D;
    if (y > 635) return SOIL_D;
    return band < 13 ? SOIL_TOP : SOIL_M;
  };
  for (let x = 0; x < W; x++) {
    for (let y = H[x]; y < floor; y++) P.put(x, y, S, soil(x, y, y - H[x]));
  }
  // Embedded moss & limestone boulders inside the earth
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(rnd() * W);
    const y = H[x] + 12 + Math.floor(rnd() * Math.max(1, floor - 14 - H[x]));
    const r = 1.5 + rnd() * 3.5;
    P.disc(x, y, r, null, i % 3 === 0 ? LEAF_D : TEMPLE_D);
  }
  bedrock(P, rnd, '#0b081a', '#16282a');

  // ---------- Layered Distant Rainforest Canopy Silhouettes ----------
  P.behind(() => {
    for (let x = 0; x < W; x++) {
      const far1 = 335 + 28 * Math.sin(x * 0.005 + s1) + 15 * Math.sin(x * 0.018 + s2) + 7 * Math.sin(x * 0.065 + s3);
      const far2 = 392 + 20 * Math.sin(x * 0.009 + s2) + 12 * Math.sin(x * 0.031 + s1);
      for (let y = Math.round(far1); y < H[x]; y++) {
        P.put(x, y, D, y < far2 ? JUNGLE_BG1 : JUNGLE_BG2);
      }
    }
  });

  // ---------- Subterranean Root Caverns & Secret Under-Temple Catacombs ----------
  // Ridge root tunnels (walk straight under both ridges or blast through from above!)
  const caveFloor = 556;
  for (const side of [1, -1]) {
    const cx = side > 0 ? RIDGE : W - 1 - RIDGE;
    const x0 = cx - 108;
    const x1 = cx + 108;
    P.round(x0, caveFloor - 38, x1, caveFloor, 10, MAT_EMPTY, '#000000');
    P.round(x0, caveFloor - 38, x1, caveFloor, 10, D, SOIL_D);
    // Hanging roots & glowing bioluminescent mushrooms inside the cave
    for (let x = x0 + 22; x < x1 - 20; x += 42) {
      P.rect(x, caveFloor - 37, x + 2, caveFloor - 26, D, BARK);
      P.rect(x - 1, caveFloor - 26, x + 3, caveFloor - 24, D, LEAF_HI);
    }
    bounceMushroom(P, cx, caveFloor, 8, SHROOM_B);
  }

  // Deep Catacomb Chamber directly underneath the Central Mayan Temple (`y = 610..652`)
  P.round(MID - 135, 612, MID + 135, 650, 10, MAT_EMPTY, '#000000');
  P.round(MID - 135, 612, MID + 135, 650, 10, D, '#1f193d');
  // Diagonal entrance shafts from both river gorges (`x = 725` and `x = 1075`) into the catacomb!
  for (const side of [-1, 1]) {
    for (let k = 0; k < 12; k++) {
      const sx = MID + side * (125 + k * 5);
      const sy = 646 - k * 3;
      P.round(sx - 14, sy - 32, sx + 14, sy + 2, 6, MAT_EMPTY, '#000000');
      P.round(sx - 14, sy - 32, sx + 14, sy + 2, 6, D, SOIL_D);
    }
  }
  crate(P, MID - 22, 650, 10);
  crate(P, MID + 12, 650, 10);

  // ---------- Twin Turquoise Waterfall Basins & Misty Updraft Geysers ----------
  for (const side of [-1, 1]) {
    const gx = MID + side * 175; // 725 & 1075 river gorges
    const gy = ground(gx);
    // Turquoise lagoon water at bottom of each gorge
    for (let y = gy - 10; y < gy; y++) {
      for (let x = gx - 32; x <= gx + 32; x++) {
        if (P.t.mat[y * W + x] === MAT_EMPTY || P.t.mat[y * W + x] === D) {
          P.put(x, y, MAT_SAND, (x + y) & 1 ? WATER_A : WATER_B);
        }
      }
    }
    // Misty geyser updraft shaft rising from gorge floor up to canopy bridges!
    P.t.addLift(gx - 14, 230, gx + 14, gy, 'updraft');
    P.behind(() => {
      for (let y = 240; y < gy - 10; y += 5) {
        P.put(gx - 6 + ((y * 3) % 13), y, D, WATER_B);
        P.put(gx - 4 + ((y * 7) % 9), y + 2, D, GLASS);
      }
    });
    // High cliffside waterfall reservoir perched on the ridge edge (blast the glass/stone lip to unleash water!)
    const wx = side < 0 ? RIDGE + 56 : W - RIDGE - 84;
    const wy = ground(wx + 14);
    glassCase(P, wx, wx + 28, wy, 20);
    for (let y = wy - 16; y < wy - 2; y++) {
      for (let x = wx + 2; x < wx + 26; x++) P.put(x, y, MAT_SAND, (x + y) & 1 ? WATER_A : WATER_B);
    }
  }

  // ---------- Central Ancient Mayan / Aztec Stepped Pyramid Temple ----------
  jungleTemple(P, MID, TEMPLE_FLOOR);

  // ---------- Colossal Kapok Canopy Trees, Treehouses & Rope Suspension Bridges ----------
  const treeDefs = [
    [250, 276, true],
    [555, 250, true],
    [W - 555, 250, true],
    [W - 250, 276, true],
  ];
  for (const [tx, topY, hasHouse] of treeDefs) {
    giantTree(P, tx, ground(tx), topY, hasHouse, rnd);
  }

  // Floating vine-draped moss islands in the upper sky above the Temple
  for (const [cx, cy, w] of [
    [MID - 175, 215, 58],
    [MID + 175, 215, 58],
    [MID, 148, 70],
  ]) {
    const half = w >> 1;
    for (let x = cx - half; x < cx + half; x++) {
      const t = (x - cx) / half;
      const depth = Math.round((1 - t * t) * w * 0.36 + rnd() * 2) + 4;
      for (let d = 0; d < depth; d++) {
        const col = d < 2 ? LEAF_HI : d < 5 ? LEAF_M : d < depth - 3 ? SOIL_TOP : TEMPLE_D;
        P.put(x, cy + d, S, col);
      }
      if (rnd() < 0.28) {
        const vLen = 6 + Math.floor(rnd() * 14);
        P.behind(() => P.rect(x, cy + depth, x + 1, cy + depth + vLen, D, LEAF_M));
      }
    }
    islandCore(P, cx, cy, w);
  }
  bounceMushroom(P, MID, 148, 9, SHROOM_A);

  // Destructible high-canopy rope suspension bridges linking trees & crossing the Temple Gorge!
  bridge(P, 292, 286, 513, 260, [402]);
  bridge(P, W - 513, 260, W - 292, 286, [W - 402]);
  // Grand Gorge Rope Bridge from West Ridge Treehouse to East Ridge Treehouse above the Pyramid!
  bridge(P, 597, 260, W - 597, 260, [MID - 145, MID + 145]);

  // Mid-level wooden hunter ledges over the valleys
  for (const [x0, x1, y] of [
    [335, 415, 452],
    [W - 415, W - 335, 452],
  ]) {
    ledge(P, x0, x1, y, ground);
  }

  const top = (x0, x1) => {
    let g = P.t.h;
    for (let x = x0; x < x1; x++) g = Math.min(g, ground(x));
    return g;
  };

  // ---------- Expedition Outposts, Watchtowers & Bouncy Jungle Mushrooms ----------
  for (const side of [1, -1]) {
    const m = (x, w = 0) => (side > 0 ? x : W - x - w);

    // Expedition base cabin + bamboo watchtower + supply crates
    const hx = m(86, 46);
    footing(P, hx, hx + 46, top(hx, hx + 46), SOIL_TOP);
    house(P, hx, hx + 46, top(hx, hx + 46), side, 38);

    watchtower(P, m(380), ground, 60);
    sandbags(P, m(156, 26), m(156, 26) + 26, top(m(156, 26), m(156, 26) + 26), 3);
    crateStack(P, m(455, 28), top(m(455, 28), m(455, 28) + 28), 3, 10);

    // Giant bouncy jungle mushrooms along the forest floor & cliffs for rapid canopy launches!
    const b1 = m(208);
    bounceMushroom(P, b1, ground(b1), 10, SHROOM_A);
    const b2 = m(498);
    bounceMushroom(P, b2, ground(b2), 10, SHROOM_B);
    const b3 = m(656);
    bounceMushroom(P, b3, ground(b3), 9, SHROOM_A);
  }
}
