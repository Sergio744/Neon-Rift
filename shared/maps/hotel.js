import { MAT_BEDROCK, MAT_BOUNCE, MAT_SAND, MAT_TNT } from '../constants.js';
import {
  D, MAT_BEAM, MAT_EMPTY, MAT_GLASS, MAT_METAL, MAT_PLANK, MAT_ROCK, MAT_WOOD, PL, S, bedrock, core,
} from './painter.js';
import { crate } from './props.js';

// GRAND HOTEL (960x2620 cells = 1920x5240 world px):
// A 55-storey luxury cyberpunk-deco skyscraper where every room, piece of furniture, chandelier,
// swimming pool, gold vault, casino machine, piano, bouncy king-size bed, and twin Express Glass
// Elevators is physically interactive and destructible.

// Curated palette reusing existing colours where possible to keep global PALETTE well below 256.
const NIGHT_BG = '#120d26';
const WALL_BG = '#181236';
const SUITE_BG = '#221c44';
const LOUNGE_BG = '#2b1838';
const CASINO_BG = '#16282a';
const SPA_BG = '#13263a';
const MARBLE = '#f4f1ff';
const MARBLE_M = '#a9a7bf';
const MARBLE_D = '#6f6d86';
const GOLD = '#ffd23f';
const GOLD_D = '#c9a258';
const BRASS = '#d9b264';
const CYAN = '#3ee6ff';
const GLASS = '#9fe7ff';
const GLASS_HI = '#e4fbff';
const WATER_A = '#3fc6e0';
const WATER_B = '#7ef9ff';
const MAGENTA = '#ff4d9d';
const CRIMSON = '#8c3b30';
const CRIMSON_D = '#6e2c25';
const RED_ALERT = '#ff5a5a';
const WOOD = '#a4683a';
const WOOD_D = '#7c4a2a';
const WOOD_L = '#c8894f';
const POST = '#6b4128';
const FELT = '#2aa862';
const FELT_L = '#45d483';
const STEEL = '#2d2654';
const CONCRETE = '#1f193d';

// ---------- Interactive luxury furniture ----------

// King-size bouncy mattress on a mahogany frame: jump on it to launch sky-high, hold DOWN to rest,
// or blast/burn it into splinters.
function luxuryBed(P, x, gy, accent = MAGENTA) {
  P.rect(x, gy - 2, x + 28, gy, MAT_WOOD, WOOD_D);
  P.rect(x, gy - 12, x + 4, gy, MAT_WOOD, WOOD); // headboard
  P.rect(x + 1, gy - 12, x + 3, gy - 10, null, GOLD);
  P.rect(x + 25, gy - 6, x + 28, gy, MAT_WOOD, WOOD); // footboard
  // Spring mattress (MAT_BOUNCE) + silk pillows (ample ceiling clearance indoors!).
  P.rect(x + 4, gy - 6, x + 25, gy - 2, MAT_BOUNCE, accent);
  P.rect(x + 4, gy - 6, x + 25, gy - 5, null, MARBLE);
  P.rect(x + 5, gy - 7, x + 11, gy - 6, MAT_BOUNCE, MARBLE);
  P.rect(x + 13, gy - 7, x + 18, gy - 6, MAT_BOUNCE, MARBLE);
}

// Plush velvet sofa (bouncy cushions) with an optional glass coffee table beside it.
function velvetSofa(P, x, gy, col = CRIMSON) {
  P.rect(x, gy - 9, x + 3, gy, MAT_WOOD, WOOD_D);
  P.rect(x + 17, gy - 9, x + 20, gy, MAT_WOOD, WOOD_D);
  P.rect(x + 2, gy - 11, x + 18, gy - 6, D, CRIMSON_D);
  P.rect(x + 3, gy - 6, x + 17, gy - 1, MAT_BOUNCE, col);
  P.rect(x, gy - 1, x + 20, gy, MAT_WOOD, WOOD_D);
}

function coffeeTable(P, x, gy) {
  P.plat(x, gy - 6, x + 14, gy - 4, 0, GLASS, 2, MAT_PLANK, MAT_BEAM);
  P.rect(x + 2, gy - 4, x + 4, gy, MAT_BEAM, GOLD_D);
  P.rect(x + 10, gy - 4, x + 12, gy, MAT_BEAM, GOLD_D);
  P.rect(x + 6, gy - 9, x + 8, gy - 6, MAT_GLASS, GLASS_HI);
}

