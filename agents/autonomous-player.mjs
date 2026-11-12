#!/usr/bin/env node
import WebSocket from 'ws';
import { BTN, PHYS } from '../shared/constants.js';
import { isWeaponForbidden } from '../shared/rules.js';
import { W, WEAPONS } from '../shared/weapons.js';

// External Autonomous AI Player for Neon Rift:
// Connects over the exact same WebSocket protocol as a human browser client and performs EVERY
// action a human can: joining the Colosseum (or a room code), challenging players, forming teams,
// spectating, calling SOS for reinforcements, choosing freely whether to help others, chatting,
// respecting custom Challenge Rules, and fighting at 60 Hz!
//
// Usage:
//   node agents/autonomous-player.mjs --url ws://localhost:3030/ws --name OMEGA-IA [--room ABCD]

function parseArgs(argv) {
  const out = { url: 'ws://localhost:3030/ws', name: 'OMEGA-IA', room: '', trait: 'loyal' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (argv[i] === '--name' && argv[i + 1]) out.name = argv[++i];
    else if (argv[i] === '--room' && argv[i + 1]) out.room = argv[++i];
    else if (argv[i] === '--trait' && argv[i + 1]) out.trait = argv[++i];
  }
  return out;
}

export function launchAutonomousAgent({ url = 'ws://localhost:3030/ws', name = 'OMEGA-IA', room = '', trait = 'loyal' } = {}) {
  const ws = new WebSocket(url);
  let seq = 0;
  let myActorId = null;
  let mySlot = -1;
  let spectating = false;
  let obs = null;
  let strafe = 1;
  let strafeTicks = 0;
  let handledChallengeId = null;
  let handledSosId = null;
  let idleTicks = 0;

  const send = (m) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(m));
  };

  ws.on('open', () => {
    if (room) send({ t: 'join', name, code: room.toUpperCase() });
    else send({ t: 'arena', name });
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t === 'pi') {
      send({ t: 'po', n: msg.n });
    } else if (msg.t === 'joined') {
      mySlot = msg.slot ?? -1;
      myActorId = msg.actorId || myActorId;
      spectating = Boolean(msg.spectating || mySlot < 0);
      send({ t: 'chat', scope: 'all', text: `${name} ONLINE — READY FOR CHALLENGES!` });
    } else if (msg.t === 'arena_role') {
      mySlot = msg.slot;
      spectating = Boolean(msg.spectating);
    } else if (msg.t === 'obs') {
      obs = msg;
      if (msg.me?.id) myActorId = msg.me.id;
      if (msg.me?.slot !== undefined) mySlot = msg.me.slot;
      spectating = Boolean(msg.me?.spectating || mySlot < 0);
    }
  });

  // Poll structured world observation at 15 Hz + drive 60 Hz controls & social decisions
  const obsInterval = setInterval(() => {
    if (ws.readyState === 1) send({ t: 'observe' });
  }, 66);

  const stepInterval = setInterval(() => {
    if (ws.readyState !== 1 || !obs) return;

    // 1. Social & Arena Decisions (challenges, teams, SOS calls & free-will reinforcement replies)
    if (obs.challenge && obs.challenge.id !== handledChallengeId && obs.challenge.targetId === myActorId) {
      handledChallengeId = obs.challenge.id;
      send({ t: 'chat', scope: 'all', text: 'CHALLENGE ACCEPTED!' });
      send({ t: 'challenge_reply', accept: true });
    }

    if (obs.sos && obs.sos.id !== handledSosId && spectating && obs.state === 'playing') {
      handledSosId = obs.sos.id;
      const help = trait === 'honorable' ? Math.random() < 0.2 : Math.random() < 0.8;
      send({ t: 'sos_reply', accept: help });
    }

    if (obs.state === 'idle' && !obs.challenge && Array.isArray(obs.roster) && obs.roster.length >= 2) {
      if (++idleTicks > 240) {
        idleTicks = 0;
        const others = obs.roster.filter((r) => r.id !== myActorId);
        if (others.length) {
          const target = others[Math.floor(Math.random() * others.length)];
          const spare = others.filter((r) => r.id !== target.id);
          const allies0 = spare.length >= 2 && Math.random() < 0.35 ? [spare[0].id] : [];
          const allies1 = allies0.length ? [spare[1].id] : [];
          send({
            t: 'challenge',
            targetId: target.id,
            allies0,
            allies1,
            map: 'neon',
            goal: 5,
            timeLimit: 120,
            rules: Math.random() < 0.4 ? { noExplosives: true } : {},
          });
        }
      }
    } else {
      idleTicks = 0;
    }

    // 2. 60 Hz Combat & Movement when in the ring!
    if (spectating || mySlot < 0) return;
    const me = obs.fighters?.[mySlot];
    if (!me || me.dead) return;

    // Call SOS if losing by >=2 points and rules allow!
    if (obs.state === 'playing' && !obs.sos && !obs.rules?.noSos && Array.isArray(obs.teamScores)) {
      const myT = me.team;
      if ((myT === 0 || myT === 1) && obs.teamScores[1 - myT] - obs.teamScores[myT] >= 2 && me.hp < 50) {
        send({ t: 'sos' });
      }
    }

    const enemies = (obs.fighters || []).filter(
      (f) => f && !f.dead && f.slot !== mySlot && (obs.state === 'idle' || f.team !== me.team),
    );
    let b = 0;
    let aim = 0;
    let w = W.pistol;

    if (--strafeTicks <= 0) {
      strafe = Math.random() < 0.5 ? -1 : 1;
      strafeTicks = 30 + Math.floor(Math.random() * 35);
    }

    if (enemies.length > 0) {
      enemies.sort((a, c) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(c.x - me.x, c.y - me.y));
      const tgt = enemies[0];
      const dx = tgt.x - me.x;
      const dy = tgt.y - 24 - (me.y - PHYS.AIM_Y);
      const dist = Math.hypot(dx, dy) || 1;
      aim = Math.atan2(dy, dx);

      // Pick best legal owned weapon
      for (const cand of [W.rifle, W.prism, W.smg, W.shotgun, W.rail, W.pistol]) {
        if (
          !isWeaponForbidden(obs.rules, cand) &&
          me.owned & (1 << cand) &&
          (WEAPONS[cand].ammo < 0 || me.ammo?.[cand] > 0)
        ) {
          w = cand;
          break;
        }
      }

      const moveDir = dist > 260 ? Math.sign(dx) : dist < 110 ? -Math.sign(dx) : strafe;
      if (moveDir < 0) b |= BTN.LEFT;
      else if (moveDir > 0) b |= BTN.RIGHT;
      if (tgt.y < me.y - 65 && !obs.rules?.noJetpack && me.fuel > 0.2) b |= BTN.JUMP;
      if (obs.state === 'playing' && dist < 680) b |= BTN.FIRE;
    } else {
      if (strafe < 0) b |= BTN.LEFT;
      else b |= BTN.RIGHT;
    }

    const s = ++seq;
    send({ t: 'i', l: [[s, b, Math.round(aim * 1000) / 1000, w, obs.tick || 0, 0]] });
  }, 16);

  const close = () => {
    clearInterval(obsInterval);
    clearInterval(stepInterval);
    ws.close();
  };
  ws.on('close', () => {
    clearInterval(obsInterval);
    clearInterval(stepInterval);
  });

  return { ws, close };
}

const isMain = process.argv[1] && process.argv[1].endsWith('autonomous-player.mjs');
if (isMain) {
  const cfg = parseArgs(process.argv);
  console.log(`[Neon Rift AI] Connecting as ${cfg.name} to ${cfg.url}...`);
  launchAutonomousAgent(cfg);
}
