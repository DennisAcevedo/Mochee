# GeminiGuy (Tutor) — Claude instructions

Local working copy of `github.com/Purabhh/GeminiGuy`. The upstream repo belongs to Purabhh; this clone is RON2K's local sandbox.

## Git: local only (overrides the global push-by-default rule)
- Work on branch `ron2k/local-dev`. Never commit to or merge into `main`; `main` stays a clean mirror of `origin/main`.
- NEVER push, to any branch. The push URL for `origin` is deliberately set to `NO_PUSH__local-only-clone` so `git push` fails. Do not reset it, add another remote, or open a PR unless RON2K explicitly asks in that session.
- Fetching from `origin` is fine (`git fetch origin`). To take upstream changes: `git fetch origin && git merge origin/main` while on `ron2k/local-dev`.
- Local commits are fine and encouraged: atomic, imperative subject, no AI attribution trailers.

## Secrets
- `gemini_API.txt` (repo root) holds the Gemini API key. It is excluded via `.git/info/exclude`. Never read it into chat or logs, never print it, never commit it, never `git add -f` it.
- `ElevenLabsAPI.txt` (repo root) holds the ElevenLabs key: same rules, excluded via `.git/info/exclude`. The account is pay-as-you-go with a 10k character limit, so never loop TTS calls; the proxy caches every line in `tmp/tts-cache/` (gitignored) and caps billed characters per dev-server run.
- Keys are read ONLY by the server-side Vite proxies at request time: `server/geminiProxy.ts` (POST /api/ask, `x-goog-api-key` header) and `server/ttsProxy.ts` (POST /api/tts, `xi-api-key` header). Env vars `GEMINI_API_KEY` / `ELEVENLABS_API_KEY` override the files. Never use `VITE_`-prefixed vars for keys (they are inlined into the client bundle).
- Voice: ElevenLabs "Will" (`bIHbv24MWmeRgasZH58o`, Relaxed Optimist) on `eleven_turbo_v2_5`; override with `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL`. The client (`src/lesson/voiceEleven.ts` via `speech.ts`) falls back to the browser voice when the proxy has no key or budget.

## Stack and commands
- Vite 7 + React 19 + TypeScript 5.9 (strict), react-three-fiber 9 + drei 10 + three 0.179, gsap, zustand 5, react-router 7. Node 24 / npm 11 on this machine.
- `npm run dev` serves on **http://localhost:5176** (`strictPort`, so it fails rather than hopping ports if 5176 is taken).
- `npm run typecheck` (tsc --noEmit) and `npm run build` (typecheck + vite build). There is no test runner or linter configured.

## Layout
- `src/app/` routes, `src/pages/` Home / CreateTutor / Lesson pages, `src/ui/` UI components (each with a `.module.css`).
- `src/character/` the 3D tutor (rig, geometry, materials, body parts); `src/scene/` stage, cameras, lights; `src/animation/` pose/look/tick hooks; `src/intro/` intro sequence.
- `src/state/` zustand stores; `src/data/` catalog + `mockLesson.ts`; `src/lesson/generateLesson.ts` is the single swap point where the mock lesson gets replaced by Gemini output.
- `design/` holds the reference designs (`*.dc.html`, screenshots, `README.md`): treat them as the visual target for UI work.
- `graphify-out/` is a pre-built knowledge graph of the codebase (`GRAPH_REPORT.md`, `graph.json`), useful for orientation.

## Current state (as cloned at 8c01bfb)
- Gemini is NOT wired yet: lessons come from `mockLesson.ts`, voice uses browser `speechSynthesis`, catalog voices have `gemini: null`.

## Verify before calling anything done
- `npm run typecheck` must pass.
- UI changes get checked in a real browser at http://localhost:5176 (screenshot or DOM probe), not just a green typecheck.

## RON2K's instructions
- **Design through Claude Design first.** New UI is mocked as a Design artifact on claude.ai (Artifact tool, Design type) and approved before it is ported into `src/`.
- **White-box stage (2026-10-10).** Replace the lesson stage's cream backdrop with a white-box room: a one-point-perspective interior (back wall, floor, ceiling, two side walls, soft white light). The character stands in the middle and his animations play inside the box.
- **Mini Chrome windows.** Inside the room, small browser-style windows (Chrome tab strip with mini tabs) float to the LEFT and RIGHT of the character.
- **Basic movements.** Give the character a small set of basic movements inside the room. RON2K will layer more frontend design on top later, so keep the room and windows easy to restyle.
- **Everything in 3D (2026-10-10, 04:50).** The learning windows live in the same 3D scene as the tutor (movable camera, real depth), with special effects and dance moves to encourage the student.
- **Blender tutor.** The character is rebuilt in Blender (`blender/tutor/build_tutor.py` + `clips.json` -> `public/models/tutor.glb`) with full animations; the old code character was "just a rudimentary form". Animations must be fast and snappy.
- **Visually bold + fully wired.** Bold, multicoloured accents and bold type. The tutor actually walks the student through the lesson end to end (walk, point, highlight, reveal, narrate, quiz). Do not stop until an end-to-end test passes.
- **Play + level-up, not "beat the boss".** Students play with Gemini Guy (tickle, high-five, catch, snack, dance) to earn XP and level him up; levels unlock dances/effects.
- Contracts and ownership live in `docs/specs/2026-10-10-whitebox-stage.md`. The ChatGPT animation brief is `docs/prompts/chatgpt-animation-brief.md`; its JSON answer drops into `blender/tutor/clips.json`.
