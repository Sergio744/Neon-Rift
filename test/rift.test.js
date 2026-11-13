import assert from 'node:assert/strict';
import { test } from 'node:test';
import WebSocket from 'ws';
import { BTN, BUFF, MAT_BEDROCK, PHYS } from '../shared/constants.js';
import { Game } from '../shared/game.js';
import { ITEM } from '../shared/game/items.js';
import { prismTrace } from '../shared/geom.js';
import { MAP_IDS, MAPS, PALETTE, buildMap } from '../shared/maps.js';
import { createPlayer, packPlayer, unpackPlayer } from '../shared/player.js';
import { PROJ, VORTEX_P } from '../shared/projectiles.js';
import { Survival } from '../shared/survival.js';
import { FULL_POOL, PRISM, RIFT_POOL, W, WEAPONS, owns, poolStart, sanitizePool } from '../shared/weapons.js';
import { startServer } from '../server/index.js';
import { ArenaHub } from '../server/arena-hub.js';
import { Room } from '../server/room.js';
import { launchAutonomousAgent } from '../agents/autonomous-player.mjs';

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

test('private duel creator can park room in background and auto-wakes when opponent joins', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  const mkClient = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const c = { ws, msgs: [], waiters: [] };
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      c.msgs.push(m);
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    c.send = (m) => ws.send(JSON.stringify(m));
    c.wait = (pred, ms = 5000) =>
      new Promise((res, rej) => {
        const found = c.msgs.find(pred);
        if (found) return res(found);
        const to = setTimeout(() => rej(new Error('timeout')), ms);
        c.waiters.push((m) => {
          if (!pred(m)) return false;
          clearTimeout(to);
          res(m);
          return true;
        });
      });
    c.open = new Promise((r) => ws.on('open', r));
    return c;
  };

  try {
    const host = mkClient();
    const rival = mkClient();
    await Promise.all([host.open, rival.open]);

    host.send({ t: 'create', name: 'sergio' });
    const created = await host.wait((m) => m.t === 'joined');
    assert.equal(created.slot, 0);

    // Park the room so the creator can wait in the menu or play Solo Survival.
    host.send({ t: 'park' });
    const parked = await host.wait((m) => m.t === 'parked');
    assert.equal(parked.code, created.code);

    // Clear host message log, then have rival join via the invite code.
    host.msgs.length = 0;
    rival.send({ t: 'join', name: 'rival', code: created.code });

    const woke = await host.wait((m) => m.t === 'joined' && m.opponent === 'RIVAL');
    assert.equal(woke.code, created.code);
    assert.equal(woke.slot, 0);

    const countdown = await host.wait((m) => m.t === 'room' && m.st === 'countdown');
    assert.deepEqual(countdown.names, ['SERGIO', 'RIVAL']);

    host.ws.close();
    rival.ws.close();
  } finally {
    await srv.close();
  }
});

test('Solo, Co-op and Online rooms support all maps, default to Rift Drops with finite ammo, and toggle Full Arsenal', async () => {
  // 1. Solo / Survival runs on every online map in Rift Drops mode (light start + finite ammo).
  for (const id of MAP_IDS) {
    const run = new Survival(777, { map: id, pool: FULL_POOL, riftDrops: true });
    run.addHuman(0);
    const p0 = run.game.players[0];
    assert.equal(run.game.mapId, id);
    assert.equal(p0.owned, poolStart(FULL_POOL), `light starting arsenal on ${id}`);
    assert.equal(p0.ammo[W.pistol], -1, 'backup pistol stays infinite');
    assert.ok(p0.ammo[W.smg] > 0, 'starting SMG has finite ammo');
    for (let i = 0; i < 200; i++) run.step();
    assert.equal(run.wave, 1, `wave 1 starts cleanly on ${id}`);
  }

  // 2. Co-op over WebSocket defaults to Rift Drops (`loadout: 'drops'`), supports all maps, and toggles to `'full'`.
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
  const msgs = [];
  let waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    msgs.push(m);
    waiters = waiters.filter((w) => !w(m));
  });
  const wait = (pred, ms = 5000) =>
    new Promise((res, rej) => {
      const found = msgs.find(pred);
      if (found) return res(found);
      const to = setTimeout(() => rej(new Error('timeout')), ms);
      waiters.push((m) => {
        if (!pred(m)) return false;
        clearTimeout(to);
        res(m);
        return true;
      });
    });

  try {
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ t: 'coop', name: 'sergio' }));
    await wait((m) => m.t === 'coop' && m.map === 'neon' && m.loadout === 'drops' && m.pool === FULL_POOL);

    ws.send(JSON.stringify({ t: 'setmap', map: 'canyon' }));
    await wait((m) => m.t === 'coop' && m.map === 'canyon');
    await wait((m) => m.t === 'map' && m.id === 'canyon');

    ws.send(JSON.stringify({ t: 'start' }));
    await wait((m) => m.t === 'coop' && m.st === 'playing' && m.map === 'canyon');
    msgs.length = 0;
    const snap = await wait((m) => m.t === 's' && m.p[0] && m.sv?.st !== 'lobby');
    const p0 = unpackPlayer(snap.p[0], createPlayer(0));
    assert.equal(p0.owned, poolStart(FULL_POOL), 'Rift Drops starts with light loadout');
    assert.ok(p0.ammo[W.smg] > 0, 'Rift Drops uses finite ammo on non-pistol weapons');
    ws.close();
  } finally {
    await srv.close();
  }
});

