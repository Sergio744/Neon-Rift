import { MAPS } from '/shared/maps.js';
import { SURVIVAL_SLOTS, Survival } from '/shared/survival.js';
import { FULL_POOL, sanitizePool } from '/shared/weapons.js';

const PLAYER = 0;

// Local stand-in for the online server in solo survival: runs shared/survival.js in the browser
// with one human, full map & weapon pool parity with online modes, and defaults to `loadout = 'drops'`
// (light start + finite ammo + contextual mystery weapon crates + temporary Rift boost orbs).
export class SoloServer {
  constructor(client, { onSnapshot } = {}) {
    this.client = client;
    this.onSnapshot = onSnapshot;
    this.active = false;
    this.paused = false;
    this.state = 'lobby';
    this.mapId = 'neon';
    this.loadout = 'drops';
    this.pool = FULL_POOL;
    this.name = 'PLAYER';
    this.run = null;
  }

  get game() {
    return this.run?.game ?? null;
  }

  mountRun({ lobby }) {
    const seed = (Math.random() * 2 ** 31) | 0;
    this.run = new Survival(seed, {
      lobby, pool: this.pool, map: this.mapId,
      unlockAll: this.loadout === 'full', riftDrops: this.loadout === 'drops',
    });
    this.queue = [];
    const c = this.client;
    c.setSlot(PLAYER);
    c.names = new Array(SURVIVAL_SLOTS).fill('');
    c.names[PLAYER] = this.name;
    c.interp = 2;
    c.roomState = 'playing';
    c.offset = null;
    c.loadMap({ id: this.mapId, seed, wp: this.pool }, this.run.game);
    c.pending = [];
    this.ack = c.seq;
    this.run.addHuman(PLAYER);
    this.state = lobby ? 'lobby' : 'playing';
    this.active = true;
    this.paused = false;
    this.flush();
  }

  openLobby(name, { map, pool, loadout } = {}) {
    this.name = name || this.name;
    if (map && MAPS[map] && !MAPS[map].hidden) this.mapId = map;
    if (loadout === 'drops' || loadout === 'full') this.loadout = loadout;
    if (pool !== undefined) this.pool = sanitizePool(pool, this.pool);
    this.mountRun({ lobby: true });
  }

  begin(map) {
    if (map && MAPS[map] && !MAPS[map].hidden) this.mapId = map;
    this.mountRun({ lobby: false });
  }

  start(name, { map, pool, loadout } = {}) {
    this.name = name || this.name;
    if (map && MAPS[map] && !MAPS[map].hidden) this.mapId = map;
    if (loadout === 'drops' || loadout === 'full') this.loadout = loadout;
    if (pool !== undefined) this.pool = sanitizePool(pool, this.pool);
    this.mountRun({ lobby: false });
  }

  setMap(map) {
    if (!MAPS[map] || MAPS[map].hidden || map === this.mapId) return;
    this.mapId = map;
    if (this.active && this.state === 'lobby') this.mountRun({ lobby: true });
  }

  setPool(pool) {
    const next = sanitizePool(pool, this.pool);
    if (next === this.pool) return;
    this.pool = next;
    if (this.active && this.state === 'lobby' && this.run) {
      this.run.setPool(this.pool);
      this.client.pool = this.pool;
      this.flush();
    }
  }

  setLoadout(loadout) {
    if ((loadout !== 'drops' && loadout !== 'full') || loadout === this.loadout) return;
    this.loadout = loadout;
    if (this.active && this.state === 'lobby' && this.run) {
      this.run.setLoadout(this.loadout);
      this.flush();
    }
  }

  stop() {
    this.active = false;
    this.paused = false;
  }

  send(msg) {
    if (!this.active || msg.t !== 'i') return;
    for (const row of msg.l) {
      this.queue.push({ s: row[0], b: row[1], a: row[2], w: row[3], v: row[4], k: row[5] | 0 });
    }
  }

  step() {
    if (!this.active || this.paused) return;
    if (this.state === 'playing' && this.run.over && this.run.overSent) this.state = 'over';
    for (const inp of this.queue) {
      this.run.applyInput(PLAYER, inp);
      this.ack = inp.s;
    }
    this.queue = [];
    this.run.step();
    this.client.sync.afterStep();
    this.flush();
  }

  flush() {
    const snap = this.run.game.snapshot();
    snap.a = this.ack;
    snap.sv = this.run.state();
    snap.se = this.run.takeEvents();
    this.onSnapshot?.(snap);
    this.client.onSnapshot(snap);
  }
}
