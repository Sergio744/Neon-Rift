# Third-Party Licenses & Assets Inventory / Inventaire des Licences & Ressources Tierces

[🇬🇧 English](#english) | [🇫🇷 Français](#français)

---

## English

Before publishing **Neon Rift**, all runtime dependencies, fonts, audio, and visual assets were audited to ensure 100% open-source compliance.

### 1. Base Game Engine & Original Code
| Component | Source | Author | License |
| :--- | :--- | :--- | :--- |
| Stick Duel engine (`server/`, `shared/`, `public/`, `test/`) | [github.com/Melvynx/stick-duel](https://github.com/Melvynx/stick-duel) | Melvyn Malherbe ([Melvynx](https://melvynx.com)) | **MIT** |

### 2. NPM Runtime Dependencies
| Package | Version | Repository | License |
| :--- | :--- | :--- | :--- |
| [`ws`](https://www.npmjs.com/package/ws) | `^8.18.0` | [github.com/websockets/ws](https://github.com/websockets/ws) | **MIT** |

*(There are zero other runtime or build dependencies — the client uses native ES modules directly.)*

### 3. Fonts
| Font | Usage | Author / Source | License |
| :--- | :--- | :--- | :--- |
| **Silkscreen** | HTML/CSS UI overlays (`public/index.html`, `public/style.css`) | Jason Kottke via [Google Fonts](https://fonts.google.com/specimen/Silkscreen) | **SIL Open Font License 1.1 (OFL-1.1)** |
| **Built-in 5x7 Pixel Font** | Canvas HUD, logo & destructible map lettering (`shared/font.js`) | Original bitmap matrix in codebase | **MIT** |

### 4. Audio & Visual Assets
| Asset Category | Implementation | External Files | License |
| :--- | :--- | :--- | :--- |
| **Sound Effects (SFX)** | 100% procedural runtime synthesis via WebAudio API (`public/js/audio.js`, `public/js/audio-tools.js`) | None (`0` audio files) | **MIT** |
| **Weapon & Item Sprites** | 100% procedural pixel-art matrices in JS (`public/js/sprites.js`, `public/js/sprites-tools.js`, `public/js/pixel.js`) | None (`0` image files) | **MIT** |
| **Maps & Destructible Props** | 100% procedural code builders (`shared/maps/*.js`) | None | **MIT** |

### Policy for Future Community Contributions
To keep **Neon Rift** legally clean and freely redistributable forever:
1. Prefer **procedural WebAudio** and **procedural pixel sprites** whenever possible.
2. Any external library, font, sound, or image added in a Pull Request **must** use an OSI/FSF-approved permissive or free culture license compatible with MIT (e.g., **MIT**, **ISC**, **BSD**, **Apache-2.0**, **CC0-1.0**, **CC-BY-4.0**, **SIL OFL-1.1**).
3. Every new external dependency or asset **must** be added to the tables in this file in the same Pull Request.

---

## Français

Avant la publication de **Neon Rift**, l'intégralité des librairies, polices, sons et ressources graphiques a été auditée afin de garantir une conformité open-source totale.

### 1. Moteur de base & Code d'origine
| Composant | Source | Auteur | Licence |
| :--- | :--- | :--- | :--- |
| Moteur Stick Duel (`server/`, `shared/`, `public/`, `test/`) | [github.com/Melvynx/stick-duel](https://github.com/Melvynx/stick-duel) | Melvyn Malherbe ([Melvynx](https://melvynx.com)) | **MIT** |

### 2. Dépendances NPM d'exécution
| Paquet | Version | Dépôt | Licence |
| :--- | :--- | :--- | :--- |
| [`ws`](https://www.npmjs.com/package/ws) | `^8.18.0` | [github.com/websockets/ws](https://github.com/websockets/ws) | **MIT** |

*(Aucune autre dépendance ni étape de build : le navigateur charge directement `public/` et `shared/` en modules ES natifs.)*

### 3. Polices d'écriture
| Police | Utilisation | Auteur / Source | Licence |
| :--- | :--- | :--- | :--- |
| **Silkscreen** | Menus et interface HTML/CSS (`public/index.html`, `public/style.css`) | Jason Kottke via [Google Fonts](https://fonts.google.com/specimen/Silkscreen) | **SIL Open Font License 1.1 (OFL-1.1)** |
| **Police pixel 5x7 intégrée** | HUD canvas, logo et textes destructibles des cartes (`shared/font.js`) | Matrice bitmap originale intégrée au code | **MIT** |

### 4. Ressources Audio & Graphiques
| Catégorie | Implémentation | Fichiers externes | Licence |
| :--- | :--- | :--- | :--- |
| **Effets sonores (SFX)** | Synthèse procédurale 100 % générée à l'exécution via WebAudio API (`public/js/audio.js`, `public/js/audio-tools.js`) | Aucun (`0` fichier audio) | **MIT** |
| **Sprites d'armes & objets** | Matrices de pixel-art procédural en JS (`public/js/sprites.js`, `public/js/sprites-tools.js`, `public/js/pixel.js`) | Aucun (`0` fichier image) | **MIT** |
| **Cartes & décors destructibles** | Génération 100 % procédurale en code (`shared/maps/*.js`) | Aucun | **MIT** |

### Règles pour les futures contributions communautaires
Pour que **Neon Rift** reste 100 % libre et redistribuable sans ambiguïté :
1. Privilégiez toujours les **sons WebAudio procéduraux** et les **sprites pixel-art en code**.
2. Toute librairie, police, image ou ressource sonore externe ajoutée via une Pull Request **doit impérativement** être sous licence libre compatible MIT (**MIT**, **ISC**, **BSD**, **Apache-2.0**, **CC0-1.0**, **CC-BY-4.0**, **SIL OFL-1.1**).
3. Toute nouvelle ressource tierce **doit être documentée dans ce fichier** dans la même Pull Request.