// Crystal chandelier suspended from a thin MAT_BEAM chain: shoot the chain and the whole
// chandelier detaches as a rigid body and crashes onto players below!
function chandelier(P, cx, ceilY, big = false) {
  const chainH = big ? 8 : 5;
  P.rect(cx - 1, ceilY, cx + 1, ceilY + chainH, MAT_BEAM, GOLD_D);
  const y = ceilY + chainH;
  const hw = big ? 11 : 7;
  P.rect(cx - hw, y, cx + hw, y + 2, MAT_METAL, GOLD);
  P.rect(cx - hw + 2, y + 2, cx + hw - 2, y + 5, MAT_GLASS, GLASS_HI);
  P.rect(cx - hw + 5, y + 5, cx + hw - 5, y + 7, MAT_GLASS, GLASS);
  for (let dx = -hw + 1; dx < hw; dx += 4) {
    P.put(cx + dx, y - 1, MAT_GLASS, GOLD);
  }
}

// Dining table with white tablecloth, chairs, and crystal glassware.
function diningSet(P, cx, gy) {
  // Left & right chairs
  for (const sx of [-16, 11]) {
    P.rect(cx + sx, gy - 11, cx + sx + 2, gy, MAT_WOOD, WOOD_D);
    P.rect(cx + sx, gy - 6, cx + sx + 6, gy - 4, MAT_PLANK, WOOD);
    P.rect(cx + sx + 4, gy - 4, cx + sx + 6, gy, MAT_BEAM, WOOD_D);
  }
  // Table
  P.plat(cx - 10, gy - 9, cx + 10, gy - 6, 0, MARBLE, 2, MAT_PLANK, MAT_BEAM);
  P.rect(cx - 8, gy - 6, cx - 6, gy, MAT_BEAM, WOOD_D);
  P.rect(cx + 6, gy - 6, cx + 8, gy, MAT_BEAM, WOOD_D);
  // Candle & wine glasses
  P.rect(cx - 1, gy - 12, cx + 1, gy - 9, MAT_WOOD, GOLD);
  P.put(cx - 5, gy - 11, MAT_GLASS, GLASS_HI);
  P.put(cx + 4, gy - 11, MAT_GLASS, MAGENTA);
}

// Concert grand piano: walkable lid + wooden soundboard + ivory keyboard.
function grandPiano(P, x, gy) {
  P.plat(x, gy - 11, x + 24, gy - 8, 1, CONCRETE, 2, MAT_PLANK, MAT_WOOD);
  P.rect(x, gy - 8, x + 22, gy - 5, MAT_WOOD, STEEL);
  P.rect(x + 18, gy - 7, x + 24, gy - 5, MAT_PLANK, MARBLE); // keys
  for (const lx of [x + 2, x + 11, x + 19]) P.rect(lx, gy - 5, lx + 2, gy, MAT_BEAM, CONCRETE);
  // Raised diagonal piano lid
  for (let i = 0; i < 12; i++) P.rect(x + 2 + i, gy - 12 - Math.floor(i * 0.6), x + 4 + i, gy - 11 - Math.floor(i * 0.6), MAT_WOOD, GOLD_D);
  // Piano bench
  P.plat(x + 25, gy - 5, x + 31, gy - 3, 0, CRIMSON, 2, MAT_PLANK, MAT_BEAM);
  P.rect(x + 26, gy - 3, x + 27, gy, MAT_BEAM, WOOD_D);
  P.rect(x + 29, gy - 3, x + 30, gy, MAT_BEAM, WOOD_D);
}

// Mahogany bookshelf or wardrobe (flammable cover).
function bookshelf(P, x, gy, w = 16, h = 24) {
  const y0 = gy - h;
  P.rect(x, y0, x + w, gy, MAT_WOOD, WOOD_D);
  P.frame(x, y0, x + w, gy, POST);
  const cols = [CRIMSON, CYAN, GOLD, FELT_L, MAGENTA, MARBLE_M];
  for (let sy = y0 + 5; sy < gy - 2; sy += 6) {
    P.rect(x + 1, sy, x + w - 1, sy + 1, MAT_WOOD, WOOD_L);
    for (let bx = x + 2; bx < x + w - 2; bx += 2) {
      P.rect(bx, sy - 4, bx + 1, sy, D, cols[(bx * 3 + sy) % cols.length]);
    }
  }
}

// Casino slot machine stuffed with gold coins (MAT_SAND) behind glass: smash to spill jackpot!
function slotMachine(P, x, gy) {
  P.rect(x, gy - 18, x + 12, gy, MAT_METAL, STEEL);
  P.frame(x, gy - 18, x + 12, gy, GOLD);
  P.rect(x + 2, gy - 16, x + 10, gy - 10, MAT_GLASS, GLASS_HI);
  for (let cy = gy - 9; cy < gy - 2; cy++) {
    for (let cx = x + 2; cx < x + 10; cx++) {
      P.put(cx, cy, MAT_SAND, (cx + cy) & 1 ? GOLD : BRASS);
    }
  }
  P.rect(x + 1, gy - 10, x + 2, gy - 2, MAT_GLASS, GLASS);
  P.rect(x + 10, gy - 10, x + 11, gy - 2, MAT_GLASS, GLASS);
  P.put(x + 5, gy - 20, MAT_GLASS, MAGENTA);
}

