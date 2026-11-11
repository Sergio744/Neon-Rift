import { DT, RULES, SNAP_EVERY } from '../shared/constants.js';
import { MAPS } from '../shared/maps.js';
import { MODES } from '../shared/modes.js';
import { mulberry32, randomSeed } from '../shared/rng.js';
import { FULL_POOL, poolStart, sanitizePool } from '../shared/weapons.js';
import { BOT_CALLSIGNS, cleanSkill, createArenaBot, stepArenaBot } from './arena-bot.js';
import { Game } from './game.js';
import { processInputs, queueInputs, resetInputs, send, sendSnapshot } from './inputs.js';

const SPAWN_GAP = 36; // world px between players sharing a start spawn
const SPAWN_STEP = 48; // max ground height difference for that side-step

// One online match room supporting humans, tactical NPC bots, hybrid squads, and Rift Comms.
// - 'duel': two slots, the match starts as soon as 2 participants (humans or human+bot) are in.
//   Private duels can also upgrade live to 'teams' (8 slots) while keeping the same invite code!
// - 'ffa' / 'teams': group rooms of up to MODES[mode].max slots (humans + NPC bots).
export class Room {
  constructor(code, { pub = false, map, goal, pool = FULL_POOL, mode = 'duel', loadout = 'full' } = {}) {
    this.code = code;
    this.pub = pub;
    this.mode = MODES[mode] ? mode : 'duel';
    this.group = this.mode !== 'duel';
    this.max = MODES[this.mode].max;
    this.mapId = MAPS[map] ? map : this.group ? 'canyon' : 'neon';
    this.goal = MODES[this.mode].goals.includes(goal) ? goal : MODES[this.mode].goal;
    this.loadout = loadout === 'drops' ? 'drops' : 'full';
    this.clients = new Array(this.max).fill(null);
    this.bots = new Array(this.max).fill(null);
    this.botSkill = 'veteran';
    this.rng = mulberry32(randomSeed());
    this.parked = new Array(this.max).fill(false); // creator waiting in menu / solo while room stays reserved
    this.teams = new Array(this.max).fill(-1); // team of each slot in 'teams', -1 elsewhere
    this.host = -1;
    this.state = 'waiting';
    this.timer = 0;
    this.scores = new Array(this.max).fill(0); // kills (duel: points)
    this.deaths = new Array(this.max).fill(0);
    this.teamScores = [0, 0];
    this.winner = -1; // slot, or team in 'teams'
    this.rematch = new Array(this.max).fill(false);
    this.pool = sanitizePool(pool);
    this.game = new Game(this.mapId, randomSeed(), this.max);
    this.game.onKill = (v, by) => this.onKill(v, by);
    this.applyPool();
    this.applyRules();
  }

  hasSlot(s) {
    return Boolean(this.clients[s] || this.bots[s]);
  }

  slotName(s) {
    if (this.clients[s]) return this.clients[s].name;
    if (this.bots[s]) return this.bots[s].name;
    return null;
  }

  get humanCount() {
    let n = 0;
    for (const c of this.clients) if (c) n++;
    return n;
  }

  get botCount() {
    let n = 0;
    for (const b of this.bots) if (b) n++;
    return n;
  }

  get count() {
    return this.humanCount + this.botCount;
  }

  // Only truly full when all slots are taken by real human players; bots yield to incoming friends!
  get full() {
    return this.humanCount >= this.max;
  }

  // Takes effect on the next reset (match start, map change) and for waiting players right away.
  applyPool() {
    const g = this.game;
    const drops = this.loadout === 'drops';
    g.pool = this.pool;
    g.riftDrops = drops;
    g.startOwned = drops ? poolStart(this.pool) : this.pool;
    g.baseOwned = g.startOwned;
  }

  applyTeams() {
    for (let s = 0; s < this.max; s++) {
      this.game.team[s] = this.mode === 'teams' && this.teams[s] >= 0 ? this.teams[s] : s;
    }
  }

