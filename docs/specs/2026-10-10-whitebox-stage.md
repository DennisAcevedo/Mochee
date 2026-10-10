# White-box stage, Blender tutor, guided lessons, play + level-up

Date: 2026-10-10. Owner: RON2K. Branch `ron2k/local-dev` (LOCAL ONLY: never push, never commit to main).

## What RON2K asked for
1. The lesson stage becomes a **white-box room** (one-point-perspective interior). The tutor lives in the middle and his animations play inside it.
2. **Mini Chrome-style windows** with tabs float LEFT (notes / PDFs) and RIGHT (board / quick check) of the tutor. They are **3D objects in the scene**, so the whole thing is movable (camera moves, windows tilt, depth and shadows are real).
3. The tutor is **rebuilt in Blender** with full animations: basic moves, special effects, and **dance moves to encourage**. Animations must be fast and snappy (60 fps, quick crossfades).
4. **Visually appealing**: bold, multicoloured accents on a white room (see `PALETTE` in `src/scene/layout3d.ts`), bold type (Figtree 800), colour-coded highlights.
5. **Fully wired guided lesson**: he actually walks the student through the material: walks to a window, points, highlights lines, switches tabs, reveals the board step by step, narrates with voice + captions, runs the quick check, celebrates.
6. **Play + level-up** (instead of "beat the boss"): the student can play with him (poke/tickle, high-five, play catch, feed a snack, dance party) to earn XP; he levels up and unlocks new dances and effects. Learning also earns XP.
7. Real answers: the ask box goes through a **server-side Gemini proxy** (key never reaches the browser).

## Architecture (one R3F Canvas, the existing one in `src/scene/Stage.tsx`)
- `src/state/director.ts`: **the stage contract** (spot, focus, loop clip, one-shot gesture, fx events, notes tab, highlight id, board reveal, caption). Everything goes through it. Do not rename exports; you may ADD fields/actions if you need them (coordinate in your report).
- `src/state/progress.ts`: XP + level contract (`award(reason)`, `xpForLevel`, `levelForXp`, `levelUpId`).
- `src/scene/layout3d.ts`: world constants (floor, spots, window placements, tutor scale, lesson camera, palette). Tune values HERE, never inline.
- `src/scene/anchors.ts`: live world positions (tutor head, hands, window centers) written per frame, read by fx/props.
- `src/data/stageContent.ts`: window content with stable line ids; `BOARD_PARTS` reveal order.
- Existing tutor store `src/state/store.ts` stays the source for mode (lecture/quiz), mic, transcript, quiz answer. The board window's "Quick check" tab == `mode === 'quiz'` (click → `setMode`). Quiz options call `pick(i)`.

Coordinate space: three.js, Y up, +Z toward the camera, viewer's left = -X. Floor at `FLOOR_Y`.

## Blender tutor contract (`public/models/tutor.glb`)
Built by a reproducible script: `blender/tutor/build_tutor.py` run as
`"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python blender/tutor/build_tutor.py`.
Clip keyframes come from `blender/tutor/clips.json` (schema below), so new clips (e.g. from ChatGPT) can be added as data.

Look: same character as `design/README.md` / `src/character/geometry.ts` + `materials.ts` (white gumdrop body r 0.8, glossy black eyes with highlights, brows, smile, open mouth with tongue, pink cheeks, indigo->violet graduation cap with gold button and tassel, floating mitten hands), PLUS two small floating rounded feet (same style as the hands) so walking and dancing read. Smooth, subdivided, bevelled, no faceting. Model faces -Y in Blender (exports facing +Z in glTF).

Rig: rigid parts parented to bones (no skin weights needed). Bone names (exact):
- `root` at the floor origin (0,0,0). Everything is under it.
- `body` (child of root) at the body centre: squash/stretch, lean, bob. Face parts and the cap ride on it.
- `cap` (child of body), `tassel` (child of cap).
- `hand.L`, `hand.R`, `foot.L`, `foot.R` (children of root, NOT body: they float independently). `.L` is HIS left = viewer's right (+X).
Face nodes (separate mesh objects parented to `body`, exact names, the app drives them in code): `eye.L`, `eye.R` (scale Y for blink), `happy.L`, `happy.R` (∩ arcs, hidden by default via scale 0 in rest pose is NOT allowed; keep scale 1, the app toggles `.visible`), `brow.L`, `brow.R`, `smile`, `mouth` (open mouth group; app scales Y for talking), `cheek.L`, `cheek.R`. Cap mesh material named `cap` (app may recolour).