// Casino roulette / poker table (emerald felt platform).
function casinoTable(P, cx, gy) {
  P.plat(cx - 16, gy - 8, cx + 16, gy - 5, 1, FELT_L, 2, MAT_PLANK, MAT_WOOD);
  P.rect(cx - 16, gy - 6, cx + 16, gy - 5, null, FELT);
  P.rect(cx - 12, gy - 5, cx - 9, gy, MAT_WOOD, WOOD_D);
  P.rect(cx + 9, gy - 5, cx + 12, gy, MAT_WOOD, WOOD_D);
  P.rect(cx - 3, gy - 10, cx + 3, gy - 8, MAT_METAL, GOLD);
}

// Glass vault filled with glittering gold bullion (MAT_SAND).
function goldVault(P, x0, x1, gy, h = 22) {
  const y0 = gy - h;
  P.rect(x0, y0, x1, y0 + 2, MAT_METAL, GOLD);
  P.rect(x0, y0 + 2, x0 + 2, gy, MAT_GLASS, GLASS);
  P.rect(x1 - 2, y0 + 2, x1, gy, MAT_GLASS, GLASS);
  for (let y = y0 + 5; y < gy; y++) {
    for (let x = x0 + 2; x < x1 - 2; x++) {
      P.put(x, y, MAT_SAND, (x * 5 + y * 3) % 3 === 0 ? GOLD : BRASS);
    }
  }
}

// Cocktail / restaurant bar counter with crystal bottles and optional pressurized keg.
function barCounter(P, x0, x1, gy, keg = false) {
  P.rect(x0, gy - 10, x1, gy, MAT_WOOD, WOOD_D);
  P.plat(x0 - 1, gy - 12, x1 + 1, gy - 10, 0, MARBLE, 2, MAT_PLANK, MAT_WOOD);
  for (let x = x0 + 3; x < x1 - 3; x += 5) {
    P.rect(x, gy - 16, x + 2, gy - 12, MAT_GLASS, (x & 1) ? CYAN : MAGENTA);
  }
  if (keg && x1 - x0 >= 16) {
    const kx = ((x0 + x1) >> 1) - 2;
    P.rect(kx, gy - 6, kx + 4, gy - 1, MAT_GLASS, RED_ALERT);
    P.rect(kx, gy - 7, kx + 4, gy - 6, MAT_METAL, GOLD);
  }
}

// Wall-mounted red glass/brass fire cabinet (destructible corridor cover; explosive boiler tanks live on dedicated mechanical floors).
function fireExtinguisher(P, x, gy, liveTnt = false) {
  P.rect(x, gy - 13, x + 3, gy - 6, liveTnt ? MAT_TNT : MAT_GLASS, RED_ALERT);
  P.rect(x + 1, gy - 15, x + 2, gy - 13, MAT_METAL, MARBLE);
}

// Cantilevered glass swimming pool filled with turquoise water (MAT_SAND) + bouncy diving board!
function skyPool(P, x0, x1, gy, side) {
  const depth = 11;
  const wallX = side < 0 ? x0 : x1 - 3;
  // Reinforced pool basin slab underneath (anchored bedrock spine so the pool deck stays solid)
  P.rect(x0, gy, x1, gy + 4, MAT_ROCK, MARBLE_M);
  P.rect(x0 + 4, gy + 1, x1 - 4, gy + 4, MAT_BEDROCK, MARBLE_D);
  // Glass outer wall: shoot it out and a turquoise waterfall cascades down the skyscraper!
  P.rect(wallX, gy - depth, wallX + 3, gy, MAT_GLASS, GLASS_HI);
  const innerLip = side < 0 ? x1 - 3 : x0;
  P.rect(innerLip, gy - depth, innerLip + 3, gy, MAT_ROCK, MARBLE);
  // Shimmering water grains
  const wx0 = Math.min(wallX + 3, innerLip + 3);
  const wx1 = Math.max(wallX, innerLip);
  for (let y = gy - depth + 2; y < gy; y++) {
    for (let x = wx0; x < wx1; x++) {
      P.put(x, y, MAT_SAND, (x + y) & 1 ? WATER_A : WATER_B);
    }
  }
  // Spring diving board (MAT_BOUNCE) projecting over the water!
  if (side < 0) {
    P.rect(x1 - 6, gy - depth - 4, x1 + 2, gy - depth, MAT_METAL, GOLD);
    P.rect(x1 - 18, gy - depth - 4, x1 - 6, gy - depth - 1, MAT_BOUNCE, CYAN);
  } else {
    P.rect(x0 - 2, gy - depth - 4, x0 + 6, gy - depth, MAT_METAL, GOLD);
    P.rect(x0 + 6, gy - depth - 4, x0 + 18, gy - depth - 1, MAT_BOUNCE, CYAN);
  }
}

