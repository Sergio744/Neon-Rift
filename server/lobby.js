import { performance } from 'node:perf_hooks';
import { RULES, TICK_MS } from '../shared/constants.js';
import { MAPS, MAP_IDS, mapSize } from '../shared/maps.js';
import { MODES } from '../shared/modes.js';
import { POOLS, POOL_IDS, SELECTABLE, WEAPONS } from '../shared/weapons.js';
import { ArenaHub } from './arena-hub.js';
import { CoopRoom } from './coop.js';
import { Room } from './room.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_MSGS_PER_SEC = 240;
const PING_EVERY_MS = 1000;

export function cleanName(name) {
  const n = String(name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return n || 'PLAYER';
}

export function cleanChat(text) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

// Owns every connection and room, and drives all rooms from one fixed 60 Hz loop.
export class Lobby {
  constructor() {
    this.rooms = new Map();
    this.clients = new Set();
    this.nextClientId = 1;
    this.running = false;
  }

  start() {
    this.running = true;
    let last = performance.now();
    let acc = 0;
    let lastPing = 0;
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      acc += now - last;
      last = now;
      let steps = 0;
      while (acc >= TICK_MS && steps < 5) {
        for (const room of this.rooms.values()) room.tick();
        acc -= TICK_MS;
        steps++;
      }
      if (acc > TICK_MS * 5) acc = 0;
      if (now - lastPing > PING_EVERY_MS) {
        lastPing = now;
        this.pingAll(now);
      }
      this.timer = setTimeout(loop, Math.max(1, TICK_MS - acc - 1));
    };
    loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
  }

  stats() {
    return { rooms: this.rooms.size, players: this.clients.size };
  }

  pingAll(now) {
    const msg = JSON.stringify({ t: 'pi', n: Math.round(now) });
    for (const c of this.clients) if (c.ws.readyState === 1) c.ws.send(msg);
  }

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  send(client, msg) {
    if (client.ws.readyState === 1) client.ws.send(JSON.stringify(msg));
  }

  connect(ws) {
    const client = {
      id: this.nextClientId++, ws, name: 'PLAYER', room: null, slot: -1, rtt: 80,
      msgCount: 0, msgWindow: performance.now(),
      chatCount: 0, chatWindow: performance.now(),
      media: { mic: false, cam: false, vscope: 'all' },
    };
    this.clients.add(client);
    this.send(client, {
      t: 'hello',
      maps: MAP_IDS.map((id) => ({ id, name: MAPS[id].name, w: mapSize(id).w, h: mapSize(id).h })),
      goals: RULES.GOALS,
      modes: Object.entries(MODES).map(([id, m]) => ({ id, name: m.name, max: m.max, goals: m.goals })),
      weapons: SELECTABLE.map((w) => ({ w, name: WEAPONS[w].name })),
      pools: POOL_IDS.map((id) => ({ id, name: POOLS[id].name, mask: POOLS[id].mask })),
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const now = performance.now();
      if (now - client.msgWindow > 1000) {
        client.msgWindow = now;
        client.msgCount = 0;
      }
      if (++client.msgCount > MAX_MSGS_PER_SEC) return;
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg && typeof msg === 'object') this.handle(client, msg);
    });
    ws.on('close', () => this.disconnect(client));
    ws.on('error', () => this.disconnect(client));
  }

  disconnect(client) {
    if (!this.clients.has(client)) return;
    this.clients.delete(client);
    this.leaveRoom(client);
  }

  leaveRoom(client) {
    const room = client.room;
    if (!room) return;
    room.leave(client);
    const empty = room instanceof Room || room instanceof ArenaHub ? room.humanCount === 0 : room.count === 0;
    if (empty) this.rooms.delete(room.code);
  }

  createRoom(opts = {}) {
    const cfg = { loadout: opts.loadout === 'full' ? 'full' : 'drops', ...opts };
    cfg.loadout = opts.loadout === 'full' ? 'full' : 'drops';
    const room = cfg.arena
      ? new ArenaHub(this.newCode(), cfg)
      : cfg.coop
        ? new CoopRoom(this.newCode(), cfg)
        : new Room(this.newCode(), cfg);
    this.rooms.set(room.code, room);
    return room;
  }

  handle(client, msg) {
    switch (msg.t) {
      case 'i':
        if (client.room) client.room.queueInputs(client, msg.l);
        break;
      case 'po':
        if (Number.isFinite(msg.n)) {
          const rtt = Math.max(0, Math.min(2000, performance.now() - msg.n));
          client.rtt = client.rtt * 0.7 + rtt * 0.3;
        }
        break;
      case 'create': {
        this.leaveRoom(client);
        client.name = cleanName(msg.name);
        const room = this.createRoom({
          pub: false, map: msg.map, goal: Number(msg.goal), pool: msg.pool, mode: msg.mode,
          loadout: msg.loadout, timeLimit: msg.timeLimit, rules: msg.rules,
        });
        room.join(client);
        break;
      }
      case 'arena': {
        this.leaveRoom(client);
        client.name = cleanName(msg.name);
        let hub = null;
        if (!msg.priv) {
          for (const r of this.rooms.values()) {
            if (r instanceof ArenaHub && !r.priv && !r.full) {
              hub = r;
              break;
            }
          }
        }
        if (!hub) {
          hub = this.createRoom({
            arena: true,
            map: msg.map || 'neon',
            loadout: msg.loadout || 'drops',
            autoAi: msg.autoAi !== false,
            initialAis: Number.isInteger(msg.initialAis) ? Math.max(0, Math.min(6, msg.initialAis)) : 3,
          });
          hub.priv = Boolean(msg.priv);
        }
        hub.join(client);
        break;
      }
      case 'arena_add_ai':
        if (client.room instanceof ArenaHub) client.room.spawnAiCitizen(msg.callsign);
        break;
      case 'arena_rm_ai':
        if (client.room instanceof ArenaHub) client.room.removeAiCitizen(msg.id);
        break;
      case 'challenge':
        if (client.room instanceof ArenaHub) {
          const actor = client.room.actorForClient(client);
          client.room.proposeChallenge(actor, {
            targetId: msg.targetId,
            allies0: msg.allies0,
            allies1: msg.allies1,
            map: msg.map,
            goal: msg.goal,
            timeLimit: msg.timeLimit,
            rules: msg.rules,
          });
        }
        break;
      case 'challenge_reply':
        if (client.room instanceof ArenaHub) {
          const actor = client.room.actorForClient(client);
          client.room.replyChallenge(actor, Boolean(msg.accept));
        }
        break;
      case 'sos':
        if (client.room instanceof ArenaHub) {
          const actor = client.room.actorForClient(client);
          client.room.triggerSos(actor);
        }
        break;
      case 'sos_reply':
        if (client.room instanceof ArenaHub) {
          const actor = client.room.actorForClient(client);
          client.room.answerSos(actor, Boolean(msg.accept));
        }
        break;
      case 'observe':
        if (client.room instanceof ArenaHub) {
          this.send(client, client.room.observeFor(client));
        } else if (client.room instanceof Room) {
          const r = client.room;
          const g = r.game;
          this.send(client, {
            t: 'obs',
            code: r.code,
            me: { slot: client.slot, team: r.teams[client.slot] },
            state: r.state,
            map: r.mapId,
            tick: g.tick,
            goal: r.goal,
            timeLimit: r.timeLimit,
            matchTimer: Math.round(r.matchTimer * 10) / 10,
            rules: r.activeRules,
            scores: r.scores,
            teamScores: r.teamScores,
            fighters: Array.from({ length: r.max }, (_, s) => {
              if (!r.hasSlot(s) || !g.present[s]) return null;
              const p = g.players[s];
              return {
                slot: s, name: r.slotName(s), team: r.teams[s],
                x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy),
                hp: Math.round(p.hp), dead: p.dead, w: p.w, owned: p.owned, ammo: p.ammo,
              };
            }),
            items: g.items.map((it) => ({ kind: it.kind, x: Math.round(it.x), y: Math.round(it.y) })),
          });
        }
        break;
      case 'coop': {
        this.leaveRoom(client);
        client.name = cleanName(msg.name);
        this.createRoom({ coop: true, pool: msg.pool, map: msg.map, loadout: msg.loadout }).join(client);
        break;
      }
      case 'start':
        if (client.room) client.room.begin(client, msg.map);
        break;
      case 'setopts':
        if (client.room) {
          client.room.setOpts?.(client, {
            pool: msg.pool, goal: msg.goal, mode: msg.mode, map: msg.map,
            loadout: msg.loadout, timeLimit: msg.timeLimit, rules: msg.rules,
          });
        }
        break;
      case 'team':
        if (client.room instanceof Room) client.room.setTeam(client, msg.team, msg.slot);
        break;
      case 'addbot':
        if (client.room instanceof Room) client.room.addBot(client, { team: msg.team, skill: msg.skill });
        break;
      case 'rmbot':
        if (client.room instanceof Room) client.room.removeBot(client, msg.slot);
        break;
      case 'botskill':
        if (client.room instanceof Room) client.room.setBotSkill(client, msg.skill);
        break;
      case 'squads':
        if (client.room instanceof Room) client.room.upgradeToSquads(client, msg.mode);
        break;
      case 'order':
        if (client.room instanceof Room) client.room.issueOrder(client, String(msg.cmd ?? ''));
        break;
      case 'chat': {
        const room = client.room;
        if (!room) break;
        const now = performance.now();
        if (now - client.chatWindow > 3000) {
          client.chatWindow = now;
          client.chatCount = 0;
        }
        if (++client.chatCount > 6) break;
        const text = cleanChat(msg.text);
        if (!text) break;
        const isRoomTeams = room instanceof Room && room.mode === 'teams';
        const arenaActor = room instanceof ArenaHub ? room.actorForClient(client) : null;
        const isArenaTeams = Boolean(arenaActor && arenaActor.team >= 0 && room.state !== 'idle');
        const canTeam = isRoomTeams || isArenaTeams || room instanceof CoopRoom;
        const scope = msg.scope === 'team' && canTeam ? 'team' : 'all';
        const team = isRoomTeams ? room.teams[client.slot] : isArenaTeams ? arenaActor.team : -1;
        const slot = client.slot >= 0 ? client.slot : 0;
        const payload = { t: 'chat', slot, name: client.name, text, scope, team };
        if (scope === 'team' && (isRoomTeams || isArenaTeams) && team >= 0) room.broadcastTeam(team, payload);
        else room.broadcast(payload);
        break;
      }
      case 'media': {
        const room = client.room;
        if (!room) break;
        client.media = {
          mic: Boolean(msg.mic),
          cam: Boolean(msg.cam),
          vscope: msg.vscope === 'team' ? 'team' : 'all',
        };
        room.broadcastMedia?.();
        break;
      }
      case 'rtc': {
        const room = client.room;
        if (!room) break;
        const to = Number(msg.to);
        if (!Number.isInteger(to) || to < 0 || to === client.slot || to >= room.clients.length) break;
        const peer = room.clients[to];
        if (!peer || !msg.data || typeof msg.data !== 'object') break;
        this.send(peer, { t: 'rtc', from: client.slot, data: msg.data });
        break;
      }
      case 'join': {
        const code = String(msg.code ?? '').toUpperCase().trim();
        const room = this.rooms.get(code);
        if (!room) return this.send(client, { t: 'err', m: 'ROOM NOT FOUND' });
        if (room === client.room) {
          if (room instanceof Room && room.parked[client.slot]) room.unpark(client);
          return;
        }
        if (room.full) return this.send(client, { t: 'err', m: 'ROOM IS FULL' });
        this.leaveRoom(client);
        client.name = cleanName(msg.name);
        room.join(client);
        break;
      }
      case 'park':
        if (client.room instanceof Room) client.room.park(client);
        break;
      case 'unpark':
        if (client.room instanceof Room) client.room.unpark(client);
        break;
      case 'quick': {
        this.leaveRoom(client);
        client.name = cleanName(msg.name);
        let room = null;
        for (const r of this.rooms.values()) {
          if (r instanceof Room && r.mode === 'duel' && r.pub && r.count === 1 && r.state === 'waiting') {
            room = r;
            break;
          }
        }
        if (!room) room = this.createRoom({ pub: true, map: MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)], goal: 5 });
        room.join(client);
        break;
      }
      case 'rematch':
        if (client.room instanceof Room) client.room.requestRematch(client, msg.map);
        break;
      case 'setmap':
        if (client.room) client.room.setMap?.(client, String(msg.map ?? ''));
        break;
      case 'leave':
        this.leaveRoom(client);
        this.send(client, { t: 'lobby' });
        break;
      default:
        break;
    }
  }
}