Clips (glTF animation names, exact). Loops: `idle`, `talk`, `think`, `listen`, `point_left`, `point_right`, `walk`, `sleep`. One-shots: `wave`, `hop`, `shrug`, `celebrate`, `dance_bounce`, `dance_spin`, `dance_robot`, `giggle`, `highfive`, `catch`, `yum`, `levelup`, `wake`. Loops must loop seamlessly (first key == last key). Clips never translate `root` in X/Z (the app moves him); vertical bob/hops are fine. `point_left` points toward viewer's left (the notes window), `point_right` toward viewer's right (the board). Snappy timing: anticipation, overshoot, squash and stretch; one-shots 0.8 to 2.6 s.

### clips.json schema
```json
{
  "fps": 30,
  "clips": [
    {
      "name": "dance_bounce",
      "loop": true,
      "duration": 2.0,
      "face": "happy",
      "fx": [[1.0, "sparkles"]],
      "keys": {
        "body":   [[0.0, {"loc": [0, 0, 0], "rot": [0, 0, 0], "scale": [1, 1, 1]}, "bezier"]],
        "hand.R": [[0.0, {"loc": [0, 0, 0]}], [0.5, {"loc": [0.1, 0.6, 0.1], "rot": [0, 0, -40]}, "back"]]
      },
      "notes": "free text"
    }
  ]
}
```
- `keys[bone]` is a list of `[time_seconds, channels, ease?]`. Channels: `loc` = OFFSET from the bone's rest position in three.js axes (x right, y up, z toward camera), in model units (body radius = 0.8); `rot` = degrees (x pitch, y yaw, z roll) added to rest; `scale` = multiplier. Omitted channels stay at rest. `ease` ∈ `linear | bezier | constant | back | bounce | elastic` (Blender interpolation of the key's segment; default `bezier`).
- `face` ∈ `neutral | happy | closed | surprised | focused` (the app applies it while the clip plays). `fx` = `[time, kind]` the app fires (kinds as `FxKind` in director.ts).

## Ownership (parallel builders; touch ONLY your files)
| Builder | Owns |
|---|---|
| blender | `blender/tutor/**`, `public/models/tutor.glb`, `public/models/tutor.manifest.json` |
| room | `src/scene/room/**`, `src/scene/windows/**`, `lab/room.*`, may tune `src/scene/layout3d.ts`, installs `@fontsource/*` |
| character | `src/character/blender/**`, `lab/character.*` |
| lesson | `src/lesson/**` (walkthrough, runner, speech, Gemini client), `server/**`, `vite.config.ts`, `tsconfig.node.json`, `src/ui/Walkthrough/**`, `src/ui/Caption/**` |
| play | `src/play/**`, `src/scene/fx/**`, `src/ui/PlayHud/**`, may implement `src/state/progress.ts` (keep exports) |
| integrator (later) | `src/scene/Stage.tsx`, `CameraRig.tsx`, `src/pages/LessonPage.tsx`, intro wiring, styles |

## Rules for every builder
- NEVER `git commit`, `git push`, `git stash`, `git checkout -- .` or reset. The orchestrator commits.
- NEVER read, print, cat, echo, grep or log `gemini_API.txt` or any key. Only server code reads it at runtime.
- Do not run `npm install` unless you are the room builder (fonts). Do not restart or kill the dev server (http://localhost:5176, already running, HMR on).
- `npm run typecheck` may show errors in OTHER builders' in-progress files; fix only yours, and say which errors you saw elsewhere.
- Preview your work on a dev-only page `lab/<name>.html` + `lab/<name>.tsx` (Vite serves it at http://localhost:5176/lab/<name>.html; it is not in the production build). Screenshot it with Python Playwright (`python` = 3.14 has playwright) and LOOK at the screenshot before you report.
- Every number goes in a config object at the top of your module or in `layout3d.ts`. Comment density and naming like the surrounding code.