  broadcast(msg) {
    const raw = JSON.stringify(msg);
    for (let s = 0; s < this.max; s++) {
      if (this.clients[s] && !this.parked[s]) send(this.clients[s], raw);
    }
  }

  broadcastTeam(team, msg) {
    const raw = JSON.stringify(msg);
    for (let s = 0; s < this.max; s++) {
      if (this.clients[s] && !this.parked[s] && this.teams[s] === team) send(this.clients[s], raw);
    }
  }

  mediaInfo() {
    return {
      t: 'media',
      states: this.clients.map((c) =>
        c?.media ? { mic: !!c.media.mic, cam: !!c.media.cam, vscope: c.media.vscope || 'all' } : null,
      ),
    };
  }

  broadcastMedia() {
    this.broadcast(this.mediaInfo());
  }

  info() {
    return {
      t: 'room', code: this.code, mode: this.mode, max: this.max, host: this.host, st: this.state,
      timer: Math.round(this.timer * 100) / 100, goal: this.goal, scores: this.scores, deaths: this.deaths,
      teams: this.teams, teamScores: this.teamScores,
      names: Array.from({ length: this.max }, (_, s) => this.slotName(s)),
      bots: this.bots.map((b) => (b ? b.skill : null)),
      botSkill: this.botSkill,
      orders: this.bots.map((b) => (b ? b.order : null)),
      winner: this.winner, rematch: this.rematch, map: this.mapId, pub: this.pub, pool: this.pool, loadout: this.loadout,
    };
  }

  mapMsg() {
    return { t: 'map', ...this.game.mapState() };
  }

  // Only reads `game` and `state` (the arena harness borrows it for its headless matches).
  applyRules() {
    const g = this.game;
    const drops = this.loadout === 'drops';
    g.allowFire = this.state !== 'countdown';
    g.scoring = this.state === 'playing';
    g.cratesOn = this.state === 'playing';
    g.riftDrops = drops;
    g.armoryOn = false;
    g.infiniteAmmo = !drops || this.state === 'waiting';
  }

  isHost(client) {
    return !this.group || client.slot === this.host;
  }

  teamSize(t) {
    let n = 0;
    for (let s = 0; s < this.max; s++) if (this.hasSlot(s) && this.teams[s] === t) n++;
    return n;
  }

  smallerTeam() {
    return this.teamSize(1) < this.teamSize(0) ? 1 : 0;
  }

  // Enough participants for a match: at least 1 human, 2 total participants, and in 'teams' >=1 per side.
  canPlay() {
    if (this.humanCount < 1 || this.count < 2) return false;
    return this.mode !== 'teams' || (this.teamSize(0) > 0 && this.teamSize(1) > 0);
  }

  cantPlayMsg() {
    return this.mode === 'teams' && this.count >= 2 ? 'EACH TEAM NEEDS A PLAYER' : 'NEED AT LEAST 2 PLAYERS';
  }

  // Two participants never share a name in one room.
  uniqueName(name) {
    const taken = new Set();
    for (let s = 0; s < this.max; s++) {
      const nm = this.slotName(s);
      if (nm) taken.add(nm);
    }
    if (!taken.has(name)) return name;
    for (let i = 2; ; i++) {
      const n = `${name.slice(0, 11 - String(i).length)}-${i}`;
      if (!taken.has(n)) return n;
    }
  }

  freeSlot() {
    for (let s = 0; s < this.max; s++) {
      if (!this.clients[s] && !this.bots[s]) return s;
    }
    return -1;
  }

