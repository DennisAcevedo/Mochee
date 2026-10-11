# Notebook lectures, topic progress and review

**Date:** 2026-10-11
**Status:** approved design, awaiting spec review
**Branch:** `Purabh-branch`

## Goal

Turn Mochee from a one-time demo into a study tool. Today a notebook (a `Tutor` in `src/state/library.ts`) holds several documents, but a session teaches one document's cached `LessonPack` (at most 6 short sections), the Quick check always asks the same 3 questions, and topic mastery lives only in the browser with no per-notebook view.

After this work:

1. A lecture covers the **whole notebook**: topics from all its documents, weak and due topics first.
2. Lectures are **deeper** (5 to 8 spoken lines per topic plus a worked example) and topic count **scales with the material**.
3. A **New content** button regenerates either the lecture and questions, or only the questions. New questions never repeat ones this notebook has seen.
4. **Progress is saved on the server** per notebook and topic, with a mastery meter per topic and a "Review these today" list driven by spaced review.
5. Adding a PDF to a notebook adds its topics to that notebook's progress automatically.

## Decisions made

| Question | Decision |
|---|---|
| Lecture scope | Whole notebook, not one PDF at a time |
| Bar | Real study tool: progress on the server, spaced review, no repeated questions |
| More content | Deeper lectures, more topics, Quick check of 3 to 5 questions by lecture size |
| Approach | Topic-level generation, assembled per notebook (approach B) |
| Hosting and accounts | Separate follow-on sub-project. This spec adds an `ownerId` column to every new table, fixed to `'local'`, so it drops in later |

## Out of scope

- Hosting Mochee as a public website and the account system. That is the next sub-project (see "Follow-on: hosting and accounts" at the end). Nothing here depends on it.
- Moving notebooks and uploaded files from the browser (localStorage, IndexedDB) to the server. Also part of the follow-on.
- The research-paper upload flow (`paper.ts`), document, page, chunk and topic storage, and citation checking. Unchanged.
- The wrong-answer "try again" UI discussed separately.

## 1. Data model