test('Mystery Weapon Crates stay hidden until pickup, anyone can grab them, and weapons adapt to the situation', () => {
  const g = new Game('flat', 9090, 4);
  g.riftDrops = true;
  g.cratesOn = true;
  g.pool = FULL_POOL;
  g.startOwned = poolStart(FULL_POOL);
  g.reset('flat', 9090);
  g.riftDrops = true;
  g.cratesOn = true;
  g.addPlayer(0, 0);
  g.addPlayer(1, 1);
  g.addPlayer(2, 0);
  g.addPlayer(3, 1);
  for (const p of g.players) p.shield = 0;

  // Drop a mystery crate: snapshot entry has 5 fields only (no hidden weapon leak before pickup).
  const crate = g.dropMystery(500);
  assert.equal(crate.kind, ITEM.MYSTERY);
  const snapItem = g.snapshot().c.find((e) => e[0] === crate.id);
  assert.equal(snapItem.length, 5, 'snapshot never leaks the mystery weapon id before pickup');
  assert.equal(snapItem[4], ITEM.MYSTERY);

  // Any player (e.g. rival slot 1) can grab the mystery crate and unlock a contextual weapon with finite ammo.
  const p1 = g.players[1];
  const before = p1.owned;
  g.pickup(1, crate);
  assert.notEqual(p1.owned, before, 'mystery crate grants a new weapon from the pool');
  const unlockedEv = g.takeEvents().find((e) => e.e === 'u' && e.s === 1 && e.mys === 1);
  assert.ok(unlockedEv, 'emits mystery unlock event on pickup');
  assert.ok(p1.ammo[unlockedEv.w] > 0, 'granted mystery weapon has finite ammo');

  // Situational bias check: player 0 trapped low with an enemy high above strongly favors escape/mobility tools.
  const p0 = g.players[0];
  p0.x = 400;
  p0.y = g.worldH * 0.8;
  p1.x = 420;
  p1.y = p0.y - 180;
  let blinkOrVertical = 0;
  for (let i = 0; i < 40; i++) {
    const w = g.pickContextualWeapon(0);
    if (w === W.blink || w === W.prism || w === W.rocket) blinkOrVertical++;
  }
  assert.ok(blinkOrVertical >= 14, `expected vertical/escape weapon preference (${blinkOrVertical}/40)`);
});

test('Rift Boost Orbs grant temporary Turbo, Overdrive, Shield and Frenzy buffs with deterministic pack/unpack', () => {
  const g = duel('flat');
  g.riftDrops = true;
  const p0 = g.players[0];
  const p1 = g.players[1];
  p0.x = 300;
  p0.y = 800;
  p0.grounded = true;
  p1.x = 460;
  p1.y = 800;
  p1.grounded = true;

  // 1. TURBO: increases max sprint speed and round-trips through packPlayer/unpackPlayer.
  g.pickup(0, { id: 10, kind: ITEM.ORB, x: p0.x, y: p0.y, buff: BUFF.TURBO });
  assert.equal(p0.buff, BUFF.TURBO);
  const unpacked = unpackPlayer(packPlayer(p0), createPlayer(0));
  assert.equal(unpacked.buff, BUFF.TURBO);
  assert.ok(unpacked.buffT > 7);
  for (let i = 0; i < 35; i++) {
    g.applyInput(0, { s: g.tick, b: BTN.RIGHT | BTN.SPRINT, a: 0, w: 0, v: g.tick });
    g.update();
  }
  assert.ok(p0.vx > PHYS.RUN * PHYS.SPRINT + 40, `Turbo exceeded normal sprint cap (${p0.vx})`);

  // 2. SHIELD: heals + absorbs weapon damage into eshield before touching hp.
  p1.hp = 60;
  g.pickup(1, { id: 11, kind: ITEM.ORB, x: p1.x, y: p1.y, buff: BUFF.SHIELD });
  assert.equal(p1.hp, 95, 'Shield Orb heals +35 HP');
  assert.equal(p1.eshield, 55, 'Shield Orb grants 55 energy barrier');
  g.damage(1, 30, 0, W.pistol, 0, 0, p1.x, p1.y - 30, false);
  assert.equal(p1.hp, 95, 'Energy shield absorbed the hit completely');
  assert.ok(p1.eshield < 55, 'Energy shield decreased');

  // 3. OVERDRIVE: increases weapon damage dealt by 35%.
  p1.eshield = 0;
  p1.buff = 0;
  p1.buffT = 0;
  p1.hp = 100;
  g.pickup(0, { id: 12, kind: ITEM.ORB, x: p0.x, y: p0.y, buff: BUFF.OVERDRIVE });
  g.damage(1, 20, 0, W.pistol, 0, 0, p1.x, p1.y - 30, false);
  assert.ok(p1.hp <= 73.1, `Overdrive boosted 20 dmg to 27 (hp=${p1.hp})`);

  // 4. FRENZY: fires finite-ammo weapons without spending ammo, then expires cleanly.
  p0.owned |= 1 << W.rocket;
  p0.w = W.rocket;
  p0.ammo[W.rocket] = 2;
  p0.cd = 0;
  g.pickup(0, { id: 13, kind: ITEM.ORB, x: p0.x, y: p0.y, buff: BUFF.FRENZY });
  g.applyInput(0, { s: g.tick, b: BTN.FIRE, a: -0.4, w: W.rocket, v: g.tick });
  assert.equal(p0.ammo[W.rocket], 2, 'Frenzy fired rocket without spending ammo');
  for (let i = 0; i < 60 * 7; i++) {
    g.applyInput(0, { s: g.tick, b: 0, a: 0, w: W.rocket, v: g.tick });
    g.update();
  }
  assert.equal(p0.buff, BUFF.NONE, 'Frenzy expired after duration');
});

