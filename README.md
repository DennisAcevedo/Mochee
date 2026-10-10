# Gemini Guy

A 3D study buddy. Gemini Guy stands in a white-box classroom between two browser-style windows (lecture notes on the left, a whiteboard on the right) and walks the student through a lesson: he walks, points, highlights, reveals the board step by step, narrates in a real voice and runs a quick check. Students can also upload their own PDFs and ask him questions; every answer cites the exact page and quote it came from, and he says so when the document does not cover the question.

Built with Vite 7, React 19, TypeScript, react-three-fiber, drei, Rapier physics, zustand, a Blender-built character and Gemini on a server-side proxy.

## Run it

```
npm install
npm run dev            # http://localhost:5176  (lesson: /tutor/cs111)
```

Keys are read only by the dev server, never by the browser:

- `gemini_API.txt` in the repo root (or `GEMINI_API_KEY`): answers, document Q&A, quizzes, topic extraction.
- `ElevenLabsAPI.txt` in the repo root (or `ELEVENLABS_API_KEY`): the tutor's voice. Lines are cached in `tmp/tts-cache/` and billed characters are capped per day (the count is kept on disk, so a restart doesn't reset it).

Both files are git-excluded and denied by the dev server's file serving. Without a Gemini key the document features run in a labelled demo mode (answers built from the best matching passage, quizzes cut from real sentences); without an ElevenLabs key he falls back to the browser voice.

Use Node 24 for the server (older Node builds can lack SQLite FTS5).

Speech starts as ElevenLabs audio arrives, using the same voice and model. Browsers without MP3 MediaSource support use complete-clip playback. Answers and document citations are still validated before speech begins. Interrupting speech cancels its download; concurrent listeners for the same line share one synthesis call, and only complete clips are cached.

With the server running, `npm run warm:voice` prepares the fixed lesson narration and quiz feedback ahead of a demo. It reuses cached audio and obeys the same daily character budget. During normal lessons, a small look-ahead warms upcoming lines instead of generating every line immediately.

For local timing diagnostics, run `window.__GG_LATENCY__.samples()` in the browser console. The most recent 100 records contain elapsed milliseconds for `answerReady`, `ttsRequested`, `audioFirstChunk`, `audioDownloaded`, and `playbackStarted`, where applicable, plus the outcome. Cached clips have an `audioCached` mark. Records contain no conversation text and are never sent to a server. Use `window.__GG_LATENCY__.clear()` to reset them. Compare question records' `playbackStarted` for end-to-end delay; compare `audioFirstChunk - ttsRequested` for speech transport delay. Fallback and cancelled samples should be assessed separately.

The developer check at `/lab/voice-streaming.html` verifies early playback, caching, cancellation, and non-streaming fallback with a controlled audio stream. It fetches the fixed opening line once (a cache hit after `warm:voice`); the remaining checks use local mocks.

## Tests

```
npm run typecheck                    # app + server
npm run test:server                  # document backend: ingest, FTS, citation checks, upload limits, quiz idempotency, demo mode
npm run test:anim                    # animation state machine: priority, cooldowns, queueing
python tests/e2e/lesson_e2e.py       # the guided lesson end to end in a real browser
python tests/e2e/study_play_e2e.py   # drawers, documents, physics play, mastery and the evolving room
```

The e2e scripts need Python with Playwright and Pillow, and the dev server running. Reports and screenshots go to `tmp/e2e/`.

## Implemented

Each item below is asserted by an e2e check. The checks read what the tutor actually played from the animation state machine's log, not just what the code requested.

**The room and the tutor**
- A one-point-perspective white-box room with the lecture notes window on the left and the whiteboard window on the right, all in one 3D scene.
- A Blender-built tutor (`public/models/tutor.glb`, 27 clips) driven by one animation state machine with priorities, cooldowns and a short queue, so a quiz cheer can't cut off a physics recovery.

**The guided lesson** (`lesson_e2e.py`)
- An 8+ step walkthrough. The tutor walks left and right, points at both windows, highlights note lines, switches tabs and reveals the board in steps, with a caption for every step.
- An ElevenLabs voice, with each line's audio fetched before it is needed.
- A quiz projected onto the board. A wrong answer gets a shrug; a right one gets a dance, confetti and XP.
- Free questions answered live by Gemini (`/api/ask`).
- Play: tickle, high-five, catch, snack and dance earn XP. Level-ups play their own clip and show a banner.

**Study and play** (`study_play_e2e.py`)
- A Study/Play mode switch. In Play he can be dragged, flung and tumbled, he recovers on landing and stays inside the room, and a ball and hoop come out (a basket gives confetti and XP).
- Mastery: getting a topic right on the first try teaches him an ability (`queue_juggle`). He says so, invites the student to play, and performs it on request with props.
- The room grows from what was learned: a book per document, a poster per topic and a trophy per mastered topic.
- On a return visit the next calendar day (`?return=1` to preview) he shows an experiment built from the last lesson ("scheduler race"). The lesson waits for it to finish, and a seen experiment never repeats.
- Documents: PDF upload (topics extracted), page-cited chat answers (each chip opens the page with the quote highlighted), honest abstaining on off-topic questions, and a quiz whose answers stay on the server until submitted, with idempotent resubmits.
- No-key demo mode is labelled in the UI. The e2e checks the label with a mocked response; `test:server` covers the demo answers themselves.

Both e2e files also assert no failed requests, no page errors and no console errors.

### Known gaps

- His pick-up reaction ("surprise") doesn't play while he is held, because the higher-priority dragged loop blocks it by design. If he is picked up, flung and lands within about 1.2 s, the queued reaction can play just after he recovers.
- The hoop's rim position and radius (`PHYSICS.hoop` in `src/scene/physics/config.ts`) haven't had a tuning pass. Baskets are only verified with the scripted shot.
- Each `study_play_e2e.py` run uploads another copy of its fixture PDF, so `.data/` grows until a delete route exists.
- In a slow headless browser a queued level-up clip can start after its banner is already showing.
- The server reads the API keys in three places (`server/keys.ts` plus the two proxies); they should share one reader.
- Upstream's `Board`, `Sidebar` and `QuizCard` components are unused but kept, so `git merge origin/main` stays clean.

## Deferred

- Server-side XP economy and quest database. XP, levels, mastery and learned abilities persist in the browser (localStorage) for now.
- Return events stored on the server. Return experiments are scheduled client-side (eligible from the next calendar day, `?return=1` to preview).
- Teach-back mode (the student explains a topic back to him and he grades it).
- A mascot redesign. Gemini Guy keeps his original look.
- Accounts, document ownership and a delete-document route. All data access sits in `server/docs/store.ts` so auth can be added there.
- OCR for scanned PDFs (a PDF without a text layer is rejected with `no-text`).
- Sandboxed PDF parsing. pdfjs runs on the dev server's main thread, so a deliberately hostile PDF (hundreds of KB of compressed text operators) can stall the server for a long time. The fix is a worker thread with a timeout and per-page character caps.
- Hosting the API outside the Vite dev/preview server (the document, ask and voice routes are Vite plugins).
