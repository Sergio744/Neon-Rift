# 🚀 Hosting Neon Rift Online for Free / Héberger Neon Rift Gratuitement

[🇬🇧 English](#english) | [🇫🇷 Français](#français)

---

<a id="english"></a>

## 🇬🇧 English

### Important Technical Note Before Deploying
Unlike static websites, **Neon Rift** runs a **stateful 60 Hz Node.js + WebSocket (`/ws`) server** where active rooms (`?room=ABCD`), matchmaking queues, and destructible maps live in memory.

Therefore:
1. **Do NOT use serverless/static-only hosts** (like GitHub Pages, Netlify static, or Vercel Functions) — they terminate persistent WebSocket loops.
2. **Keep `1` instance (`max instances = 1`)**: do not horizontally scale to multiple replicas behind a round-robin load balancer, so friends sharing a 4-letter room code always land on the exact same Node.js process!
3. The server is ultra-lightweight (`~40–70 MB` RAM for dozens of concurrent players), so **free container tiers run it effortlessly**.

---

### Option 1: Render.com (Free Tier — 1-Click Blueprint)
This repository already includes [`render.yaml`](render.yaml):
1. Create a free account at [render.com](https://render.com).
2. Click **New + → Blueprint** and select your `Sergio744/Neon-Rift` repository.
3. Click **Apply**. Render will build, check `/healthz`, and give you a live `https://neon-rift.onrender.com` URL with automatic TLS (`wss://`)!
   *(Note: Render's free tier sleeps after 15 min of inactivity and wakes up in ~20s when someone visits.)*

### Option 2: Koyeb (Free Tier — Node / Docker)
1. Sign up at [koyeb.com](https://www.koyeb.com) (Hobby Free plan — 1 free Web Service).
2. Connect GitHub → select `Sergio744/Neon-Rift` → choose **Dockerfile** (included in the repo) on port `3030` with health check `/healthz`.
3. Set scaling to **1 instance** and deploy!

### Option 3: Docker Anywhere (Fly.io, Railway, Coolify, or VPS)
```bash
docker build -t neon-rift .
docker run -d --name neon-rift -p 3030:3030 --restart unless-stopped neon-rift
```
If hosting on a small VPS (Hetzner / OVH / Hostinger) with a custom domain, put **Caddy** in front for automatic HTTPS + WebSocket proxying in 3 lines:
```caddyfile
play.yourdomain.com {
    reverse_proxy 127.0.0.1:3030
}
```

---

<a id="français"></a>

## 🇫🇷 Français

### Point technique essentiel à connaître
Contrairement à un site statique classique, **Neon Rift** fait tourner un **serveur temps réel Node.js + WebSocket (`/ws`) à 60 Hz** qui garde les salons (`?room=ABCD`), le matchmaking et l'état du terrain en mémoire vive.

Par conséquent :
1. **N'utilisez pas un hébergeur purement statique / serverless** (comme GitHub Pages ou Vercel Functions), car ils coupent les connexions WebSocket persistantes.
2. **Gardez `1` seule instance active** : ainsi, deux amis qui tapent le même code salon `ABCD` tombent toujours sur le même processus serveur !
3. Le serveur est **ultra léger** (`~40 à 70 Mo` de RAM suffisent pour des dizaines de joueurs simultanés), ce qui permet de l'héberger **gratuitement**.

---

### Option 1 : Render.com (Gratuit — Déploiement 1-clic prêt à l'emploi)
Le fichier [`render.yaml`](render.yaml) est déjà configuré dans le dépôt :
1. Créez un compte gratuit sur [render.com](https://render.com).
2. Cliquez sur **New + → Blueprint** et sélectionnez votre dépôt `Sergio744/Neon-Rift`.
3. Cliquez sur **Apply** : votre jeu sera en ligne en HTTPS + WebSocket sécurisé (`wss://`) automatiquement !
   *(Astuce : l'offre gratuite Render met le serveur en veille après 15 min sans joueur et le réveille automatiquement dès qu'un joueur ouvre le lien.)*

### Option 2 : Koyeb (Offre Hobby Gratuite via Docker)
1. Créez un compte gratuit sur [koyeb.com](https://www.koyeb.com).
2. Connectez votre dépôt GitHub `Sergio744/Neon-Rift`, choisissez le mode **Dockerfile** (déjà fourni à la racine), port `3030`, health check `/healthz`.
3. Laissez le scaling à **1 instance** et déployez !

### Option 3 : Docker / VPS personnel (Coolify, Railway, Fly.io, OVH, Hetzner...)
```bash
docker build -t neon-rift .
docker run -d --name neon-rift -p 3030:3030 --restart unless-stopped neon-rift
```
Avec **Caddy** devant pour avoir le HTTPS et le WebSocket automatiques sur votre propre nom de domaine :
```caddyfile
play.votredomaine.com {
    reverse_proxy 127.0.0.1:3030
}
```