test('in-game HUD serves dedicated Pause and Main Menu buttons with EN/FR translations', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  try {
    const res = await fetch(`http://127.0.0.1:${srv.port}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('id="btn-hud-pause"'), 'Pause button exists in HUD');
    assert.ok(html.includes('id="btn-hud-menu"'), 'Main Menu button exists in HUD');
    assert.ok(html.includes('data-i18n="hudPause"'));
    assert.ok(html.includes('data-i18n="hudMenu"'));

    const i18nRes = await fetch(`http://127.0.0.1:${srv.port}/js/i18n.js`);
    assert.equal(i18nRes.status, 200);
    const i18nSrc = await i18nRes.text();
    assert.ok(i18nSrc.includes("hudMenu: 'MAIN MENU'"));
    assert.ok(i18nSrc.includes("hudMenu: 'MENU PRINCIPAL'"));
  } finally {
    await srv.close();
  }
});

test('Hybrid Squads: private duel upgrades in-place to Teams, mixes humans + NPC bots, obeys orders, and yields bot slots to friends', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  const mkClient = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const c = { ws, msgs: [], waiters: [] };
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      c.msgs.push(m);
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    c.send = (m) => ws.send(JSON.stringify(m));
    c.wait = (pred, ms = 5000) =>
      new Promise((res, rej) => {
        const found = c.msgs.find(pred);
        if (found) return res(found);
        const to = setTimeout(() => rej(new Error('timeout')), ms);
        c.waiters.push((m) => {
          if (!pred(m)) return false;
          clearTimeout(to);
          res(m);
          return true;
        });
      });
    c.open = new Promise((r) => ws.on('open', r));
    return c;
  };

  try {
    const host = mkClient();
    const friend = mkClient();
    const lateFriend = mkClient();
    await Promise.all([host.open, friend.open, lateFriend.open]);

    // 1. Creator makes a private duel and upgrades it live to Teams keeping the exact same code!
    host.send({ t: 'create', name: 'sergio' });
    const created = await host.wait((m) => m.t === 'joined' && m.mode === 'duel');
    const code = created.code;

    host.msgs.length = 0;
    host.send({ t: 'squads', mode: 'teams' });
    const upgraded = await host.wait((m) => m.t === 'room' && m.mode === 'teams' && m.max === 8);
    assert.equal(upgraded.code, code, 'invite code stays identical after upgrading to Squads');

    // 2. Friend joins via the original link; both join CYAN (team 0) and add NPC bots on PINK (team 1) & CYAN!
    friend.send({ t: 'join', name: 'alex', code });
    await friend.wait((m) => m.t === 'joined' && m.slot === 1);

    friend.msgs.length = 0;
    friend.send({ t: 'team', team: 0 });
    await friend.wait((m) => m.t === 'room' && m.teams[0] === 0 && m.teams[1] === 0);

    host.msgs.length = 0;
    host.send({ t: 'botskill', skill: 'ace' });
    host.send({ t: 'addbot', team: 0 }); // allied bot on CYAN
    host.send({ t: 'addbot', team: 1 }); // enemy bot 1 on PINK
    host.send({ t: 'addbot', team: 1 }); // enemy bot 2 on PINK
    const withBots = await host.wait((m) => m.t === 'room' && m.bots?.filter(Boolean).length === 3);
    assert.equal(withBots.botSkill, 'ace');
    assert.equal(withBots.teams[2], 0, 'allied bot placed on CYAN');
    assert.equal(withBots.teams[3], 1, 'enemy bot placed on PINK');
    assert.equal(withBots.teams[4], 1, 'second enemy bot placed on PINK');

    // 3. Fill remaining 3 slots with bots (total 8/8), then verify a real human friend evicts a bot!
    host.msgs.length = 0;
    host.send({ t: 'addbot', team: 0 });
    host.send({ t: 'addbot', team: 1 });
    host.send({ t: 'addbot', team: 0 });
    await host.wait((m) => m.t === 'room' && m.names.filter(Boolean).length === 8);

    lateFriend.send({ t: 'join', name: 'maya', code });
    const mayaJoined = await lateFriend.wait((m) => m.t === 'joined');
    assert.ok(mayaJoined.slot >= 2, 'real friend seamlessly replaced an NPC bot in an 8/8 room');

    // 4. Issue tactical order ('hold') to allied CYAN bots and verify bot chat acknowledgment + start match!
    host.msgs.length = 0;
    host.send({ t: 'order', cmd: 'hold' });
    const botAck = await host.wait((m) => m.t === 'chat' && m.bot === true);
    assert.equal(botAck.scope, 'team');
    assert.ok(botAck.text.includes('HOLDING'));

    host.msgs.length = 0;
    host.send({ t: 'start' });
    const countdown = await host.wait((m) => m.t === 'room' && m.st === 'countdown');
    assert.equal(countdown.mode, 'teams');

    host.ws.close();
    friend.ws.close();
    lateFriend.ws.close();
  } finally {
    await srv.close();
  }
});

