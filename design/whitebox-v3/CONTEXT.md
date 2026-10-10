# Gemini Guy: design context (as of 2026-10-10 05:25 ET)

Context for another design tool or CLI. The images in this folder show how the character and the lesson UI look right now. The last section says where the build is heading, so new design ideas fit it.

## Files here
- `stage-ui.png`: the lesson screen (white-box stage v3), 1440x900 at 2x.
- `movements.png`: the 8 basic movements storyboard.
- `poses/*.png`: the character alone, 940x820 renders: idle, wave, think, listen, point-notes, point-board, hop.
- `poses-sheet.png`: all 7 poses side by side.
- Source: Claude Design artifact "GeminiGuy White Box Stage" v3 (https://claude.ai/artifact/8sedQ7dB4cz6UhMn9vLqqK, private to RON2K's account).

## The product
GeminiGuy is a study app for college students. A student uploads lecture PDFs, and Gemini Guy, a 3D mascot tutor, teaches them:
- He walks them through the material and points at it.
- He answers spoken or typed questions (Gemini answers through a server proxy).
- He runs quick quizzes.
- Students can also play with him to earn XP and level him up. This replaces an earlier "beat the boss" idea.

## The character (current look)
- **Body = head.** A white gumdrop (sphere radius 0.8 units, slightly flattened, flared base). Matte white `#f7f7f5` with a soft sheen.
- **Face:**
  - Big glossy black eyes `#131316`, two white highlights each.
  - Thin dark brows `#2c2224`, a small smile and pink cheek blush.
  - When he talks: an open mouth with a pink tongue `#e48c88`.
  - When he's happy: the eyes become ∩∩ arcs.
- **Cap:** an indigo-to-violet graduation cap (`#3d5ad6` to `#6a4fd0`) with a white four-point sparkle on the front, a gold button and a tassel.
- **Hands and feet:** no arms or legs. Two floating white mitten hands `#fdfdfc` with thumb nubs (Rayman style). The 3D rebuild adds two small floating rounded feet so walking and dancing read clearly.
- **Size and shadow:** about 2.6 units tall from floor to cap top, with a soft contact shadow on the floor.
- **Personality:** small, joyful, slightly goofy, never distracting while teaching.

## The lesson screen (current layout, see stage-ui.png)
- **Top:** a pill input bar. Teal mic button, "Ask about CPU scheduling" field, black send button.
- **Stage card:** a rounded card holding a **white-box room**, a one-point-perspective interior with a back wall, floor, ceiling and two side walls, lit soft white. The character stands centre floor.
- **Left: a mini Chrome window (notes).**
  - Tab strip with 3 PDF tabs, plus an address bar showing `tutor.app/notes/cs111-lecture-4.pdf#page=7`.
  - The page content uses teal highlighter marks on the line he is explaining.
- **Right: a mini Chrome window (board).**
  - Tabs "Board · FCFS" and "Quick check".
  - Handwritten Caveat heading "FCFS: run jobs in arrival order".
  - A Gantt bar (P1 teal 24 ms, P2 sun, P3 violet) and the handwritten working "avg wait = (0+24+27)/3 = 17 ms" with a hand-drawn ring around the result.
- **Header pill:** "Tutor · CS111 · Operating Systems · First-come, first-served", "Section 2 of 5" progress dots, and a "Lesson panel" button.
- **Caption bubble** at the bottom of the room: "**Tutor** So far we've said…".
- **Type:**
  - Figtree is the UI font (bold 700–800 for emphasis).
  - Caveat is the board handwriting.
  - JetBrains Mono is used for labels and URLs.

## Motion (current spec, see movements.png)
| Move | When | Spec |
|---|---|---|
| Idle | default while teaching | bob 8 px every 3.4 s, slow head tilt, eyes follow the cursor |
| Wave | session start | right hand springs up, waves fast |
| Point at board / notes | explaining a window | glide 14% toward it in 0.9 s, reach; that window tilts in and gets a teal ring |
| Walk to a window | moving between spots | 3 steps × 0.3 s, glide 0.9 s |
| Hop | correct quiz answer | 2 hops × 0.7 s, squash and stretch, shadow shrinks in the air |
| Think | while Gemini answers | hand at chin, looks up and away |
| Listen | mic on | hand up by his side, head tilted, small nods |

Poses blend in about 0.2 s; the hands spring to each new pose.

## Where it is heading (build in progress tonight)
- **Everything in one 3D scene** (react-three-fiber). The room and both Chrome windows become real 3D objects with depth and shadows, and the camera eases toward whichever window he is explaining.
- **Character rebuilt in Blender** (glTF, bone rig: root, body, cap, tassel, hand.L/R, foot.L/R) with full animation clips:
  - Loops: idle, talk, think, listen, point_left, point_right, walk, sleep.
  - One-shots: wave, hop, shrug, celebrate, giggle, highfive, catch, yum, levelup, wake.
  - Dances: dance_bounce, dance_spin, dance_robot.
  - Motion is snappy: 0.15–0.2 s crossfades, anticipation, overshoot.
- **Visually bold and multicoloured.** The white room is the canvas; accents use teal `#12a4b4`, coral `#ff6b5b`, sun `#ffc83d`, violet `#7c5cf2`, lime `#4cc76a`, pink `#ff6fae` and indigo `#3d5ad6`, on ink `#1d1b24`. Type is bold (Figtree 800), and highlights are colour-coded.
- **Guided walkthrough bar:**
  - A "Step 3 of 12" chip, Back / Play-Pause / Next / Restart controls and a multicolour segmented progress bar.
  - A big caption bubble with bold coloured key terms.
  - A spoken voice (ElevenLabs, being wired in now).
- **Effects:** confetti, sparkles, hearts, stars, a ring shockwave and a level-up flash, fired from the tutor or from either window.
- **Play HUD:**
  - A level badge with a rank title (Rookie, Buddy, Groover, Stylist, Party Star, Legend) and a gradient XP bar with shimmer.
  - Buttons: High five / Play catch / Snack / Dance. Locked dances show a lock and "Level N".
  - "Tap Gemini Guy to tickle him", floating "+N XP" toasts and a level-up banner listing what unlocked.
- **Unlocks:** L2 spin dance, L3 robot dance, L4 rainbow cap, L5 party lights.

## Design asks that fit
- Concept art: turnaround, expressions, key poses, dances, level 1–6 cosmetics.
- HUD, walkthrough bar and caption styling.
- Room lighting and party-light states.
- Effect looks.
- New play interactions and dance ideas.

Keep the white room and the character's silhouette; push colour into accents, effects and UI chrome.
