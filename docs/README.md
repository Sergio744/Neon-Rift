# 🌐 Neon Rift — Landing page (GitHub Pages)

Static presentation page for **Neon Rift**. It does **not** run the game
(the game needs a stateful Node.js + WebSocket server — see [`DEPLOY.md`](../DEPLOY.md)).
It only presents the project and links to the live game and the repository.

- Live game: https://neon-rift-0we0.onrender.com/
- Repository: https://github.com/Sergio744/Neon-Rift
- Published URL (once enabled): https://sergio744.github.io/Neon-Rift/

## Enable GitHub Pages (one-time, in the GitHub UI)

1. Open https://github.com/Sergio744/Neon-Rift → **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch **`main`** and folder **`/docs`**, then click **Save**.
4. Wait ~1 minute, then open https://sergio744.github.io/Neon-Rift/

No build step: `index.html`, `style.css`, `app.js` and `assets/` are served as-is.
The `.nojekyll` file prevents Jekyll processing.

## Preview locally

```bash
python3 -m http.server 3031 --directory docs
# open http://localhost:3031
```

## Files

| File | Purpose |
| :--- | :--- |
| `index.html` | Landing page (FR default, EN toggle) |
| `style.css` | Neon Rift theme (cyan/magenta, Silkscreen) |
| `app.js` | FR/EN toggle, mobile nav, falling-sand hero canvas |
| `assets/` | Pixel-art icons (copies of `public/` icons) |
| `.nojekyll` | Disables Jekyll on GitHub Pages |
