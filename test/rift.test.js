import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BTN, MAT_BEDROCK, PHYS } from '../shared/constants.js';
import { Game } from '../shared/game.js';
import { prismTrace } from '../shared/geom.js';
import { MAP_IDS, buildMap } from '../shared/maps.js';
import { PROJ, VORTEX_P } from '../shared/projectiles.js';
import { PRISM, RIFT_POOL, W, WEAPONS, owns, sanitizePool } from '../shared/weapons.js';
import { Room } from '../server/room.js';

function duel(map = 'flat') {
  const g = new Game(map, 4242);
  g.addPlayer(0, 0);
  g.addPlayer(1, 1);
  for (const p of g.players) p.shield = 0;
  return g;
}

function equip(g, slot, w, seqStart = 1) {
  let seq = seqStart;
  for (let i = 0; i < 8; i++) {
    g.applyInput(slot, { s: seq++, b: 0, a: 0, w, v: g.tick });
    g.update();
  }
  return seq;
}

test('NEON CITY is the signature first map and default 1v1 duel arena', () => {
  assert.equal(MAP_IDS[0], 'neon');
  const m = buildMap('neon', 99);
  assert.equal(m.name, 'NEON CITY');
  assert.equal(m.spawns.length, 8);
  const room = new Room('TEST', false, () => {}, 'duel');
  assert.equal(room.mapId, 'neon');
});

test('Rift Arsenal preset includes Blink Disc, Prism Rifle and Vortex Orb', () => {
  assert.equal(sanitizePool('rift'), RIFT_POOL);
  assert.ok(owns(RIFT_POOL, W.blink));
  assert.ok(owns(RIFT_POOL, W.prism));
  assert.ok(owns(RIFT_POOL, W.vortex));
});

test('Blink Disc teleports on wall impact, hurts nearby enemies, and never self-damages', () => {
  const g = duel('flat');
  g.grant(0, W.blink);
  const p0 = g.players[0];
  const p1 = g.players[1];
  p0.x = 260;
  p0.y = 800;
  p0.grounded = true;
  // Indestructible vertical pillar at x = 700..720 standing on the y = 800 floor.
  for (let cy = 300; cy < 400; cy++) {
    for (let cx = 350; cx <= 360; cx++) g.terrain.set(cx, cy, MAT_BEDROCK, 2);
  }
  p1.x = 684;
  p1.y = 800;
  p1.grounded = true;
  const startHp0 = p0.hp;
  const startHp1 = p1.hp;

  let seq = equip(g, 0, W.blink);
  g.applyInput(0, { s: seq++, b: BTN.FIRE, a: -0.05, w: W.blink, v: g.tick });
  g.update();
  assert.equal(g.projs.filter((pr) => pr.k === PROJ.BLINK).length, 1);

  for (let i = 0; i < 45 && g.projs.length > 0; i++) {
    g.applyInput(0, { s: seq++, b: 0, a: -0.05, w: W.blink, v: g.tick });
    g.update();
  }

  assert.ok(p0.x > 600, `expected shooter to blink near pillar, got x=${p0.x}`);
  assert.equal(p0.hp, startHp0, 'Blink arrival pulse must never hurt the shooter');
  assert.ok(p1.hp < startHp1, 'Blink arrival pulse damages adjacent enemy');
  assert.ok(g.takeEvents().some((e) => e.e === 'tp' && e.s === 0), 'emits teleport event');
});

test('Blink Disc mid-air activation on ALT teleports early and refills air flip', () => {
  const g = duel('flat');
  g.grant(0, W.blink);
  const p0 = g.players[0];
  p0.x = 240;
  p0.y = 800;
  p0.grounded = true;

  let seq = equip(g, 0, W.blink);
  p0.flips = 0;
  g.applyInput(0, { s: seq++, b: BTN.FIRE, a: -0.35, w: W.blink, v: g.tick });
  for (let i = 0; i < 10; i++) {
    g.applyInput(0, { s: seq++, b: 0, a: -0.35, w: W.blink, v: g.tick });
    g.update();
  }
  assert.equal(g.projs.filter((pr) => pr.k === PROJ.BLINK).length, 1);
  const nadesBefore = p0.nades;

  // Trigger ALT to blink mid-flight instead of throwing a grenade.
  g.applyInput(0, { s: seq++, b: BTN.ALT, a: -0.35, w: W.blink, v: g.tick });
  g.update();

  assert.equal(g.projs.filter((pr) => pr.k === PROJ.BLINK).length, 0);
  assert.equal(p0.nades, nadesBefore, 'ALT with Blink Disc activates disc rather than spending a grenade');
  assert.ok(p0.x > 340 && p0.y < 790, `expected mid-air blink, got (${p0.x}, ${p0.y})`);
  assert.equal(p0.flips, PHYS.FLIPS);
});