  // Evicts a bot slot so an incoming human friend can seamlessly take its place!
  evictBotForHuman() {
    // Prefer evicting from the larger team in 'teams', otherwise the last bot slot.
    let best = -1;
    for (let s = this.max - 1; s >= 0; s--) {
      if (!this.bots[s]) continue;
      if (best < 0) best = s;
      if (this.mode === 'teams' && this.teamSize(this.teams[s]) > this.teamSize(1 - this.teams[s])) {
        best = s;
        break;
      }
    }
    if (best < 0) return -1;
    const prevTeam = this.teams[best];
    this.bots[best] = null;
    this.game.removePlayer(best);
    this.scores[best] = 0;
    this.deaths[best] = 0;
    this.rematch[best] = false;
    this.teams[best] = prevTeam;
    return best;
  }

  join(client) {
    let slot = this.freeSlot();
    let inheritedTeam = -1;
    if (slot < 0) {
      slot = this.evictBotForHuman();
      if (slot >= 0) inheritedTeam = this.teams[slot];
    }
    if (slot < 0) return -1;

    client.name = this.uniqueName(client.name);
    client.media = { mic: false, cam: false, vscope: 'all' };
    this.clients[slot] = client;
    client.room = this;
    resetInputs(client, slot, slot % 2 === 0 ? 0 : Math.PI);
    if (this.host < 0 || !this.clients[this.host]) this.host = slot;
    this.scores[slot] = 0;
    this.deaths[slot] = 0;
    this.rematch[slot] = false;
    if (this.mode === 'teams') {
      this.teams[slot] = inheritedTeam >= 0 ? inheritedTeam : this.smallerTeam();
    }
    this.applyTeams();
    send(client, { t: 'joined', code: this.code, slot, pub: this.pub, mode: this.mode });

    // Wake any parked creator/host waiting in the menu or Solo Survival so they switch right in.
    for (let s = 0; s < this.max; s++) {
      if (s === slot || !this.parked[s] || !this.clients[s]) continue;
      this.parked[s] = false;
      resetInputs(this.clients[s], s, s % 2 === 0 ? 0 : Math.PI);
      if (this.group) this.game.addPlayer(s, this.game.pickSpawn(s));
      send(this.clients[s], {
        t: 'joined', code: this.code, slot: s, pub: this.pub, mode: this.mode, opponent: client.name,
      });
      if (this.group) send(this.clients[s], this.mapMsg());
    }

    if (!this.group && this.count === 2) {
      this.startMatch();
    } else {
      this.game.addPlayer(slot, this.group ? this.game.pickSpawn(slot) : slot);
      send(client, this.mapMsg());
      this.broadcast(this.info());
    }
    this.broadcastMedia();
    return slot;
  }

  // Upgrades a private 1v1 duel room in-place into an 8-slot Squads ('teams' or 'ffa') room
  // while keeping the exact same 4-letter invite code and connected players!
  upgradeToSquads(client, targetMode = 'teams') {
    if (this.pub || this.group || !this.isHost(client)) return false;
    if (this.state === 'countdown' || this.state === 'playing') return false;
    const nextMode = targetMode === 'ffa' ? 'ffa' : 'teams';
    const nextMax = MODES[nextMode].max;

    const oldClients = this.clients;
    const oldBots = this.bots;
    this.mode = nextMode;
    this.group = true;
    this.max = nextMax;
    if (!MODES[nextMode].goals.includes(this.goal)) this.goal = MODES[nextMode].goal;

    this.clients = new Array(nextMax).fill(null);
    this.bots = new Array(nextMax).fill(null);
    this.parked = new Array(nextMax).fill(false);
    this.teams = new Array(nextMax).fill(-1);
    this.scores = new Array(nextMax).fill(0);
    this.deaths = new Array(nextMax).fill(0);
    this.rematch = new Array(nextMax).fill(false);

    for (let s = 0; s < oldClients.length; s++) {
      if (oldClients[s]) this.clients[s] = oldClients[s];
      if (oldBots[s]) this.bots[s] = oldBots[s];
      if (nextMode === 'teams' && (oldClients[s] || oldBots[s])) {
        this.teams[s] = s % 2;
      }
    }
    this.host = this.clients.findIndex(Boolean);
    this.state = 'waiting';
    this.timer = 0;
    this.teamScores = [0, 0];
    this.winner = -1;

    this.game = new Game(this.mapId, randomSeed(), this.max);
    this.game.onKill = (v, by) => this.onKill(v, by);
    this.applyPool();
    this.applyRules();
    this.applyTeams();

    for (let s = 0; s < this.max; s++) {
      if (this.clients[s]) {
        resetInputs(this.clients[s], s, s % 2 === 0 ? 0 : Math.PI);
        send(this.clients[s], { t: 'joined', code: this.code, slot: s, pub: this.pub, mode: this.mode });
      }
      if (this.hasSlot(s)) {
        this.game.addPlayer(s, this.game.pickSpawn(s));
      }
    }
    this.broadcast(this.mapMsg());
    this.broadcast(this.info());
    this.broadcastMedia();
    return true;
  }

