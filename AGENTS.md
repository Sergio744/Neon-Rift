# Neon Rift — Architecture & Agent Guide

Open-source community stickman shooter on destructible falling-sand pixel maps: 1v1 duels, 2–8 player group rooms (FFA & teams), solo survival waves, and online co-op survival (up to 4 players). Authoritative Node.js server (`server/`), deterministic shared simulation (`shared/`, imported by both server and browser), static browser client (`public/`). Zero build step.

Inspired by and forked from [Stick Duel](https://github.com/Melvynx/stick-duel) by [Melvynx](https://melvynx.com) (MIT License). Independent, unofficial community project.

## Commands

- `npm install` (or `pnpm install`) — install the single runtime dependency (`ws`)
- `npm start` — start the server on `PORT` (default `3030`) and `HOST` (default `0.0.0.0`)
- `npm run dev` — start the server in watch mode (`node --watch server/index.js`)
- `npm test` — run the Node built-in test suite (`node --test`)

## Golden Rules

1. **Deterministic shared code:** `shared/` runs identically in Node.js and in the browser. Player physics, projectiles, and the falling-sand automaton must remain deterministic (use `shared/rng.js`, never `Math.random()` inside shared simulation steps) so client prediction and lockstep terrain replay never desync.
2. **Append-only wire IDs:** Weapon indices in `WEAPONS`, `ITEM` kinds, and `OP` terrain codes are serialized over the network wire format — **only ever append** new entries, never reorder or delete middle indices.
3. **Terrain mutations via `world.op()`:** Every terrain modification on the authority must go through `world.op()` so clients replay the exact same op `[simTick, OP, ...]`. Never mutate `terrain` arrays directly from gameplay code.
4. **License & asset hygiene:** Do not add proprietary audio/image/font files. Prefer procedural WebAudio (`public/js/audio-tools.js`) and pixel matrices (`public/js/sprites-tools.js`). Document any new open-source dependency or asset in `THIRD_PARTY_LICENSES.md`.
5. **Run tests before finishing:** Always run `npm test` and add unit/integration tests in `test/` when introducing new weapons, maps, or room rules.

## Module Map

Each file starts with a short header comment describing what it owns:

- `shared/game.js` — authoritative `Game` core (players, ticks, snapshots, armory timer). Behavior is mixed in from `shared/game/`:
  - `combat.js` — firing, melee shove, continuous tools
  - `blast.js` — damage, explosions, projectile flight
  - `items.js` — crates/ammo/packs, `grant`, `nextLocked`
  - `world.js` — `op` -> deterministic sandbox
- `shared/sim.js` — deterministic falling-sand automaton (`TerrainSim`). Lockstep: ops `[simTick, OP, ...]` are sent in snapshots (`o`, `os`, `st`) and replayed identically; late joiners receive `mapState()` (`{id, seed, ops, st}`).
- `shared/weapons.js` — `WEAPONS` stats, `UNLOCKS` order, `START_OWNED`/`ALL_OWNED`/`owns`, weapon pools (`FULL_POOL`, `BASIC_POOL`, `POOLS`, `sanitizePool`, `poolBar`, `poolStart`), `KILL_NAMES`.
- `shared/materials.js` — material behavior tables (sand, wood, metal, glass, TNT, bedrock, build pieces, etc.).
- `shared/maps/` — one procedural builder per map; `shared/maps.js` registers them (`w`/`h` in cells, `mapSize()` in world px; `canyon` is the large default for group rooms).
- `shared/modes.js` — online room modes (`duel`, `ffa`, `teams`), score goals, team names/colors.
- `shared/survival.js` — survival wave engine (`Survival`: waves, enemy roster, shared crew lives, revives) for 1–4 humans; bot AI in `shared/survival-bots.js`. Runs in the browser for solo and on the server for co-op.
- `server/` — `index.js` (HTTP static server + `/ws` WebSocket + `/healthz`), `lobby.js` (connections, matchmaking, 60 Hz tick loop), `room.js` (1v1 duel & 2–8 player group rooms in FFA/teams, host controls, late joins), `coop.js` (co-op survival room), `inputs.js` (input queues & snapshot fan-out).
- `public/js/game.js` — `ClientGame` core (prediction, render loop, `hud()`), with mixins in `public/js/client/`:
  - `shots.js` — weapon switching, predicted shot FX & ghost projectiles
  - `events.js` — server events, unlock banners, death gibs
  - `interp.js` — remote player/item/projectile interpolation
  - `terrain-sync.js` — lockstep op replay (`attach()` in solo mode)
  - `builder.js` — wall/floor ghost preview & material style picker
- `public/js/solo.js` — `SoloServer`: runs `Survival` locally in the browser for zero-latency offline/solo play.
- `public/js/ui/` — `hud.js` (hotbar, unlock banner, stamina, armory countdown, kill feed), `feel.js` (low-HP vignette/heartbeat, hit arcs, streak callouts, death recap), `room.js` (lobby, scoreboard, results), `controls.js` (chip/pool pickers).
- `public/js/main.js` — menus, pause settings (`localStorage`), room URL invites (`?room=CODE`), and wiring.
- Tool add-ons mixed into base classes: `fx-tools.js` (`Fx`), `audio-tools.js` (`Sfx`), `sprites-tools.js` (gun/pickup sprites).
