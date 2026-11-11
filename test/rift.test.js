import assert from 'node:assert/strict';
import { test } from 'node:test';
import WebSocket from 'ws';
import { BTN, BUFF, MAT_BEDROCK, PHYS } from '../shared/constants.js';
import { Game } from '../shared/game.js';
import { ITEM } from '../shared/game/items.js';
import { prismTrace } from '../shared/geom.js';
import { MAP_IDS, buildMap } from '../shared/maps.js';
import { createPlayer, packPlayer, unpackPlayer } from '../shared/player.js';
import { PROJ, VORTEX_P } from '../shared/projectiles.js';
import { Survival } from '../shared/survival.js';
import { FULL_POOL, PRISM, RIFT_POOL, W, WEAPONS, owns, poolStart, sanitizePool } from '../shared/weapons.js';
import { startServer } from '../server/index.js';
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


