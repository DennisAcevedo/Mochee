# Handoff: Tutor 3D Character

## Overview
"Tutor" is a small, friendly 3D mascot for an edtech web app. He floats in the scene, talks, follows the cursor, and switches between 7 animated states (explaining, pointing, celebrating, waving, thinking, listening, shrugging). This bundle holds the complete, working source for the character so it can be rebuilt or integrated into a real codebase.

## About the Design Files
`tutor-3d.js` is a **design reference built as a working prototype**: a self-contained web component (`<tutor-3d>`) written with three.js. It shows the intended look, proportions, materials and motion. Recreate it in the target codebase's environment, for example:
- **React:** wrap it as-is (it's a standard custom element), or port it to `@react-three/fiber` using the same geometry, materials and tick logic.
- **Vue/Svelte/plain:** the custom element works directly.

You can ship the file as-is if it fits the stack. In that case, swap the CDN import for a bundled `three` dependency (see Dependencies).

`demo.html` opens the character full-screen with buttons for every state. Serve the folder locally (e.g. `npx serve .`), because ES module imports don't load from `file://`.

## Fidelity
**High-fidelity.** Colors, proportions, materials, lighting and animation timing are final. Match them closely.

## Dependencies
- three.js **0.169.0**, loaded at runtime from `https://esm.sh/three@0.169.0`
- `RoomEnvironment` from `three/examples/jsm/environments/RoomEnvironment.js` (optional; used for soft reflections, with a graceful fallback)

In a bundled app, replace the `lib()` loader at the top of the file with:
```js
import * as T from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
```

## Usage / API
```html
<script src="tutor-3d.js"></script>
<tutor-3d pose="explain" speaking="on" roam="0.8" size="1.2" rleft="0" rright="1"
          style="position:absolute; inset:0"></tutor-3d>
```
The element fills its container, uses a transparent canvas, and ignores pointer events (`pointer-events:none`), so the UI behind it stays clickable. Set attributes or the matching JS properties.

| Attribute | Values | Meaning |
|---|---|---|
| `pose` | `explain` · `point` · `celebrate` · `wave` · `think` · `listen` · `shrug` | Current animation state. Switching to `celebrate` also triggers a one-time 360° spin. |
| `speaking` | `on` / `off` | Animates the mouth open and closed and lifts the brows slightly. |
| `roam` | 0–1 | How far he drifts left/right, up/down and toward/away from the camera. 0 is almost still. |
| `size` | ~0.5–1.6 | Target scale. Auto-capped so he always fits the region. |
| `rleft`, `rright` | 0–1 | Horizontal region of the canvas he's allowed to occupy, as fractions of the width. Use this to keep him clear of overlapping UI, like a whiteboard on the right (e.g. `rright="0.55"`). |

## Character Spec

**Body**: sphere (r 0.8 units) with a flattened, slightly flared base, like a gumdrop. White matte physical material: `#f7f7f5`, roughness 0.6, sheen 1, clearcoat 0.12.

**Face** (features are placed on the sphere surface and face outward along its normal):
- Eyes: glossy black (`#131316`, clearcoat 1), sphere r 0.094, scaled (1, 1.1, 0.5), at x ±0.205, y −0.01. Each has two white highlights: a large one (r 0.03, upper right) and a small one (r 0.013, lower left).
- Brows: thin arcs (`#2c2224`), torus r 0.05, tube 0.012, at x ±0.21, y 0.16.
- Smile: small arc, torus r 0.048, tube 0.014, at y −0.13.
- Open mouth (talking): dark `#3a2224` half-ellipsoid with a pink tongue `#e48c88`, at y −0.15. Its height animates while speaking.
- Cheeks: soft radial blush `rgba(250,140,150,0.75)`, 0.26 × 0.15, at x ±0.37, y −0.1.
- Blink every 2.5–5.5 s (random), taking 0.16 s.
- Happy state (celebrate): the eyes are replaced by upward arcs (∩∩).

**Hands**: two floating mittens, not attached to the body. Each is a capsule (r 0.15, length 0.06) scaled (1, 1, 0.74) with a thumb nub, in `#fdfdfc`. They follow pose targets on a spring (stiffness 70, damping 9), so they lag and overshoot naturally.

**Cap**: a graduation cap tilted slightly.
- Skull: cylinder r 0.47–0.52, h 0.24, with a vertex-color gradient from `#3d5ad6` (bottom) to `#6a4fd0` (top). Velvet sheen `#b8c4ff`.
- Board: 1.1 × 0.05 × 1.1, rotated 45°, gradient `#5a4cc8` → `#7a5ce0`.
- Button, cord and tassel: `#c9d2ff`, roughness 0.3, metalness 0.35. The tassel swings on a spring driven by his velocity.
- Front emblem: a four-point sparkle (extruded bezier shape) in pearl `#fbfaff` with iridescence 0.6.

**Ground shadow**: a radial blob that shrinks and fades as he rises.

**Lighting**: ACES filmic tone mapping at exposure 1.18. Lights: hemisphere light (`#ffffff` / `#e4e0d8`, 1.2), warm key light from top right (2.0, soft shadows), cool fill light from the left (0.6), and a rim light from behind (1.4). Camera FOV is 28°, positioned at (0, 0.5, 9).

## Motion
- **Roaming**: layered sine waves on x (periods ~20 s and ~7.5 s), y (~12 s and ~4.6 s) and z (~15 s), scaled by `roam`, eased with exponential damping.
- **Secondary motion**: leans (roll) and turns (yaw) into horizontal velocity, pitches with vertical velocity, and squashes and stretches on vertical speed. There's also a constant gentle head tilt (~9 s period).
- **Cursor tracking**: yaws toward the pointer (up to ±0.45 rad) and pitches with the cursor's height.

## States
| Pose | Hands | Head / face | Suggested trigger |
|---|---|---|---|
| explain | left low, right gesturing up and down | follows cursor | Default while teaching |
| point | right hand extended sideways, poking | turned 0.5 rad toward the board | Referencing the whiteboard |
| celebrate | both hands raised, pumping | happy eyes, wide mouth, bouncing, 360° spin on enter | Correct quiz answer |
| wave | right hand raised, waving quickly | slight tilt | Session start / greeting |
| think | one hand at the chin, the other under it | looks up and away, one brow raised | While generating an answer |
| listen | right hand held up by his side | head tilted, small nod | Mic on, student speaking |
| shrug | both palms up and out, with a little lift | both brows up, small hop | Wrong answer, gentle retry |

All state changes blend smoothly. Hands spring to their new targets, and head offsets damp at a rate of about 4/s.

## Performance
- Rendering pauses when the element is offscreen (IntersectionObserver).
- Device pixel ratio is capped at 2, and the shadow map is 2048².
- `preserveDrawingBuffer: true` is only there so screenshots can read the canvas. Remove it in production.
- Each `<tutor-3d>` instance has its own WebGL context. Browsers allow about 16 at once, so for galleries prefer one renderer with several scenes.

## Files
- `tutor-3d.js` — the complete character: geometry, materials, lighting and every animation.
- `demo.html` — a standalone test page with buttons for each state and for talking.
