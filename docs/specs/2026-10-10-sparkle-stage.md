# Round 2: sparkle stage, Chrome tabs, roaming tutor

Approved by RON2K on 2026-10-10 (10:45). The visual target is the Claude Design canvas, copied into `design/sparkle-stage/`:

- `Main.dc.html`: the lesson screen. Pastel sparkle stage, fixed 16:9 frame, header in its own row, HUD at the top of the stage, caption at the bottom, two windows with tabs, the tutor on a white disc with a rainbow rim.
- `NewTab.dc.html`: the New tab page (Scratch note, lesson sections, the student's PDF pages).
- `Roam.dc.html`: how he moves (start spin, pace, wander, right/wrong answer, question) and the rules.
- `design/character-ref/gemini-guy-reference.jpg`: the character. A separate Blender rebuild is in progress (see "Do not touch").

Open the `.dc.html` files and read them. Inline styles and the `renderVals()` logic at the bottom give the exact colours, sizes and behaviour. They are mocks: port the intent into the real 3D app; do not copy DOM into the scene.

RON2K's asks for this round, verbatim where it matters:
- "make the background a better theme, inside a classroom isnt good"
- "white box should fix aspect ratio so headings arent wrapped over each other"
- "the tabs should be able to be added and deleated and made bigger"
- "the tabs should be able to open and close like a real google tab and that should also be moveable"
- "gemini guys movements need to be able to move randomly he should pace back and forth or [move] left [and] right at random or do emotes when you answer questions"
- "all the new variants should have feet and the spinning animation when it starts"
- "make more dancing animations" (a separate follow-up adds new dance clips to the GLB; this round must make adding one a one-line change)

## Rules for every agent

- Repo `C:\Users\thegr\OneDrive\Desktop\GeminiGuy`, branch `ron2k/local-dev`. Do NOT commit, push, stash, reset or touch git config. Never `cd` out of the repo in Bash (use absolute paths).
- Never read, print or copy `gemini_API.txt` or `ElevenLabsAPI.txt`. Never call `/api/tts` or `/api/ask` in a loop (ElevenLabs credits are limited; the e2e suites already mock or cache what they need).
- The Vite dev server runs on http://localhost:5176. NEVER kill or restart it. HMR picks up edits.
- Do not touch: `BLENDER/**`, `public/models/**` (a character-rebuild agent owns them right now), `server/**`, `shared/**` unless your section says so.
- Other builders edit other files at the same time. If `npm run typecheck` reports errors only in files you do not own, ignore them, then re-run at the end. Never "fix" another owner's file. If you need something from another owner, use the contract below or write it in your report.
- The frontend/backend boundary holds: `server/` never imports `src/`, `src/` never imports `server/`, `shared/` imports neither (`npm run test:server` checks it).
- Style: match the surrounding code (2-space TS, no semicolons, single quotes, named exports, short comments that say why). Tune values in config objects, not inline. React Three Fiber: no allocations inside `useFrame` (reuse vectors), damp with the existing helpers.
- Keep every existing `window.__gg` hook and e2e-visible behaviour working unless this spec changes it.

## Ownership

| Builder | Owns (may edit or create) |
|---|---|
| stage | `src/scene/room/**`, `src/scene/layout3d.ts`, `src/scene/Lights.tsx`, `src/scene/CameraRig.tsx`, `src/scene/Stage.module.css`, `src/scene/evolution/**`, `src/scene/fx/PartyLights.tsx`, `src/pages/LessonPage.tsx` and its CSS modules, `src/ui/TopBar/**`, the `*.module.css` files under `src/ui/PlayHud/`, `src/ui/Caption/`, `src/ui/Walkthrough/`, `src/ui/Drawers/` (CSS only), `src/ui/ModeSwitch/**` |
| windows | `src/scene/windows/**`, `src/state/windows.ts`, `src/debug/GGHooks.tsx` (add a `windows` key only), `tests/ui/**` (create), `package.json` (add a `test:ui` script only) |
| tutor | `src/scene/Stage.tsx`, `src/character/blender/**`, `src/intro/**`, `src/animation/introState.ts`, `src/state/director.ts` (add fields and actions; never rename or remove), `src/lesson/roam.ts` (create), `src/lesson/runner.ts`, `src/lesson/askFlow.ts`, `src/ui/Drawers/tutorCues.ts`, `src/scene/physics/PhysicsTutor.tsx`, `src/scene/CharacterDirector.tsx`, `tests/ui/roam*.test.ts` |
| integrator / fixer | anything, after the builders finish |

## Contracts between builders

- `src/scene/room/LessonRoom.tsx` keeps exporting `LessonRoom`; `Stage.tsx` mounts it unchanged.
- `src/state/windows.ts` exports `useWindows` with `maximized: 'notes' | 'board' | null` (the stub is in place). The tutor builder reads it; the windows builder implements everything else in that store.
- `src/state/director.ts`: the tutor builder adds what roaming needs (for example a free x target alongside `spot`). Existing fields and actions keep their names and meaning.
- `CameraRig.tsx` keeps reading `introState` the way it does now, so the intro's camera pull-out still works.
- Window placements stay in `WINDOWS` in `layout3d.ts` (owned by stage). The windows builder treats them as defaults and keeps drag offsets and sizes in its own store or config.

## Stage builder: sparkle stage and framing

1. Replace the white-box classroom (back wall, floor, ceiling, side walls) with the pastel sparkle stage from `Main.dc.html`: soft pastel backdrop (blue glow on the left, peach top right, warm yellow bottom right) and floating rainbow four-point Gemini sparkles at several depths with a slow bob and twinkle. Add a white disc platform with a rainbow rim (#4285F4, #EA4335, #FBBC04, #34A853) under the tutor, and soft contact shadows. The canvas renders with `alpha: true`, so a CSS gradient behind it is allowed, but the sparkles must be real 3D objects so the camera moves through depth. Keep it cheap: instanced meshes, no per-frame allocations.
2. Re-home the room evolution items (a book per document, a poster per topic, a trophy per mastered topic) and the return experiment and party lights, because there are no walls any more. For example, floating shelves or small islands at the sides and back of the stage. The e2e reads them through `window.__gg`; keep those hooks and counts.
3. Framing: the stage is a fixed 16:9 frame, letterboxed inside the space between the header and the walkthrough bar, never stretched. The header ("Tutor · CS111 · Operating Systems", the Study/Play pill, the section counter) sits in its own row above the stage. The play HUD sits inside the top of the stage and the caption inside the bottom; both scale with the stage (container units). The drawer handles sit beside the stage. At 1440x900, 1280x720, 1920x1080, 1024x768 and 390x844 nothing overlaps, and the heading never wraps onto two lines (shorten, wrap the pill to a second row, or ellipsize instead). The 3D camera framing (CameraRig aspect and view offset) matches the 16:9 frame, so the windows and tutor sit where the mock puts them.
4. Verify: `npm run typecheck`; screenshot the lesson at the five viewports (Playwright, mock the HMR websocket like `tests/e2e/lesson_e2e.py` does, click "Start lesson", wait until `window.__gg.tutor.getState().phase === 'live'`) into `tmp/round2/stage/`, and look at every screenshot with the Read tool.

## Windows builder: Chrome tabs, moving and resizing windows

Behave like real Chrome tabs, built in the 3D windows (raycast pointer events on the meshes; `drei` `<Html transform>` is allowed only where text input is needed, such as the scratch note).

1. **Tab model** in `src/state/windows.ts`: tabs per window with stable ids and a kind (lesson notes tab N, lesson board, Quick check, scratch note, a PDF page, new tab), the active tab per window, window offset and size, `maximized`. Persist tabs, offsets and sizes in `localStorage` under a versioned key, wrapped in try/catch, and restore on load. Keep the pure logic (open, close, activate, reorder, move between windows, reopen) in functions with no React or three imports and unit-test them in `tests/ui/` under plain Node (import with `.ts` extensions like `tests/character/*.test.ts`). Add `"test:ui": "node --test tests/ui/*.test.ts"`.
2. **Open**: the `+` button opens a New tab page at the end of the strip and activates it. The new tab's width grows from zero (about 150 ms, ease out), and its title fades in.
3. **New tab page** (`NewTab.dc.html`): Scratch note (an editable note saved per window in localStorage), lesson sections (the notes tabs, the board, Quick check), and the student's PDFs with a page picker (from the documents store the Learning drawer uses). Picking an item turns this tab into it.
4. **Close**: an `x` on each tab, visible on hover and always on the active tab (only on the active tab once tabs get narrow). Middle-click also closes. The width shrinks to zero (about 150 ms), neighbours slide over, and the tab to the right becomes active (or the left one if it was last). Closing the last tab leaves a New tab page, so a window is never empty.
5. **Sizing**: tabs share the strip like Chrome. They have a max width, shrink evenly as more open, and at minimum show just the favicon dot (and the `x` when active). Titles ellipsize and never overlap.
6. **Move tabs**: drag a tab sideways to reorder it. It lifts with a shadow and follows the pointer, and the others slide aside with animation. Drag it off the strip and over the other window's strip to move it there. Drop anywhere else and it snaps back. A 4 px dead zone keeps a click a click.
7. **Move windows**: drag a window by its empty tab-strip area or omnibox to move it within the stage, clamped so it stays on screen. Double-click the strip to toggle maximize, like Chrome.
8. **Resize**: drag the bottom corner grip to resize, within a min and max. The content and tab widths reflow live.
9. **Maximize**: a maximize/restore button in the toolbar. The maximized window animates to a large centred placement in front of the stage; the other window dims and slides back. Set `useWindows.maximized`.
10. **Lesson integration**: the guided lesson keeps working whatever the student did to the tabs. When the walkthrough calls `setNotesTab(i)`, reveals the board or opens Quick check, the needed lesson tab is reopened if it was closed, moved back to its home window if it was dragged away (animated), and activated. Highlights, board reveals, the quiz on the board and `anchors` (the tutor walks to and points at these) all keep working.
11. `window.__gg.windows` (dev only): the store, plus a helper returning each tab's and grip's projected screen rectangle, so the e2e can drive real mouse drags.
12. Verify: `npm run typecheck`, `npm run test:ui`, and a Playwright script (mock the HMR websocket) that drives real mouse drags on the live lesson. Cover open, close, reorder, move between windows, window move, resize, maximize, and persistence after a reload. Screenshot into `tmp/round2/windows/` and look at the screenshots.

## Tutor builder: start spin, roaming, emotes

1. **Start spin on the new character**: today `Stage.tsx` mounts the classic code character for the start screen and intro, and the Blender tutor appears only when the lesson is live, so the new character never spins. Make the Blender tutor play the whole intro instead:
   - The start screen shows him asleep (`sleep` loop).
   - After Start: `wake`, then the wind-up, then the 6-turn spin driven by `introState` (`INTRO.spin` timing: extra yaw on his root, stretch with spin speed, rise like a top, hands flung out by offsetting the hand bones after the mixer update).
   - He lands with a wobble and waves, and the lesson goes live.
   - Stop mounting the classic `Character` in the lesson stage (keep its files; the home page still uses it).
   - The windows can pop in after the spin. Every pose keeps his feet visible.
2. **Roaming** (`Roam.dc.html` rules), in `src/lesson/roam.ts` with a pure scheduler you unit-test in `tests/ui/roam*.test.ts`:
   - Between lesson beats he paces to the other side of the lane or wanders to a random spot in it every 4 to 9 s (randomised). He uses the `walk` loop, faces where he walks, and settles to idle.
   - He stays in the lane between the two windows.
   - He roams only when nothing else is happening: not while speaking or pointing, not while a step is being performed, not during the intro or a return experiment, not while held or in Play mode, and not while a window is maximized (he steps aside to the side away from the maximized window and waits).
   - When the walkthrough needs him at a spot, the walkthrough wins immediately.
3. **Emotes**:
   - Right quiz answer: a celebration picked at random from a `CELEBRATIONS` list (start with the existing `celebrate`, `dance_bounce`, `dance_spin`, `dance_robot`, `hop`), never the same twice in a row, with confetti and XP as now.
   - Wrong answer: `shrug`, then he goes to the notes and points at the right line (keep what exists).
   - While a chat or ask question is pending: `think` until the answer arrives, then talk with the answer's gesture.
   - After a long idle (about 20 s with no input): a small emote (`wave` or `hop`).
   - Adding a future dance clip must be one line in `CELEBRATIONS` (plus the clip existing in the GLB). Clips missing from the GLB must degrade through the existing fallback map, never throw.
4. Verify: `npm run typecheck`, `npm run test:anim`, your unit tests, and a Playwright script (mock the HMR websocket) that loads the lesson and records the intro. Check the Blender tutor is the one spinning (accumulated yaw of about 6 turns) and that he roams while the lesson is paused. Screenshot frames into `tmp/round2/tutor/` and look at them.

## Integrator acceptance (after all three builders)

- `npm run typecheck`, `npm run test:server`, `npm run test:anim`, `npm run test:ui`, `python tests/e2e/lesson_e2e.py`, `python tests/e2e/study_play_e2e.py` all pass. Update the existing e2e only where this spec intentionally changed behaviour, never to weaken a check.
- New `tests/e2e/stage_tabs_e2e.py` asserts:
  - at all five viewports: no bounding-box overlap between header, HUD, caption, walkthrough bar, ask bar and drawer handles; the heading is one line; the stage is 16:9 within 1%
  - tab open, close, reorder by real mouse drag, move between windows, window move, resize, maximize (the tutor steps aside), and persistence after a reload
  - the walkthrough reclaims a closed or moved lesson tab
  - the Blender tutor (not the classic character) does the start spin
  - roaming while paused
  - a celebration from `CELEBRATIONS` on a right answer, and `think` while a question is pending
  - no console errors and no failed requests
- Screenshots in `tmp/round2/final/`, looked at.