  addBot(client, { team, skill } = {}) {
    if (this.pub || !this.isHost(client)) return -1;
    if (this.state === 'countdown' || this.state === 'playing') return -1;
    const slot = this.freeSlot();
    if (slot < 0) {
      send(client, { t: 'err', m: 'ROOM IS FULL' });
      return -1;
    }
    if (skill) this.botSkill = cleanSkill(skill);

    let rawName = `BOT ${BOT_CALLSIGNS[slot % BOT_CALLSIGNS.length]}`;
    for (const cs of BOT_CALLSIGNS) {
      const cand = `BOT ${cs}`;
      let used = false;
      for (let s = 0; s < this.max; s++) if (this.slotName(s) === cand) used = true;
      if (!used) {
        rawName = cand;
        break;
      }
    }

    const bot = createArenaBot(slot, { name: this.uniqueName(rawName), skill: this.botSkill, rng: this.rng });
    if (this.mode === 'teams') {
      const t = team === 0 || team === 1 ? team : this.smallerTeam();
      this.teams[slot] = t;
      // Default allied bots to follow their human squadmate if one is on the same team.
      for (let s = 0; s < this.max; s++) {
        if (this.clients[s] && this.teams[s] === t) {
          bot.leader = s;
          break;
        }
      }
    }
    this.bots[slot] = bot;
    this.scores[slot] = 0;
    this.deaths[slot] = 0;
    this.rematch[slot] = true;
    this.applyTeams();

    if (!this.group && this.count === 2) {
      this.startMatch();
    } else if (this.state === 'waiting') {
      this.game.addPlayer(slot, this.group ? this.game.pickSpawn(slot) : slot);
      this.broadcast(this.info());
    } else {
      this.broadcast(this.info());
    }
    return slot;
  }

  removeBot(client, slot) {
    if (this.pub || !this.isHost(client)) return false;
    if (this.state === 'countdown' || this.state === 'playing') return false;
    let target = Number.isInteger(slot) ? slot : -1;
    if (target < 0 || target >= this.max || !this.bots[target]) {
      for (let s = this.max - 1; s >= 0; s--) {
        if (this.bots[s]) {
          target = s;
          break;
        }
      }
    }
    if (target < 0 || !this.bots[target]) return false;
    this.bots[target] = null;
    this.game.removePlayer(target);
    this.teams[target] = -1;
    this.scores[target] = 0;
    this.deaths[target] = 0;
    this.rematch[target] = false;
    this.broadcast({ t: 'left', slot: target });
    this.broadcast(this.info());
    return true;
  }

  setBotSkill(client, skill) {
    if (!this.isHost(client)) return;
    this.botSkill = cleanSkill(skill);
    for (const b of this.bots) if (b) b.skill = this.botSkill;
    this.broadcast(this.info());
  }