test('Rift Comms: global chat, team-only chat privacy, media state broadcast, and WebRTC signaling relay', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  const mkClient = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const c = { ws, msgs: [], waiters: [] };
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      c.msgs.push(m);
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    c.send = (m) => ws.send(JSON.stringify(m));
    c.wait = (pred, ms = 5000) =>
      new Promise((res, rej) => {
        const found = c.msgs.find(pred);
        if (found) return res(found);
        const to = setTimeout(() => rej(new Error('timeout')), ms);
        c.waiters.push((m) => {
          if (!pred(m)) return false;
          clearTimeout(to);
          res(m);
          return true;
        });
      });
    c.open = new Promise((r) => ws.on('open', r));
    return c;
  };

  try {
    const c0 = mkClient();
    const c1 = mkClient();
    const c2 = mkClient();
    await Promise.all([c0.open, c1.open, c2.open]);

    c0.send({ t: 'create', name: 'alpha', mode: 'teams' });
    const j0 = await c0.wait((m) => m.t === 'joined');
    const code = j0.code;

    c1.send({ t: 'join', name: 'bravo', code });
    await c1.wait((m) => m.t === 'joined' && m.slot === 1); // team 1 (PINK)
    c2.send({ t: 'join', name: 'charlie', code });
    await c2.wait((m) => m.t === 'joined' && m.slot === 2); // team 0 (CYAN, same as alpha)

    // 1. Team-scoped message from alpha (team 0) reaches charlie (team 0) and NEVER bravo (team 1)!
    c0.msgs.length = 0;
    c1.msgs.length = 0;
    c2.msgs.length = 0;
    c0.send({ t: 'chat', scope: 'team', text: 'Rush high ground!' });
    const teamMsg = await c2.wait((m) => m.t === 'chat' && m.scope === 'team');
    assert.equal(teamMsg.text, 'Rush high ground!');

    // Global message reaches everyone including rival team (bravo)
    c0.send({ t: 'chat', scope: 'all', text: 'GL HF everyone!' });
    const allMsg = await c1.wait((m) => m.t === 'chat' && m.scope === 'all');
    assert.equal(allMsg.text, 'GL HF everyone!');
    assert.equal(
      c1.msgs.some((m) => m.t === 'chat' && m.scope === 'team'),
      false,
      'rival team never receives secret team chat',
    );

    // 2. Live Mic/Cam media state broadcast + WebRTC peer-to-peer signaling relay
    c1.msgs.length = 0;
    c0.send({ t: 'media', mic: true, cam: true, vscope: 'team' });
    const mediaMsg = await c1.wait((m) => m.t === 'media' && m.states?.[0]?.mic === true);
    assert.equal(mediaMsg.states[0].cam, true);
    assert.equal(mediaMsg.states[0].vscope, 'team');

    c1.msgs.length = 0;
    c0.send({ t: 'rtc', to: 1, data: { description: { type: 'offer', sdp: 'v=0-mock-sdp' } } });
    const rtcMsg = await c1.wait((m) => m.t === 'rtc' && m.from === 0);
    assert.equal(rtcMsg.data.description.sdp, 'v=0-mock-sdp');

    c0.ws.close();
    c1.ws.close();
    c2.ws.close();
  } finally {
    await srv.close();
  }
});

test('Rift Colosseum: challenges, live spectators, custom rule referee fouls, and voluntary SOS reinforcements', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  const mkClient = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const c = { ws, msgs: [], waiters: [] };
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      c.msgs.push(m);
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    c.send = (m) => ws.send(JSON.stringify(m));
    c.wait = (pred, ms = 6000) =>
      new Promise((res, rej) => {
        const found = c.msgs.find(pred);
        if (found) return res(found);
        const to = setTimeout(() => rej(new Error('timeout')), ms);
        c.waiters.push((m) => {
          if (!pred(m)) return false;
          clearTimeout(to);
          res(m);
          return true;
        });
      });
    c.open = new Promise((r) => ws.on('open', r));
    return c;
  };

  try {
    const fA = mkClient();
    const fB = mkClient();
    const spec = mkClient();
    await Promise.all([fA.open, fB.open, spec.open]);

    fA.send({ t: 'arena', name: 'sergio', priv: true, autoAi: false, initialAis: 0 });
    const jA = await fA.wait((m) => m.t === 'joined' && m.mode === 'arena');
    const code = jA.code;

    fB.send({ t: 'join', name: 'rival', code });
    const jB = await fB.wait((m) => m.t === 'joined' && m.mode === 'arena');

    spec.send({ t: 'join', name: 'viewer', code });
    await spec.wait((m) => m.t === 'joined' && m.mode === 'arena');

    // 1. Sergio challenges Rival with Custom Rules (noExplosives) and a 60s Match Timer!
    fB.msgs.length = 0;
    fA.send({
      t: 'challenge',
      targetId: jB.actorId,
      map: 'neon',
      goal: 5,
      timeLimit: 60,
      rules: { noExplosives: true },
    });
    const chArena = await fB.wait((m) => m.t === 'arena' && m.challenge?.targetId === jB.actorId);
    assert.equal(chArena.challenge.timeLimit, 60);
    assert.equal(chArena.challenge.rules.noExplosives, true);

    // 2. Rival accepts -> Viewer automatically moves to Spectator mode (`spectating: true, slot: -1`) and receives live snapshots!
    spec.msgs.length = 0;
    fA.msgs.length = 0;
    fB.send({ t: 'challenge_reply', accept: true });

    const specRole = await spec.wait((m) => m.t === 'arena_role');
    assert.equal(specRole.spectating, true);
    assert.equal(specRole.slot, -1);

    // Speed up countdown on server hub for deterministic fast test
    const hub = srv.lobby.rooms.get(code);
    hub.timer = 0.01;
    await fA.wait((m) => m.t === 'arena' && m.st === 'playing');
    const liveSnap = await spec.wait((m) => m.t === 's' && Array.isArray(m.p));
    assert.ok(liveSnap.p[0] && liveSnap.p[1], 'spectator receives real-time 60 Hz snapshots of both fighters');

    // 3. Referee enforces `noExplosives`: attempting BTN.ALT grenade triggers a Foul shock & blocks grenade!
    fA.msgs.length = 0;
    fA.send({ t: 'i', l: [[1, BTN.ALT, 0, W.pistol, hub.game.tick, 0]] });
    const foul = await fA.wait((m) => m.t === 'foul' && m.rule === 'noExplosives');
    assert.equal(foul.name, 'SERGIO');
    assert.equal(hub.game.projs.length, 0, 'illegal grenade was blocked by Referee');

    // 4. Mid-match SOS ("Appel à l'aide"): Sergio calls SOS, Spectator Viewer chooses to jump in and help!
    spec.msgs.length = 0;
    fA.send({ t: 'sos' });
    const sosArena = await spec.wait((m) => m.t === 'arena' && m.sos?.callerName === 'SERGIO');
    assert.equal(sosArena.sos.team, 0);

    spec.msgs.length = 0;
    spec.send({ t: 'sos_reply', accept: true });
    const promoted = await spec.wait((m) => m.t === 'arena_role' && m.spectating === false);
    assert.ok(promoted.slot >= 2, 'spectator promoted into live arena slot');
    assert.equal(promoted.team, 0, 'helper joined caller team');
    await fA.wait((m) => m.t === 'sos_joined' && m.helperName === 'VIEWER');

    fA.ws.close();
    fB.ws.close();
    spec.ws.close();
  } finally {
    await srv.close();
  }
});

