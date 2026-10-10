# GeminiGuy (Tutor) — Claude instructions

Local working copy of `github.com/Purabhh/GeminiGuy`. The upstream repo belongs to Purabhh; this clone is RON2K's local sandbox.

## Git: local only (overrides the global push-by-default rule)
- Work on branch `ron2k/local-dev`. Never commit to or merge into `main`; `main` stays a clean mirror of `origin/main`.
- NEVER push, to any branch. The push URL for `origin` is deliberately set to `NO_PUSH__local-only-clone` so `git push` fails. Do not reset it, add another remote, or open a PR unless RON2K explicitly asks in that session.
- Fetching from `origin` is fine (`git fetch origin`). To take upstream changes: `git fetch origin && git merge origin/main` while on `ron2k/local-dev`.
- Local commits are fine and encouraged: atomic, imperative subject, no AI attribution trailers.

## Secrets
- `gemini_API.txt` (repo root) holds the Gemini API key. It is excluded via `.git/info/exclude`. Never read it into chat or logs, never print it, never commit it, never `git add -f` it.
- When Gemini gets wired in, load the key from `.env.local` (already ignored by `*.local`). Note: any `VITE_`-prefixed var is inlined into the client bundle, so it is acceptable for local dev only; a deployed build needs a server-side proxy instead.

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
<!-- To be filled in once the frontend is running. -->
