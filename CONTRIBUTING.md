# Contributing to Neon Rift / Contribuer à Neon Rift

[🇬🇧 English](#english) | [🇫🇷 Français](#français)

---

<a id="english"></a>

## 🇬🇧 English

Welcome! **Neon Rift** is a free, community-built game — whether you want to design a crazy new weapon, paint a destructible pixel map, improve bot AI, polish neon FX, or fix a bug, your contributions are warmly welcome!

### 1. Development Workflow

1. **Fork** the repository on GitHub and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/Neon-Rift.git
   cd Neon-Rift
   npm install
   ```
2. Create a descriptive feature or fix branch:
   ```bash
   git checkout -b feat/gravity-rifle
   ```
3. Run the live dev server (`http://localhost:3030`):
   ```bash
   npm run dev
   ```
4. Run the automated test suite and make sure everything passes:
   ```bash
   npm test
   ```
5. Commit your changes with clear messages and open a **Pull Request** against `main`.

### 2. Crucial Architecture Rules (Must Read!)

Because Neon Rift runs a **60 Hz authoritative multiplayer server** with client-side prediction and lockstep destructible terrain, keep these 4 rules in mind:

1. **`shared/` Must Stay Deterministic:**
   Code in `shared/` runs in both Node.js and the browser. Never call `Math.random()` or `Date.now()` inside shared simulation ticks — use the seeded PRNG (`shared/rng.js`) so server and client stay in lockstep.
2. **Wire IDs Are Append-Only:**
   Weapon indices in `shared/weapons.js`, item kinds (`ITEM`), and terrain operation codes (`OP` in `shared/sim.js`) are sent over WebSockets as compact integers. **Always append new items at the end** — never delete or reorder existing entries.
3. **Mutate Terrain Only Through `world.op()`:**
   Never write directly to `terrain.mat` during a match. Always trigger an operation via `this.op(...)` (`shared/game/world.js`) so connected clients replay the exact same destruction op.
4. **Zero Proprietary Assets:**
   Sound effects are procedural WebAudio (`public/js/audio.js`, `public/js/audio-tools.js`) and sprites are procedural pixel matrices (`public/js/sprites.js`, `public/js/sprites-tools.js`). If you add any external open-source library or font, verify its license (MIT / OFL / CC0 / CC-BY) and document it in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

### 3. Quick Recipes

#### 🗺️ How to Add a New Map
1. Create `shared/maps/my-map.js` using helpers from `shared/maps/painter.js` and `shared/maps/props.js`.
   - Ensure floating platforms/islands have unbreakable `core(...)` anchors and the bottom floor uses `bedrock(...)`.
   - Keep TNT barrels sparse (`<= 140` TNT cells total and away from spawn points — enforced by `test/maps.test.js`!).
2. Register your map in `shared/maps.js` (`MAPS` object) with `name`, `w`, `h`, `build`, and `spawns`.
3. Run `npm test` — `test/maps.test.js` and `test/terrain.test.js` will automatically validate stability, spawns, TNT safety, and determinism for your new map!

#### 🔫 How to Add a New Weapon
1. Append the weapon stats to `WEAPONS` in `shared/weapons.js`, expose its index in `W`, add its display kill name to `KILL_NAMES`, and append it to `UNLOCKS` if it should appear in survival/pools.
2. Implement firing/projectile behavior in `shared/game/combat.js` and/or `shared/game/blast.js` (`shared/projectiles.js`).
3. Add its pixel sprite in `public/js/sprites.js` (or `public/js/sprites-tools.js`) and its procedural WebAudio sound in `public/js/audio.js` (or `public/js/audio-tools.js`).
4. Add a test in `test/` covering cooldown, damage/terrain effect, and state packing!

---

<a id="français"></a>

## 🇫🇷 Français

Bienvenue ! **Neon Rift** est un projet communautaire gratuit et ouvert à tous. Que vous souhaitiez créer une nouvelle arme délirante, dessiner une carte destructible, améliorer l'IA des bots, ajouter des effets néon ou corriger un bug, toutes les contributions sont les bienvenues !

### 1. Étapes pour contribuer

1. **Forkez** le dépôt sur GitHub puis clonez votre fork :
   ```bash
   git clone https://github.com/<votre-pseudo>/Neon-Rift.git
   cd Neon-Rift
   npm install
   ```
2. Créez une branche dédiée à votre fonctionnalité ou correctif :
   ```bash
   git checkout -b feat/nouvelle-arme-plasma
   ```
3. Lancez le serveur de développement (`http://localhost:3030`) :
   ```bash
   npm run dev
   ```
4. Vérifiez que toute la suite de tests passe (et ajoutez vos propres tests si besoin) :
   ```bash
   npm test
   ```
5. Poussez votre branche et ouvrez une **Pull Request** vers `main`.

### 2. Les 4 règles d'or techniques

Comme **Neon Rift** repose sur un serveur autoritaire à **60 Hz** avec prédiction côté client et réplication déterministe du terrain *falling-sand*, respectez toujours ces 4 règles :

1. **Le dossier `shared/` doit rester 100 % déterministe :**
   `shared/` tourne à la fois sur le serveur Node.js et dans le navigateur. N'utilisez jamais `Math.random()` ou `Date.now()` dans la simulation : passez par `shared/rng.js`.
2. **Identifiants réseau en ajout uniquement (*append-only*) :**
   Les index de `WEAPONS`, `ITEM` et les codes `OP` (`shared/sim.js`) transitent sur le réseau. **Ajoutez toujours les nouvelles entrées à la fin**, sans réordonner les existantes.
3. **Modifier le terrain uniquement via `world.op()` :**
   Ne modifiez jamais les tableaux de `terrain` directement en cours de partie ; passez toujours par `this.op(...)` (`shared/game/world.js`) pour que tous les clients rejouent l'opération à l'identique.
4. **Zéro asset propriétaire :**
   Privilégiez les sons WebAudio procéduraux (`public/js/audio.js`) et les sprites en matrices de pixels (`public/js/sprites.js`). Toute ressource externe doit être sous licence libre compatible MIT et ajoutée dans [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

### 3. Guides rapides

#### 🗺️ Ajouter une nouvelle carte
1. Créez `shared/maps/ma-carte.js` à l'aide des outils de `shared/maps/painter.js` et `shared/maps/props.js` (pensez aux noyaux incassables `core(...)` pour les îles flottantes et au sol `bedrock(...)` tout en bas).
2. Enregistrez la carte dans `shared/maps.js` (`MAPS`).
3. Lancez `npm test` : `test/maps.test.js` et `test/terrain.test.js` testeront automatiquement la stabilité physique, les points d'apparition et le déterminisme de votre carte !

#### 🔫 Ajouter une nouvelle arme
1. Ajoutez l'arme à la fin de `WEAPONS` dans `shared/weapons.js` (et dans `W`, `KILL_NAMES`, `UNLOCKS`).
2. Implémentez son tir/impact dans `shared/game/combat.js` / `shared/game/blast.js`.
3. Ajoutez son sprite pixel-art dans `public/js/sprites.js` et son bruitage WebAudio dans `public/js/audio.js`.
4. Ajoutez un test dans `test/` puis vérifiez avec `npm test`.
