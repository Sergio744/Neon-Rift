import { DT, RULES, SNAP_EVERY } from '../shared/constants.js';
import { MAPS, MAP_IDS } from '../shared/maps.js';
import { mulberry32, randomSeed } from '../shared/rng.js';
import {
  enforceRulesOnInput,
  hasAnyRule,
  sanitizeRules,
  sanitizeTimeLimit,
} from '../shared/rules.js';
import { FULL_POOL, W, poolStart, sanitizePool } from '../shared/weapons.js';
import { createArenaBot, stepArenaBot } from './arena-bot.js';
import { Game } from './game.js';
import { processInputs, queueInputs, resetInputs, send } from './inputs.js';

const MAX_FIGHTERS = 8;
const MAX_ACTORS = 12;
const SPAWN_GAP = 36;
const SPAWN_STEP = 48;

const AI_PROFILES = [
  { callsign: 'KAI', skill: 'ace', trait: 'honorable', favRules: { noExplosives: true } },
  { callsign: 'NOVA', skill: 'veteran', trait: 'loyal', favRules: {} },
  { callsign: 'ZED', skill: 'ace', trait: 'bold', favRules: { noBuild: true } },
  { callsign: 'LYRA', skill: 'veteran', trait: 'tactical', favRules: { noJetpack: true } },
  { callsign: 'VOLT', skill: 'rookie', trait: 'chaotic', favRules: { pistolOnly: true } },
  { callsign: 'ECHO', skill: 'veteran', trait: 'guardian', favRules: { noOrbs: true } },
];

// The Colosseum ("Arène du Rift"):
// Humans and Autonomous AI Citizens share one live social arena where ANY participant (Human or AI)
// can challenge another (Human or AI), form squads, set custom rules & timers, watch live as a
// spectator, call for mid-match reinforcements (SOS), and freely decide whether to jump in and help!
export class ArenaHub {
  constructor(code, { map = 'neon', pool = FULL_POOL, loadout = 'drops', autoAi = true, initialAis = 3 } = {}) {
    this.code = code;
    this.pub = false;
    this.isArena = true;
    this.max = MAX_FIGHTERS;
    this.mapId = MAPS[map] && !MAPS[map].hidden ? map : 'neon';
    this.pool = sanitizePool(pool);
    this.loadout = loadout === 'full' ? 'full' : 'drops';
    this.rng = mulberry32(randomSeed());
    this.autoAi = Boolean(autoAi);

    // Every participant in the Colosseum (human WebSocket client OR autonomous AI citizen):
    // actor = { id, kind: 'human'|'ai', name, client, ai, slot: -1..7, team: -1|0|1, wins: 0, losses: 0 }
    this.actors = new Map();
    this.nextActorSeq = 1;

    // Active ring slot mapping (0..7) -> actor
    this.ring = new Array(MAX_FIGHTERS).fill(null);
    this.clients = new Array(MAX_FIGHTERS).fill(null); // ring human clients for Comms/RTC compatibility
    this.bots = new Array(MAX_FIGHTERS).fill(null); // ring AI combat brains for stepArenaBot
    this.teams = new Array(MAX_FIGHTERS).fill(-1);
    this.scores = new Array(MAX_FIGHTERS).fill(0);
    this.deaths = new Array(MAX_FIGHTERS).fill(0);
    this.teamScores = [0, 0];
    this.foulCd = new Array(MAX_FIGHTERS).fill(0);
    this.foulCounts = new Array(MAX_FIGHTERS).fill(0);

    // Match / Challenge lifecycle: 'idle' (open ring) -> 'countdown' -> 'playing' -> 'over'
    this.mode = 'teams';
    this.state = 'idle';
    this.timer = 0;
    this.goal = 5;
    this.timeLimit = 120;
    this.matchTimer = 0;
    this.suddenDeath = false;
    this.activeRules = {};
    this.winner = -1;
    this.overCooldown = 0;

    // Pending challenge proposal & active mid-match SOS call
    this.pendingChallenge = null; // { id, fromId, targetId, allies0: [], allies1: [], map, goal, timeLimit, rules, expiresAt }
    this.activeSos = null; // { id, callerId, callerName, team, expiresAt, decided: Set<actorId> }
    this.socialAcc = 0;
    this.idleChallengeCd = 6.5;

    this.game = new Game(this.mapId, randomSeed(), MAX_FIGHTERS);
    this.game.onKill = (v, by) => this.onKill(v, by);
    this.applyPool();
    this.applyRules();

    for (let i = 0; i < initialAis; i++) this.spawnAiCitizen();
  }

  get humanActors() {
    const out = [];
    for (const a of this.actors.values()) if (a.kind === 'human' && a.client) out.push(a);
    return out;
  }

