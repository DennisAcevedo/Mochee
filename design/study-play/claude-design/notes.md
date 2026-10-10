# Claude Design pass: Study room + Play room

Harvested 2026-10-10 14:09 EDT.

- Project: **Gemini Guy rooms**, https://claude.ai/design/p/1ef728d8-e40c-4872-8206-eb1464425fc4
- Model: Opus 5.5 (Medium), design system: None. One generation, about 6 minutes, with no retry needed. It ran one self-check pass ("Found issues, fixing", then "Edited").
- Prompt sent: `prompt.md` (this folder).
- Approved rough board it builds on: `../Backgrounds.dc.html`.

## Files

| File | What it is |
|---|---|
| `study.png`, `play.png` | 1440x810 frames with the UI chrome on (top bar, Study/Play pill, caption, lesson bar or play HUD; Study also shows the Notes and Lesson Board windows) |
| `study-noui.png`, `play-noui.png` | The same frames with `showUI` off: the bare room plus the mascot. Use these as the 3D match target |
| `study-sheet.png`, `play-sheet.png` | Frame + palette legend + Claude Design's own "rebuild list" (element, position, hex) |
| `gemini-guy-rooms.dc.html` + `support.js` | The source Claude Design produced (one SVG per room, about 440 lines; `support.js` is its runtime). Opens from disk. Props: `showUI` (default true), `showGuides` (default false; draws the vanishing-point guides and the ball arc) |

The PNGs were rendered from the harvested HTML in the browser-drive Chromium. The signed `/serve/` URL only works inside the claude.ai iframe, so it could not be screenshotted directly. The `-noui` versions come from a local copy with `showUI` forced to false (`tmp/claude-design/raw/Gemini-Guy-Rooms.noui.dc.html`).

## Honest read of the images

- It is a **flat vector illustration** (SVG polygons plus a few soft gradients), not a rendered clay/3D look. The "3D" comes from one-point perspective (floor planks run to the vanishing point, the side walls are angled strips, blocks and the bookcase have a top and side face), soft contact-shadow ellipses, a pale glow ellipse on the back wall and a corner vignette. This makes it easy to rebuild with boxes, planes, cylinders and spheres, using flat or toon materials.
- The camera matches in both rooms: vanishing point at (720, 300), back wall x 150 to 1290, floor line at y 486 (60% down). Neither room shows a ceiling; the back wall runs off the top of the frame.
- The **Study** room is calm and pale, as asked. The window is **centred above Gemini Guy**, not upper right. With the UI on, the Notes and Lesson Board windows sit at upper left and upper right and frame the window between them. No sparkles. The Notes window's bottom edge overlaps the top of the LIBRARY bookcase by about 10 px.
- The **Play** room is loud and sunny, as asked. It has **no bleachers and no climbing wall**: it used soft toy blocks instead. The ball-to-hoop arc above and right of the mascot is kept clear. The orange block at front right slightly covers the free-throw circle line. The basketballs are flat orange discs with black seam lines; the rack also holds a blue volleyball and a purple dodgeball.
- The mascot is the same SVG in both rooms: white body, glossy black eyes, pink cheeks, purple mortarboard with a gold tassel, on a white disc platform with a rainbow rim and a lilac plinth. It is about 230 px tall, centred at x 720 with the platform at y 598.

## Camera and scale (derived from the SVG, for three.js)

Use 100 px = 1 unit on the back-wall plane. Then:

- Room width is 11.4 u (back wall x 150 to 1290). Eye height is 1.86 u (floor line y 486 minus horizon y 300).
- The horizon sits at y 300, which is 105 px above frame centre, while the verticals stay parallel. So use a vertical lens shift (`camera.setViewOffset`) rather than tilting the camera. A small downward pitch of about 5 degrees is an acceptable approximation.
- Example camera: vFOV 40 degrees at 16:9 gives hFOV about 66 degrees. The back wall then sits about 11.1 u in front of the camera, and the side walls leave the frame at about 0.79 of that distance.
- Converting a floor point at screen (x, y): depth fraction `f = 186 / (y - 300)` (1 = at the back wall, smaller = nearer the camera), world x = `(x - 720) * f / 100`. On the back wall, height above the floor = `(486 - y) / 100`.

## Palette

### Study room