  // Human squadmates can command allied bots ('follow' | 'attack' | 'hold').
  issueOrder(client, cmd) {
    if (!['follow', 'attack', 'hold'].includes(cmd)) return false;
    const p = this.game.players[client.slot];
    const myTeam = this.mode === 'teams' ? this.teams[client.slot] : -1;
    let ackSlot = -1;
    for (let s = 0; s < this.max; s++) {
      const b = this.bots[s];
      if (!b) continue;
      const allied = this.mode === 'teams' ? this.teams[s] === myTeam : this.isHost(client);
      if (!allied) continue;
      b.order = cmd;
      b.leader = client.slot;
      if (cmd === 'hold' && p) {
        b.holdX = p.x;
        b.holdY = p.y;
      }
      if (ackSlot < 0) ackSlot = s;
    }
    if (ackSlot < 0) return false;
    this.broadcast(this.info());
    const lines = { follow: 'ON YOUR SIX!', attack: 'PUSHING IN!', hold: 'HOLDING ZONE!' };
    const ackMsg = {
      t: 'chat',
      slot: ackSlot,
      name: this.bots[ackSlot].name,
      text: lines[cmd],
      scope: this.mode === 'teams' ? 'team' : 'all',
      team: myTeam,
      bot: true,
    };
    if (this.mode === 'teams' && myTeam >= 0) this.broadcastTeam(myTeam, ackMsg);
    else this.broadcast(ackMsg);
    return true;
  }

  canPark(client) {
    return (
      !this.pub &&
      this.state === 'waiting' &&
      this.humanCount === 1 &&
      this.botCount === 0 &&
      this.clients[client.slot] === client &&
      this.isHost(client)
    );
  }

  // Keeps the private room reserved while its creator returns to the menu or plays Solo Survival.
  park(client) {
    if (!this.canPark(client) || this.parked[client.slot]) return false;
    const slot = client.slot;
    this.parked[slot] = true;
    client.queue = [];
    this.game.removePlayer(slot);
    send(client, { t: 'parked', code: this.code, mode: this.mode });
    return true;
  }

  // Brings a parked creator back into their waiting warm-up room.
  unpark(client) {
    const slot = client.slot;
    if (this.clients[slot] !== client || !this.parked[slot]) return false;
    this.parked[slot] = false;
    resetInputs(client, slot, slot % 2 === 0 ? 0 : Math.PI);
    if (this.state === 'waiting') {
      this.game.addPlayer(slot, this.group ? this.game.pickSpawn(slot) : slot);
    }
    send(client, { t: 'joined', code: this.code, slot, pub: this.pub, mode: this.mode });
    send(client, this.mapMsg());
    this.broadcast(this.info());
    this.broadcastMedia();
    return true;
  }

  leave(client) {
    const slot = client.slot;
    if (this.clients[slot] !== client) return;
    this.clients[slot] = null;
    this.parked[slot] = false;
    client.room = null;
    this.game.removePlayer(slot);
    this.teams[slot] = -1;
    this.scores[slot] = 0;
    this.deaths[slot] = 0;
    this.rematch[slot] = false;
    if (this.host === slot) this.host = this.clients.findIndex(Boolean);
    if (this.humanCount === 0) return;
    if (!this.group || (this.state !== 'waiting' && !this.canPlay())) {
      this.toWaiting();
      for (let s = 0; s < this.max; s++) {
        if (this.hasSlot(s) && !this.parked[s] && !this.game.present[s]) {
          this.game.addPlayer(s, this.group ? this.game.pickSpawn(s) : s);
        }
      }
    }
    this.broadcast({ t: 'left', slot });
    this.broadcast(this.info());
    this.broadcastMedia();
  }

  toWaiting() {
    this.state = 'waiting';
    this.timer = 0;
    this.resetScores();
    this.applyRules();
  }

  resetScores() {
    this.scores.fill(0);
    this.deaths.fill(0);
    this.teamScores = [0, 0];
    this.winner = -1;
    for (let s = 0; s < this.max; s++) this.rematch[s] = Boolean(this.bots[s]);
  }

