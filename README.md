# Mochee

**An interactive 3D AI study buddy that makes learning feel more personal.**

Studying often means switching between notes, videos, flashcards and a chatbot. We built Mochee to bring those pieces into one place. Instead of just giving students an answer, Mochee walks them through a lesson and helps them work toward understanding it.

Mochee lives in a 3D classroom. He moves between lecture notes and a whiteboard as he teaches. He can point to key ideas, reveal explanations step by step and speak with students in a natural voice. Students can upload their own PDFs, ask questions about the material and check their understanding through quizzes or a teach-back session.

Learning also changes the world around him. Correct answers earn rewards. Mastered topics become trophies. Uploaded documents appear as books in the room. Students can take a break to interact with Mochee or challenge a boss using questions from the material they are studying.

**The goal is simple: make it easier to start studying and give students a reason to keep going.**

## Features

### A tutor that teaches alongside you

- **Guided lessons:** Follow an eight-plus-step lesson while Mochee walks between the notes and whiteboard. He highlights key lines and reveals explanations in sequence.
- **A voice you can talk to:** Ask questions through text, tap-to-talk or hands-free conversation. Mochee responds using Gemini and speaks through ElevenLabs when a voice key is available.
- **Study your own documents:** Upload a PDF to extract topics and ask questions about the content. Answers include the page and supporting quote. Select a citation to open the relevant page with the quote highlighted.
- **Source-aware answers:** When a document does not support an answer, Mochee says so instead of pretending the information is there.
- **Teach it back:** Explain a topic in your own words. Mochee checks your explanation against the uploaded material and gives specific feedback on what you understood and what to review.

### Learning that feels rewarding

- **Interactive quizzes:** Answer questions on the classroom whiteboard. Mochee reacts to the result with animations and rewards.
- **Boss challenges:** Practice a topic by answering questions to defeat a boss. Challenges become harder as you progress.
- **Progress and mastery:** Earn XP and coins as you study. Mastered topics add trophies to your classroom.
- **A room that grows with you:** Every uploaded document adds a book. Every mastered topic adds a trophy.
- **Time to play:** Switch to Play mode to high-five Mochee, play catch, give him a snack or shoot baskets. His physics-based reactions make the character feel part of the experience.

## Getting started

### Requirements

- **Node.js 24** and npm. Older Node versions may not include the SQLite FTS5 support used by the server.
- A modern browser.
- **Optional:** A Gemini API key for live AI answers, document questions, quizzes, topic extraction and teach-back grading.
- **Optional:** An ElevenLabs API key for Mochee's voice. Without one, the app uses browser speech.

### 1. Install and run

From the project directory:

```bash
npm install
npm run dev
```

Open **http://localhost:5176** in your browser.

The guided lesson is available at **http://localhost:5176/tutor/cs111**.

The development command starts both the React app and the server-side API through Vite plugins. You do not need to start a separate backend process.

### 2. Configure API keys (optional)

There are two supported ways to provide each key:

| Service | File in the project root | Environment variable | Used for |
| --- | --- | --- | --- |
| Google Gemini | `gemini_API.txt` | `GEMINI_API_KEY` | AI answers, PDF Q&A, quizzes, topic extraction and teach-back |
| ElevenLabs | `ElevenLabsAPI.txt` | `ELEVENLABS_API_KEY` | Mochee's spoken responses |

For the file-based approach, place the API key in the corresponding file at the root of the repository. Alternatively, set the environment variable before running the server.

**Keys stay on the server.** Both key files are excluded from Git and blocked from the dev server's file serving. The browser communicates with server-side proxies rather than receiving the secret keys.

#### Running without API keys

You can still explore the project without either key:

- Without Gemini, document Q&A and quizzes use a **clearly labeled demo mode**. Document answers use the best matching passage. Quiz questions are built from sentences in the source material.
- **Teach-back grading requires Gemini.** It does not award a grade or coins if AI grading is unavailable or cannot be verified.
- Without ElevenLabs, Mochee uses the browser's speech engine.

