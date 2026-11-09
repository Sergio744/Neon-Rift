# Security Policy / Politique de Sécurité

[🇬🇧 English](#english) | [🇫🇷 Français](#français)

---

## 🇬🇧 English

Because **Neon Rift** includes an authoritative Node.js HTTP & WebSocket multiplayer server (`server/`), security issues such as remote crashes, memory exhaustion (DoS via malformed WebSocket payloads), path traversal, or XSS in player/room names are taken seriously.

### Reporting a Vulnerability
- **Please do NOT open a public GitHub Issue** for exploitable server crashes or security vulnerabilities that could affect live community servers.
- Instead, use **GitHub Private Vulnerability Reporting** on [`Sergio744/Neon-Rift/security/advisories`](https://github.com/Sergio744/Neon-Rift/security/advisories) (if enabled) or contact [@Sergio744](https://github.com/Sergio744) privately with steps to reproduce.
- Once patched, we gladly credit security researchers in the release notes!

---

## 🇫🇷 Français

**Neon Rift** embarquant un serveur multijoueur Node.js HTTP & WebSocket (`server/`), toute faille pouvant provoquer un crash serveur à distance, une saturation mémoire (DoS via messages WebSocket malformés), une traversée de répertoires ou une injection XSS est prise très au sérieux.

### Signaler une vulnérabilité
- **N'ouvrez pas d'Issue publique** pour une faille exploitable sur les serveurs communautaires en ligne.
- Utilisez la fonctionnalité **Private Vulnerability Reporting** de GitHub ([`Sergio744/Neon-Rift/security/advisories`](https://github.com/Sergio744/Neon-Rift/security/advisories)) ou contactez directement [@Sergio744](https://github.com/Sergio744) avec les étapes de reproduction.
- Une fois le correctif déployé, nous remercions volontiers les découvreurs dans les notes de version !