  // Start spawn index per slot: duel slot i on spawn i; each team on its own half of the map,
  // from the edge inwards; free-for-all spread across the map in a random order.
  startSpawns() {
    const order = new Map();
    const slots = [];
    for (let s = 0; s < this.max; s++) if (this.hasSlot(s)) slots.push(s);
    if (!this.group) {
      for (const s of slots) order.set(s, s);
      return order;
    }
    const byX = this.game.spawns.map(([x], i) => ({ x, i })).sort((a, b) => a.x - b.x);
    if (this.mode === 'teams') {
      const mid = this.game.worldW / 2;
      const halves = [byX.filter((p) => p.x < mid), byX.filter((p) => p.x >= mid).reverse()];
      const seen = [0, 0];
      for (const s of slots) {
        const t = this.teams[s];
        const half = halves[t].length ? halves[t] : byX;
        order.set(s, half[seen[t]++ % half.length].i);
      }
      return order;
    }
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const n = slots.length;
    slots.forEach((s, k) => order.set(s, byX[n > 1 ? Math.round((k * (byX.length - 1)) / (n - 1)) % byX.length : 0].i));
    return order;
  }

  // Players sharing a spawn (more players than spawns) stand a body width apart, when the ground
  // there is at the same height; otherwise they share the spot and the spawn shield covers them.
  placeAtStart(order) {
    const g = this.game;
    const used = new Map();
    for (const [s, idx] of order) {
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
      g.players[s].btn = this.clients[s]?.last ? this.clients[s].last.b : 0;
    }
  }

  startMatch() {
    this.state = 'countdown';
    this.timer = RULES.COUNTDOWN;
    this.applyPool();
    this.applyRules();
    this.game.reset(this.mapId, randomSeed());
    this.applyRules();
    this.applyTeams();
    this.placeAtStart(this.startSpawns());
    this.game.takeEvents();
    this.resetScores();
    this.broadcast(this.mapMsg());
    this.broadcast(this.info());
  }

  // Group rooms: the host starts from the warm-up or the results screen.
  begin(client) {
    if (!this.group || !this.isHost(client)) return;
    if (this.state === 'countdown' || this.state === 'playing') return;
    if (!this.canPlay()) {
      send(client, { t: 'err', m: this.cantPlayMsg() });
      return;
    }
    this.startMatch();
  }

  onKill(victim, by) {
    if (this.state !== 'playing') return;
    this.deaths[victim]++;
    const kill = by >= 0 && by !== victim;
    let win = -1;
    if (this.mode === 'duel') {
      const point = kill ? by : 1 - victim;
      this.scores[point]++;
      if (this.scores[point] >= this.goal) win = point;
    } else if (this.mode === 'ffa') {
      // A suicide or a death to the world costs a point, never below zero.
      if (kill) this.scores[by]++;
      else this.scores[victim] = Math.max(0, this.scores[victim] - 1);
      if (kill && this.scores[by] >= this.goal) win = by;
    } else {
      if (kill) this.scores[by]++;
      const t = kill ? this.teams[by] : 1 - this.teams[victim];
      this.teamScores[t]++;
      if (this.teamScores[t] >= this.goal) win = t;
    }
    if (win >= 0) {
      this.state = 'over';
      this.winner = win;
      for (let s = 0; s < this.max; s++) if (this.bots[s]) this.rematch[s] = true;
      this.applyRules();
    }
    this.broadcast(this.info());
  }

  // Duel: both participants must ask (bots auto-accept). Group: host restarts right away, or when all humans ready.
  requestRematch(client, map) {
    if (this.state !== 'over' || this.count < 2) return;
    if (map && MAPS[map] && !MAPS[map].hidden && this.isHost(client)) this.mapId = map;
    this.rematch[client.slot] = true;
    for (let s = 0; s < this.max; s++) if (this.bots[s]) this.rematch[s] = true;
    if (this.group) {
      const all = this.clients.every((c, s) => !c || this.rematch[s]);
      if (client.slot === this.host || all) {
        if (this.canPlay()) return this.startMatch();
        if (client.slot === this.host) send(client, { t: 'err', m: this.cantPlayMsg() });
      }
      return this.broadcast(this.info());
    }
    if (this.rematch[0] && this.rematch[1]) this.startMatch();
    else this.broadcast(this.info());
  }

