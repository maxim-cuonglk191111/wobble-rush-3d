# 🏃 Wobble Rush 3D

A bright, toy-like, single-player **3D obstacle-course dash** built with
[Three.js](https://threejs.org/) and plain HTML / CSS / JavaScript. Guide your
wobbly little character across sweepers, moving platforms, springy bumpers and a
narrow bridge to reach the finish gate as fast as you can!

> Original characters, colours, level design and art — inspired by the
> obstacle-course party genre, but **not** a copy of any existing game's assets.

![Wobble Rush 3D](https://img.shields.io/badge/Three.js-r128-blue) ![No build step](https://img.shields.io/badge/build-none-brightgreen)

## ▶️ Play

**Just open `index.html` in any modern browser.** No build step, no server, no
install. Three.js loads from a CDN (so you need an internet connection the first
time).

Prefer a local server? Any static server works, e.g.:

```bash
# Python
python -m http.server 8000
# then visit http://localhost:8000
```

## 🎮 Controls

| Action | Keys |
| ------ | ---- |
| Move | `W` `A` `S` `D` or Arrow keys |
| Jump | `Space` |
| Dive / boost | `Shift` |
| Respawn at checkpoint | `R` |
| Start / restart | `Space` or the on-screen button |

## 🏁 The course

One short, polished course featuring:

1. **Starting platform** under a checkered banner.
2. **Rotating sweeper bars** — time your jumps!
3. **Moving platforms** ferrying you across a pit.
4. **Bouncing bumpers** that launch you around.
5. A **narrow bridge** with a sweeper in the middle.
6. A **final ramp** up into the glowing **finish gate**.

Fall off and you respawn instantly at your latest checkpoint. Reach the finish
to see your time — beat your personal best (saved in your browser)!

## 🕹️ Game feel

- Responsive, forgiving arcade movement (acceleration, coyote time, jump
  buffering, variable jump height).
- Readable, fair obstacles.
- Quick recovery — falling is never a big punishment.
- Particles for landing, checkpoints, dives, respawns and the finish.
- Living background: floating toy shapes, slow rings and drifting clouds.

## 🧩 Code structure

Clear, single-responsibility modules (plain classes, no framework):

| File | Responsibility |
| ---- | -------------- |
| `js/Game.js` | Renderer, scene, camera, input, main loop, state machine |
| `js/Player.js` | Character mesh + arcade physics (move/jump/dive/collisions) |
| `js/Course.js` | Level layout, lighting, sky, ground queries, background |
| `js/Obstacle.js` | `Sweeper`, `MovingPlatform`, `Bumper` |
| `js/Checkpoint.js` | Checkpoint / finish gates |
| `js/UI.js` | Start / HUD / finish / error screens |
| `js/Effects.js` | Pooled particle bursts |
| `js/main.js` | Bootstrap + explicit error handling (no silent fallbacks) |

If Three.js or a module fails to load, the game shows a clear error overlay
instead of failing silently.

## 📁 Project layout

```
wobble-rush-3d/
├── index.html      # entry point (loads Three.js + modules)
├── styles.css      # UI styling
├── js/             # game modules
└── README.md
```

## 📜 License

Released under the [MIT License](LICENSE). All code, shapes and colours are
original.