test('Autonomous AI Citizens & external WebSocket AI Agents play like humans (initiate/accept duels, chat, observe, fight)', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  const mkClient = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const c = { ws, msgs: [], waiters: [] };
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      c.msgs.push(m);
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    c.send = (m) => ws.send(JSON.stringify(m));
    c.wait = (pred, ms = 6000) =>
      new Promise((res, rej) => {
        const found = c.msgs.find(pred);
        if (found) return res(found);
        const to = setTimeout(() => rej(new Error('timeout')), ms);
        c.waiters.push((m) => {
          if (!pred(m)) return false;
          clearTimeout(to);
          res(m);
          return true;
        });
      });
    c.open = new Promise((r) => ws.on('open', r));
    return c;
  };

  let extAgent = null;
  try {
    const human = mkClient();
    await human.open;

    human.send({ t: 'arena', name: 'sergio', priv: true, autoAi: true, initialAis: 2 });
    const joined = await human.wait((m) => m.t === 'joined' && m.mode === 'arena');
    const hub = srv.lobby.rooms.get(joined.code);

    // 1. Connect external AI agent script over WebSocket into the exact same Colosseum!
    extAgent = launchAutonomousAgent({
      url: `ws://127.0.0.1:${srv.port}/ws`,
      name: 'OMEGA-IA',
      room: joined.code,
    });
    const agentGreet = await human.wait((m) => m.t === 'chat' && m.name === 'OMEGAIA');
    assert.ok(agentGreet.text.includes('ONLINE'));

    // 2. Human challenges external AI agent -> external AI agent autonomously accepts over WebSocket!
    const arenaInfo = hub.info();
    const omegaActor = arenaInfo.roster.find((r) => r.name === 'OMEGAIA');
    assert.ok(omegaActor, 'external AI agent appears in Colosseum roster');

    human.msgs.length = 0;
    human.send({
      t: 'challenge',
      targetId: omegaActor.id,
      map: 'neon',
      goal: 3,
      timeLimit: 60,
      rules: { noJetpack: true },
    });
    const started = await human.wait((m) => m.t === 'arena' && m.st === 'countdown');
    assert.equal(started.rules.noJetpack, true);

    // 3. Verify built-in Autonomous AI Citizens also initiate challenges on their own when idle!
    hub.returnToOpenRing();
    human.msgs.length = 0;
    hub.idleChallengeCd = 0.05;
    hub.stepSocialAi(0.2);
    const aiProposed = await human.wait((m) => m.t === 'arena' && Boolean(m.challenge));
    assert.ok(aiProposed.challenge.fromId.startsWith('ai'), 'built-in AI citizen initiated a challenge autonomously');

    human.ws.close();
  } finally {
    extAgent?.close();
    await srv.close();
  }
});

test('Match Timer resolves winner at 0:00 and triggers Sudden Death on a tie', () => {
  const room = new Room('TIME', { mode: 'duel', timeLimit: 60, goal: 5 });
  const fakeWs = { readyState: 3, send() {} };
  const c0 = { id: 1, ws: fakeWs, name: 'A', slot: -1, rtt: 10 };
  const c1 = { id: 2, ws: fakeWs, name: 'B', slot: -1, rtt: 10 };
  room.join(c0);
  room.join(c1);

  // Advance past countdown into playing
  room.state = 'playing';
  room.applyRules();
  assert.equal(room.matchTimer, 60);

  // 1. Tied 1-1 when timer hits 0 -> enters Sudden Death, then next kill wins immediately!
  room.scores = [1, 1];
  room.matchTimer = 0.01;
  room.tick();
  assert.equal(room.state, 'playing');
  assert.equal(room.suddenDeath, true, 'tie at 0:00 triggers Sudden Death');

  room.onKill(1, 0); // P0 scores 2-1 (below goal 5, but Sudden Death!)
  assert.equal(room.state, 'over');
  assert.equal(room.winner, 0, 'next point in Sudden Death wins immediately');
});

