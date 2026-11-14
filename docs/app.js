/* Neon Rift landing — i18n FR/EN, mobile nav, falling-sand hero canvas. No dependencies. */
(function () {
  "use strict";

  var I18N = {
    fr: {
      skip: "Aller au contenu",
      navModes: "Modes",
      navMaps: "Arènes",
      navWeapons: "Armes",
      navPlay: "Jouer",
      navOss: "Open Source",
      navCredits: "Crédits",
      ctaPlay: "▶ Jouer",
      heroBadge: "100 % GRATUIT · OPEN SOURCE · LICENCE MIT",
      heroTagline: "Le jeu de tir stickman où tout est destructible.",
      heroLead:
        "Chaque balle, roquette et rayon laser creuse le décor en temps réel : le sable s'écoule, les structures s'effondrent, et vous construisez murs et planchers en plein duel. Duels 1v1, salons jusqu'à 8 joueurs, survie solo et co-op — directement dans le navigateur.",
      ctaPlayNow: "▶ Jouer maintenant",
      ctaStar: "★ Voir sur GitHub",
      heroNote: "Aucun téléchargement · Aucune inscription · AZERTY & QWERTY natifs",
      heroCaption: "Neon Cyan vs Rift Magenta",
      statMaps: "arènes destructibles",
      statPlayers: "joueurs par salon",
      statModes: "modes de jeu",
      statPrice: "sans pub, sans pay-to-win",
      modesKicker: "MODES DE JEU",
      modesTitle: "Choisis ton combat",
      modesLead: "Quatre façons de jouer, en ligne ou hors ligne, seul ou entre amis.",
      mode1t: "Duels 1v1",
      mode1d: "Matchmaking instantané ou salon privé par code à 4 lettres. Score et arsenal personnalisables.",
      mode2t: "Salons de groupe",
      mode2d: "Chacun pour soi ou match à mort par équipes sur de grandes arènes. Rejoignables en cours de partie.",
      mode3t: "Survie solo",
      mode3d: "Vagues de bots de plus en plus coriaces, 100 % hors ligne dans le navigateur. Une arme débloquée par vague.",
      mode4t: "Survie co-op",
      mode4d: "Survis en ligne avec ton équipe : vies partagées, réanimations et largages d'armurerie progressifs.",
      mapsKicker: "ARÈNES",
      mapsTitle: "8 mondes à détruire",
      mapsLead: "Physique falling-sand : tout ce qui n'est pas bedrock peut être creusé, brûlé ou fait s'effondrer.",
      mapNeon: "Arène signature : gratte-ciels jumeaux, passerelles néon et réacteur Rift central. Parfaite pour les duels.",
      mapHotel: "55 étages verticaux, chambres vitrées et combats de haut en bas. Montez, descendez, détruisez.",
      mapJungle: "Grande carte luxuriante, canopée et rivières. Idéale pour les salons jusqu'à 8 joueurs.",
      mapLanding: "L'arène d'atterrissage classique, équilibrée et lisible pour débuter.",
      mapRidge: "Crêtes au crépuscule, combats verticaux et longues lignes de vue.",
      mapMine: "Galeries souterraines étroites : embuscades, effondrements et combats au corps à corps.",
      mapCanyon: "Canyon rouge immense, falaises destructibles et traversées risquées.",
      mapOutpost: "Avant-poste compact, parfait pour des matchs rapides et nerveux.",
      weapKicker: "ARSENAL RIFT",
      weapTitle: "Des armes qui tordent la réalité",
      weapLead:
        "Trois armes exclusives Neon Rift, plus les classiques du genre — pistolet, SMG, shotgun, roquette, railgun, lance-flammes, C4, sniper, AK-47 et constructeur.",
      weapBlink:
        "Disque de phase : téléporte-toi à l'impact, ou en plein vol (clic droit / G / E) pour recharger ton double saut et libérer une onde de choc sans auto-dégâts.",
      weapPrism: "Laser cristallin qui rebondit jusqu'à 3 fois sur les murs (+15 % de dégâts par ricochet), avec aperçu du premier rebond.",
      weapVortex: "Orbe de matière noire : s'ancre en singularité gravitationnelle, soulève et aspire les ennemis avant d'imploser.",
      playKicker: "COMMENT JOUER",
      playTitle: "En jeu en 30 secondes",
      step1t: "Ouvre le jeu",
      step1d: "Un clic sur le lien, aucun téléchargement. Le serveur gratuit peut mettre ~20 secondes à se réveiller après une pause.",
      step2t: "Choisis ton mode",
      step2d: "1v1, groupe, survie solo ou co-op — puis la carte et l'arsenal qui te ressemblent.",
      step3t: "Détruis & construis",
      step3d: "Creuse le décor, pose des murs et des sols en plein duel, et reprends l'avantage.",
      controlsTitle: "🕹️ Contrôles — AZERTY & QWERTY natifs",
      thKey: "Touche",
      thAction: "Action",
      cRun: "Courir (Shift = sprint)",
      cJump: "Saut · double saut en l'air · jetpack en maintenant",
      cFall: "Chute rapide / descendre d'une plateforme",
      cShoot: "Tirer / poser une construction",
      cAlt: "Grenade / Blink en vol / détoner le C4",
      cSwap: "Changer d'arme",
      cMelee: "Coup d'épaule (brise le décor et repousse)",
      cBuild: "Construction (mur / sol, T = matériau)",
      cMisc: "Scores · aide des touches · couper le son",
      ctaPlayNow2: "▶ Jouer maintenant — c'est gratuit",
      ossKicker: "OPEN SOURCE",
      ossTitle: "Construit par la communauté",
      ossLead: "Zéro monétisation, 100 % fun. Forke le projet, propose tes idées, ou héberge ton propre serveur.",
      oss1t: "Fork & lance",
      oss1d: "Clone le repo, npm install, puis npm run dev : le jeu tourne en local sur localhost:3030.",
      oss2t: "Contribue",
      oss2d: "Nouvelles armes, cartes destructibles, modes ou effets néon : le guide CONTRIBUTING.md t'explique tout, pas à pas.",
      oss3t: "Héberge",
      oss3d: "Render, Docker, Fly.io, Railway ou VPS : le guide DEPLOY.md couvre l'hébergement gratuit, clé en main.",
      linkContrib: "🤝 CONTRIBUTING",
      linkRoadmap: "🗺️ ROADMAP",
      linkDeploy: "🚀 DEPLOY",
      linkIssues: "💬 Issues",
      credKicker: "CRÉDITS",
      credTitle: "Inspiré de Stick Duel",
      credBody:
        "Neon Rift est inspiré et dérivé de Stick Duel, créé par Melvynx (game.melvynx.dev · code source), avec son accord explicite pour utiliser, modifier et redistribuer le code, héberger une version multijoueur gratuite et laisser la communauté contribuer et forker.",
      credBody2:
        "Il s'agit d'un projet communautaire indépendant : ce n'est pas un projet officiel de Melvynx ou de sa chaîne. Le code est publié sous licence MIT — voir NOTICE.md et THIRD_PARTY_LICENSES.md.",
      ctaPlayNow3: "▶ Rejoindre la Rift",
      footTag: "jeu stickman destructible, gratuit & open-source (MIT)",
      footPlay: "Jouer",
      footNote: "Inspiré de Stick Duel — projet non officiel."
    },
    en: {
      skip: "Skip to content",
      navModes: "Modes",
      navMaps: "Arenas",
      navWeapons: "Weapons",
      navPlay: "Play",
      navOss: "Open Source",
      navCredits: "Credits",
      ctaPlay: "▶ Play",
      heroBadge: "100% FREE · OPEN SOURCE · MIT LICENSE",
      heroTagline: "The stickman shooter where everything is destructible.",
      heroLead:
        "Every bullet, rocket and laser beam carves the world in real time: sand pours, structures collapse, and you build walls and floors mid-fight. 1v1 duels, rooms up to 8 players, solo and co-op survival — right in your browser.",
      ctaPlayNow: "▶ Play now",
      ctaStar: "★ View on GitHub",
      heroNote: "No download · No sign-up · Native AZERTY & QWERTY",
      heroCaption: "Neon Cyan vs Rift Magenta",
      statMaps: "destructible arenas",
      statPlayers: "players per room",
      statModes: "game modes",
      statPrice: "no ads, no pay-to-win",
      modesKicker: "GAME MODES",
      modesTitle: "Pick your fight",
      modesLead: "Four ways to play, online or offline, solo or with friends.",
      mode1t: "1v1 Duels",
      mode1d: "Instant matchmaking or private 4-letter rooms. Custom score goals and weapon pools.",
      mode2t: "Group rooms",
      mode2d: "Free-for-all or team deathmatch on massive arenas. Late joins supported.",
      mode3t: "Solo survival",
      mode3d: "Escalating bot waves, 100% offline in the browser. One weapon unlocked per wave.",
      mode4t: "Co-op survival",
      mode4d: "Survive online with your crew: shared lives, revives and progressive armory drops.",
      mapsKicker: "ARENAS",
      mapsTitle: "8 worlds to destroy",
      mapsLead: "Falling-sand physics: anything that isn't bedrock can be dug, burned or collapsed.",
      mapNeon: "Signature arena: twin skyscrapers, neon skybridges and a central Rift Reactor. Perfect for duels.",
      mapHotel: "55 vertical floors, glass chambers and top-to-bottom fights. Climb, drop, destroy.",
      mapJungle: "Large lush map, canopy and rivers. Ideal for 8-player rooms.",
      mapLanding: "The classic landing arena, balanced and readable for beginners.",
      mapRidge: "Dusk ridges, vertical fights and long sightlines.",
      mapMine: "Narrow underground galleries: ambushes, collapses and close-quarters fights.",
      mapCanyon: "Immense red canyon, destructible cliffs and risky crossings.",
      mapOutpost: "Compact outpost, perfect for fast, frantic matches.",
      weapKicker: "RIFT ARSENAL",
      weapTitle: "Weapons that bend reality",
      weapLead:
        "Three Neon Rift exclusives, plus genre classics — pistol, SMG, shotgun, rocket, railgun, flamethrower, C4, sniper, AK-47 and builder.",
      weapBlink:
        "Phase disc: teleport on impact, or mid-flight (right click / G / E) to refill your air flip and trigger a zero-self-damage shockwave.",
      weapPrism: "Crystalline laser bouncing up to 3 times off walls (+15% damage per ricochet), with a first-bounce aim guide.",
      weapVortex: "Dark-matter orb: anchors into a gravitational singularity, lifting and pulling enemies inward before imploding.",
      playKicker: "HOW TO PLAY",
      playTitle: "In game in 30 seconds",
      step1t: "Open the game",
      step1d: "One click, no download. The free server may take ~20 seconds to wake up after idle time.",
      step2t: "Pick your mode",
      step2d: "1v1, group, solo or co-op survival — then the map and arsenal you like.",
      step3t: "Destroy & build",
      step3d: "Dig through terrain, place walls and floors mid-fight, and take back the advantage.",
      controlsTitle: "🕹️ Controls — native AZERTY & QWERTY",
      thKey: "Key",
      thAction: "Action",
      cRun: "Run (Shift = sprint)",
      cJump: "Jump · mid-air flip · hold for jetpack",
      cFall: "Fast-fall / drop through platforms",
      cShoot: "Shoot / place a build piece",
      cAlt: "Grenade / mid-air Blink / detonate C4",
      cSwap: "Switch weapon",
      cMelee: "Shove (breaches terrain & knocks back)",
      cBuild: "Builder (wall / floor, T = material)",
      cMisc: "Scores · controls help · mute",
      ctaPlayNow2: "▶ Play now — it's free",
      ossKicker: "OPEN SOURCE",
      ossTitle: "Built by the community",
      ossLead: "Zero monetization, 100% fun. Fork the project, propose ideas, or host your own server.",
      oss1t: "Fork & run",
      oss1d: "Clone the repo, npm install, then npm run dev: the game runs locally on localhost:3030.",
      oss2t: "Contribute",
      oss2d: "New weapons, destructible maps, modes or neon FX: the CONTRIBUTING.md guide walks you through it.",
      oss3t: "Self-host",
      oss3d: "Render, Docker, Fly.io, Railway or VPS: the DEPLOY.md guide covers free hosting, turnkey.",
      linkContrib: "🤝 CONTRIBUTING",
      linkRoadmap: "🗺️ ROADMAP",
      linkDeploy: "🚀 DEPLOY",
      linkIssues: "💬 Issues",
      credKicker: "CREDITS",
      credTitle: "Inspired by Stick Duel",
      credBody:
        "Neon Rift is inspired by and forked from Stick Duel, created by Melvynx (game.melvynx.dev · source code), with his explicit permission to use, modify and redistribute the code, host a free multiplayer version, and let the community contribute and fork.",
      credBody2:
        "It is an independent community project: NOT an official project of Melvynx or his channel. Code is published under the MIT license — see NOTICE.md and THIRD_PARTY_LICENSES.md.",
      ctaPlayNow3: "▶ Join the Rift",
      footTag: "destructible stickman shooter, free & open-source (MIT)",
      footPlay: "Play",
      footNote: "Inspired by Stick Duel — unofficial project."
    }
  };

  function setLang(lang) {
    var dict = I18N[lang] || I18N.fr;
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      var on = btn.getAttribute("data-lang") === lang;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    try { localStorage.setItem("neon-rift-lang", lang); } catch (e) { /* private mode */ }
  }

  document.querySelectorAll(".lang-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { setLang(btn.getAttribute("data-lang")); });
  });

  var saved = null;
  try { saved = localStorage.getItem("neon-rift-lang"); } catch (e) { /* ignore */ }
  if (saved === "en" || saved === "fr") setLang(saved);

  /* Mobile nav */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* Active nav link on scroll */
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
  if ("IntersectionObserver" in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && byId[en.target.id]) {
          links.forEach(function (a) { a.classList.remove("is-active"); });
          byId[en.target.id].classList.add("is-active");
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    ["modes", "maps", "armes", "jouer", "opensource", "credits"].forEach(function (id) {
      var s = document.getElementById(id);
      if (s) obs.observe(s);
    });
  }

  /* Footer year */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* Falling-sand hero canvas (decorative, respects reduced motion) */
  var canvas = document.getElementById("sand");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (canvas && !reduce) {
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, parts = [];
    var COLORS = ["#3ee6ff", "#ff4d9d", "#7c5cff", "#45d483"];

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      W = canvas.width = Math.max(320, Math.floor(r.width / 3));
      H = canvas.height = Math.max(200, Math.floor(r.height / 3));
    }
    function spawn(n) {
      for (var i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * W,
          y: Math.random() * -H,
          s: 1 + Math.random() * 2,
          v: 0.6 + Math.random() * 1.6,
          c: COLORS[(Math.random() * COLORS.length) | 0],
          drift: (Math.random() - 0.5) * 0.4
        });
      }
    }
    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.y += p.v;
        p.x += p.drift;
        if (p.y > H) { parts.splice(i, 1); continue; }
        ctx.fillStyle = p.c;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(p.x, p.y, p.s, p.s);
      }
      ctx.globalAlpha = 1;
      if (parts.length < 130) spawn(2);
      requestAnimationFrame(frame);
    }
    resize();
    spawn(90);
    window.addEventListener("resize", resize);
    requestAnimationFrame(frame);
  }
})();