| Hex | Role |
|---|---|
| `#DCE6EE` | back wall (pale blue-grey) |
| `#C8D5E1` | side walls (a shade darker) and the silver trophy |
| `#F2EADB` | wainscot panel and LIBRARY label plate |
| `#FBF8F3` | trim: chair rail and ledge, moulding outlines, baseboard, window frame and sill |
| `#EADBC4` | floor (pale wood) |
| `#D6C1A2` | floor plank seams |
| `#C49A74` | wood: bookcase and trophy shelf |
| `#BFDDF2` to `#E6F2FA` | window sky gradient (white clouds) |
| `#CFDCD4` | round rug (sage), with a `#FBF8F3` inner ring |
| `#7FA3B6` | book spine blue, and the book on the ledge |
| `#D49C84` | terracotta: book spines and plant pot |
| `#93B394` | sage: book spines, plant leaves, mug |
| `#E2BE6A` | gold: book spines, gold cup and star |
| `#14A39A` | Notes window accent (teal) |
| `#4F55C9` | Lesson Board window accent (indigo) |

### Play room

| Hex | Role |
|---|---|
| `#FF8A3D` | top wall stripe (y 0 to 120), baseboard, front-right block |
| `#4DB4F0` | middle stripe (y 120 to 180), volleyball, big front-left block |
| `#8A5CE6` | lower stripe (y 180 to 240), painted key, dodgeball, small stacked block |
| `#FFCE4A` | lower wall (y 240 to 486) and the scoreboard digits |
| `#E3A55C` | court floor (honey wood) |
| `#C98A45` | court plank seams |
| `#FFFFFF` | court lines, backboard, net |
| `#262A44` | dark navy metal: scoreboard panel, ball rack, hoop bracket |
| `#F2702E` | basketballs, rim, backboard target square |

The side walls use the same stripe colours with a dark `#1E2A3A` overlay at 12% opacity.

### Shared (mascot and stage)

| Hex | Role |
|---|---|
| `#FFFFFF` with `#E6E1F0` | body, shaded via a radial gradient |
| `#1E1B2E` | eyes and ink; also the shadow tint |
| `#F7A8B8` | cheeks |
| `#7B4FD6` / `#5A36A8` | cap top / cap side |
| `#F2C14E` | tassel |
| `#F4F1FA` / `#D9D3E8` | platform top / plinth |
| `#FF7A59`, `#FFC94A`, `#5CC98A`, `#4FA8F0`, `#8C6CF0` | rainbow rim gradient |
| `#1E2A3A` | shadow and ambient-occlusion tint, used at low alpha |

The UI type in the mock is Lexend, plus JetBrains Mono for the scoreboard and code.

## Study room: element list and placement

Positions are given as screen px, then as world units from the formulas above. "Back wall" means the item sits on the wall plane (f = 1).

| Element | Where | Screen px | Approx world | Colour |
|---|---|---|---|---|
| Back wall | full back | x 150 to 1290, y 0 to 486 | 11.4 u wide, taller than 4.86 u | `#DCE6EE` |
| Side walls | left and right strips | 150 px wide each | continue the rail and panel | `#C8D5E1` |
| Wainscot panel | back wall, lower | y 398 to 486, 8 moulding outlines at y 414 to 460 | 0 to 0.88 u high | `#F2EADB`, outlines `#FBF8F3` |
| Chair rail / ledge | back wall, full width | y 384 to 405 | about 0.8 to 1.0 u high | `#FBF8F3` |
| Window | back wall, upper centre (above the mascot) | x 578 to 862, y 80 to 332; glass x 594 to 846; sill y 326 to 340 | x -1.4 to 1.4, 1.5 to 4.1 u high | frame `#FBF8F3`, sky `#BFDDF2` to `#E6F2FA` |
| Wall glow | back wall, behind the window | ellipse centred (720, 210), r 250 x 180, white at 32% | (a light, not geometry) | `#FFFFFF` |
| Book stack | ledge, left of centre | x 430 to 494 | x about -2.9 to -2.3 | `#D49C84`, `#7FA3B6` |
| Mug | ledge, right of centre | x 892 to 924 | x about 1.7 to 2.0 | `#93B394` |
| Trophy shelf (gold cup, gold star, silver cup) | back wall, right, at panel height | shelf x 1040 to 1260, y 452 | x 3.2 to 5.4 | wood `#C49A74`, gold `#E2BE6A`, silver `#C8D5E1` |
| LIBRARY bookcase (2 shelves, about 18 spines, label plate) | floor, front left, against nothing | front face x 120 to 380, y 392 to 560; side face to x 414 | x -4.3 to -2.4, about 1.2 u tall, f about 0.72 | `#C49A74`; spines `#7FA3B6`, `#D49C84`, `#93B394`, `#E2BE6A` |
| Floor | full | y 486 down; planks run to the vanishing point | | `#EADBC4`, seams `#D6C1A2` |
| Daylight patch | floor, centre, straight out from the window | trapezoid 612..828 at y 490 to 522..918 at y 640 | strip about 2.2 u wide, from the wall to f about 0.55 | white at 26% |
| Round rug | floor, centre, under the platform | ellipse (720, 622), r 340 x 78 | radius about 2 u | `#CFDCD4` with a `#FBF8F3` ring |
| Platform + Gemini Guy | floor, centre | platform (720, 598), diameter 260 | f about 0.62, diameter about 1.6 u, mascot about 1.4 u tall | shared palette |
| Potted plant | floor, front right | pot x 1298 to 1374, bottom y 648 | x about 3.3, f about 0.53 | pot `#D49C84`, leaves `#93B394` |
| Notes window (UI) | floating, upper left | x 64 to 444, y 80 to 380 | in front of the wall | white, `#14A39A` |
| Lesson Board window (UI) | floating, upper right | x 976 to 1376, y 80 to 380 | in front of the wall | white, `#4F55C9` |

