import { SNAP_EVERY } from '../shared/constants.js';
import { MAPS } from '../shared/maps.js';
import { randomSeed } from '../shared/rng.js';
import { MAX_HUMANS, Survival } from '../shared/survival.js';
import { FULL_POOL, sanitizePool } from '../shared/weapons.js';
import { processInputs, queueInputs, resetInputs, send, sendSnapshot } from './inputs.js';

// Online co-op survival: up to MAX_HUMANS players against waves on any playable map.
// Defaults to `loadout = 'drops'` (light start + finite ammo + contextual mystery crates + Rift orbs),
// with `'full'` (all weapons + infinite ammo) available as a lobby option.
export class CoopRoom {
  constructor(code, { pool = FULL_POOL, map = 'neon', loadout = 'drops' } = {}) {
    this.code = code;
    this.pub = false;
    this.clients = new Array(MAX_HUMANS).fill(null);
    this.state = 'lobby';
    this.mapId = MAPS[map] && !MAPS[map].hidden ? map : 'neon';
    this.loadout = loadout === 'full' ? 'full' : 'drops';
    this.pool = sanitizePool(pool);
    this.run = new Survival(randomSeed(), {
      lobby: true, pool: this.pool, map: this.mapId,
      unlockAll: this.loadout === 'full', riftDrops: this.loadout === 'drops',
    });
  }

  get game() {
    return this.run.game;
  }

  get count() {
    return this.clients.filter(Boolean).length;
  }

  get full() {
    return this.count >= MAX_HUMANS;
  }

  broadcast(msg) {
    const raw = JSON.stringify(msg);
    for (const c of this.clients) send(c, raw);
  }

  info() {
    return {
      t: 'coop', code: this.code, st: this.state, pool: this.pool, map: this.mapId, loadout: this.loadout,
      names: this.clients.map((c) => (c ? c.name : null)),
    };
  }

  mapMsg() {
    return { t: 'map', ...this.game.mapState() };
  }

  join(client) {
    const slot = this.clients.indexOf(null);
    this.clients[slot] = client;
    client.room = this;
    resetInputs(client, slot);
    send(client, { t: 'joined', code: this.code, slot, pub: false, mode: 'coop' });
    this.run.addHuman(slot);
    send(client, this.mapMsg());
    this.broadcast(this.info());
    return slot;
  }

  leave(client) {
    const slot = client.slot;
    if (this.clients[slot] !== client) return;
    this.clients[slot] = null;
    client.room = null;
    this.run.removeHuman(slot);
    this.broadcast({ t: 'left', slot });
    this.broadcast(this.info());
  }

  setMap(_client, map) {
    if (this.state === 'playing' || !MAPS[map] || MAPS[map].hidden || map === this.mapId) return;
    this.mapId = map;
    if (this.state === 'lobby') {
      this.run.setMap(map);
      this.broadcast(this.mapMsg());
    }
    this.broadcast(this.info());
  }

  // Anyone in the lobby (or on the game over panel) can change the weapon pool, loadout or map of the next run.
  setOpts(_client, { pool, map, loadout } = {}) {
    if (this.state === 'playing') return;
    let changed = false;
    if (map && MAPS[map] && !MAPS[map].hidden && map !== this.mapId) {
      this.mapId = map;
      if (this.state === 'lobby') {
        this.run.setMap(map);
        this.broadcast(this.mapMsg());
      }
      changed = true;
    }
    if ((loadout === 'drops' || loadout === 'full') && loadout !== this.loadout) {
      this.loadout = loadout;
      if (this.state === 'lobby') this.run.setLoadout(this.loadout);
      changed = true;
    }
    if (pool !== undefined) {
      const next = sanitizePool(pool, this.pool);
      if (next !== this.pool) {
        this.pool = next;
        if (this.state === 'lobby') {
          this.run.setPool(this.pool);
          this.broadcast(this.mapMsg());
        }
        changed = true;
      }
    }
    if (changed) this.broadcast(this.info());
  }

  // Anyone in the crew can start (or retry after game over).
  begin(_client, map) {
    if (this.state === 'playing' || this.count < 1) return;
    if (map && MAPS[map] && !MAPS[map].hidden) this.mapId = map;
    this.state = 'playing';
    this.run = new Survival(randomSeed(), {
      pool: this.pool, map: this.mapId,
      unlockAll: this.loadout === 'full', riftDrops: this.loadout === 'drops',
    });
    for (let s = 0; s < MAX_HUMANS; s++) if (this.clients[s]) this.run.addHuman(s);
    this.game.takeEvents();
    this.broadcast(this.mapMsg());
    this.broadcast(this.info());
  }

  queueInputs(client, list) {
    queueInputs(client, list);
  }

  tick() {
    processInputs(this.clients, (s, inp) => this.run.applyInput(s, inp));
    this.run.step();
    const events = this.run.takeEvents();
    if (this.state === 'playing' && events.some((e) => e.e === 'over')) {
      this.state = 'over';
      this.broadcast(this.info());
    }
    if (events.length) this.pendingEvents = (this.pendingEvents || []).concat(events);
    if (this.game.tick % SNAP_EVERY === 0) {
      const snap = this.game.snapshot();
      snap.sv = this.run.state();
      snap.se = this.pendingEvents || [];
      this.pendingEvents = null;
      sendSnapshot(this.clients, snap);
    }
  }
}