Demo mode is intended for trying the experience. It is not the same as live Gemini-backed tutoring.

### 3. Prepare the voice before a demo (optional)

With the development server running, open another terminal and run:

```bash
npm run warm:voice
```

This pre-generates fixed lesson narration and quiz feedback. It reuses cached audio and respects the daily ElevenLabs character limit. During normal lessons, Mochee also prepares a small number of upcoming lines so his responses feel more immediate.

## How to use Mochee

1. **Start a lesson.** Open `/tutor/cs111` and watch Mochee guide you between the notes and whiteboard.
2. **Ask a question.** Type in the talk bar or use a microphone option. Mochee can pause the lesson to answer.
3. **Bring your own material.** Upload a PDF and choose a topic. Use cited Q&A to find the exact passage behind an answer.
4. **Check what you know.** Take a quiz or choose **Teach it back** to explain the material in your own words.
5. **Make progress.** Earn XP and coins. Master topics and watch the classroom fill with books and trophies.
6. **Take a break.** Switch to Play mode or try a boss battle before returning to your lesson.

## Inside the experience

### The 3D classroom

The classroom is a clean white-box space built around a single perspective. Lecture notes appear on the left. The whiteboard sits on the right. Both surfaces exist in the same 3D scene as Mochee.

The character was built in Blender and exported as `public/models/tutor.glb`. He has **27 animation clips** controlled by one state machine. Animation priorities, cooldowns and a short queue keep his movements consistent. For example, a celebratory dance cannot interrupt his recovery after a physics interaction.

Mochee can walk, point, highlight notes, change tabs and reveal whiteboard content one step at a time. Captions accompany the guided lesson so students can follow the explanation even without sound.

### PDF study and grounded answers

Uploaded PDFs are ingested by the document service. SQLite FTS5 supports passage retrieval. Gemini provides live document-backed answers when configured.

Answers include a citation for the source page and quote. Clicking the citation opens the page and highlights the supporting text. If the question falls outside the document, Mochee can decline to answer from that document rather than inventing a citation.

PDF study also includes topic extraction and document-based quizzes. Correct answers remain on the server until submission. Repeated quiz submissions are handled idempotently so the same attempt does not produce duplicate results.

### Hands-free conversation

The talk bar supports two voice controls:

- **Tap to talk:** Hold Space or tap the microphone to speak.
- **Hands-free:** Speak a question and pause for about 1.8 seconds to send it. Mochee stops listening while he thinks and replies. Listening resumes afterward.

Hands-free mode pauses the active lesson so the conversation gets Mochee's attention. The microphone button can also pause or resume hands-free listening.

Listening is suspended while the student types, plays a lesson, enters Play mode, uses Teach it back or switches to a hidden browser tab. It stops when the student leaves the page. Silent recordings do not submit an example question.

This feature requires browser `SpeechRecognition` support and microphone permission. Typed Q&A remains available if either is missing.

### Teach it back

Reading an explanation is different from being able to explain it yourself. **Teach it back** gives students a chance to test that understanding.

Open the study tools, choose **Teach it back**, then select an uploaded document and topic. Speaking is the default option. Select **Start speaking** and then **Finish & get feedback**. Students can also choose **Type instead** and enter an explanation of **60 to 3,000 characters**.

For spoken answers, the microphone shows a live level meter and can display browser captions. A recording can last up to **two minutes**. Students can pause to review the transcript before submitting it. Gemini transcribes the audio and evaluates the explanation against a source-checked rubric.

Each idea is classified as **correct**, **partial**, **missing** or **incorrect**. Mochee gives a short explanation of the score and suggests what to work on next. Feedback links to the study material. The spoken feedback uses ElevenLabs when available and browser speech otherwise. Students can independently control whether Mochee speaks or repeats his feedback.

Students can earn up to **50 coins per topic** based on their best score. A revised answer earns only the difference if the score improves. The reward ledger works with the browser coin balance. Drafts survive switching between tools during the same visit.