// Rooftop VIP helicopter parked on the East Helipad.
function helicopter(P, cx, gy) {
  // Skids
  P.rect(cx - 24, gy - 2, cx + 22, gy, MAT_METAL, GOLD);
  P.rect(cx - 14, gy - 6, cx - 12, gy - 2, MAT_METAL, STEEL);
  P.rect(cx + 8, gy - 6, cx + 10, gy - 2, MAT_METAL, STEEL);
  // Fuselage + tail boom
  P.round(cx - 20, gy - 20, cx + 16, gy - 6, 5, MAT_METAL, MARBLE);
  P.rect(cx - 20, gy - 13, cx + 16, gy - 11, null, GOLD);
  P.rect(cx - 42, gy - 16, cx - 20, gy - 12, MAT_METAL, STEEL);
  P.rect(cx - 44, gy - 22, cx - 39, gy - 12, MAT_METAL, MAGENTA);
  // Glass cockpit bubble
  P.round(cx + 2, gy - 19, cx + 18, gy - 8, 4, MAT_GLASS, GLASS_HI);
  // Rotor mast & wide walkable rotor blades
  P.rect(cx - 3, gy - 26, cx, gy - 20, MAT_BEAM, STEEL);
  P.plat(cx - 38, gy - 28, cx + 36, gy - 26, 0, GOLD, 2, MAT_PLANK, MAT_BEAM);
}

