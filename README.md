# ⚡ Neon Rift

[![License: MIT](https://img.shields.io/badge/License-MIT-3ee6ff.svg)](LICENSE)
[![CI](https://github.com/Sergio744/Neon-Rift/actions/workflows/ci.yml/badge.svg)](https://github.com/Sergio744/Neon-Rift/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-45d483.svg)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff4d9d.svg)](CONTRIBUTING.md)

**[🇬🇧 English](#english) · [🇫🇷 Français](#français) · [🤝 Contributing](CONTRIBUTING.md) · [🗺️ Roadmap](ROADMAP.md) · [🚀 Free Hosting Guide](DEPLOY.md)**

---

<a id="english"></a>

## 🇬🇧 English

**Neon Rift** is a **100% free, non-commercial, open-source community stickman shooter** played on fully destructible, falling-sand pixel maps right in the browser.

Every bullet, rocket, flamethrower burst, and laser cutter carves through the world in real time — sand pours, wood burns, structures collapse, and players build tactical walls and floors mid-fight to hold their ground.

> **Attribution & Non-Affiliation:**
> **Neon Rift** is inspired by and forked from **[Stick Duel](https://github.com/Melvynx/stick-duel)** ([game.melvynx.dev](https://game.melvynx.dev)), created by **[Melvynx](https://melvynx.com)**, with his explicit permission. It is an **independent, community-driven project** and is **not an official project** of Melvynx or his channel. See [`NOTICE.md`](NOTICE.md) and [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

### 🎮 Game Modes

- **1v1 Duels** — Instant quick-match matchmaking or private 4-letter invite rooms (`?room=ABCD`) with customizable score goals and weapon pools.
- **Group Rooms (2–8 Players)** — Chaotic **Free-For-All** or **Team Deathmatch** on massive destructible arenas; late joins supported.
- **Solo Survival** — Fight escalating waves of bots completely offline/client-side and unlock a new weapon after every cleared wave.
- **Co-op Survival (2–4 Players)** — Team up online with shared crew lives, revives, and progressive armory unlocks.

### ⚡ Quick Start (Zero Build Step)

Requires **Node.js 20+** (`npm` or `pnpm`). The only runtime dependency is `ws` — browsers load `public/` and `shared/` directly as native ES modules.

```bash
git clone https://github.com/Sergio744/Neon-Rift.git
cd Neon-Rift
npm install
npm run dev      # Starts server at http://localhost:3030 (auto-restarts on changes)
npm test         # Runs the 65-test deterministic physics, terrain & multiplayer suite
```

Environment variables:
- `PORT` (default `3030`)
- `HOST` (default `0.0.0.0`)
- Health check endpoint: `GET /healthz`

### 🕹️ Controls

Keys use **physical keyboard positions** (`KeyboardEvent.code`), so **WASD (QWERTY)** and **ZQSD (AZERTY)** both work automatically out of the box!

| Key / Input | Action |
| :--- | :--- |
| `A` / `D` *(or `Q` / `D` on AZERTY)* | Run (`Shift` to sprint) |
| `Space` | Jump · Tap again in mid-air to flip · Hold for jetpack |
| `S` | Fast-fall / Drop through one-way platforms |
| `Left Click` | Shoot / Place build piece |
| `Right Click` | Throw grenade / Detonate sticky C4 |
| `1`–`9`, `Wheel`, `Q` *(or `A`)* | Switch weapon / Quick-swap last weapon |
| `F` | Melee shove (breaches terrain in front of you & knocks back foes) |
| `B` + `T` | Builder tool (aim sideways = wall, up/down = floor, `T` cycles material style) |
| `Tab` (hold) | Scoreboard |
| `H` / `Esc` / `M` | Toggle controls panel / Pause & settings / Mute audio |

### 🏗️ Architecture Overview

The Node.js server is authoritative at **60 Hz**. Because `shared/` is imported identically by both the server and the browser, movement prediction and the falling-sand cellular automaton stay in deterministic lockstep without streaming pixel buffers over the network.

```text
server/   HTTP static server, WebSocket lobby, 1v1/group rooms, co-op rooms & 60 Hz loop
shared/   Deterministic game core, weapons, procedural maps, falling-sand sim & survival AI
public/   Zero-build ES module client: canvas renderer, prediction, WebAudio synth & UI
test/     Automated node:test suite (physics, builder, maps, sandbox, rooms & co-op)
```

### 🤝 Join the Community & Contribute

Neon Rift exists to grow **with and for its players** — never pay-to-win, never closed-source.
- Read **[`CONTRIBUTING.md`](CONTRIBUTING.md)** for step-by-step guides on adding **new weapons**, **new destructible maps**, **visual FX**, or **game modes**.
- Check **[`ROADMAP.md`](ROADMAP.md)** or open [Issues](https://github.com/Sergio744/Neon-Rift/issues) to pick up a feature or propose your own idea.
- Want to host a public server for free? Follow **[`DEPLOY.md`](DEPLOY.md)** (Docker, Render, Koyeb, Fly.io, Railway, or VPS).

---

<a id="français"></a>

## 🇫🇷 Français

**Neon Rift** est un **jeu de tir stickman multijoueur 100 % gratuit, non commercial, open-source et communautaire**, jouable directement dans le navigateur sur des cartes en pixels intégralement destructibles (physique *falling-sand*).

Chaque balle, roquette, lance-flammes ou découpeur laser creuse le décor en temps réel : le sable s'écoule, le bois brûle, les structures s'effondrent, et vous pouvez construire murs et planchers en plein duel pour reprendre l'avantage.

> **Attribution & Non-affiliation :**
> **Neon Rift** est inspiré et dérivé de **[Stick Duel](https://github.com/Melvynx/stick-duel)** ([game.melvynx.dev](https://game.melvynx.dev)), créé par **[Melvynx](https://melvynx.com)**, avec son aimable accord. Il s'agit d'un **projet communautaire indépendant** et **non d'un projet officiel** de Melvynx ou de sa chaîne. Voir [`NOTICE.md`](NOTICE.md) et [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

### 🎮 Modes de jeu

- **Duels 1v1** — Matchmaking rapide en un clic ou salons privés par code à 4 lettres (`?room=ABCD`) avec choix de la carte, du score et des armes.
- **Salons de Groupe (2 à 8 joueurs)** — **Chacun pour soi (FFA)** ou **Match à mort par équipes** sur de grandes arènes destructibles (rejoignables en cours de partie).
- **Survie Solo** — Affrontez des vagues de bots de plus en plus coriaces (tourne à 100 % en local dans le navigateur) et débloquez une arme à chaque vague.
- **Survie Co-op (2 à 4 joueurs)** — Survivez en ligne avec vos amis grâce à un pool de vies partagé, des réanimations et des largages d'armurerie.

### ⚡ Démarrage rapide (Sans étape de build)

Nécessite **Node.js 20+** (`npm` ou `pnpm`). La seule dépendance est `ws` : le navigateur charge directement `public/` et `shared/` en modules ES natifs.

```bash
git clone https://github.com/Sergio744/Neon-Rift.git
cd Neon-Rift
npm install
npm run dev      # Lance le serveur sur http://localhost:3030 (rechargement auto)
npm test         # Lance les 65 tests automatisés (physique, terrain, salons, co-op)
```

### 🕹️ Contrôles (AZERTY & QWERTY natifs)

Le jeu détecte la **position physique des touches** : **ZQSD (AZERTY)** et **WASD (QWERTY)** fonctionnent donc automatiquement sans aucune configuration !

| Touche / Action | Effet |
| :--- | :--- |
| `Q` / `D` *(AZERTY)* ou `A` / `D` *(QWERTY)* | Courir (`Shift` pour sprinter) |
| `Espace` | Sauter · Réappuyer en l'air pour un double saut · Maintenir pour le jetpack |
| `S` | Descendre d'une plateforme / chute rapide |
| `Clic gauche` | Tirer / Poser une construction |
| `Clic droit` | Lancer une grenade / Faire exploser le C4 |
| `1`–`9`, `Molette`, `A` *(AZERTY)* / `Q` *(QWERTY)* | Changer d'arme / Revenir à l'arme précédente |
| `F` | Coup d'épaule (brise le décor devant soi et repousse l'adversaire) |
| `B` + `T` | Mode construction (viser sur le côté = mur, haut/bas = sol, `T` change le matériau) |
| `Tab` (maintenir) | Tableau des scores |
| `H` / `Échap` / `M` | Afficher l'aide des touches / Menu pause & réglages / Couper le son |

### 🤝 Construire la communauté ensemble

L'objectif de **Neon Rift** est simple : **zéro monétisation, 100 % fun et open-source**, construit par ses joueurs.
- Consultez **[`CONTRIBUTING.md`](CONTRIBUTING.md)** pour apprendre à ajouter **une nouvelle arme**, **une nouvelle carte destructible**, **un mode de jeu** ou **des effets néon**.
- Parcourez la **[`ROADMAP.md`](ROADMAP.md)** et les [Issues](https://github.com/Sergio744/Neon-Rift/issues) pour proposer vos idées ou prendre un ticket.
- Pour mettre votre propre serveur multijoueur en ligne gratuitement, suivez **[`DEPLOY.md`](DEPLOY.md)**.

## 📄 License / Licence

Distributed under the **[MIT License](LICENSE)** — Copyright (c) 2026 Sergio744 & Neon Rift Contributors, and Copyright (c) 2026 Melvyn Malherbe (original Stick Duel codebase).