The audio stays in memory and is not saved as a library document. Raw student explanations are not persisted by the server. Rubrics and grading results are stored in SQLite and deleted alongside their documents. Feedback may contain brief excerpts from an explanation. Repeated submissions reuse the previously saved grade. If grading fails or cannot be verified, no coins are awarded.

### Quizzes, bosses and progression

The guided quiz appears directly on the classroom whiteboard. Mochee shrugs when a student gets an answer wrong. A correct answer can trigger a dance, confetti and XP.

Boss challenges add a more game-like way to practice. Each boss uses distinct questions tied to its topic. Boss cards appear in **Easy → Medium → Hard** order.

| Difficulty | Bosses | Boss HP | Damage per mistake | Victory reward |
| --- | --- | ---: | ---: | ---: |
| Easy | Golem, Fog | 60 | 20 | 60 coins |
| Medium | Wraith, Knot | 80 | 25 | 100 coins |
| Hard | Hydra, Blur Beast | 100 | 34 | 150 coins |

Mochee starts with **100 HP** and deals **20 damage per correct answer**. That means a standard Easy boss takes three correct answers to defeat. Medium takes four and Hard takes five. Mochee can survive four Easy mistakes, three Medium mistakes or two Hard mistakes before the next hit defeats him.

If a topic has fewer questions, the boss's HP and coin reward scale down proportionally. The fight display shows the actual reward. On retry, Mochee's HP resets while the boss retains its damage. A victory pays out only once. Hands-free listening pauses when the boss interface is open.

### Play mode and a changing room

The **Study / Play** switch gives students room to take a break without leaving Mochee. In Play mode, students can drag or toss him around the room. Rapier physics handles his movement. He recovers when he lands and stays inside the classroom.

Other interactions include tickling, high-fives, catching, snacks and dancing. A basketball hoop and ball also appear in Play mode. Making a basket earns confetti and XP. Level-ups have their own animation and banner.

Answering a topic correctly on the first try can mark it as mastered. Mochee celebrates and a trophy appears on the shelf. Uploaded documents add books to the room. The result is a classroom that reflects what the student has actually studied.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Vite 7, React 19, TypeScript |
| 3D scene | React Three Fiber, drei |
| Character and animation | Blender, GLB model, animation state machine |
| Physics | Rapier |
| Client state | Zustand |
| AI tutoring | Google Gemini through a server-side proxy |
| Voice | ElevenLabs with browser speech fallback |
| Documents and retrieval | PDF ingestion, SQLite FTS5 |
| Testing | TypeScript checks, server tests, animation tests, Playwright and Pillow |

## Project structure

```text
src/               React UI, 3D classroom, lesson runner and play interactions
public/            Static assets, including models/tutor.glb
server/            Gemini proxy, ElevenLabs proxy and document API
shared/            Shared API types and lesson note data
tests/             Backend tests, animation tests and browser end-to-end tests
BLENDER/tutor/     Blender character source
lab/              Isolated developer verification pages
tmp/              Generated voice cache and end-to-end test artifacts
```

The app and backend run together through Vite during development.

The `shared/` directory contains the `/api/ask` contract in `askTypes.ts`, the document API contract in `docsTypes.ts` and the lesson note content in `lessonNotes.ts`. The Gemini question-answering proxy uses those lesson notes in its prompt.

**Dependency boundaries are enforced.** `server/` does not import from `src/`. `shared/` does not import from either directory. The server test suite checks that these boundaries remain intact.

## Voice implementation

The ElevenLabs integration is designed to reduce the delay between an answer becoming ready and Mochee beginning to speak.

- Speech starts as streamed MP3 audio arrives when the browser supports MP3 MediaSource playback.
- Browsers without that support play the complete audio clip instead.
- Answers and document citations are validated **before** speech begins.
- Interrupting an answer cancels the in-progress audio download.
- Multiple listeners asking for the same line share a single synthesis request.
- Only fully generated audio clips are cached in `tmp/tts-cache/`.
- Voice usage is subject to a daily billed-character cap. Usage is tracked on disk so restarting the server does not reset the limit.

