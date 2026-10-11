# Blender rooms

The Study and Play backgrounds as real 3D rooms: modelled here, exported as GLBs the app mounts behind the tutor. The Claude Design shots (`design/study-play/claude-design/`) set the mood, palette and props. They are not a pixel target.

| File | What it does |
|---|---|
| `build_study_room.py`, `build_play_room.py` | The two rooms. |
| `contract.py` | The numbers the app fixes: floor, tutor, camera, the floating window, hoop, ball, keep-out zones, node names, palettes, and the camera/window maths. No bpy modelling. |
| `common.py` | The modelling kit: palette materials, bevelled boxes, cylinders, spheres, rings, quads, text, banded walls (stripes), plank floor, floor paint, named nodes, slots, loose props. `C.build()` runs the pipeline. |
| `checks.py` | Build-time checks: keep-out and calm boxes, props through a wall, the floating window crossing a wall, and anything drawn over that window (tested triangle by triangle, walls and floor included). |
| `pipeline.py` | After modelling: the checks, Cycles AO bake into vertex colours, shading, the unlit material swap, merging static meshes, GLB export, the report and the manifest. |
| `preview.py` | An Eevee render from the app's lesson camera at 1456 x 785, with the tutor, a window ghost and (`--guides`) the shot arc. |
| `smoke.py` | Runs every helper on one box and writes `tmp/rooms/smoke.glb`. |
| `lab_check.py` | Opens a GLB in `lab/rooms.html` with Playwright, saves a screenshot and checks the required nodes and the page's errors. |
| `fonts/` | `Figtree-ExtraBold.ttf` (the app's display face, static) and its licence, `OFL.txt` (SIL Open Font License 1.1). |
| `tsconfig.lab.json` | Typechecks `lab/rooms.tsx` with the app's settings. |

## Scale contract (contract version 3)

Contract history (`CONTRACT` in `contract.py`, written into each GLB's root extras and the manifest; bump it whenever `APP` changes):

- **2**: one floating window, centred at x -3.15, 3.0 wide, focused scale 1.06.
- **3**: the same window at x -3.06, 2.98 wide, unscaled when focused (focus scale 1.0), so its focus ring stays inside the left wall. Geometry is unchanged from the last contract-2 build; only the extras' contract number moved.

- **Room frame** uses three.js axes (x right, y up, z toward the camera) in the app's world units, with the **floor at y = 0**. The app mounts each GLB at `[0, FLOOR_Y, 0] = [0, -1.55, 0]` with no rotation or scale, so room x/z are world x/z, and room y = world y + 1.55. Every helper takes room points. `C.T()` converts them to Blender axes.
- **Walls** sit on the physics colliders (`ROOM_BOX`): x from -4.7 to 4.7, back wall at z = -7. Walls run to 13 high and the floor runs to z = 11.4, so no pan ever shows an edge. Physics has an invisible front wall at z = 2 and a ceiling at 4.9. The front is open: there is no fourth wall. Props stand inside the walls (checked) and off the front wall plane: the study bookcase and the foam blocks sit in front of z = 2.
- **Tutor**: centre spot at (0, 0, 0.6). He roams x from -0.2 (`SPOTS.left`, where he teaches beside the window) to 1.05 and z from 0.6 to 1.0. At `TUTOR_SCALE` 0.8 he is 2.08 tall (2.6 model units) with a body radius of 0.64. His round platform (ellipse at (0, 0.7), rx 1.5, rz 1.05) is drawn by the app, so do not model it. Floor paint under it uses `lift <= 0.001`.
- **Camera**: fov 40 (vertical, for the 16:9 frame), position (0, 2.10, 7.4) looking at (0, 1.43, 0). At 1456 x 785 the 16:9 frame is (202, 68.125, 1052 x 591.75) px, and `setViewOffset` widens that to the full window. While the window has focus (the normal teaching state) the camera and its target pan x by -0.9; there is no pan while it is maximized.
- **The floating window**: the app has one (notes, board and quiz all live in it), 2.98 wide and 2.5 tall, centred at (-3.06, 1.88, -0.45) with yaw 0.26. Focused, it turns to yaw 0.14, keeps scale 1.0 and moves 0.25 toward the camera, with a teal outline 0.065 out from its edge. These numbers live in `APP['window']` only; the calm boxes, the screen-space check and the preview ghost are worked out from them. Students can drag and resize it, so keep a margin. Focused, its ring spans x -4.600 to -1.520: 10 cm inside the left wall (x -4.7) and 2 cm inside the study's left rail (face at x -4.62). The old pose (x -3.15, 3.0 wide, focused scale 1.06) put the ring 0.093 past the wall, and the left wall and the study rail cut it; `checks.py` warns again (`window focused: its outline reaches ... past the left wall`, `... rail_left is drawn over it`) if the pose ever drifts back.
- **Calm** (`CALM`, worked out at import): the walls the window hides from the lesson camera, at rest or focused. `window_back` is the back wall from x -4.615 to -2.043 (y 0.15 to 4.17), `window_left` the left wall from z -6.52 to -0.18. Keep them flat colour or bands: no props, shelves or posters.
- **Hoop**: the rim centre is at (4.08, 3.60, -2.6) (`PHYSICS.hoop.rim`, on the right wall), with radius 0.45 and tube 0.035. The board is 1.25 wide (along z), 0.85 tall and 0.06 thick, its centre 0.32 above the rim, flat on the x = 4.7 wall. The net is 0.36 deep. The shoot clip releases at (0, 2.0, 1.43), and the arc tops out at 4.6.
- **Ball**: radius 0.16 (`PHYSICS.ball.radius` 0.2 x `TUTOR_SCALE`): the rack balls, the rack slots' `radius` extra and `loose_ball` all use it. The seams are flat bands with their corners on the 0.16 sphere, over a body 1.7 mm smaller (radius 0.1583), so no part of a ball reaches past 0.16 from its centre: the app can swap one for its live ball's collider 1:1, and the loose ball rests on the floor without dipping into it.
- **Keep-out** (`CLEAR`, checked at build): `stage` (x ±1.9, y 0.012 to 3.0, z -0.5 to 2.2) holds flat decals only. `shot` (x -0.6 to 4.6, y 1.6 to 4.9, z -3.4 to 1.9) holds the hoop only (`hoop_*`).
- **Look**: flat palette colours with bevelled toy edges. AO and a soft key light are baked into vertex colours. Every static mesh is merged into one unlit `room_vc` material, so there are no textures and the room costs a few draw calls. Only `window_glass` and `scoreboard_screen` keep UVs. The app sets `toneMapped = false` on the room. Budget: under about 2 MB per GLB. No sparkles.
- **Text** (labels, the scoreboard's baked digits) uses the bundled Figtree ExtraBold, so every machine draws the same glyphs. If the font file is missing the build falls back to a system bold font and prints `ROOM WARN font: ...`.

## Named nodes (the app looks these up by name)

Each name is used once and contains no dots or spaces. A named mesh's node position is its bounds centre unless `C.set_origin()` sets another point.

| Room | Node | Kind | Meaning |
|---|---|---|---|
| both | `tutor_spot` | empty | His centre spot, (0, 0, 0.6). |
| study | `window_glass` | mesh, keep material, UVs | The sky panes. The app may restyle or animate them. |
| study | `window_glow`, `trophy_cup`, `trophy_star` | mesh (optional) | Window glow, and the shelf trophies the app may bounce on level-up. |
| play | `hoop_rim` | mesh | The rim ring. Its position is the rim centre and must equal the physics rim. |
| play | `hoop_backboard`, `hoop_net` | mesh | The board (centre), and the net (pivot on its top ring, so it can sway on a swish). |
| play | `scoreboard_screen` | quad, keep material, UVs | The live score face. A `CanvasTexture` on it needs `flipY = false`. |
| play | `ball_rack_slots` | empty + children | `C.slots()`: children `ball_rack_slots_0..n` sit at each ball's centre. The extras hold `count`, `radius` and `kinds`. |
| play | `scoreboard_digits`, `rack_balls`, `hoop_mount` | optional | Baked digits (hidden when the live screen draws), the balls on the rack, and the wall bracket. |
| play | `loose_ball` | mesh (optional) | The basketball on the court, pivot at its centre. A loose prop (`C.loose()`): it bakes after the rest, so hiding it (while the live ball is in play) leaves no shadow behind. |

Each GLB's root (`room_<name>`) carries its own contract in extras: `contract`, `room`, `mount`, and `layout` (a JSON string holding the nodes, release, rim, apex cap, and the clear and calm boxes). `public/models/rooms/rooms.manifest.json` collects the same data, plus each node's room position.

## Build

Run from the repo root, one command per room:

```
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python BLENDER/rooms/build_study_room.py -- --preview tmp/rooms/study.png
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python BLENDER/rooms/build_play_room.py -- --preview tmp/rooms/play.png --guides
```

These write `public/models/rooms/study_room.glb` and `play_room.glb` and merge their entries into `rooms.manifest.json`, under a lock file, so both rooms can build at once.

- **Drafts never touch the shipped files.** `--no-bake` writes `tmp/rooms/<room>_room.draft.glb`, and `--out tmp/rooms/<name>.glb` writes anywhere you name. The manifest is only written for a GLB in `public/models/rooms/`, so a draft prints `ROOM NOTE ... manifest left alone`.
- **Flags**: `--no-bake` (fast draft without AO), `--out <glb>`, `--preview <png>`, `--guides` (shot arc), `--pan -0.9` (the focused shot: camera panned, window ghost in its focused pose with its outline), `--no-tutor`, `--no-ghosts`, `--percent <n>`. The study room also takes `--preview-ghosts <png>` for a second shot with the window ghosted in.
- **Report**: the build prints one `ROOM_REPORT {json}` line (bytes, draw calls, triangles, named node positions, missing nodes, warnings) and a `ROOM WARN` line for each check that fails: a prop in a `CLEAR` or `CALM` box, a prop poking through a wall, the window's outline reaching past a wall or the floor, or any mesh, walls included, with a triangle the lesson camera draws over the window (at rest, or focused with the outline). The build still exports, so a draft can be looked at.
- **Reproducible**: same scripts, same GLB bytes. `C.stable_faces()` fixes the face order of UV spheres, which Blender otherwise shuffles from run to run.

A room script starts with:

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

root = C.new_room('study')
...
C.build(root, C.out_path('study'))
```

## Check in the app's own shot

- Dev server: `http://localhost:5176/lab/rooms.html?room=study` (or `room=play`). Optional params: `&guides=1`, `&pan=notes` (the focused shot; `pan=board` is the same shot, since there is one window), `&windows=0`, `&tutor=0`, `&ui=0`, `&void=1` (gaps show magenta). You can also drop a `.glb` on the page.
- Headless: `python BLENDER/rooms/lab_check.py public/models/rooms/play_room.glb --out tmp/rooms/play_lab.png --query "guides=1&pan=notes"`. It exits 1 if a required node is missing or the page throws or logs a console error (the TTS route it answers with a 503 is ignored). Vite will not serve `tmp/`, so the check routes `/__rooms/<file>` to the file on disk.
- Typecheck the lab page: `npx tsc -p BLENDER/rooms/tsconfig.lab.json`.
- Smoke test: run `smoke.py`, then `lab_check.py tmp/rooms/smoke.glb --out tmp/rooms/smoke.png`.