test('Autonomous AI Citizens fight to completion on open maps (neon) and underground bunker maps (mine + noExplosives)', () => {
  // 1. Open vertical map: NEON CITY
  const neonHub = new ArenaHub('AINN', { map: 'neon', initialAis: 2, autoAi: false });
  assert.equal(neonHub.startAiExhibition({ map: 'neon', goal: 3, timeLimit: 120 }), true);
  for (let i = 0; i < 60 * 55 && neonHub.state !== 'over'; i++) neonHub.tick();
  assert.equal(neonHub.state, 'over', 'AI-vs-AI duel on NEON CITY completes decisively');
  assert.ok(Math.max(...neonHub.teamScores) >= 3, 'winner reached goal of 3 on NEON CITY');

  // 2. Sealed underground bunkers + MAT_METAL shields + SANS EXPLOSIFS rule: THE MINE
  const mineHub = new ArenaHub('AIMN', { map: 'mine', initialAis: 2, autoAi: false });
  assert.equal(
    mineHub.startAiExhibition({ map: 'mine', goal: 2, timeLimit: 120, rules: { noExplosives: true } }),
    true,
  );
  for (let i = 0; i < 60 * 90 && mineHub.state !== 'over'; i++) mineHub.tick();
  assert.ok(
    mineHub.teamScores[0] + mineHub.teamScores[1] >= 1,
    `AIs escaped underground bunkers on THE MINE and scored kills (got ${mineHub.teamScores.join('-')})`,
  );
});

test('Colosseum keeps human in active ring (never auto-hijacked by AI-vs-AI) and supports voluntary AI-vs-AI duel + Stop & Play', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  const mkClient = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const c = { ws, msgs: [], waiters: [] };
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      c.msgs.push(m);
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    c.send = (m) => ws.send(JSON.stringify(m));
    c.wait = (pred, ms = 5000) =>
      new Promise((res, rej) => {
        const found = c.msgs.find(pred);
        if (found) return res(found);
        const to = setTimeout(() => rej(new Error('timeout')), ms);
        c.waiters.push((m) => {
          if (!pred(m)) return false;
          clearTimeout(to);
          res(m);
          return true;
        });
      });
    c.open = new Promise((r) => ws.on('open', r));
    return c;
  };

  try {
    const human = mkClient();
    await human.open;

    human.send({ t: 'arena', name: 'sergio', priv: true, autoAi: true, initialAis: 3 });
    const joined = await human.wait((m) => m.t === 'joined' && m.mode === 'arena');
    assert.ok(joined.slot >= 0 && !joined.spectating, 'human spawns directly in the active Open Ring');

    const hub = srv.lobby.rooms.get(joined.code);
    const humanActor = hub.actors.get(joined.actorId);

    // 1. Even across repeated autonomous social ticks, AIs only challenge the human (withchatKey) and NEVER eject them!
    for (let k = 0; k < 6; k++) {
      hub.pendingChallenge = null;
      hub.idleChallengeCd = 0.01;
      hub.stepSocialAi(0.2);
      assert.equal(hub.state, 'idle', 'AIs never start an unrequested match behind the human player');
      assert.ok(humanActor.slot >= 0, 'human keeps active fighter slot and keyboard control');
      if (hub.pendingChallenge) {
        assert.equal(hub.pendingChallenge.targetId, humanActor.id, 'spontaneous AI challenge targets the human');
      }
    }

    const aiChat = await human.wait((m) => m.t === 'chat' && m.chatKey === 'aiChatChallenge');
    assert.ok(aiChat, 'AI challenge chat carries i18n chatKey for FR/EN client translation');

    // 2. Human voluntarily clicks "⚔ AI VS AI DUEL" -> enters Spectator Mode watching 2 AIs fight!
    hub.pendingChallenge = null;
    human.msgs.length = 0;
    human.send({ t: 'arena_ai_duel', map: 'neon', goal: 3, timeLimit: 90, rules: { noExplosives: true } });
    const specRole = await human.wait((m) => m.t === 'arena_role' && m.spectating === true);
    assert.equal(specRole.slot, -1);
    assert.equal(hub.state, 'countdown');

    // 3. Human clicks "⏹ STOP & PLAY" (`arena_stop`) -> AI exhibition stops and human reclaims active fighter slot!
    human.msgs.length = 0;
    human.send({ t: 'arena_stop' });
    const activeRole = await human.wait((m) => m.t === 'arena_role' && m.spectating === false);
    assert.ok(activeRole.slot >= 0, 'human immediately reclaims an active fighter slot in the ring');
    assert.equal(hub.state, 'idle');

    // 4. Verify `#arena-box` CSS positioning + FR strings are served properly
    const [cssRes, htmlRes, i18nRes] = await Promise.all([
      fetch(`http://127.0.0.1:${srv.port}/style.css`),
      fetch(`http://127.0.0.1:${srv.port}/`),
      fetch(`http://127.0.0.1:${srv.port}/js/i18n.js`),
    ]);
    const [css, html, i18n] = await Promise.all([cssRes.text(), htmlRes.text(), i18nRes.text()]);
    assert.ok(css.includes('#arena-box {') || css.includes('#arena-box\n'), '#arena-box inherits waitbox layout');
    assert.ok(css.includes('#arena-box .chip'), '#arena-box chips use compact HUD sizing');
    assert.ok(html.includes('id="btn-arena-aiduel"'), 'AI-vs-AI duel button present in HUD');
    assert.ok(html.includes('id="btn-spec-stop"'), 'Spectator Stop & Play button present in HUD');
    assert.ok(i18n.includes('REPRENDRE LA MAIN'), 'French translation for Stop & Play present');

    human.ws.close();
  } finally {
    await srv.close();
  }
});