All in SQLite via `server/docs/store.ts`, created idempotently like the existing tables (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` guarded by a column check). A notebook is identified by the existing `tutorId` that documents already carry; there is no notebook table. Every new table has `ownerId TEXT NOT NULL DEFAULT 'local'` and every query filters on it.

### New tables

**`topic_sections`**: one generated section for a topic.

| Column | Type | Notes |
|---|---|---|
| ownerId | TEXT | `'local'` for now |
| topicId | TEXT | `TOPIC_ID` format |
| version | INTEGER | 1, 2, ...; the highest is live |
| json | TEXT | a `LessonSection` (see section 4) |
| source | TEXT | `'gemini'` or `'outline'` |
| createdAt | TEXT | ISO |

Primary key `(ownerId, topicId, version)`.

**`notebook_lectures`**: one assembled lecture.

| Column | Type | Notes |
|---|---|---|
| ownerId | TEXT | |
| tutorId | TEXT | the notebook |
| version | INTEGER | the highest is current |
| json | TEXT | `{ topics: { topicId, sectionVersion }[], intro, recap, checkQuestionIds }` |
| createdAt | TEXT | ISO |

Primary key `(ownerId, tutorId, version)`.

**`topic_progress`**: one row per notebook and topic.

| Column | Type | Notes |
|---|---|---|
| ownerId | TEXT | |
| tutorId | TEXT | |
| topicId | TEXT | the built-in lesson uses `BUILTIN_TOPIC.id` from `src/growth/topics.ts` |
| title | TEXT | copied for the built-in lesson, which has no topic row |
| attempts | INTEGER | every submitted answer |
| correct | INTEGER | correct answers |
| recentJson | TEXT | last 5 answers (true/false), newest last |
| score | REAL | 0 to 1, see section 3 |
| mastered | INTEGER | 0 or 1 |
| masteredAt | TEXT | ISO or NULL |
| box | INTEGER | Leitner box 0 to 5; 0 = not mastered |
| dueAt | TEXT | ISO; NULL = due now |
| lastSeenAt | TEXT | ISO |

Primary key `(ownerId, tutorId, topicId)`.

**`asked_questions`**: questions a notebook has already been asked.

Columns `ownerId, tutorId, questionId, askedAt`. Primary key `(ownerId, tutorId, questionId)`.

### Changed tables

- `questions` gains `generation INTEGER NOT NULL DEFAULT 1` and `retired INTEGER NOT NULL DEFAULT 0`. New questions are added next to old ones; nothing is overwritten.
- `attempts` is unchanged and stays the raw answer log.

### Topic count

`topicsMax` in `server/docs/config.ts` becomes a function of length: `topicsFor(pageCount) = clamp(round(pageCount / 4), 3, 12)`. The topics prompt in `topics.ts` asks for that number. `topicSampleChars` grows from 24,000 to 48,000 so a 40-page PDF is sampled well enough to find 10 topics. Existing documents keep their topics.

### Migration

- **Existing lesson packs**: the first time a notebook lecture needs a section for a topic that has a cached `lesson_packs` section, that section is copied in as `topic_sections` version 1 (source as stored) instead of generating a new one. `lesson_packs` stays and `POST /api/documents/:id/lesson` keeps working.
- **Existing client mastery**: on first load the client posts `growth.ts`'s localStorage mastery to `POST /api/notebooks/:tutorId/progress/seed` once per notebook. The server inserts rows only where none exist. The client then clears its local mastery map and sets a `seeded` flag.

## 2. Generation

### Topic sections (`server/docs/sections.ts`, new)

- One Gemini call per topic over that topic's page range (`topicRanges` in `lesson.ts`). Calls run in parallel with a concurrency of 3 (`DOCS_CONFIG.sectionConcurrency`).
- Output per section: `say` 5 to 8 lines, `example` (a problem, 2 to 4 steps, an answer), `board` 3 to 6 lines, `notes` 3 to 6 lines each with a page, `mins` 3 to 8.
- Grounding: every notes line must be supported by its page, checked as `lesson.ts` does today; lines that fail are dropped, and a section with fewer than 3 surviving notes lines falls back.
- Fallback: on any error, timeout or missing key, the topic gets `outlineSection(range, pages)` with source `'outline'`. One topic failing never fails the lecture.
- Paper documents (`kind = 'paper'`) use the paper walkthrough prompt style (question, method, data, results, limitations) for their topics' sections.

### Question pool per topic

- `buildQuiz` (in `quiz.ts`) gains an `exclude: string[]` option with the prompts the topic already has, passed to Gemini as "do not ask these". It generates 4 grounded questions per call (`DOCS_CONFIG.questionsPerRefill`).
- Before storing, a question is rejected if its normalised prompt (lowercase, punctuation and stopwords stripped) matches an existing one for that topic.
- Without a key, the existing cloze path is used with the same exclusion.

### Assembling a notebook lecture (`server/docs/notebook.ts`, new)

1. **Pick topics** from all the notebook's documents (`listDocuments(tutorId)`):
   - first, mastered topics whose `dueAt` has passed, most overdue first;
   - then unmastered topics (tried or not), in learning order (document `createdAt`, then topic `ord`);
   - up to `DOCS_CONFIG.lectureMaxTopics = 6`;
   - if none are due or unmastered, the least recently seen topics.
   - The picked set is then sorted into learning order for teaching.
2. **Sections**: each picked topic uses its latest `topic_sections` version; missing ones are copied from a lesson pack or generated.
3. **Intro and recap**: one small Gemini call over the picked titles writes one intro line and one recap line. Canned fallback: "Today: {titles}." and "That's {n} topics. Nice work."
4. **Quick check size**: 1 to 3 sections gives 3 questions, 4 or 5 gives 4, 6 gives 5 (`quickCheckSize(n)`).
5. **Pick questions**: from the picked topics, weakest score first, one per topic round-robin, skipping any in `asked_questions` for this notebook and any `retired`. A topic with no unasked question gets a refill (above). If refills fail and fewer questions exist than the size, take from other topics in the notebook; never fewer than 3 when the notebook has 3 or more questions in total.
6. **Store** as the next `notebook_lectures` version.

### Endpoints (added to `shared/lessonPack.ts` as `NOTEBOOK_ROUTES`)

| Route | Body | Returns |
|---|---|---|
| `GET /api/notebooks/:tutorId/lecture` | | `NotebookLecture`; builds version 1 if none |
| `POST /api/notebooks/:tutorId/lecture` | `{ mode: 'lesson' \| 'questions' }` | `NotebookLecture` |
| `GET /api/notebooks/:tutorId/progress` | | `NotebookProgress` |
| `POST /api/notebooks/:tutorId/answers` | `{ topicId, title, correct, attemptId }` | `TopicProgress` (built-in lesson only) |
| `POST /api/notebooks/:tutorId/progress/seed` | `{ topics: SeedTopic[] }` | `{ ok: true, inserted: number }` |

- `mode: 'lesson'`: pick topics again from current progress, generate a new section version for each picked topic, pick a fresh question set.
- `mode: 'questions'`: keep the current lecture's topics and section versions; pick a fresh question set (refilling as needed).
- A per-notebook lock: a second POST while one is building awaits and returns the same result.
- All POSTs go through the existing `refuseCrossSite` JSON check in `plugin.ts`. `tutorId` is validated with `tutorIdFrom`.

### Speed

New lecture with 6 new sections: about 15 to 25 s (3 concurrent calls). Questions only: about 5 s. The first lecture of an existing notebook is fast because it reuses cached pack sections.

## 3. Progress and review

### Recording answers

- `submitAnswer` resolves question, document, `tutorId`. In the same transaction as the `attempts` insert it updates `topic_progress` and inserts into `asked_questions`.
- `QuizResult` gains `progress: TopicProgress`.
- The built-in CS111 lesson grades on the client and posts to `/answers`; same update logic.
- Every submitted answer counts: it increments `attempts`, and `correct` when right, and is appended to `recent`.

### Mastery (same rule as `growth.ts` today)

- `score` = correct entries in `recent` (the last 5 answers) divided by the number of entries; 0 when none.
- `mastered` becomes true exactly as `meetsMastery` in `src/state/growth.ts`: the topic's very first answer is correct, or 2 of the last 3 answers are correct (`GROWTH.mastery`). The server copies that rule and its constants; a test pins them equal.

### Review scheduling (Leitner)

`DOCS_CONFIG.reviewDays = [1, 3, 7, 14, 30]`.

- On becoming mastered: `box = 1`, `dueAt = now + reviewDays[0]`.
- A correct answer on a mastered topic that is due: `box = min(box + 1, 5)`, `dueAt = now + reviewDays[box - 1]`.
- A correct answer on a mastered topic that is not yet due: no box change.
- Any wrong answer on a mastered topic: `box = 0`, `mastered = false`, `dueAt = now + 1 day`. Mastery must be earned again.
- Unmastered topics are always due.
- Order of checks per answer: append to `recent`, then the lapse rule (a wrong answer on a mastered topic), then mastery, which only a **correct** answer can grant. So a miss right after a lapse can never re-master the topic through the 2-of-3 window.

### "Review these today"

`NotebookProgress.review`: up to 3 topics, in this order: overdue mastered (most overdue first), then the lowest `score` among tried unmastered, then untried. Each item carries a `reason`: `'overdue' | 'weak' | 'new'`.

### Mochee's growth

`growth.ts` stops computing mastery. `recordAnswer` takes the server's `TopicProgress` and, when `mastered` flips to true, runs the existing ability, trophy and `celebrateMastery` flow. Abilities, return experiments and the room stay client-side.

## 4. Shared types

```ts
// shared/lessonPack.ts
export interface WorkedExample {
  problem: string
  steps: string[] // 2-4
  answer: string
}

export interface LessonSection {
  // existing fields unchanged
  example?: WorkedExample // new; absent on old packs
}

export interface NotebookLecture extends LessonPack {
  tutorId: string
  version: number
  intro: string
  recap: string
  // documentId: the first section's document, kept for LessonPack compatibility
}

// shared/progressTypes.ts (new)
export type TopicStatus = 'new' | 'learning' | 'mastered' | 'due'

export interface TopicProgress {
  topicId: string
  title: string
  documentId: string | null // null = built-in lesson
  attempts: number
  score: number // 0..1
  mastered: boolean
  box: number
  dueAt: string | null
  lastSeenAt: string | null
  status: TopicStatus
}

export interface ReviewItem {
  topicId: string
  title: string
  reason: 'overdue' | 'weak' | 'new'
}

export interface NotebookProgress {
  tutorId: string
  topics: TopicProgress[] // every topic of every document in the notebook, learning order
  mastered: number
  total: number
  review: ReviewItem[] // at most 3
}
```

`status`: `'new'` when `attempts = 0`; `'due'` when mastered and `dueAt` has passed; `'mastered'` when mastered and not due; otherwise `'learning'`.

## 5. UI

- **Home library** (`HomePage`): each notebook tile shows a mastery ring ("7 of 12 topics") in place of `sectionsDone`, and a "3 to review" pill when `review` is non-empty.
- **Notebook start screen** (`src/ui/Start/StartScreen.tsx`):
  - a **Review these today** card with up to 3 topic chips (meter and reason);
  - **Start lesson** plays the current notebook lecture;
  - a **New content** button with a two-way toggle under it, **Lecture + questions** (default) or **Questions only**. While building, Mochee plays `think` and a checklist ticks through the topics on a timer (like `SessionPane`'s `stageMs`). On success the new lecture is current and ready to start. On failure a toast, and the current lecture stays.
- **Progress pane** (new card in `src/hub/StudyHub.tsx`): topics grouped by document; each row has title, score bar, status chip (New, Learning, Mastered, Due in N days, Due), and **Quiz me**, which opens `QuizPane` with that `topicId`. After an upload, a toast "Added N topics to {notebook}".
- **Start Tutor Session pane** (`src/hub/SessionPane.tsx`): the document picker becomes the notebook lecture's section list (start from any section) with the same New content button.
- **In the lesson**: Quick check shows "Question n of N" with N from 3 to 5; the sidebar outline shows a meter dot per section, updated from each answer's `progress`; the worked example renders on the Board tab as numbered steps after the board lines.

### Client modules

- `src/state/notebook.ts` (new, zustand, not persisted): `lecture`, `progress`, `status`, `refresh(tutorId)`, `newContent(tutorId, mode)`, `applyProgress(p: TopicProgress)`.
- `src/ui/Drawers/docsClient.ts`: fetchers for the new routes.
- `src/lesson/packSession.ts`: `packToWalkthrough` and `packBoard` render `example`; a `NotebookLecture` is passed to `useLessonPack.start` as a `LessonPack`.
- `src/lesson/quickCheck.ts`: question count comes from `checkQuestionIds.length`.

## 6. Errors

| Case | Behaviour |
|---|---|
| One topic's Gemini call fails | That topic uses its outline section |
| Question refill fails | Use unasked questions from other topics; never fewer than 3 if the notebook has 3 |
| No Gemini key | Outline sections and cloze questions, labelled `source: 'outline'` as today |
| Two New content clicks | Per-notebook lock; the second gets the same result |
| Notebook with no documents (built-in CS111 only) | `GET /lecture` returns 404 `not-found`; the start screen keeps the built-in walkthrough; progress still records built-in topics |
| Bad `tutorId` or `mode` | 400 `bad-request` |

## 7. Testing

`node --test`, same folders as now. Typecheck with `npx tsc --noEmit -p tsconfig.json` and `-p tsconfig.node.json`.

- **`tests/server`**: `topicsFor` scaling; Leitner transitions (mastered, up a box, not-yet-due no-op, drop on miss); mastery matches the `growth.ts` rule; question dedupe and never re-asking within a notebook; topic picking order and the all-mastered fallback; `quickCheckSize` 3/4/5; `lesson` vs `questions` modes; seed inserts only missing rows; every query scoped by `ownerId`; the per-notebook lock; lesson-pack sections reused as version 1.
- **`tests/lesson`**: a `NotebookLecture` with examples to walkthrough steps and board lines.
- **`tests/ui`**: the notebook store (refresh, newContent, applyProgress).
- **Playwright e2e** (`tests/e2e/notebook_e2e.py`): upload a PDF into a notebook, see its topics as New, generate a new lecture, answer the Quick check, see meters and the review list change, then "Questions only" gives questions not seen before.

## Build order

1. Store: new tables, `questions` columns, `topicsFor`.
2. Progress: answer recording, mastery, Leitner, `/answers`, `/progress`, `/progress/seed`, `QuizResult.progress`.
3. Sections and question refills.
4. Notebook lecture assembly and `/lecture` routes.
5. Client store and `growth.ts` switch-over.
6. UI: start screen, Progress pane, Session pane, home tiles, lesson board and sidebar.
7. E2E.

## Follow-on: hosting and accounts (separate spec)

Not built here; recorded so this design stays compatible.

- A standalone Node server (`server/main.ts`) serving the built `dist/` plus the existing `/api` middleware, Gemini and TTS proxies, run on a DigitalOcean droplet behind HTTPS, with SQLite on the droplet's disk. Vercel is dropped.
- An account system: sign up and sign in, sessions in an HttpOnly cookie, `ownerId` = the account id (replacing `'local'`). Every new table here already filters on `ownerId`.
- Notebooks and uploaded files move from localStorage and IndexedDB to the server, owned by the account. Existing documents' rows gain `ownerId` too.
