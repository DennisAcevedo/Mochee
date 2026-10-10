import { DOCS_LIMITS } from '../../src/lesson/docsTypes.ts'
import type { AskGesture } from '../../src/lesson/askTypes.ts'

// Every number and threshold the documents backend uses. Contract limits come
// from src/lesson/docsTypes.ts (DOCS_LIMITS); everything here is server-only.

export const DOCS_CONFIG = {
  dataDir: '.data', // repo root, outside the web root's served paths (blocked in plugin.ts) and gitignored
  uploadsDir: 'uploads',
  dbFile: 'geminiguy.db',
  maxJsonBytes: 16_384,
  drainBytes: 64 * 1024 * 1024, // past the upload limit, bytes read and discarded so the client sees the 413; beyond this the connection drops
  limits: DOCS_LIMITS,

  // Text extraction + chunking.
  paragraphGapRatio: 1.8, // a line gap over this many line heights starts a new paragraph
  titleMaxChars: 80,

  // Retrieval.
  maxQueryTokens: 16,
  minTokenChars: 2,

  // Quote verification.
  minQuoteChars: 12,
  maxQuoteChars: 400,
  maxCitations: 3,

  // Gemini.
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  defaultModel: 'gemini-3.8-flash', // same default as server/geminiProxy.ts; override with GEMINI_MODEL
  timeoutMs: 20_000,
  thinkingLevel: 'low',
  temperature: { chat: 0.2, topics: 0.2, quiz: 0.4 },
  maxOutputTokens: { chat: 1024, topics: 1024, quiz: 4096 },
  answerMaxChars: 600,
  explanationMaxSentences: 2, // quiz explanations shown after a submit
  explanationMaxChars: 280,

  // Topics.
  topicSampleChars: 6000,
  topicsMin: 3,
  topicsMax: 6,
  keywordsMin: 2,
  keywordsMax: 5,
  topicTitleMaxChars: 60,
  keywordMaxChars: 32,
  headingMaxChars: 60, // heuristic fallback: a heading-like line is short, has no final period
  headingMinChars: 4,

  // Quiz.
  quizSize: 5,
  quizChoices: 4,
  quizPassages: 8,
  quizPromptMaxChars: 300,
  quizChoiceMaxChars: 120,
  clozeSentenceMin: 30,
  clozeSentenceMax: 240,
  clozeAnswerMinChars: 3,
} as const

// Animation cues the tutor can play with an answer. Mirrors ASK_GESTURES in
// src/lesson/askTypes.ts (that module pulls in browser-side lesson data, so the
// server keeps its own copy, type-checked against the union both ways).
export const DOC_CUES = ['talk', 'point_left', 'point_right', 'hop', 'celebrate', 'shrug', 'think'] as const satisfies readonly AskGesture[]
type MissingCue = Exclude<AskGesture, (typeof DOC_CUES)[number]>
export const CUES_COMPLETE: MissingCue extends never ? true : never = true

// Words that never count as evidence a question is about the document.
export const STOPWORDS = new Set(
  (
    'a an and are as at be been being but by can could did do does doing for from had has have how i if in into is it its ' +
    'me my no not of on or our please say so tell than that the their them then there these they this those to too us was ' +
    'we were what when where which while who whom why will with would you your about explain mean means define describe ' +
    'give show does vs versus'
  ).split(' '),
)
