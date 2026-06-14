# Domain parking page

A domain parking page styled after the Chrome offline screen, with a
dino-style endless-runner mini-game at the top.

## Open-source assets

The original Google dino game and artwork have been removed. Instead:

- **Game:** ported from [flo-bit/blento](https://github.com/flo-bit/blento)'s
  `DinoGameCard` (MIT) to vanilla JS — `assets/dino-game.js`.
- **Artwork:** Kenney's **1-Bit Platformer Pack** (CC0, public domain),
  `assets/dino/Tilemap/monochrome_tilemap_transparent.png`. Tiles are
  extracted at runtime per Kenney's `cells.txt` layout.

No external CDN dependencies — everything is served from `assets/`.

## Controls

- **Space / ↑ / W / tap** — jump
- **↓ / S** — duck (under flying obstacles)

## Customize

- Edit the heading / list / contact text in `index.html` (`#main-content`).
- Update the `mailto:` link.

Deployed via GitHub Pages (see `.github/workflows/pages.yml`).