test('Mobile & Tablet Twin-Stick Touch Controls: serves touch.js, HTML controls, settings toggle, and EN/FR i18n', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  try {
    const [htmlRes, touchRes, inputRes, cssRes, i18nRes] = await Promise.all([
      fetch(`http://127.0.0.1:${srv.port}/`),
      fetch(`http://127.0.0.1:${srv.port}/js/touch.js`),
      fetch(`http://127.0.0.1:${srv.port}/js/input.js`),
      fetch(`http://127.0.0.1:${srv.port}/style.css`),
      fetch(`http://127.0.0.1:${srv.port}/js/i18n.js`),
    ]);
    assert.equal(htmlRes.status, 200);
    assert.equal(touchRes.status, 200);
    assert.equal(inputRes.status, 200);
    assert.ok((touchRes.headers.get('cache-control') || '').includes('no-store'));

    const [html, touchSrc, inputSrc, css, i18n] = await Promise.all([
      htmlRes.text(),
      touchRes.text(),
      inputRes.text(),
      cssRes.text(),
      i18nRes.text(),
    ]);

    for (const id of [
      'touch-controls',
      'touch-move-zone',
      'touch-aim-zone',
      'touch-jump',
      'touch-fire',
      'touch-alt',
      'touch-melee',
      'touch-build',
      'touch-style',
      'touch-swap',
      'btn-touch',
      'btn-hud-fs',
      'btn-menu-fs',
    ]) {
      assert.ok(html.includes(`id="${id}"`), `HTML contains #${id}`);
    }
    assert.ok(html.includes('viewport-fit=cover'), 'mobile viewport supports safe-area notches');
    assert.ok(html.includes('"/js/touch.js"'), 'importmap includes /js/touch.js');
    assert.ok(touchSrc.includes('createTouchControls'), 'touch.js exports createTouchControls');
    assert.ok(inputSrc.includes('syncTouchCrosshair'), 'Input supports orbital twin-stick crosshair');
    assert.ok(css.includes('.touch-controls'), 'style.css defines touch-controls layout');
    assert.ok(i18n.includes('CONTRÔLES TACTILES') && i18n.includes('TOUCH CONTROLS'), 'EN/FR i18n strings present');
  } finally {
    await srv.close();
  }
});

test('GRAND HOTEL (55 floors) & AMAZON JUNGLE maps, Express Elevators, Bouncy Furniture & Chandelier Crush', () => {
  assert.ok(MAP_IDS.includes('hotel'), 'hotel is registered in MAP_IDS');
  assert.ok(MAP_IDS.includes('jungle'), 'jungle is registered in MAP_IDS');

  // Build every map in a single process to verify global 256-colour palette safety & spawn clearance.
  for (const id of Object.keys(MAPS)) {
    const m = buildMap(id, 2026);
    for (const [sx, sy] of m.spawns) {
      const fy = m.terrain.findStand(sx, sy);
      assert.equal(m.terrain.rectSolid(sx - PHYS.HALF_W, fy - PHYS.HEIGHT, sx + PHYS.HALF_W, fy), false, `${id} spawn [${sx},${sy}] is clear`);
    }
  }
  assert.ok(PALETTE.length < 235, `PALETTE stays safely below 256 (${PALETTE.length})`);

  // 1. GRAND HOTEL: Express Elevator ascent, brake, and descent
  const g = duel('hotel');
  assert.equal(g.terrain.w, 960);
  assert.equal(g.terrain.h, 2724);
  assert.equal(g.terrain.lifts.length, 2);

  const p0 = g.players[0];
  let seq = 1;
  const runTick = (b0) => {
    g.applyInput(0, { s: seq, b: b0, a: 0, w: 0, v: g.tick });
    g.applyInput(1, { s: seq, b: 0, a: Math.PI, w: 0, v: g.tick });
    seq++;
    g.update();
  };

  // Place player 0 at bottom of West Express Elevator shaft (cells 380..404 -> world x = 784)
  g.spawnAt(0, 784, g.terrain.findStand(784, 5350));
  p0.shield = 0;
  const startY = p0.y;
  for (let i = 0; i < 120; i++) runTick(BTN.JUMP);
  assert.ok(startY - p0.y > 1400, `Express Elevator climbs 15+ storeys in 2s (climbed ${Math.round(startY - p0.y)}px)`);
  assert.ok(p0.fuel >= 95, 'Express Elevator does not drain jetpack fuel');

  const midY = p0.y;
  for (let i = 0; i < 60; i++) runTick(BTN.DOWN);
  assert.ok(p0.y - midY > 600, `Holding DOWN in Express Elevator descends rapidly (dropped ${Math.round(p0.y - midY)}px)`);

  // 2. Bouncy King-Size Luxury Bed (open-air Rooftop Penthouse bed at ROOF_Y = 200 cells = 400px)
  g.spawnAt(0, 712, 330);
  p0.vy = 260;
  p0.grounded = false;
  let bouncedUp = false;
  for (let i = 0; i < 30; i++) {
    runTick(0);
    if (p0.vy < -700) bouncedUp = true;
  }
  assert.ok(bouncedUp, 'Dropping onto a hotel luxury bed launches the player skyward');

  // 3. Chandelier chain shot detaches chandelier as a real falling rigid body & shatters on the lobby floor
  // Floor 1 STREET_Y = 2700, ceilY = 2700 - 58 + 4 = 2646 cells = 5292 world px (chain at y = 5292..5308)
  g.op(0, 1, 960, 5298, 6, 0);
  let chandelierDetached = false;
  let chandelierLanded = false;
  for (let i = 0; i < 80; i++) {
    g.sim.step();
    if (g.sim.bodies.length > 0) chandelierDetached = true;
    if (g.sim.landings.length > 0) chandelierLanded = true;
  }
  assert.ok(chandelierDetached && chandelierLanded, 'Crystal chandelier detaches and crashes onto the floor when its chain is shot');

  // 4. Rift Room Service spawns interior drops inside GRAND HOTEL floors
  g.riftDrops = true;
  const drop = g.dropMystery();
  assert.ok(drop && drop.y > 120 && drop.y < g.worldH - 40, `Hotel mystery crate spawns indoors (y=${drop?.y})`);

  // 5. AMAZON JUNGLE: 3-tier rainforest + Waterfall Updrafts + Bouncy Giant Mushrooms
  const jg = duel('jungle');
  assert.equal(jg.terrain.w, 1800);
  assert.equal(jg.terrain.h, 740);
  assert.equal(jg.terrain.lifts.length, 2);
});