## Testing

Run the following checks from the project root:

```bash
npm run typecheck
npm run test:server
npm run test:anim
python tests/e2e/lesson_e2e.py
python tests/e2e/study_play_e2e.py
```

| Check | What it covers |
| --- | --- |
| `npm run typecheck` | TypeScript checks for the frontend and server |
| `npm run test:server` | PDF ingestion, FTS retrieval, citations, upload limits, quiz idempotency, demo mode and architectural boundaries |
| `npm run test:anim` | Animation priorities, cooldowns and queueing |
| `lesson_e2e.py` | The complete guided lesson in a real browser |
| `study_play_e2e.py` | Study tools, drawers, uploaded documents, Play mode, mastery and the evolving classroom |

The end-to-end scripts require **Python**, **Playwright** and **Pillow**. Keep the development server running while executing them. Reports and screenshots are written to `tmp/e2e/`.

The browser tests check the animations that actually played through the character's state machine log. They do not rely only on the animations requested by the interface. Both browser suites also check for failed requests, page errors and console errors.

### Focused tests and developer checks

| Test or page | Purpose |
| --- | --- |
| `tests/server/teachBack.test.ts` | Teach-back citations, grading, retries, validation, idempotency and document deletion |
| `tests/ui/progress.test.ts` | Reward caps and persistence |
| `/lab/voice-streaming.html` | Early playback, audio caching, interruption and complete-clip fallback |
| `/lab/hands-free.html` | Talk bar behavior using a synthetic speech recognizer |
| `/lab/boss-balance.html` | Real boss-fight state with scripted quiz results and an isolated test wallet |
| `/lab/teach-back.html` | Teach-back interface and error handling with scripted feedback and no external AI calls |

The voice-streaming lab requests the fixed opening line once. It can use the cached version after `npm run warm:voice`. The remaining checks use local mocks.

### Voice latency diagnostics

For local troubleshooting, open the browser console and run:

```js
window.__GG_LATENCY__.samples()
```

This returns up to the 100 most recent timing records. Depending on the request, a record can include:

- `answerReady`
- `ttsRequested`
- `audioFirstChunk`
- `audioDownloaded`
- `playbackStarted`
- `audioCached` for a cache hit

Records also include an outcome where applicable. They contain no conversation text and are not transmitted to the server.

To clear the records:

```js
window.__GG_LATENCY__.clear()
```

For question latency, compare `playbackStarted` values. For streaming transport delay, compare `audioFirstChunk - ttsRequested`. Evaluate fallback playback and cancelled requests separately.

## Design decisions

**Make AI answers traceable.** PDF answers point back to specific pages and quotes. Students should be able to check an explanation rather than accept it on trust.

**Reward understanding instead of just activity.** Quizzes, teach-back grading and topic mastery connect progression to learning. Revisiting the same graded answer cannot repeatedly earn the full reward.

**Make the character responsive without making it distracting.** Mochee can celebrate, play and move naturally. The animation state machine prevents reactions from interrupting more important movements.

**Keep credentials out of the browser.** Gemini and ElevenLabs calls are proxied through the server. File-based API keys are excluded from Git and from static file serving.

**Keep demo behavior transparent.** The app labels its no-key demo responses. It does not represent document passage matching as live AI reasoning or invent a teach-back grade when Gemini is unavailable.

## Why we built Mochee

A lot of students know they need to study but have trouble staying engaged long enough to make progress. We wanted to build something that feels less like another document viewer and more like a companion that works through the material with you.

Mochee combines guided teaching with source-based questions and active recall. Its 3D classroom makes that experience visible. Its games and rewards give students small reasons to return. And its document citations help keep the learning grounded in the material that matters.

**Mochee is our attempt to make studying feel like something you participate in rather than something you sit through.**