export function buildHotel(P, rnd) {
  const W = P.t.w; // 960
  const H = P.t.h; // 2724
  const STREET_Y = H - 24; // 2700
  const FLOORS = 55;
  const FH = 46; // generous 92px floor-to-floor height across all 55 storeys!
  const LOBBY_EXTRA = 12; // extra grand ceiling on Floor 1
  const TOWER_L = 148;
  const TOWER_R = 812;
  const ELEV_WL = 376;
  const ELEV_WR = 408;
  const ELEV_EL = 552;
  const ELEV_ER = 584;

  // Floor `f` (1..55): returns { gy, ceilY } in cells.
  const floorGeom = (f) => {
    if (f === 1) {
      return { gy: STREET_Y, ceilY: STREET_Y - (FH + LOBBY_EXTRA) + 4 };
    }
    const gy = STREET_Y - (FH + LOBBY_EXTRA) - (f - 2) * FH;
    return { gy, ceilY: gy - FH + 4 };
  };
  const ROOF_Y = floorGeom(FLOORS).ceilY - 4; // top of Floor 55 roof slab (~164)

  // ---------- Street Plaza & Bedrock Foundation ----------
  P.rect(0, STREET_Y, W, H - 12, S, CONCRETE);
  P.rect(0, STREET_Y, W, STREET_Y + 3, null, MARBLE);
  // Red velvet VIP entrance carpets on both sides of the hotel
  P.rect(18, STREET_Y, TOWER_L + 10, STREET_Y + 3, null, CRIMSON);
  P.rect(TOWER_R - 10, STREET_Y, W - 18, STREET_Y + 3, null, CRIMSON);
  P.rect(18, STREET_Y + 2, TOWER_L + 10, STREET_Y + 3, null, GOLD);
  P.rect(TOWER_R - 10, STREET_Y + 2, W - 18, STREET_Y + 3, null, GOLD);
  bedrock(P, rnd, '#0b081a', '#161130');

  // Distant night skyline silhouettes behind the exterior air flanks
  P.behind(() => {
    for (const [bx0, by0, bx1, col] of [
      [8, 1750, 68, '#161130'],
      [72, 1920, 132, '#181236'],
      [828, 1880, 888, '#181236'],
      [892, 1710, 952, '#161130'],
    ]) {
      P.rect(bx0, by0, bx1, STREET_Y, D, col);
      P.rect(bx0, by0, bx1, by0 + 2, D, CYAN);
      for (let wy = by0 + 14; wy < STREET_Y - 20; wy += 16) {
        for (let wx = bx0 + 8; wx < bx1 - 8; wx += 12) {
          if (rnd() < 0.55) P.rect(wx, wy, wx + 4, wy + 5, D, rnd() < 0.3 ? GOLD : CYAN);
        }
      }
    }
  });

  // Street fountains & golden porte-cochère entrance canopies outside Floor 1
  for (const side of [-1, 1]) {
    const fx = side < 0 ? 64 : W - 64;
    P.rect(fx - 22, STREET_Y - 8, fx + 22, STREET_Y, MAT_ROCK, MARBLE);
    P.rect(fx - 19, STREET_Y - 8, fx + 19, STREET_Y - 2, MAT_EMPTY, '#000000');
    for (let y = STREET_Y - 7; y < STREET_Y - 2; y++) {
      for (let x = fx - 18; x < fx + 18; x++) P.put(x, y, MAT_SAND, (x + y) & 1 ? WATER_A : WATER_B);
    }
    P.rect(fx - 2, STREET_Y - 16, fx + 2, STREET_Y - 2, MAT_ROCK, GOLD);
    // Golden entrance marquee
    const ax0 = side < 0 ? TOWER_L - 36 : TOWER_R;
    const ax1 = side < 0 ? TOWER_L : TOWER_R + 36;
    P.plat(ax0, STREET_Y - 38, ax1, STREET_Y - 34, 1, GOLD, 2, MAT_PLANK, MAT_METAL);
    P.rect(ax0, STREET_Y - 35, ax1, STREET_Y - 34, null, CRIMSON);
  }

  // ---------- Register Twin Express Glass Elevator Shafts ----------
  P.t.addLift(ELEV_WL + 4, ROOF_Y - 28, ELEV_WR - 4, STREET_Y, 'lift');
  P.t.addLift(ELEV_EL + 4, ROOF_Y - 28, ELEV_ER - 4, STREET_Y, 'lift');

  // ---------- Build All 55 Furnished Floors ----------
  for (let f = 1; f <= FLOORS; f++) {
    const { gy, ceilY } = floorGeom(f);
    const slabTop = ceilY - 4;

    // Zone theme backdrop colour
    let bg = SUITE_BG;
    if (f <= 2) bg = LOUNGE_BG;
    else if (f >= 11 && f <= 16) bg = CASINO_BG;
    else if (f >= 17 && f <= 24) bg = LOUNGE_BG;
    else if (f >= 34 && f <= 39) bg = SPA_BG;
    else if (f >= 40 && f <= 48) bg = NIGHT_BG;
    else if (f >= 49) bg = WALL_BG;

    // Interior backdrop for West Wing, Central Atrium, and East Wing
    P.rect(TOWER_L + 4, ceilY, ELEV_WL, gy, D, bg);
    P.rect(ELEV_WR, ceilY, ELEV_EL, gy, D, WALL_BG);
    P.rect(ELEV_ER, ceilY, TOWER_R - 4, gy, D, bg);

    // Subtle luxury wallpaper wainscot trim along every floor
    P.rect(TOWER_L + 4, gy - 8, ELEV_WL, gy - 7, D, GOLD_D);
    P.rect(ELEV_ER, gy - 8, TOWER_R - 4, gy - 7, D, GOLD_D);

    // Ceiling / upper floor slab above this floor
    // West Wing slab + East Wing slab (destructible marble/concrete so rockets & C4 can breach floors!)
    P.rect(TOWER_L, slabTop, ELEV_WL + 3, ceilY, S, MARBLE_M);
    P.rect(TOWER_L, slabTop, ELEV_WL + 3, slabTop + 1, null, MARBLE);
    P.rect(TOWER_L, ceilY - 1, ELEV_WL + 3, ceilY, null, GOLD_D);

    P.rect(ELEV_ER - 3, slabTop, TOWER_R, ceilY, S, MARBLE_M);
    P.rect(ELEV_ER - 3, slabTop, TOWER_R, slabTop + 1, null, MARBLE);
    P.rect(ELEV_ER - 3, ceilY - 1, TOWER_R, ceilY, null, GOLD_D);

    // Central Atrium slab with central glass skylight / stair opening
    const stairLeft = (f & 1) === 1;
    const openX0 = stairLeft ? ELEV_WR + 14 : ELEV_EL - 58;
    const openX1 = stairLeft ? ELEV_WR + 58 : ELEV_EL - 14;
    P.rect(ELEV_WR - 3, slabTop, openX0, ceilY, S, MARBLE_M);
    P.rect(openX1, slabTop, ELEV_EL + 3, ceilY, S, MARBLE_M);
    // Walkable one-way skylight deck across the stair opening
    P.plat(openX0, slabTop, openX1, slabTop + 3, 0, GLASS_HI, 2, PL, D);

    // Indestructible steel core knots at the 6 elevator/facade collar joints (keeps all 55 storeys
    // structurally anchored in O(1) flood steps while every room floor & wall remains destructible!)
    P.rect(TOWER_L, slabTop + 1, TOWER_L + 6, ceilY, MAT_BEDROCK, MARBLE_D);
    P.rect(ELEV_WL - 4, slabTop + 1, ELEV_WL + 3, ceilY, MAT_BEDROCK, MARBLE_D);
    P.rect(ELEV_WR - 3, slabTop + 1, ELEV_WR + 4, ceilY, MAT_BEDROCK, MARBLE_D);
    P.rect(ELEV_EL - 4, slabTop + 1, ELEV_EL + 3, ceilY, MAT_BEDROCK, MARBLE_D);
    P.rect(ELEV_ER - 3, slabTop + 1, ELEV_ER + 4, ceilY, MAT_BEDROCK, MARBLE_D);
    P.rect(TOWER_R - 6, slabTop + 1, TOWER_R, ceilY, MAT_BEDROCK, MARBLE_D);

    // Unbreakable standable spawn slabs on the landmark spawn floors + rooftop helipad!
    if (f === 7 || f === 13 || f === 20 || f === 35 || f === 43 || f === 54 || f === 55) {
      core(P, 260, slabTop, 300, ceilY, null);
      core(P, 715, slabTop, 755, ceilY, null);
    }

    // Panoramic floor-to-ceiling exterior glass facade (smash through on any floor!)
    if (f === 1) {
      // Open ground-floor grand archways so players walk right in from the red carpet
      P.rect(TOWER_L, ceilY, TOWER_L + 4, gy - 36, MAT_ROCK, GOLD);
      P.rect(TOWER_R - 4, ceilY, TOWER_R, gy - 36, MAT_ROCK, GOLD);
    } else {
      P.rect(TOWER_L, ceilY, TOWER_L + 2, gy, MAT_METAL, STEEL);
      P.rect(TOWER_L + 2, ceilY + 2, TOWER_L + 4, gy - 2, MAT_GLASS, GLASS);
      P.rect(TOWER_R - 2, ceilY, TOWER_R, gy, MAT_METAL, STEEL);
      P.rect(TOWER_R - 4, ceilY + 2, TOWER_R - 2, gy - 2, MAT_GLASS, GLASS);
    }

    // ---------- Express Glass Elevator Shafts (West & East) ----------
    for (const [el, er] of [[ELEV_WL, ELEV_WR], [ELEV_EL, ELEV_ER]]) {
      P.rect(el, ceilY, er, gy, D, NIGHT_BG);
      // Glowing vertical guide rails + centre energy beam
      P.rect(el + 3, ceilY, el + 4, gy, D, GOLD_D);
      P.rect(er - 4, ceilY, er - 3, gy, D, GOLD_D);
      for (let ry = ceilY; ry < gy; ry += 6) {
        P.rect(((el + er) >> 1) - 1, ry, ((el + er) >> 1) + 1, ry + 3, D, CYAN);
      }
      // Transom lintels above 34-cell-tall elevator doorways (stickman is 29 cells tall)
      P.rect(el, ceilY, el + 3, gy - 34, MAT_METAL, GOLD);
      P.rect(er - 3, ceilY, er, gy - 34, MAT_METAL, GOLD);
      // One-way glass safety landing at each floor so players can walk straight across or ride through
      if (f > 1) P.plat(el + 2, gy, er - 2, gy + 2, 0, CYAN, 1, PL, D);
    }

    // ---------- Central Atrium: Floor Number Plaque & Grand Staircase ----------
    const label = f < 10 ? `0${f}` : `${f}`;
    P.rect(466, gy - 31, 494, gy - 19, D, CONCRETE);
    P.frame(466, gy - 31, 494, gy - 19, GOLD_D);
    P.textCenter(label, 480, gy - 28, 1, D, f === 55 ? MAGENTA : GOLD);

    // Alternating staircase connecting floor `f` up to floor `f + 1`
    if (f < FLOORS) {
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const sy = gy - (s + 1) * 7;
        const sx = stairLeft
          ? ELEV_WR + 6 + s * 7
          : ELEV_EL - 17 - s * 7;
        P.plat(sx, sy, sx + 11, sy + 2, 0, MARBLE, 1, MAT_PLANK, MAT_BEAM);
      }
    }

    // ---------- Exterior Balconies & Cantilevered Sky Infinity Pools ----------
    if (f === 18 || f === 36 || f === 48) {
      // Iconic cantilevered glass-walled Sky Infinity Pools on both sides!
      skyPool(P, TOWER_L - 62, TOWER_L + 2, gy, -1);
      skyPool(P, TOWER_R - 2, TOWER_R + 62, gy, 1);
      // Open doorway out to the pool deck
      P.rect(TOWER_L, gy - 34, TOWER_L + 4, gy, MAT_EMPTY, '#000000');
      P.rect(TOWER_R - 4, gy - 34, TOWER_R, gy, MAT_EMPTY, '#000000');
    } else if (f % 4 === 0 && f >= 4) {
      // Luxury sunset balconies with glass railings & bouncy lounge daybeds
      for (const side of [-1, 1]) {
        const bx0 = side < 0 ? TOWER_L - 38 : TOWER_R;
        const bx1 = side < 0 ? TOWER_L : TOWER_R + 38;
        P.rect(bx0, gy, bx1, gy + 3, MAT_ROCK, MARBLE);
        P.rect(bx0 + 4, gy + 1, bx1 - 4, gy + 3, MAT_BEDROCK, MARBLE_D);
        const railX = side < 0 ? bx0 : bx1 - 2;
        P.rect(railX, gy - 10, railX + 2, gy, MAT_GLASS, GLASS_HI);
        P.rect(railX, gy - 11, railX + 2, gy - 10, MAT_METAL, GOLD);
        // Open balcony doorway
        const dx = side < 0 ? TOWER_L : TOWER_R - 4;
        P.rect(dx, gy - 34, dx + 4, gy, D, bg);
        // Bouncy balcony sun-lounger
        const lx = side < 0 ? bx0 + 6 : bx1 - 20;
        P.rect(lx, gy - 4, lx + 14, gy, MAT_BOUNCE, (f & 4) ? CYAN : MAGENTA);
      }
    }

    // ---------- Interior Room Partition Wall (creates 2 distinct rooms per wing with open doorway) ----------
    const midW = 265;
    const midE = 695;
    if (f > 2 && f !== 14 && f !== 20 && f !== 36 && f !== 44) {
      for (const px of [midW, midE]) {
        // Wall lintel down to 33 cells above floor (easy walk/sprint clearance) + low wainscoting
        P.rect(px - 2, ceilY, px + 2, gy - 33, MAT_WOOD, WOOD);
        P.rect(px - 2, ceilY, px + 2, ceilY + 2, null, GOLD_D);
      }
    }

    // Corridor fire extinguisher every 3rd floor (live pressurized TNT tank on Floors 27 & 30, far from all spawns)
    if (f % 3 === 0) {
      const live = f === 27 || f === 30;
      fireExtinguisher(P, ELEV_WL - 6, gy, live);
      fireExtinguisher(P, ELEV_ER + 3, gy, live);
    }

    // ---------- Furnish Rooms According to Floor Theme ----------
    if (f === 1) {
      // GRAND MARBLE LOBBY: giant chandeliers, reception desk, bellhop carts, plush velvet lounge
      chandelier(P, 265, ceilY, true);
      chandelier(P, 480, ceilY, true);
      chandelier(P, 695, ceilY, true);
      barCounter(P, 210, 290, gy, false); // Marble Reception Desk
      P.textCenter('RECEPTION', 250, gy - 26, 1, D, GOLD);
      velvetSofa(P, 315, gy, CRIMSON);
      coffeeTable(P, 340, gy);
      velvetSofa(P, 605, gy, MAGENTA);
      coffeeTable(P, 630, gy);
      grandPiano(P, 675, gy);
      crate(P, 172, gy, 10); // Bellhop luggage
      crate(P, 774, gy, 10);
    } else if (f === 2) {
      // MEZZANINE CONCIERGE & TEA GALLERY
      chandelier(P, 220, ceilY, false);
      chandelier(P, 740, ceilY, false);
      diningSet(P, 210, gy);
      diningSet(P, 320, gy);
      barCounter(P, 610, 675, gy, true);
      velvetSofa(P, 725, gy, CYAN);
    } else if (f >= 3 && f <= 10) {
      // DELUXE GUEST SUITES & EXECUTIVE BEDROOMS
      chandelier(P, 210, ceilY, false);
      chandelier(P, 745, ceilY, false);
      luxuryBed(P, 168, gy, (f & 1) ? MAGENTA : CRIMSON);
      bookshelf(P, 236, gy, 15, 24);
      velvetSofa(P, 286, gy, CYAN);
      coffeeTable(P, 312, gy);
      // East Wing Suite
      velvetSofa(P, 602, gy, CRIMSON);
      diningSet(P, 654, gy);
      bookshelf(P, 706, gy, 15, 24);
      luxuryBed(P, 756, gy, (f & 1) ? CYAN : MAGENTA);
    } else if (f >= 11 && f <= 16) {
      // CASINO ROYALE & GOLD BULLION VAULTS!
      chandelier(P, 265, ceilY, f === 14);
      chandelier(P, 695, ceilY, f === 14);
      casinoTable(P, 205, gy);
      slotMachine(P, 286, gy);
      slotMachine(P, 304, gy);
      slotMachine(P, 322, gy);
      if (f === 13 || f === 16) {
        goldVault(P, 600, 646, gy, 24);
        P.textCenter('VAULT', 623, gy - 30, 1, D, GOLD);
      } else {
        barCounter(P, 598, 652, gy, true);
      }
      casinoTable(P, 735, gy);
      slotMachine(P, 774, gy);
    } else if (f >= 17 && f <= 24) {
      // LE GRAND RESTAURANT, PRESSURIZED KITCHENS & PIANO JAZZ LOUNGE
      chandelier(P, 215, ceilY, false);
      chandelier(P, 325, ceilY, false);
      chandelier(P, 640, ceilY, false);
      diningSet(P, 198, gy);
      diningSet(P, 316, gy);
      barCounter(P, 596, 666, gy, true); // Kitchen / Champagne bar with pressurized stove/keg!
      if (f & 1) grandPiano(P, 718, gy);
      else {
        diningSet(P, 715, gy);
        diningSet(P, 772, gy);
      }
    } else if (f >= 25 && f <= 33) {
      // ROYAL PRESIDENTIAL SUITES, MAHOGANY LIBRARY & BILLIARD CLUB
      chandelier(P, 215, ceilY, false);
      chandelier(P, 740, ceilY, false);
      luxuryBed(P, 170, gy, GOLD);
      velvetSofa(P, 212, gy, MAGENTA);
      bookshelf(P, 282, gy, 18, 26);
      bookshelf(P, 306, gy, 18, 26);
      casinoTable(P, 632, gy); // Emerald billiard table
      bookshelf(P, 708, gy, 18, 26);
      luxuryBed(P, 754, gy, CRIMSON);
    } else if (f >= 34 && f <= 39) {
      // SKY SPA, INDOOR AQUARIUMS & RELAXATION SUITES
      // Indoor glass aquarium tank filled with turquoise water
      goldVault(P, 174, 216, gy, 20);
      for (let y = gy - 15; y < gy; y++) {
        for (let x = 176; x < 214; x++) P.put(x, y, MAT_SAND, (x + y) & 1 ? WATER_A : WATER_B);
      }
      luxuryBed(P, 286, gy, CYAN); // Spa massage / bounce table
      luxuryBed(P, 324, gy, WATER_A);
      barCounter(P, 600, 656, gy, false); // Juice & spa bar
      velvetSofa(P, 712, gy, CYAN);
      luxuryBed(P, 752, gy, MAGENTA);
    } else if (f >= 40 && f <= 48) {
      // CYBER-VIP SKY NIGHTCLUB & DUPLEX LOUNGES
      chandelier(P, 265, ceilY, true); // Giant suspended crystal disco chandelier!
      chandelier(P, 695, ceilY, true);
      barCounter(P, 170, 236, gy, true);
      velvetSofa(P, 284, gy, MAGENTA);
      velvetSofa(P, 322, gy, CYAN);
      // DJ Booth & VIP couches on East Wing
      barCounter(P, 602, 650, gy, true);
      grandPiano(P, 710, gy);
      luxuryBed(P, 760, gy, MAGENTA);
    } else if (f >= 49 && f <= 54) {
      // BILLIONAIRE ART GALLERY & ROYAL PENTHOUSES
      chandelier(P, 215, ceilY, true);
      chandelier(P, 740, ceilY, true);
      luxuryBed(P, 168, gy, GOLD);
      coffeeTable(P, 206, gy);
      goldVault(P, 290, 330, gy, 22); // Private art/gold display case
      grandPiano(P, 602, gy);
      diningSet(P, 668, gy);
      luxuryBed(P, 754, gy, MAGENTA);
    } else if (f === 55) {
      // FLOOR 55 — IMPERIAL CROWN PENTHOUSE
      chandelier(P, 235, ceilY, true);
      chandelier(P, 480, ceilY, true);
      chandelier(P, 725, ceilY, true);
      luxuryBed(P, 170, gy, GOLD);
      grandPiano(P, 220, gy);
      barCounter(P, 300, 362, gy, true);
      goldVault(P, 598, 646, gy, 24);
      diningSet(P, 688, gy);
      luxuryBed(P, 752, gy, MAGENTA);
    }
  }

  // ---------- Rooftop Helipad, Infinity Jacuzzi & Giant Neon Sign (y < ROOF_Y) ----------
  // Penthouse elevator headhouses on the roof so lifts open cleanly onto the rooftop deck
  for (const [el, er] of [[ELEV_WL, ELEV_WR], [ELEV_EL, ELEV_ER]]) {
    P.rect(el, ROOF_Y - 34, er, ROOF_Y, D, NIGHT_BG);
    P.rect(el, ROOF_Y - 36, er, ROOF_Y - 34, MAT_METAL, GOLD);
    P.plat(el + 2, ROOF_Y, er - 2, ROOF_Y + 2, 0, CYAN, 1, PL, D);
  }

  // Giant glowing "GRAND HOTEL" neon sign crowning the centre of the roof
  for (const px of [424, 536]) P.rect(px, ROOF_Y - 62, px + 3, ROOF_Y, MAT_BEAM, STEEL);
  P.rect(412, ROOF_Y - 68, 550, ROOF_Y - 44, D, CONCRETE);
  P.frame(412, ROOF_Y - 68, 550, ROOF_Y - 44, GOLD);
  P.textCenter('GRAND HOTEL', 481, ROOF_Y - 59, 1, D, CYAN);

  // West Rooftop: Sky Jacuzzi + Bouncy Sun-Loungers + Rooftop Cocktail Bar
  skyPool(P, TOWER_L + 12, TOWER_L + 84, ROOF_Y, -1);
  barCounter(P, 260, 336, ROOF_Y, true);
  luxuryBed(P, 342, ROOF_Y, CYAN);

  // East Rooftop: Helipad ("H") + Destructible VIP Helicopter!
  P.rect(612, ROOF_Y, 792, ROOF_Y + 2, null, GOLD);
  P.textCenter('H', 702, ROOF_Y - 12, 1, D, GOLD);
  helicopter(P, 706, ROOF_Y);
}