## Play room: element list and placement

| Element | Where | Screen px | Approx world | Colour |
|---|---|---|---|---|
| Stripes | back wall and side walls, top | orange y 0 to 120, blue 120 to 180, purple 180 to 240 | heights about 4.86 to 3.66, 3.66 to 3.06, 3.06 to 2.46 u | `#FF8A3D`, `#4DB4F0`, `#8A5CE6` |
| Lower wall | back wall and side walls | y 240 to 486 | 0 to 2.46 u | `#FFCE4A` |
| Baseboard | back wall | y 474 to 486 | about 0.12 u | `#FF8A3D` |
| Wall glow | back wall, centre | ellipse (720, 300), r 420 x 220, white at 12% | | `#FFFFFF` |
| Scoreboard "SHOTS / 7 / 10" | back wall, high, left of centre (overlapping the stripes) | x 440 to 690, y 84 to 212 | x -2.8 to -0.3, 2.7 to 4.0 u high | panel `#262A44`, "SHOTS" white, digits `#FFCE4A` |
| Backboard + target square | back wall, right | x 1020 to 1200, y 196 to 314; square x 1082 to 1138 | x 3.0 to 4.8, 1.7 to 2.9 u high | `#FFFFFF`, `#F2702E` |
| Rim + net | right, under the backboard | rim ellipse (1110, 334), r 44; net down to y 390 | x 3.9, about 1.5 u high (bring it about 0.4 u off the wall in 3D) | rim `#F2702E`, net white, bracket `#262A44` |
| Court floor | full | planks run to the vanishing point (denser than Study) | | `#E3A55C`, seams `#C98A45` |
| Painted key | floor, right, running out from the wall under the hoop | x 1010 to 1210 at the wall, 1203 to 1537 at y 610 | x 2.9 to 4.9, from the wall to f about 0.6 | `#8A5CE6`, white outline |
| Free-throw circle | floor, right, end of the key | ellipse (1370, 610), r 167 | centre x 3.9, radius about 1 u | white line |
| 3-point arc | floor, centred under the hoop, passing just right of the mascot | from x 810 to 1410 at the wall, bulging to y 596 | centre x 3.9, about 3 u across | white line |
| Ball rack (2 tiers, 8 balls) | floor, back left | x 170 to 400, y 412 to 548 | x -4.1 to -2.4, about 1 u tall, f about 0.75 | rack `#262A44`; 6 basketballs `#F2702E`, a volleyball `#4DB4F0`, a dodgeball `#8A5CE6` |
| Loose basketball | floor, left of centre, by the rack | (440, 566), r 25 | x about -1.8, f about 0.64 | `#F2702E` |
| Soft blocks, stacked | floor, front left | big x 64 to 194, bottom y 740; small on top x 84 to 162 | x about -2.5, f about 0.42, sizes about 0.55 u and 0.33 u | blue `#4DB4F0`, purple `#8A5CE6` |
| Soft block | floor, front right | x 1252 to 1362, bottom y 760 | x about 2.4, f about 0.40, about 0.45 u | `#FF8A3D` |
| Platform + Gemini Guy | floor, centre | same as Study | same as Study | shared palette |
| Ball flight (guide only) | above the mascot to the hoop | quadratic curve (770, 380), control (960, 140), end (1110, 330) | keep this space clear | |
| HUD (UI) | bottom | caption box x 340 to 1100, y 676 to 740; 5 pills below it | | active pill `#262A44`, others white at 72% with a backdrop blur (they read cream over the floor); Study/Play pill active `#1E1B2E` |