test('Prism Rifle bounces off walls to hit around cover with ricochet bonus damage', () => {
  const g = duel('flat');
  g.grant(0, W.prism);
  const p0 = g.players[0];
  const p1 = g.players[1];
  p0.x = 300;
  p0.y = 800;
  p0.grounded = true;
  p1.x = 700;
  p1.y = 800;
  p1.grounded = true;

  // Solid ceiling mirror at y = 560 (cy = 280) and cover wall at x = 500 (cx = 250) from y = 640..800.
  for (let cx = 100; cx <= 420; cx++) {
    for (let cy = 276; cy <= 280; cy++) g.terrain.set(cx, cy, MAT_BEDROCK, 2);
  }
  for (let cy = 320; cy < 400; cy++) {
    for (let cx = 248; cx <= 252; cx++) g.terrain.set(cx, cy, MAT_BEDROCK, 2);
  }

  let seq = equip(g, 0, W.prism);
  const oy = p0.y - PHYS.AIM_Y;
  const ang = Math.atan2(562 - oy, 500 - 300);
  const trace = prismTrace(g.terrain, 300, oy, ang, PRISM.range, PRISM.bounces);
  assert.ok(trace.hits.length >= 1, 'beam bounces off ceiling');

  g.takeEvents();
  g.applyInput(0, { s: seq++, b: BTN.FIRE, a: ang, w: W.prism, v: g.tick });
  g.update();

  const expectedBounceDmg = Math.round(WEAPONS[W.prism].dmg * (1 + PRISM.boost));
  assert.equal(Math.round(100 - p1.hp), expectedBounceDmg, `expected ${expectedBounceDmg} bank-shot dmg, got ${100 - p1.hp}`);
  assert.ok(g.takeEvents().some((e) => e.e === 'pr' && e.pts.length >= 6));
});

test('Vortex Orb anchors into a singularity, pulls enemies inward, and implodes', () => {
  const g = duel('flat');
  g.grant(0, W.vortex);
  const p0 = g.players[0];
  const p1 = g.players[1];
  p0.x = 220;
  p0.y = 800;
  p0.grounded = true;
  p1.x = 640;
  p1.y = 800;
  p1.grounded = true;

  let seq = equip(g, 0, W.vortex);
  g.applyInput(0, { s: seq++, b: BTN.FIRE, a: -0.18, w: W.vortex, v: g.tick });
  g.update();

  let anchoredX = null;
  let distAtAnchor = null;
  let minDist = Infinity;
  const maxTicks = Math.ceil((VORTEX_P.total + 0.4) * 60);
  for (let i = 0; i < maxTicks; i++) {
    g.applyInput(0, { s: seq++, b: 0, a: -0.18, w: W.vortex, v: g.tick });
    g.applyInput(1, { s: seq, b: 0, a: 0, w: W.pistol, v: g.tick });
    g.update();
    const pr = g.projs.find((q) => q.k === PROJ.VORTEX);
    if (pr && pr.st) {
      if (anchoredX === null) {
        anchoredX = pr.x;
        distAtAnchor = Math.abs(p1.x - anchoredX);
      }
      minDist = Math.min(minDist, Math.abs(p1.x - anchoredX));
    }
  }

  assert.ok(anchoredX !== null, 'Vortex Orb anchored into singularity state');
  assert.ok(minDist < distAtAnchor - 25, `expected enemy pulled closer to singularity (${minDist} vs ${distAtAnchor})`);
  assert.equal(g.projs.filter((q) => q.k === PROJ.VORTEX).length, 0, 'Vortex Orb imploded at end of timer');
  assert.ok(p1.hp < 100, 'Vortex singularity + implosion damaged enemy');
});