  setMap(client, map) {
    if (!MAPS[map] || (MAPS[map].hidden && map !== 'flat')) return;
    if (this.state === 'countdown' || this.state === 'playing' || !this.isHost(client)) return;
    this.mapId = map;
    if (this.state === 'waiting') {
      this.game.reset(this.mapId, randomSeed());
      this.applyTeams();
      for (let s = 0; s < this.max; s++) {
        if (this.hasSlot(s) && !this.parked[s]) this.game.addPlayer(s, this.group ? this.game.pickSpawn(s) : s);
      }
      this.game.takeEvents();
      this.broadcast(this.mapMsg());
    }
    this.broadcast(this.info());
  }

  // `pool`, `loadout` and `goal` any room; `mode` (FFA <-> TEAMS) in group rooms. Host only in group rooms.
  setOpts(client, { pool, goal, mode, loadout } = {}) {
    if (this.state === 'countdown' || this.state === 'playing' || !this.isHost(client)) return;
    if (loadout === 'drops' || loadout === 'full') this.loadout = loadout;
    if (pool !== undefined || loadout === 'drops' || loadout === 'full') {
      if (pool !== undefined) this.pool = sanitizePool(pool, this.pool);
      this.applyPool();
      this.applyRules();
      if (this.state === 'waiting') {
        for (let s = 0; s < this.max; s++) {
          const p = this.game.players[s];
          if (!this.hasSlot(s)) continue;
          p.owned = this.game.baseOwned;
          if (!(p.owned & (1 << p.w))) p.w = 0;
        }
      }
    }
    if (this.group && MODES[mode] && mode !== 'duel' && mode !== this.mode) {
      this.mode = mode;
      this.teams.fill(-1);
      if (mode === 'teams') {
        for (let s = 0; s < this.max; s++) if (this.hasSlot(s)) this.teams[s] = this.smallerTeam();
      }
      this.applyTeams();
      if (!MODES[mode].goals.includes(this.goal)) this.goal = MODES[mode].goal;
      this.resetScores();
    }
    const n = Number(goal);
    if (MODES[this.mode].goals.includes(n)) this.goal = n;
    this.broadcast(this.info());
  }

  // Anyone can switch side in 'teams' outside a running match; host can also move bots via `slot`.
  setTeam(client, team, targetSlot) {
    if (this.mode !== 'teams' || (team !== 0 && team !== 1)) return;
    if (this.state === 'countdown' || this.state === 'playing') return;
    let s = client.slot;
    if (Number.isInteger(targetSlot) && targetSlot >= 0 && targetSlot < this.max && this.bots[targetSlot] && this.isHost(client)) {
      s = targetSlot;
    }
    this.teams[s] = team;
    this.applyTeams();
    this.broadcast(this.info());
  }

  queueInputs(client, list) {
    if (this.parked[client.slot]) return;
    queueInputs(client, list);
  }

  tick() {
    processInputs(
      this.clients.map((c, s) => (this.parked[s] ? null : c)),
      (s, inp) => this.game.applyInput(s, inp),
    );
    for (let s = 0; s < this.max; s++) {
      if (this.bots[s] && this.game.present[s]) {
        const inp = stepArenaBot(this, s, this.bots[s], this.rng);
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
    }
    if (this.game.tick % SNAP_EVERY === 0) this.sendSnapshot();
  }

  sendSnapshot() {
    sendSnapshot(
      this.clients.map((c, s) => (this.parked[s] ? null : c)),
      this.game.snapshot(),
    );
  }
}