test('Rift Colosseum rule chips highlight (.chip.on) and arena_cfg applies rules & map live in Open Ring + challenges', async () => {
  const fs = await import('node:fs/promises');
  const [arenaJs, roomJs, css] = await Promise.all([
    fs.readFile(new URL('../public/js/ui/arena.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/ui/room.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/style.css', import.meta.url), 'utf8'),
  ]);
  assert.ok(arenaJs.includes("chip${on ? ' on active' : ''}"), 'arena.js toggles .on class on rule chips');
  assert.ok(roomJs.includes("chip${on ? ' on active' : ''}"), 'room.js toggles .on class on rule chips');
  assert.ok(css.includes('#ar-rules .chip.on'), 'style.css highlights selected Colosseum rule chips');

  const srv = await startServer({ port: 0, host: '127.0.0.1' });
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
  const msgs = [];
  let waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    msgs.push(m);
    waiters = waiters.filter((w) => !w(m));
  });
  const wait = (pred, ms = 4000) =>
    new Promise((res, rej) => {
      const found = msgs.find(pred);
      if (found) return res(found);
      const to = setTimeout(() => rej(new Error('timeout')), ms);
      waiters.push((m) => {
        if (!pred(m)) return false;
        clearTimeout(to);
        res(m);
        return true;
      });
    });

  try {
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ t: 'arena', name: 'sergio', priv: true, autoAi: false, initialAis: 1 }));
    const joined = await wait((m) => m.t === 'joined' && m.mode === 'arena');
    const hub = srv.lobby.rooms.get(joined.code);
    assert.ok(hub instanceof ArenaHub);

    msgs.length = 0;
    ws.send(
      JSON.stringify({
        t: 'arena_cfg',
        map: 'hotel',
        goal: 10,
        timeLimit: 180,
        rules: { pistolOnly: true, noJetpack: true },
      }),
    );

    const mapMsg = await wait((m) => m.t === 'map' && m.id === 'hotel');
    const infoMsg = await wait((m) => m.t === 'arena' && m.rules?.pistolOnly && m.rules?.noJetpack);
    assert.equal(mapMsg.id, 'hotel');
    assert.equal(infoMsg.goal, 10);
    assert.equal(infoMsg.timeLimit, 180);
    assert.equal(hub.game.players[joined.slot].owned, 1 << W.pistol, 'pistolOnly restricts Open Ring weapons immediately');
    assert.equal(hub.game.players[joined.slot].fuel, 0, 'noJetpack zeroes Open Ring jetpack fuel immediately');

    // Attempt to fire rocket in Open Ring -> scrubbed to pistol without foul point penalty in idle
    ws.send(JSON.stringify({ t: 'i', s: 1, b: BTN.FIRE, a: 0, w: W.rocket, v: hub.game.tick }));
    await new Promise((r) => setTimeout(r, 40));
    hub.tick();
    assert.equal(hub.game.players[joined.slot].w, W.pistol);
    assert.equal(hub.scores[joined.slot], 0, 'no foul penalty deducted during idle warm-up');

    // Start AI duel with configured rules, then stop -> idleRules stay preserved!
    hub.startAiExhibition({ map: 'hotel', goal: 10, timeLimit: 180, rules: { pistolOnly: true, noJetpack: true } });
    assert.equal(hub.activeRules.pistolOnly, true);
    hub.returnToOpenRing();
    assert.equal(hub.activeRules.pistolOnly, true, 'configured Colosseum rules persist on return to Open Ring');
    assert.equal(hub.activeRules.noJetpack, true);
  } finally {
    ws.close();
    await srv.close();
  }
});