  get aiActors() {
    const out = [];
    for (const a of this.actors.values()) if (a.kind === 'ai') out.push(a);
    return out;
  }

  get humanCount() {
    return this.humanActors.length;
  }

  get count() {
    return this.actors.size;
  }

  get full() {
    return this.humanCount >= MAX_ACTORS;
  }

  actorForClient(client) {
    for (const a of this.actors.values()) if (a.client === client) return a;
    return null;
  }

  uniqueName(base) {
    const taken = new Set([...this.actors.values()].map((a) => a.name));
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) {
      const n = `${base.slice(0, 11 - String(i).length)}-${i}`;
      if (!taken.has(n)) return n;
    }
  }

  spawnAiCitizen(preferredCallsign) {
    if (this.actors.size >= MAX_ACTORS) return null;
    const usedProfiles = new Set(this.aiActors.map((a) => a.profile?.callsign));
    const prof =
      AI_PROFILES.find((p) => p.callsign === preferredCallsign && !usedProfiles.has(p.callsign)) ||
      AI_PROFILES.find((p) => !usedProfiles.has(p.callsign)) ||
      AI_PROFILES[this.aiActors.length % AI_PROFILES.length];

    const id = `ai${this.nextActorSeq++}`;
    const name = this.uniqueName(`${prof.callsign}-IA`);
    const actor = {
      id,
      kind: 'ai',
      name,
      client: null,
      profile: prof,
      skill: prof.skill,
      trait: prof.trait,
      slot: -1,
      team: -1,
      wins: 0,
      losses: 0,
      sosCd: 0,
    };
    this.actors.set(id, actor);
    if (this.state === 'idle') this.seatInOpenRing(actor);
    this.broadcast(this.info());
    return actor;
  }

  removeAiCitizen(actorId) {
    const a = actorId ? this.actors.get(actorId) : this.aiActors.at(-1);
    if (!a || a.kind !== 'ai') return false;
    if ((this.state === 'countdown' || this.state === 'playing') && a.slot >= 0) return false;
    this.unseatFromRing(a);
    this.actors.delete(a.id);
    if (this.pendingChallenge && (this.pendingChallenge.fromId === a.id || this.pendingChallenge.targetId === a.id)) {
      this.pendingChallenge = null;
    }
    this.broadcast(this.info());
    return true;
  }

  freeRingSlot() {
    for (let s = 0; s < MAX_FIGHTERS; s++) if (!this.ring[s]) return s;
    return -1;
  }

  seatInOpenRing(actor, team = -1) {
    let slot = this.freeRingSlot();
    if (slot < 0 && actor.kind === 'human') {
      // Let an AI step into the stands so a newly arrived human can warm up in the open ring!
      for (let s = MAX_FIGHTERS - 1; s >= 0; s--) {
        if (this.ring[s]?.kind === 'ai') {
          this.unseatFromRing(this.ring[s]);
          slot = s;
          break;
        }
      }
    }
    if (slot < 0) return -1;
    actor.slot = slot;
    actor.team = team;
    this.ring[slot] = actor;
    this.teams[slot] = team;
    if (actor.kind === 'human') {
      this.clients[slot] = actor.client;
      this.bots[slot] = null;
      resetInputs(actor.client, slot, slot % 2 === 0 ? 0 : Math.PI);
    } else {
      this.clients[slot] = null;
      this.bots[slot] = createArenaBot(slot, { name: actor.name, skill: actor.skill, rng: this.rng });
    }
    if (this.state === 'idle') {
      this.applyTeams();
      this.game.addPlayer(slot, this.game.pickSpawn(slot));
    }
    return slot;
  }

  unseatFromRing(actor) {
    const s = actor.slot;
    if (s < 0 || this.ring[s] !== actor) return;
    this.ring[s] = null;
    this.clients[s] = null;
    this.bots[s] = null;
    this.teams[s] = -1;
    this.scores[s] = 0;
    this.deaths[s] = 0;
    this.game.removePlayer(s);
    actor.slot = -1;
    actor.team = -1;
    if (actor.client) actor.client.slot = -1;
  }

  join(client) {
    if (this.actors.size >= MAX_ACTORS && this.aiActors.length > 0) {
      // Make room for a real player by letting an idle AI citizen step out
      const idleAi = this.aiActors.find((a) => a.slot < 0) || this.aiActors.at(-1);
      if (idleAi) this.removeAiCitizen(idleAi.id);
    }
    if (this.actors.size >= MAX_ACTORS) return -1;

    client.name = this.uniqueName(client.name);
    client.media = { mic: false, cam: false, vscope: 'all' };
    client.room = this;
    client.slot = -1;
    resetInputs(client, -1, 0);

    const id = `h${this.nextActorSeq++}`;
    const actor = {
      id,
      kind: 'human',
      name: client.name,
      client,
      profile: null,
      skill: null,
      trait: 'human',
      slot: -1,
      team: -1,
      wins: 0,
      losses: 0,
      sosCd: 0,
    };
    this.actors.set(id, actor);

    if (this.state === 'idle') {
      this.seatInOpenRing(actor);
    }

    send(client, {
      t: 'joined',
      code: this.code,
      slot: actor.slot,
      pub: false,
      mode: 'arena',
      actorId: actor.id,
      spectating: actor.slot < 0,
    });
    send(client, this.mapMsg());
    this.broadcast(this.info());
    this.broadcastMedia();
    return actor.slot;
  }

  leave(client) {
    const actor = this.actorForClient(client);
    if (!actor) return;
    const wasFighting = actor.slot >= 0 && (this.state === 'countdown' || this.state === 'playing');
    this.unseatFromRing(actor);
    client.room = null;
    this.actors.delete(actor.id);

    if (this.pendingChallenge && (this.pendingChallenge.fromId === actor.id || this.pendingChallenge.targetId === actor.id)) {
      this.pendingChallenge = null;
    }
    if (wasFighting) this.checkForfeitAfterLeave();
    if (this.humanCount === 0) return;
    this.broadcast(this.info());
    this.broadcastMedia();
  }

  checkForfeitAfterLeave() {
    const t0 = this.teamSize(0);
    const t1 = this.teamSize(1);
    if (t0 === 0 || t1 === 0) {
      this.finishChallenge(t0 > 0 ? 0 : t1 > 0 ? 1 : -1);
    }
  }

  teamSize(t) {
    let n = 0;
    for (let s = 0; s < MAX_FIGHTERS; s++) if (this.ring[s] && this.teams[s] === t) n++;
    return n;
  }

  applyPool() {
    const g = this.game;
    const drops = this.loadout === 'drops';
    const pistolOnly = Boolean(this.state !== 'idle' && this.activeRules?.pistolOnly);
    const noOrbs = Boolean(this.state !== 'idle' && (this.activeRules?.noOrbs || pistolOnly));
    g.pool = pistolOnly ? 1 << W.pistol : this.pool;
    g.riftDrops = drops && !noOrbs;
    g.startOwned = pistolOnly ? 1 << W.pistol : drops ? poolStart(this.pool) : this.pool;
    g.baseOwned = g.startOwned;
  }

  applyTeams() {
    for (let s = 0; s < MAX_FIGHTERS; s++) {
      this.game.team[s] = this.state === 'idle' ? s : this.teams[s] >= 0 ? this.teams[s] : s;
    }
  }

  applyRules() {
    const g = this.game;
    const drops = this.loadout === 'drops';
    const active = this.state === 'playing';
    const noOrbs = Boolean(active && (this.activeRules?.noOrbs || this.activeRules?.pistolOnly));
    g.allowFire = this.state !== 'countdown';
    g.scoring = active;
    g.cratesOn = active && !noOrbs;
    g.riftDrops = drops && !noOrbs;
    g.armoryOn = false;
    g.infiniteAmmo = this.state === 'idle' || !drops || Boolean(this.activeRules?.pistolOnly);
  }

  broadcast(msg) {
    const raw = JSON.stringify(msg);
    for (const a of this.humanActors) send(a.client, raw);
  }

  broadcastTeam(team, msg) {
    const raw = JSON.stringify(msg);
    for (const a of this.humanActors) {
      if (a.team === team) send(a.client, raw);
    }
  }

  broadcastChat(actor, text, scope = 'all') {
    const payload = {
      t: 'chat',
      slot: actor.slot >= 0 ? actor.slot : 0,
      name: actor.name,
      text,
      scope,
      team: actor.team,
      bot: actor.kind === 'ai',
    };
    if (scope === 'team' && actor.team >= 0) this.broadcastTeam(actor.team, payload);
    else this.broadcast(payload);
  }

  mediaInfo() {
    const states = new Array(MAX_FIGHTERS).fill(null);
    for (const a of this.humanActors) {
      if (a.slot >= 0 && a.client.media) {
        states[a.slot] = {
          mic: !!a.client.media.mic,
          cam: !!a.client.media.cam,
          vscope: a.client.media.vscope || 'all',
        };
      }
    }
    return { t: 'media', states };
  }

  broadcastMedia() {
    this.broadcast(this.mediaInfo());
  }

  mapMsg() {
    return { t: 'map', ...this.game.mapState() };
  }

  info() {
    const roster = [...this.actors.values()].map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      skill: a.skill,
      trait: a.trait,
      slot: a.slot,
      team: a.team,
      wins: a.wins,
      losses: a.losses,
      fighting: a.slot >= 0 && this.state !== 'idle',
    }));

    return {
      t: 'arena',
      code: this.code,
      st: this.state,
      mode: this.state === 'idle' ? 'ffa' : 'teams',
      max: MAX_FIGHTERS,
      map: this.mapId,
      goal: this.goal,
      timeLimit: this.timeLimit,
      matchTimer: Math.max(0, Math.ceil(this.matchTimer)),
      suddenDeath: this.suddenDeath,
      timer: Math.round(this.timer * 100) / 100,
      rules: this.activeRules,
      loadout: this.loadout,
      pool: this.pool,
      scores: this.scores,
      deaths: this.deaths,
      teams: this.teams,
      teamScores: this.teamScores,
      names: this.ring.map((a) => (a ? a.name : null)),
      bots: this.ring.map((a) => (a?.kind === 'ai' ? a.skill : null)),
      winner: this.winner,
      roster,
      challenge: this.pendingChallenge
        ? {
            id: this.pendingChallenge.id,
            fromId: this.pendingChallenge.fromId,
            fromName: this.actors.get(this.pendingChallenge.fromId)?.name || '?',
            targetId: this.pendingChallenge.targetId,
            targetName: this.actors.get(this.pendingChallenge.targetId)?.name || '?',
            allies0: this.pendingChallenge.allies0,
            allies1: this.pendingChallenge.allies1,
            map: this.pendingChallenge.map,
            goal: this.pendingChallenge.goal,
            timeLimit: this.pendingChallenge.timeLimit,
            rules: this.pendingChallenge.rules,
          }
        : null,
      sos: this.activeSos
        ? {
            id: this.activeSos.id,
            callerId: this.activeSos.callerId,
            callerName: this.activeSos.callerName,
            team: this.activeSos.team,
          }
        : null,
    };
  }

  // ---------- Challenges (Human <-> Human, Human <-> AI, AI <-> AI, 1v1 or Squads!) ----------

  proposeChallenge(fromActor, { targetId, allies0 = [], allies1 = [], map, goal, timeLimit, rules } = {}) {
    if (!fromActor || this.state === 'countdown' || this.state === 'playing') return false;
    if (this.pendingChallenge) return false;
    const target = this.actors.get(String(targetId || ''));
    if (!target || target.id === fromActor.id) return false;

    const pickedMap = MAPS[map] && !MAPS[map].hidden ? map : this.mapId;
    const pickedGoal = [3, 5, 10, 15].includes(Number(goal)) ? Number(goal) : 5;
    const pickedTime = sanitizeTimeLimit(timeLimit, 120);
    const pickedRules = sanitizeRules(rules);

    const cleanAllies = (arr, exclude) =>
      (Array.isArray(arr) ? arr : [])
        .map(String)
        .filter((id) => this.actors.has(id) && !exclude.has(id))
        .slice(0, 3);

    const ex = new Set([fromActor.id, target.id]);
    const a0 = cleanAllies(allies0, ex);
    for (const id of a0) ex.add(id);
    const a1 = cleanAllies(allies1, ex);

    this.pendingChallenge = {
      id: `ch-${Date.now()}-${Math.floor(this.rng() * 999)}`,
      fromId: fromActor.id,
      targetId: target.id,
      allies0: a0,
      allies1: a1,
      map: pickedMap,
      goal: pickedGoal,
      timeLimit: pickedTime,
      rules: pickedRules,
      aiWait: 1.0,
      ttl: 16,
    };
    this.broadcast(this.info());
    return true;
  }

  replyChallenge(actor, accept) {
    const ch = this.pendingChallenge;
    if (!ch || !actor) return false;
    if (actor.id !== ch.targetId && actor.id !== ch.fromId) return false;
    if (!accept || actor.id === ch.fromId) {
      if (actor.id === ch.targetId) this.broadcastChat(actor, 'CHALLENGE DECLINED.');
      this.pendingChallenge = null;
      this.idleChallengeCd = 6;
      this.broadcast(this.info());
      return true;
    }
    return this.beginChallenge(ch);
  }

  beginChallenge(ch) {
    const challenger = this.actors.get(ch.fromId);
    const defender = this.actors.get(ch.targetId);
    if (!challenger || !defender) {
      this.pendingChallenge = null;
      this.broadcast(this.info());
      return false;
    }

    this.pendingChallenge = null;
    this.activeSos = null;
    this.mapId = ch.map;
    this.goal = ch.goal;
    this.timeLimit = ch.timeLimit;
    this.matchTimer = ch.timeLimit;
    this.suddenDeath = false;
    this.activeRules = ch.rules;
    this.winner = -1;

    // Unseat everyone first so non-participants move cleanly to the spectator stands!
    for (const a of this.actors.values()) this.unseatFromRing(a);

    const side0 = [challenger, ...ch.allies0.map((id) => this.actors.get(id)).filter(Boolean)];
    const side1 = [defender, ...ch.allies1.map((id) => this.actors.get(id)).filter(Boolean)];

    this.state = 'countdown';
    this.timer = RULES.COUNTDOWN;
    this.applyPool();
    this.applyRules();
    this.game.reset(this.mapId, randomSeed());
    this.applyRules();

    for (const a of side0) this.seatInOpenRing(a, 0);
    for (const a of side1) this.seatInOpenRing(a, 1);
    this.applyTeams();

    this.placeFightersAtStart();
    this.game.takeEvents();
    this.scores.fill(0);
    this.deaths.fill(0);
    this.teamScores = [0, 0];
    this.foulCd.fill(0);
    this.foulCounts.fill(0);

    // Notify every human client of their live role (fighter slot vs spectator slot = -1) + fresh map!
    const mapPayload = this.mapMsg();
    for (const h of this.humanActors) {
      send(h.client, {
        t: 'arena_role',
        slot: h.slot,
        team: h.team,
        spectating: h.slot < 0,
      });
      send(h.client, mapPayload);
    }
    this.broadcast(this.info());
    this.broadcastMedia();
    return true;
  }

  placeFightersAtStart() {
    const g = this.game;
    const byX = g.spawns.map(([x], i) => ({ x, i })).sort((a, b) => a.x - b.x);
    const mid = g.worldW / 2;
    const halves = [byX.filter((p) => p.x < mid), byX.filter((p) => p.x >= mid).reverse()];
    const seen = [0, 0];
    const used = new Map();

    for (let s = 0; s < MAX_FIGHTERS; s++) {
      if (!this.ring[s]) continue;
      const t = this.teams[s] === 1 ? 1 : 0;
      const half = halves[t].length ? halves[t] : byX;
      const idx = half[seen[t]++ % half.length].i;
      g.present[s] = true;
      const k = used.get(idx) ?? 0;
      used.set(idx, k + 1);
      const [sx, sy] = g.spawns[idx];
      const base = g.terrain.findStand(sx, sy);
      let spot = null;
      if (k > 0) {
        const off = Math.ceil(k / 2) * SPAWN_GAP * (k % 2 ? 1 : -1);
        for (const x of [sx + off, sx - off]) {
          if (x < SPAWN_GAP || x > g.worldW - SPAWN_GAP) continue;
          const y = g.terrain.findStand(x, sy);
          if (Math.abs(y - base) <= SPAWN_STEP) {
            spot = [x, y];
            break;
          }
        }
      }
      if (spot) g.spawnAt(s, spot[0], spot[1]);
      else g.spawn(s, idx);
      g.players[s].btn = 0;
      if (this.activeRules?.noJetpack) g.players[s].fuel = 0;
    }
  }

  // ---------- Mid-Match SOS ("Appel à l'aide") & Voluntary Spectator Reinforcements ----------

  triggerSos(callerActor) {
    if (!callerActor || this.state !== 'playing') return false;
    if (callerActor.slot < 0 || callerActor.team < 0) return false;
    if (this.activeRules?.noSos) {
      if (callerActor.client) send(callerActor.client, { t: 'err', m: 'RULE: NO OUTSIDE HELP ALLOWED' });
      return false;
    }
    if (this.activeSos || callerActor.sosCd > 0) return false;
    if (this.freeRingSlot() < 0) return false;

    callerActor.sosCd = 18;
    this.activeSos = {
      id: `sos-${Date.now()}`,
      callerId: callerActor.id,
      callerName: callerActor.name,
      team: callerActor.team,
      ttl: 14,
      decided: new Set([callerActor.id]),
    };
    this.broadcastChat(callerActor, 'SOS! NEED BACKUP IN THE ARENA!', 'all');
    this.broadcast(this.info());
    return true;
  }

  answerSos(helperActor, accept) {
    const sos = this.activeSos;
    if (!sos || !helperActor || this.state !== 'playing') return false;
    if (helperActor.slot >= 0) return false; // already fighting in the ring!
    if (sos.decided.has(helperActor.id)) return false;
    sos.decided.add(helperActor.id);

    if (!accept) {
      if (helperActor.kind === 'ai' && this.rng() < 0.45) {
        this.broadcastChat(helperActor, 'HANDLE THIS DUEL YOURSELF!');
      }
      return true;
    }

    const slot = this.seatInOpenRing(helperActor, sos.team);
    if (slot < 0) return false;
    this.applyTeams();

    // Spawn the reinforcement right into the live fight on their chosen ally's side!
    const caller = this.actors.get(sos.callerId);
    const g = this.game;
    g.present[slot] = true;
    if (caller && caller.slot >= 0 && !g.players[caller.slot].dead) {
      const cp = g.players[caller.slot];
      const y = g.terrain.findStand(cp.x, cp.y);
      g.spawnAt(slot, cp.x, y);
    } else {
      g.spawn(slot, g.pickSpawn(slot));
    }
    if (this.activeRules?.noJetpack) g.players[slot].fuel = 0;

    if (helperActor.client) {
      send(helperActor.client, {
        t: 'arena_role',
        slot,
        team: sos.team,
        spectating: false,
      });
    }

    // Clear SOS once a reinforcement arrives (caller or opponent can call again later!)
    const callerName = sos.callerName;
    this.activeSos = null;
    this.broadcastChat(helperActor, `JUMPING IN TO HELP ${callerName}!`, 'all');
    this.broadcast({
      t: 'sos_joined',
      helperName: helperActor.name,
      callerName,
      team: sos.team,
      slot,
    });
    this.broadcast(this.info());
    this.broadcastMedia();
    return true;
  }

  // ---------- Referee Fouls, Kills, Timer & Return to Open Ring ----------

  handleFoul(slot, foul) {
    if (!foul || this.state !== 'playing' || (this.foulCd[slot] ?? 0) > 0) return;
    this.foulCd[slot] = 1.4;
    this.foulCounts[slot] = (this.foulCounts[slot] || 0) + 1;
    const p = this.game.players[slot];
    if (p && !p.dead) p.hp = Math.max(5, p.hp - 12);
    let pointPenalty = false;
    if (this.foulCounts[slot] % 3 === 0) {
      pointPenalty = true;
      const t = this.teams[slot];
      if (t === 0 || t === 1) this.teamScores[t] = Math.max(0, this.teamScores[t] - 1);
    }
    this.broadcast({
      t: 'foul',
      slot,
      name: this.ring[slot]?.name || `P${slot + 1}`,
      rule: foul,
      count: this.foulCounts[slot],
      pointPenalty,
    });
    this.broadcast(this.info());
  }

  onKill(victim, by) {
    if (this.state !== 'playing') return;
    this.deaths[victim]++;
    const kill = by >= 0 && by !== victim;
    if (kill) this.scores[by]++;
    const t = kill ? this.teams[by] : 1 - this.teams[victim];
    if (t === 0 || t === 1) {
      this.teamScores[t]++;
      if (this.teamScores[t] >= this.goal || (this.suddenDeath && this.teamScores[0] !== this.teamScores[1])) {
        this.finishChallenge(t);
        return;
      }
    }
    this.broadcast(this.info());
  }

  resolveTimeUp() {
    if (this.teamScores[0] !== this.teamScores[1]) {
      this.finishChallenge(this.teamScores[0] > this.teamScores[1] ? 0 : 1);
    } else {
      this.suddenDeath = true;
      this.broadcast(this.info());
    }
  }

  finishChallenge(winTeam) {
    this.state = 'over';
    this.winner = winTeam;
    this.overCooldown = 5.0;
    this.activeSos = null;
    if (winTeam === 0 || winTeam === 1) {
      for (let s = 0; s < MAX_FIGHTERS; s++) {
        const a = this.ring[s];
        if (!a) continue;
        if (this.teams[s] === winTeam) a.wins++;
        else a.losses++;
      }
    }
    this.applyRules();
    this.broadcast(this.info());
  }

  returnToOpenRing() {
    for (const a of this.actors.values()) this.unseatFromRing(a);
    this.state = 'idle';
    this.timer = 0;
    this.matchTimer = 0;
    this.suddenDeath = false;
    this.activeRules = {};
    this.activeSos = null;
    this.winner = -1;
    this.idleChallengeCd = 7.5;

    this.applyPool();
    this.applyRules();
    this.game.reset(this.mapId, randomSeed());
    this.applyRules();

    // Seat humans first in the open warm-up ring, then fill remaining warm-up slots with AIs
    for (const h of this.humanActors) this.seatInOpenRing(h, -1);
    for (const ai of this.aiActors) {
      if (this.freeRingSlot() >= 0) this.seatInOpenRing(ai, -1);
    }
    this.applyTeams();
    this.game.takeEvents();

    const mapPayload = this.mapMsg();
    for (const h of this.humanActors) {
      send(h.client, {
        t: 'arena_role',
        slot: h.slot,
        team: -1,
        spectating: h.slot < 0,
      });
      send(h.client, mapPayload);
    }
    this.broadcast(this.info());
    this.broadcastMedia();
  }

  // ---------- Autonomous AI Social & Decision Brain (1 Hz) ----------

  stepSocialAi(dt) {
    for (const a of this.actors.values()) {
      if (a.sosCd > 0) a.sosCd = Math.max(0, a.sosCd - dt);
    }

    // 1. Handle pending challenge TTL & AI target auto-response
    if (this.pendingChallenge) {
      const ch = this.pendingChallenge;
      ch.ttl -= dt;
      if (ch.ttl <= 0) {
        this.pendingChallenge = null;
        this.broadcast(this.info());
      } else {
        const target = this.actors.get(ch.targetId);
        if (target?.kind === 'ai') {
          ch.aiWait -= dt;
          if (ch.aiWait <= 0) {
            this.broadcastChat(target, 'CHALLENGE ACCEPTED! STEP INTO THE RIFT!');
            this.replyChallenge(target, true);
          }
        }
      }
    }

    // 2. Handle active SOS TTL & free-will AI spectator responses
    if (this.activeSos && this.state === 'playing') {
      const sos = this.activeSos;
      sos.ttl -= dt;
      if (sos.ttl <= 0) {
        this.activeSos = null;
        this.broadcast(this.info());
      } else {
        for (const ai of this.aiActors) {
          if (ai.slot >= 0 || sos.decided.has(ai.id)) continue;
          if (this.rng() > 0.45) continue; // stagger reaction naturally across 1-3 seconds
          const helpChance =
            ai.trait === 'loyal' || ai.trait === 'guardian'
              ? 0.85
              : ai.trait === 'chaotic' || ai.trait === 'tactical'
                ? 0.55
                : 0.18; // 'honorable' / 'bold' prefer fair 1v1s!
          this.answerSos(ai, this.rng() < helpChance);
          if (!this.activeSos) break;
        }
      }
    }

    if (!this.autoAi) return;

    // 3. Autonomous AI SOS call when losing or outnumbered in an active challenge!
    if (this.state === 'playing' && !this.activeSos && !this.activeRules?.noSos) {
      for (const ai of this.aiActors) {
        if (ai.slot < 0 || ai.sosCd > 0 || ai.trait === 'honorable') continue;
        const myTeam = ai.team;
        const oppTeam = 1 - myTeam;
        const deficit = this.teamScores[oppTeam] - this.teamScores[myTeam];
        const outnumbered = this.teamSize(oppTeam) > this.teamSize(myTeam);
        const p = this.game.players[ai.slot];
        if ((deficit >= 2 || (outnumbered && p && p.hp < 55)) && this.rng() < 0.35) {
          this.triggerSos(ai);
          break;
        }
      }
    }

    // 4. Autonomous AI spontaneous challenge creation when the Arena is idle!
    if (this.state === 'idle' && !this.pendingChallenge && this.actors.size >= 2) {
      this.idleChallengeCd -= dt;
      if (this.idleChallengeCd <= 0) {
        this.idleChallengeCd = 11 + this.rng() * 6;
        const ais = this.aiActors;
        if (ais.length > 0) {
          const challenger = ais[Math.floor(this.rng() * ais.length)];
          const others = [...this.actors.values()].filter((a) => a.id !== challenger.id);
          if (others.length > 0) {
            const target = others[Math.floor(this.rng() * others.length)];
            const mapPick = MAP_IDS[Math.floor(this.rng() * MAP_IDS.length)];
            const rules = this.rng() < 0.55 ? { ...(challenger.profile?.favRules || {}) } : {};
            // Occasionally propose a 2v2 team challenge if >=4 actors are in the Colosseum!
            let allies0 = [];
            let allies1 = [];
            const spare = others.filter((a) => a.id !== target.id);
            if (challenger.trait === 'tactical' && spare.length >= 2 && this.rng() < 0.45) {
              allies0 = [spare[0].id];
              allies1 = [spare[1].id];
            }
            const ok = this.proposeChallenge(challenger, {
              targetId: target.id,
              allies0,
              allies1,
              map: mapPick,
              goal: 5,
              timeLimit: 120,
              rules,
            });
            if (ok) {
              this.broadcastChat(
                challenger,
                allies0.length
                  ? `${target.name}, 2V2 SQUAD CHALLENGE ON ${MAPS[mapPick].name}!`
                  : `${target.name}, I CHALLENGE YOU TO A DUEL ON ${MAPS[mapPick].name}!`,
              );
            }
          }
        }
      }
    }
  }

  queueInputs(client, list) {
    if (client.slot < 0) return; // spectators don't drive a fighter
    queueInputs(client, list);
  }

  // Structured observation for external AI agents connected over WebSocket (`{ t: 'observe' }`).
  observeFor(client) {
    const actor = this.actorForClient(client);
    const g = this.game;
    return {
      t: 'obs',
      code: this.code,
      me: actor ? { id: actor.id, slot: actor.slot, team: actor.team, spectating: actor.slot < 0 } : null,
      state: this.state,
      map: this.mapId,
      tick: g.tick,
      goal: this.goal,
      timeLimit: this.timeLimit,
      matchTimer: Math.round(this.matchTimer * 10) / 10,
      suddenDeath: this.suddenDeath,
      rules: this.activeRules,
      teamScores: this.teamScores,
      challenge: this.info().challenge,
      sos: this.info().sos,
      roster: this.info().roster,
      fighters: this.ring.map((a, s) => {
        if (!a || !g.present[s]) return null;
        const p = g.players[s];
        return {
          slot: s,
          id: a.id,
          name: a.name,
          team: this.teams[s],
          x: Math.round(p.x),
          y: Math.round(p.y),
          vx: Math.round(p.vx),
          vy: Math.round(p.vy),
          hp: Math.round(p.hp),
          dead: p.dead,
          w: p.w,
          owned: p.owned,
          ammo: p.ammo,
          fuel: Math.round(p.fuel * 100) / 100,
          buff: p.buff,
        };
      }),
      items: g.items.map((it) => ({ kind: it.kind, x: Math.round(it.x), y: Math.round(it.y) })),
      projectiles: g.projs.slice(0, 24).map((pr) => ({
        k: pr.k, o: pr.o, x: Math.round(pr.x), y: Math.round(pr.y), vx: Math.round(pr.vx), vy: Math.round(pr.vy),
      })),
    };
  }

  tick() {
    const enforce = this.state === 'playing' && hasAnyRule(this.activeRules);
    for (let s = 0; s < MAX_FIGHTERS; s++) {
      if (this.foulCd[s] > 0) this.foulCd[s] = Math.max(0, this.foulCd[s] - DT);
    }

    processInputs(this.clients, (s, rawInp) => {
      if (enforce) {
        const { inp, foul } = enforceRulesOnInput(this.activeRules, this.game.players[s], rawInp);
        if (foul) this.handleFoul(s, foul);
        this.game.applyInput(s, inp);
      } else {
        this.game.applyInput(s, rawInp);
      }
    });

    for (let s = 0; s < MAX_FIGHTERS; s++) {
      if (this.bots[s] && this.game.present[s]) {
        // In Open Ring ('idle'), AI citizens gently spar/move around; in 'playing', full combat!
        const rawInp = stepArenaBot(this, s, this.bots[s], this.rng);
        const inp = enforce ? enforceRulesOnInput(this.activeRules, this.game.players[s], rawInp).inp : rawInp;
        this.game.applyInput(s, inp);
      }
    }

    this.game.update();

    if (this.state === 'countdown') {
      this.timer -= DT;
      if (this.timer <= 0) {
        this.state = 'playing';
        this.timer = 0;
        this.applyRules();
        this.broadcast(this.info());
      }
    } else if (this.state === 'playing' && this.timeLimit > 0 && !this.suddenDeath) {
      const prevSec = Math.ceil(this.matchTimer);
      this.matchTimer = Math.max(0, this.matchTimer - DT);
      const nextSec = Math.ceil(this.matchTimer);
      if (this.matchTimer <= 0) {
        this.resolveTimeUp();
      } else if (nextSec !== prevSec && (nextSec <= 10 || nextSec % 5 === 0)) {
        this.broadcast(this.info());
      }
    } else if (this.state === 'over') {
      this.overCooldown -= DT;
      if (this.overCooldown <= 0) this.returnToOpenRing();
    }

    this.socialAcc += DT;
    if (this.socialAcc >= 0.5) {
      const step = this.socialAcc;
      this.socialAcc = 0;
      this.stepSocialAi(step);
    }

    if (this.game.tick % SNAP_EVERY === 0) this.sendSnapshot();
  }

  sendSnapshot() {
    const snap = this.game.snapshot();
    snap.t = 's';
    snap.r = this.clients.map((c) => (c ? Math.round(c.rtt) : 0));
    const base = JSON.stringify(snap);
    for (const h of this.humanActors) {
      const ack = h.slot >= 0 ? h.client.ack : 0;
      send(h.client, `{"a":${ack},${base.slice(1)}`);
    }
  }
}
