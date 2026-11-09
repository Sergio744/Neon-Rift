## Summary / Résumé
<!-- Describe what this PR adds, improves, or fixes (EN or FR welcome!). -->
<!-- Décrivez ce que cette PR ajoute, améliore ou corrige (FR ou EN bienvenu !). -->

Related Issue: #

## Type of Change / Type de modification
- [ ] 🐛 Bug fix / Correctif
- [ ] 🔫 New weapon or gameplay balance / Nouvelle arme ou équilibrage
- [ ] 🗺️ New map or map update / Nouvelle carte
- [ ] ✨ UI, FX, audio, or QoL improvement / Interface, effets néon, audio
- [ ] 📚 Documentation or CI / Documentation ou infrastructure

## Screenshots / Clip (if visual / si visuel)
<!-- Drag & drop a screenshot or short GIF if you changed maps, UI, sprites, or FX. -->

## Contributor Checklist / Vérifications
- [ ] `npm test` passes locally (`0` failures) / Tous les tests passent avec `npm test`
- [ ] Shared simulation (`shared/`) stays deterministic (no `Math.random()` / `Date.now()` in ticks)
- [ ] Network IDs (`WEAPONS`, `ITEM`, `OP`) were only appended, never reordered
- [ ] Terrain mutations go through `world.op()`
- [ ] Zero proprietary assets added (any new open-source library/font is listed in `THIRD_PARTY_LICENSES.md`)
