import { DOCS_LIMITS } from '../../shared/docsTypes.ts'
import { ASK_GESTURES } from '../../shared/askTypes.ts'

// Every number and threshold the documents backend uses. Contract limits come
// from shared/docsTypes.ts (DOCS_LIMITS); everything here is server-only.

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
  topicSampleChars: 24_000, // sampled across every page (text.ts sampleAcross), not the opening pages
  samplePageMinChars: 400, // past this budget per page, evenly spaced pages are sampled instead of all of them
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

  // Lesson packs (POST /api/documents/:id/lesson).
  lessonSampleChars: 24_000, // page text sent to Gemini across all sections, sampled across each section's pages
  lessonTemperature: 0.3,
  lessonTimeoutMs: 45_000, // lesson-pack Gemini call; under the client's 60 s
  lessonMaxOutputTokens: 4096,
  lessonLineMaxChars: 220,
  lessonHeadMaxChars: 60,
  lessonMinsMin: 2,
  lessonMinsMax: 8,

  // Recorded lectures (POST /api/lectures).
  lectureTimeoutMs: 150_000,
  lectureMaxOutputTokens: 32_768,
  lecturePageChars: 1500,
  // A PCM WAV whose loudest sample stays under this fraction of full scale is
  // silence: refused before Gemini, which can invent a lecture from silence.
  lectureSilencePeak: 0.01,
  lectureAudioTypes: ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/mp3', 'audio/aac', 'audio/flac'],
  // Browser / OS spellings of the same formats -> the type Gemini is sent.
  lectureAudioAliases: {
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/vnd.wave': 'audio/wav',
    'audio/x-m4a': 'audio/mp4',
    'audio/m4a': 'audio/mp4',
    'audio/mpeg': 'audio/mp3',
    'audio/x-mp3': 'audio/mp3',
    'audio/x-aac': 'audio/aac',
    'audio/x-flac': 'audio/flac',
  } as Record<string, string>,
  tutorIdPattern: /^[a-z0-9_-]{1,40}$/i,
  // GET /api/documents/:id/file: stored original extension -> served type ("Open full PDF").
  // HTML is a download (and sandboxed) so an uploaded page never runs on this origin.
  originalTypes: {
    pdf: { type: 'application/pdf', inline: true },
    txt: { type: 'text/plain; charset=utf-8', inline: true },
    md: { type: 'text/plain; charset=utf-8', inline: true },
    png: { type: 'image/png', inline: true },
    jpg: { type: 'image/jpeg', inline: true },
    webp: { type: 'image/webp', inline: true },
    html: { type: 'text/html; charset=utf-8', inline: false },
    docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false },
    pptx: { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false },
  } as Record<string, { type: string; inline: boolean }>,

  // Other formats (formats.ts). Text, HTML and DOCX are split into ~page-sized
  // pages; a DOCX page break always starts a new one. PPTX is one page per slide.
  textPageChars: 3000,
  zipMaxEntries: 4000,
  zipMaxInflatedBytes: 64 * 1024 * 1024, // all XML parts together; a zip bomb stops here
  // A PDF page with less text than this counts as scanned; when most pages are,
  // Gemini reads the PDF itself (vision.ts).
  scanPageMinChars: 40,
  inlineMaxBytes: 12 * 1024 * 1024, // largest file sent to Gemini inline (base64 grows it by a third; the request cap is 20 MB)
  visionTimeoutMs: 150_000, // scanned PDF / image read; plus topics, still under the client's upload timeout
  visionMaxOutputTokens: 65_536,
  imageMimeTypes: { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>,

  // Research papers (paper.ts): ONE call over the whole paper gives the topics
  // and the walkthrough. At upload it runs in place of the topics call; at
  // lesson time (if that call failed) it shares lessonTimeoutMs.
  paperTimeoutMs: 60_000,
  paperMaxOutputTokens: 8192,
  paperTemperature: 0.3,
  paperSectionsMin: 4,
  paperTextMaxChars: 400_000, // page text sent when the PDF does not go inline (all of it for any paper under ~130 pages)
  paperPageMapChars: 70, // opening words per page in the page map sent with an inline PDF
  // A note line moves to another page only when its words match that page this
  // many times better than the page Gemini named (printed vs file page numbers).
  pageReattributeRatio: 2,
  pageReattributeMinWords: 3,
} as const

// Animation cues the tutor can play with an answer: the same list as /api/ask.
export const DOC_CUES = ASK_GESTURES

// Words that never count as evidence a question is about the document.
export const STOPWORDS = new Set(
  (
    'a an and are as at be been being but by can could did do does doing for from had has have how i if in into is it its ' +
    'me my no not of on or our please say so tell than that the their them then there these they this those to too us was ' +
    'we were what when where which while who whom why will with would you your about explain mean means define describe ' +
    'give show does vs versus'
  ).split(' '),
)
