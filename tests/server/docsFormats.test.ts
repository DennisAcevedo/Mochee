import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, describe, test } from 'node:test'
import { uploadFormat, UPLOAD_ACCEPT, type DocumentInfo, type PageText } from '../../shared/docsTypes.ts'
import type { LessonPack } from '../../shared/lessonPack.ts'
import { DOCS_CONFIG } from '../../server/docs/config.ts'
import { docxText, FormatError, hasMagic, htmlToText, pagesFromText, pptxPages, readLocal } from '../../server/docs/formats.ts'
import type { GeminiCall, GeminiResult } from '../../server/docs/gemini.ts'
import { groundPage } from '../../server/docs/paper.ts'
import { docsMiddleware } from '../../server/docs/plugin.ts'
import { createDocsService, type DocsService } from '../../server/docs/service.ts'
import { contentWords, ftsQuery, normalizePageText, sampleAcross, stripPageRefs } from '../../server/docs/text.ts'
import { buildDocx, buildPptx, buildZip, JPEG_BYTES, PNG_BYTES, WORD_PAGE_BREAK, wordPara } from './fixtureOffice.ts'
import { buildPdf, FIXTURE_PAGES } from './fixturePdf.ts'

// Any file in: DOCX, PPTX, text, Markdown, HTML, images and scanned PDFs, plus
// the class / research-paper kinds. Fixtures are built in code from the same
// real CS111 lecture text as docs.test.ts; Gemini is always a scripted fake.

const pdf = buildPdf()
const LECTURE = FIXTURE_PAGES.flat()
const isFormatError = (code: string) => (e: unknown) => e instanceof FormatError && e.code === code
const searchable = (service: DocsService, id: string) => service.store.search(id, ftsQuery('What is the convoy effect?') ?? '', 5).length > 0

function freshService(gemini?: (c: GeminiCall) => Promise<GeminiResult>, key: string | null = null) {
  const dataDir = mkdtempSync(join(tmpdir(), 'gg-docs-any-'))
  const service = createDocsService({ dataDir, readKey: () => key, gemini })
  return { dataDir, service, dispose: () => (service.close(), rmSync(dataDir, { recursive: true, force: true })) }
}

describe('upload formats', () => {
  test('the extension decides; a content type naming another format is refused', () => {
    assert.equal(uploadFormat('notes.docx', ''), 'docx')
    assert.equal(uploadFormat('notes.DOCX', 'application/octet-stream'), 'docx')
    assert.equal(uploadFormat('readme.md', 'text/plain'), 'md')
    assert.equal(uploadFormat('photo.jpeg', 'image/jpeg'), 'jpg')
    assert.equal(uploadFormat('pasted', 'image/png'), 'png')
    assert.equal(uploadFormat('notes.pdf', 'text/plain'), null)
    assert.equal(uploadFormat('notes.exe', 'application/pdf'), null)
    assert.equal(uploadFormat('slides.pptx', 'application/pdf'), null)
    for (const want of ['.pdf', '.docx', '.pptx', '.txt', '.md', '.html', '.png', '.jpg', '.webp', 'application/pdf']) assert.ok(UPLOAD_ACCEPT.split(',').includes(want), want)
  })

  test('magic bytes per format', () => {
    assert.ok(hasMagic('png', PNG_BYTES))
    assert.equal(hasMagic('png', JPEG_BYTES), false)
    assert.ok(hasMagic('jpg', JPEG_BYTES))
    assert.ok(hasMagic('webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])))
    assert.equal(hasMagic('webp', PNG_BYTES), false)
    assert.ok(hasMagic('docx', buildDocx(wordPara(LECTURE[0]))))
    assert.equal(hasMagic('docx', Buffer.from(LECTURE[1])), false)
    assert.equal(hasMagic('pdf', buildDocx(wordPara(LECTURE[0]))), false)
    assert.equal(hasMagic('txt', PNG_BYTES), false, 'binary is not text')
    assert.ok(hasMagic('md', Buffer.from(`# ${LECTURE[0]}\n\n${LECTURE[1]}`)))
  })

  test('DOCX: paragraphs in order, entities decoded, deleted text dropped, a page break starts a page', () => {
    const body = [
      wordPara(LECTURE[0]),
      wordPara(`${LECTURE[2]} Waiting & turnaround < 30 ms.`),
      '<w:p><w:r><w:t>Before</w:t></w:r><w:r><w:tab/><w:t>after tab</w:t></w:r><w:del><w:r><w:delText>deleted words</w:delText></w:r></w:del></w:p>',
      WORD_PAGE_BREAK,
      wordPara(LECTURE[4]),
    ].join('')
    const pages = readLocal('docx', buildDocx(body))
    assert.equal(pages.length, 2)
    assert.match(pages[0], /^4\.2 First-come, first-served/)
    assert.match(pages[0], /Waiting & turnaround < 30 ms\./)
    assert.match(pages[0], /Before after tab/)
    assert.doesNotMatch(pages.join(' '), /deleted words/)
    assert.equal(pages[1], LECTURE[4])
    assert.match(docxText(buildDocx(body)), /\f/, 'the page break survives as a form feed')
  })

  test('DOCX: a long document splits into ~page-sized pages and keeps every word', () => {
    const paras = Array.from({ length: 60 }, (_, i) => `${i + 1}. ${LECTURE[i % LECTURE.length]}`)
    const pages = readLocal('docx', buildDocx(paras.map(wordPara).join('')))
    assert.ok(pages.length > 1, `${pages.length} pages`)
    assert.ok(pages.every((p) => p.length <= DOCS_CONFIG.textPageChars))
    assert.equal(pages.join(' ').replace(/\s+/g, ' '), paras.join(' ').replace(/\s+/g, ' '))
  })

  test('PPTX: one page per slide in presentation order, with speaker notes; an empty slide stays a page', () => {
    const slides = [{ lines: [LECTURE[0], `${LECTURE[1]}\nback of the queue`], notes: ['Ask who has waited in a queue.'] }, { lines: [LECTURE[4]] }, { lines: [] }]
    const pages = pptxPages(buildPptx(slides, [1, 0, 2]))
    assert.equal(pages.length, 3)
    assert.equal(pages[0], LECTURE[4], 'presentation order, not file order')
    assert.match(pages[1], /arrive\. One FIFO ready queue\. No preemption\.\nback of the queue/, 'a:br is a line break')
    assert.match(pages[1], /Speaker notes:\nAsk who has waited in a queue\.$/, 'the notes slide-number field is dropped')
    assert.equal(pages[2], '')
  })

  test('HTML: visible text only, entities decoded', () => {
    const html = `<!doctype html><html><head><title>T</title><style>p{color:red}</style></head><body><script>alert("x")</script><h1>${LECTURE[0]}</h1><p>${LECTURE[2]}</p><!-- hidden --><p>Average wait &le; 17&nbsp;ms &amp; <b>falls</b> with SJF</p></body></html>`
    const [page] = readLocal('html', Buffer.from(html))
    assert.equal(page, `${LECTURE[0]}\n\n${LECTURE[2]}\n\nAverage wait ≤ 17 ms & falls with SJF`)
    assert.doesNotMatch(htmlToText(html), /alert|color:red|hidden/)
  })

  test('text: BOM-marked UTF-8 and UTF-16 decode; long text pages stay under the cap', () => {
    const text = LECTURE.join('\n\n')
    const plain = readLocal('txt', Buffer.from(text))
    assert.deepEqual(readLocal('txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)])), plain)
    assert.deepEqual(readLocal('txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])), plain)
    assert.equal(readLocal('txt', Buffer.from('caf\xe9 \x96 menu', 'latin1'))[0], 'café – menu', 'not UTF-8: read as Windows-1252')
    const long = pagesFromText(Array.from({ length: 30 }, () => LECTURE.join(' ')).join('\n\n'))
    assert.ok(long.length > 1 && long.every((p) => p.length <= DOCS_CONFIG.textPageChars))
    const runOn = pagesFromText('x'.repeat(DOCS_CONFIG.textPageChars * 2 + 5))
    assert.deepEqual(runOn.map((p) => p.length), [DOCS_CONFIG.textPageChars, DOCS_CONFIG.textPageChars, 5])
  })

  test('zip bombs, missing parts and truncated archives are refused', () => {
    const bomb = buildZip({ 'word/document.xml': Buffer.alloc(DOCS_CONFIG.zipMaxInflatedBytes + 1024, 0x20) })
    assert.ok(bomb.length < 1024 * 1024, 'the bomb is small on the wire')
    assert.throws(() => readLocal('docx', bomb), isFormatError('too-large'))
    assert.throws(() => readLocal('docx', buildZip({ 'other.xml': '<x/>' })), isFormatError('bad-file'))
    assert.throws(() => readLocal('pptx', buildDocx(wordPara(LECTURE[0]))), isFormatError('bad-file'))
    assert.throws(() => readLocal('docx', buildDocx(wordPara(LECTURE[0])).subarray(0, 60)), isFormatError('bad-file'))
    const stored = buildZip({ 'word/document.xml': `<w:document><w:body>${wordPara(LECTURE[1])}</w:body></w:document>` }, { store: true })
    assert.deepEqual(readLocal('docx', stored), [LECTURE[1]], 'stored (uncompressed) entries read too')
  })
})

describe('whole-document sampling', () => {
  const pages = Array.from({ length: 40 }, (_, i) => `Page ${i + 1} heading\n${`${LECTURE[i % LECTURE.length]} `.repeat(20)}`)
  const marks = (s: string) => [...s.matchAll(/\[p\.(\d+)\]/g)].map((m) => Number(m[1]))

  test('sampleAcross covers every page within the budget', () => {
    const s = sampleAcross(pages, 24_000)
    for (let p = 1; p <= 40; p++) assert.ok(s.includes(`[p.${p}]\nPage ${p} heading`), `page ${p}`)
    assert.ok(s.length <= 24_000, `${s.length} chars`)
  })

  test('a small budget samples evenly spaced pages, the first and last included', () => {
    const s = sampleAcross(pages, 2000)
    const m = marks(s)
    assert.equal(m.length, Math.floor(2000 / DOCS_CONFIG.samplePageMinChars))
    assert.equal(m[0], 1)
    assert.equal(m.at(-1), 40)
    assert.ok(s.length <= 2000)
  })

  test('a range samples only its own pages; short pages hand their slack to long ones', () => {
    assert.deepEqual(marks(sampleAcross(pages, 6000, 11, 20)), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    const mixed = sampleAcross(['short page', 'x'.repeat(5000)], 3000)
    assert.ok(mixed.includes('short page') && mixed.length > 2900 && mixed.length <= 3000, `${mixed.length} chars`)
  })

  test('groundPage keeps a plausible page and moves a printed-number mistake', () => {
    const words = FIXTURE_PAGES.map((p) => contentWords(p.join('\n')))
    assert.equal(groundPage(LECTURE[4], 1, words), 2, 'the convoy line lives on page 2')
    assert.equal(groundPage('The CPU runs jobs in the exact order they arrive', 1, words), 1, 'its own page matches: it stays')
    assert.equal(groundPage('P2 waits 24 ms and P3 waits 27 ms', 99, words), 2, 'out of range, rescued by a strong match')
    assert.equal(groundPage('An invented finding about nothing', 99, words), null)
  })
})

describe('page text hygiene', () => {
  // pdfjs gives LaTeX's minus sign as U+0000 (seen on 20 of the 41 pages of a real thesis).
  test('control characters are dropped, so a NUL never cuts a stored page short', async () => {
    assert.equal(normalizePageText('b is the net odds (O \u0000 1)\u0007 and q = 1 \u0000 p.'), 'b is the net odds (O 1) and q = 1 p.')
    const fake = async (c: GeminiCall): Promise<GeminiResult> =>
      c.inline ? { ok: true, json: { pages: [{ page: 1, text: `q = 1 \u0000 p. ${LECTURE[4]}` }] } } : { ok: false, error: 'upstream' }
    const ctx = freshService(fake, 'test-key')
    try {
      const doc = (await ctx.service.ingest(buildPdf([[]]), 'scan.pdf')).body as DocumentInfo
      assert.equal((ctx.service.page(doc.id, '1').body as PageText).text, `q = 1 p. ${LECTURE[4]}`)
      assert.ok(searchable(ctx.service, doc.id), 'the text after the NUL is indexed too')
    } finally {
      ctx.dispose()
    }
  })

  test('page references a model writes into a line are dropped; other brackets stay', () => {
    assert.equal(stripPageRefs('RF beats the bookmaker RPS (pp. 24, 27)'), 'RF beats the bookmaker RPS')
    assert.equal(stripPageRefs('Value bets (p. 9) need calibration'), 'Value bets need calibration')
    assert.equal(stripPageRefs('Gubbing limits stakes [page 38]'), 'Gubbing limits stakes')
    assert.equal(stripPageRefs('Seasons 2018-2024 (pages 33-35)'), 'Seasons 2018-2024')
    assert.equal(stripPageRefs(LECTURE[6]), LECTURE[6])
    assert.equal(stripPageRefs('Quarter-Kelly (f* / 4) with p < 0.05 (P1 = 24 ms)'), 'Quarter-Kelly (f* / 4) with p < 0.05 (P1 = 24 ms)')
  })
})

describe('ingest by format', () => {
  test('a scanned PDF is read by Gemini page by page; without a key it is a 503', async () => {
    const scan = buildPdf([[], [], []])
    const calls: GeminiCall[] = []
    const fake = async (c: GeminiCall): Promise<GeminiResult> => {
      calls.push(c)
      if (c.inline?.mimeType === 'application/pdf')
        return { ok: true, json: { pages: [{ page: 1, text: `${LECTURE[0]}\n${LECTURE[1]}` }, { page: 2, text: LECTURE[4] }, { page: 7, text: 'a page that does not exist' }] } }
      return { ok: false, error: 'upstream' }
    }
    const ctx = freshService(fake, 'test-key')
    try {
      const res = await ctx.service.ingest(scan, 'scanned%20notes.pdf')
      assert.equal(res.status, 201)
      const doc = res.body as DocumentInfo
      assert.equal(doc.pageCount, 3, 'page N of the scan stays page N')
      assert.equal(calls[0].inline?.base64, scan.toString('base64'))
      assert.match((ctx.service.page(doc.id, '1').body as PageText).text, /The CPU runs jobs in the exact order they arrive\./)
      assert.equal((ctx.service.page(doc.id, '2').body as PageText).text, LECTURE[4])
      assert.equal((ctx.service.page(doc.id, '3').body as PageText).text, '')
      assert.ok(searchable(ctx.service, doc.id), 'transcribed text is searchable')
    } finally {
      ctx.dispose()
    }
    const offline = freshService()
    try {
      assert.deepEqual(await offline.service.ingest(scan, 'scan.pdf'), { status: 503, body: { error: 'no-key' } })
    } finally {
      offline.dispose()
    }
  })

  test('an image is transcribed (or described) by Gemini and stored as page text', async () => {
    const calls: GeminiCall[] = []
    const fake = async (c: GeminiCall): Promise<GeminiResult> => {
      calls.push(c)
      return c.inline ? { ok: true, json: { kind: 'text', text: `${LECTURE[4]}\n${LECTURE[5]}` } } : { ok: false, error: 'upstream' }
    }
    const ctx = freshService(fake, 'test-key')
    const blank = freshService(async (c) => (c.inline ? { ok: true, json: { kind: 'blank', text: '' } } : { ok: false, error: 'upstream' }), 'test-key')
    try {
      const doc = (await ctx.service.ingest(PNG_BYTES, 'whiteboard.png', 'cs111', 'class', 'image/png')).body as DocumentInfo
      assert.equal(doc.original, 'png')
      assert.equal(doc.title, 'whiteboard')
      assert.equal(calls[0].inline?.mimeType, 'image/png')
      assert.match((ctx.service.page(doc.id, '1').body as PageText).text, /^Convoy effect: short jobs stuck behind a long one\./)
      assert.deepEqual(await blank.service.ingest(JPEG_BYTES, 'dark.jpg'), { status: 422, body: { error: 'no-text' } })
    } finally {
      ctx.dispose()
      blank.dispose()
    }
  })

  test('DOCX, PPTX, Markdown and HTML documents are chunked, searchable and teachable offline', async () => {
    const ctx = freshService()
    try {
      const files: [string, Buffer][] = [
        ['Week 4.docx', buildDocx([wordPara(LECTURE[0]), wordPara(LECTURE[1]), WORD_PAGE_BREAK, wordPara(LECTURE[4]), wordPara(LECTURE[5])].join(''))],
        ['Week 4.pptx', buildPptx([{ lines: [LECTURE[0], LECTURE[1]] }, { lines: [LECTURE[4], LECTURE[5]] }])],
        ['Week 4.md', Buffer.from(`# ${LECTURE[0]}\n\n${LECTURE[1]}\n\n${LECTURE[4]} ${LECTURE[5]}`)],
        ['Week 4.html', Buffer.from(`<h1>${LECTURE[0]}</h1><p>${LECTURE[1]}</p><p>${LECTURE[4]} ${LECTURE[5]}</p>`)],
      ]
      for (const [name, bytes] of files) {
        const res = await ctx.service.ingest(bytes, name)
        assert.equal(res.status, 201, name)
        const doc = res.body as DocumentInfo
        assert.equal(doc.title, 'Week 4')
        assert.equal(doc.original, name.split('.').pop())
        assert.equal(doc.kind, 'class')
        assert.ok(searchable(ctx.service, doc.id), `${name} is searchable`)
        const pack = (await ctx.service.lesson(doc.id)).body as LessonPack
        assert.equal(pack.source, 'outline')
        assert.ok(pack.sections.every((s) => s.notes.lines.every((l) => l.page >= 1 && l.page <= doc.pageCount)))
      }
      assert.deepEqual(readdirSync(join(ctx.dataDir, 'uploads')).map((f) => f.split('.').pop()).sort(), ['docx', 'html', 'md', 'pptx'])
    } finally {
      ctx.dispose()
    }
  })

  test('class material: topics and the lesson see every page, not just the opening ones', async () => {
    const pages = Array.from({ length: 12 }, (_, i) => [`Part ${i + 1}. ${LECTURE[i % LECTURE.length]}`, `${LECTURE[(i + 3) % LECTURE.length]} `.repeat(30)])
    const calls: GeminiCall[] = []
    const fake = async (c: GeminiCall): Promise<GeminiResult> => {
      calls.push(c)
      if (c.system.includes('main topics')) return { ok: true, json: { topics: [1, 5, 10].map((p) => ({ title: `Part ${p}`, keywords: ['ready queue', 'convoy'], firstPage: p })) } }
      return { ok: false, error: 'upstream' }
    }
    const ctx = freshService(fake, 'test-key')
    try {
      const doc = (await ctx.service.ingest(buildPdf(pages), 'long.pdf')).body as DocumentInfo
      assert.equal(doc.pageCount, 12)
      const topicsCall = calls.find((c) => c.system.includes('main topics'))
      for (let p = 1; p <= 12; p++) assert.ok(topicsCall?.user.includes(`[p.${p}]\nPart ${p}.`), `topics sample has page ${p}`)
      await ctx.service.lesson(doc.id)
      const lessonCall = calls.find((c) => c.system.includes('tutoring session'))
      assert.ok(lessonCall?.user.includes('(pages 10-12)'))
      for (let p = 1; p <= 12; p++) assert.ok(lessonCall?.user.includes(`[p.${p}]\nPart ${p}.`), `lesson sample has page ${p}`)
    } finally {
      ctx.dispose()
    }
  })

  test('the heuristic (no key) spreads topics over a long document', async () => {
    const pages = Array.from({ length: 30 }, (_, i) => [`Heading number ${i + 1}`, `${LECTURE[i % LECTURE.length]} `.repeat(5)])
    const ctx = freshService()
    try {
      const doc = (await ctx.service.ingest(buildPdf(pages), 'long.pdf')).body as DocumentInfo
      const firstPages = doc.topics.map((t) => t.firstPage)
      assert.equal(firstPages.length, DOCS_CONFIG.topicsMax)
      assert.equal(firstPages[0], 1)
      assert.ok((firstPages.at(-1) ?? 0) >= 25, `last topic starts on page ${firstPages.at(-1)}`)
    } finally {
      ctx.dispose()
    }
  })
})

describe('research papers', () => {
  const WALKTHROUGH = {
    sections: [
      {
        part: 'question',
        title: 'Why arrival order matters',
        keywords: ['ready queue', 'a term the paper never uses'],
        page: 1,
        mins: 3,
        say: ['FCFS runs jobs as they arrive.', 'The question is what that order costs.'],
        notesHead: 'The question',
        notes: [{ text: 'The CPU runs jobs in the exact order they arrive. (p. 1)', page: 1 }], // the page ref in the text is dropped
        boardHead: 'Rule',
        board: ['first come, first served'],
      },
      {
        part: 'results',
        title: 'Convoy effect',
        keywords: ['Convoy effect'],
        page: 9,
        mins: 20,
        say: ['Short jobs wait behind long ones.', 'So the average wait grows.'],
        notesHead: 'Results',
        notes: [
          { text: `${LECTURE[4]} (pp. 1, 2)`, page: 1 }, // a printed page number: moved to page 2
          { text: 'P2 waits 24 ms and P3 waits 27 ms', page: 10 }, // outside the file: rescued to page 2
          { text: 'An invented finding about nothing', page: 12 }, // nowhere in the paper: dropped
        ],
        boardHead: 'Average wait',
        board: ['(0 + 24 + 27) / 3 = 17 ms'],
      },
      { part: 'method', title: 'Nothing grounded', keywords: [], page: 1, mins: 3, say: ['One line.'], notesHead: '', notes: [], boardHead: '', board: [] },
    ],
  }
  const isPaperCall = (c: GeminiCall) => c.system.includes('research paper')

  test('one walkthrough call at upload gives the topics and the cached lesson pack', async () => {
    const calls: GeminiCall[] = []
    const ctx = freshService(async (c) => (calls.push(c), isPaperCall(c) ? { ok: true, json: WALKTHROUGH } : { ok: false, error: 'upstream' }), 'test-key')
    try {
      const res = await ctx.service.ingest(pdf, 'fcfs-paper.pdf', 'cs111', 'paper')
      assert.equal(res.status, 201)
      const doc = res.body as DocumentInfo
      assert.equal(doc.kind, 'paper')
      assert.equal(calls.length, 1, 'no separate topics call')
      assert.equal(calls[0].inline?.mimeType, 'application/pdf', 'a small PDF goes inline')
      assert.match(calls[0].user, /Page map/)
      assert.match(calls[0].user, /p\.2: Convoy effect/)
      assert.deepEqual(doc.topics.map((t) => t.title), ['Why arrival order matters', 'Convoy effect'])
      assert.equal(doc.topics[0].keywords.includes('a term the paper never uses'), false)
      assert.deepEqual(doc.topics.map((t) => t.firstPage), [1, 2])

      const pack = (await ctx.service.lesson(doc.id)).body as LessonPack
      assert.equal(calls.length, 1, 'the pack was cached at upload')
      assert.equal(pack.source, 'gemini')
      assert.deepEqual(pack.sections.map((s) => s.title), ['Question: Why arrival order matters', 'Results: Convoy effect'])
      assert.deepEqual(pack.sections.map((s) => s.topicId), doc.topics.map((t) => t.id))
      assert.deepEqual(pack.sections[1].notes.lines.map((l) => l.page), [2, 2])
      assert.equal(pack.sections[0].notes.lines[0].text, 'The CPU runs jobs in the exact order they arrive.')
      assert.equal(pack.sections[1].notes.lines[0].text, LECTURE[4])
      assert.equal(pack.sections[1].mins, DOCS_CONFIG.lessonMinsMax)
      assert.equal(pack.sections[1].page, 2)
      for (const s of pack.sections) for (const l of s.notes.lines) assert.ok(l.page >= 1 && l.page <= doc.pageCount)
      assert.equal((ctx.service.list().body as DocumentInfo[])[0].kind, 'paper')
    } finally {
      ctx.dispose()
    }
  })

  test('a failed walkthrough falls back to class indexing, then is retried for the lesson', async () => {
    let paperCalls = 0
    const fake = async (c: GeminiCall): Promise<GeminiResult> => {
      if (!isPaperCall(c)) return { ok: false, error: 'upstream' } // topics -> heuristic
      paperCalls++
      return paperCalls === 1 ? { ok: false, error: 'timeout' } : { ok: true, json: WALKTHROUGH }
    }
    const ctx = freshService(fake, 'test-key')
    try {
      const doc = (await ctx.service.ingest(pdf, 'paper.pdf', 'cs111', 'paper')).body as DocumentInfo
      assert.ok(doc.topics.length >= 1, 'heuristic topics')
      const pack = (await ctx.service.lesson(doc.id)).body as LessonPack
      assert.equal(paperCalls, 2)
      assert.equal(pack.source, 'gemini')
      const ids = new Set(doc.topics.map((t) => t.id))
      assert.ok(pack.sections.every((s) => s.topicId !== null && ids.has(s.topicId)), 'sections point at the stored topics')
      await ctx.service.lesson(doc.id)
      assert.equal(paperCalls, 2, 'cached after the retry')
    } finally {
      ctx.dispose()
    }
  })

  test('a non-PDF paper sends its page text with [p.N] markers; no key gives the offline outline', async () => {
    const calls: GeminiCall[] = []
    const ctx = freshService(async (c) => (calls.push(c), isPaperCall(c) ? { ok: true, json: WALKTHROUGH } : { ok: false, error: 'upstream' }), 'test-key')
    try {
      const docx = buildDocx([...FIXTURE_PAGES[0].map(wordPara), WORD_PAGE_BREAK, ...FIXTURE_PAGES[1].map(wordPara)].join(''))
      const doc = (await ctx.service.ingest(docx, 'paper.docx', 'cs111', 'paper')).body as DocumentInfo
      assert.equal(calls[0].inline, undefined)
      assert.match(calls[0].user, /\[p\.1\]\n4\.2 First-come/)
      assert.match(calls[0].user, /\[p\.2\]\nConvoy effect/)
      assert.equal(doc.topics.length, 2)
    } finally {
      ctx.dispose()
    }
    const offline = freshService()
    try {
      const doc = (await offline.service.ingest(pdf, 'paper.pdf', 'cs111', 'paper')).body as DocumentInfo
      assert.equal(doc.kind, 'paper')
      assert.equal(((await offline.service.lesson(doc.id)).body as LessonPack).source, 'outline')
    } finally {
      offline.dispose()
    }
  })

  test('rows from before kinds existed read as class material', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'gg-docs-kind-'))
    const old = new DatabaseSync(join(dataDir, DOCS_CONFIG.dbFile))
    old.exec('CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, savedPath TEXT NOT NULL, pageCount INTEGER NOT NULL, createdAt TEXT NOT NULL)')
    old.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?)').run('00000000000000bb', 'Old notes', 'uploads/00000000000000bb.pdf', 1, '2026-01-01T00:00:00.000Z')
    old.close()
    const service = createDocsService({ dataDir, readKey: () => null })
    try {
      const [doc] = service.list().body as DocumentInfo[]
      assert.equal(doc.kind, 'class')
      assert.equal(doc.original, 'pdf')
    } finally {
      service.close()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})

describe('any file over HTTP', () => {
  let server: Server
  let base: { host: string; port: number }
  let dataDir: string
  let service: DocsService
  let key: string | null = 'test-key'

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'gg-docs-any-http-'))
    const gemini = async (c: GeminiCall): Promise<GeminiResult> =>
      c.inline?.mimeType.startsWith('image/') ? { ok: true, json: { kind: 'text', text: `${LECTURE[4]}\n${LECTURE[5]}` } } : { ok: false, error: 'upstream' }
    const mw = docsMiddleware({ root: dataDir, dataDir, readKey: () => key, gemini })
    service = mw.service()
    server = createServer((req, res) => mw(req, res, () => ((res.statusCode = 404), res.end('fallthrough'))))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = { host: '127.0.0.1', port: (server.address() as AddressInfo).port }
  })
  after(() => {
    server.close()
    service.close()
    rmSync(dataDir, { recursive: true, force: true })
  })

  function call(path: string, method: string, headers: Record<string, string>, body?: Buffer): Promise<{ status: number; headers: Record<string, unknown>; bytes: Buffer; json: unknown }> {
    return new Promise((resolve, reject) => {
      const req = request({ ...base, path, method, headers }, (res) => {
        const parts: Buffer[] = []
        res.on('data', (c: Buffer) => parts.push(c))
        res.on('end', () => {
          const bytes = Buffer.concat(parts)
          let json: unknown = null
          try {
            json = JSON.parse(bytes.toString('utf8'))
          } catch {
            json = null
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, bytes, json })
        })
      })
      req.on('error', reject)
      if (body) req.write(body)
      req.end()
    })
  }
  const upload = (name: string, type: string, bytes: Buffer, extra: Record<string, string> = {}) =>
    call('/api/documents', 'POST', { 'content-type': type, 'x-filename': encodeURIComponent(name), ...extra }, bytes)

  const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const CASES: { name: string; type: string; bytes: Buffer; served: string; inline: boolean }[] = [
    { name: 'Week 4.docx', type: DOCX_TYPE, bytes: buildDocx(FIXTURE_PAGES[0].map(wordPara).join('')), served: DOCX_TYPE, inline: false },
    { name: 'Week 4.pptx', type: '', bytes: buildPptx([{ lines: FIXTURE_PAGES[0] }, { lines: FIXTURE_PAGES[1] }]), served: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false },
    { name: 'notes.txt', type: 'text/plain', bytes: Buffer.from(LECTURE.join('\n\n')), served: 'text/plain; charset=utf-8', inline: true },
    { name: 'notes.md', type: 'text/markdown', bytes: Buffer.from(`# ${LECTURE[0]}\n\n${LECTURE[1]}`), served: 'text/plain; charset=utf-8', inline: true },
    { name: 'page.html', type: 'text/html', bytes: Buffer.from(`<p>${LECTURE[1]}</p><script>fetch('/api/tts')</script>`), served: 'text/html; charset=utf-8', inline: false },
    { name: 'board.png', type: 'image/png', bytes: PNG_BYTES, served: 'image/png', inline: true },
    { name: 'board.jpg', type: 'image/jpeg', bytes: JPEG_BYTES, served: 'image/jpeg', inline: true },
  ]

  test('every format uploads and its original is served with the right type and disposition', async () => {
    for (const c of CASES) {
      const up = await upload(c.name, c.type, c.bytes)
      assert.equal(up.status, 201, `${c.name}: ${JSON.stringify(up.json)}`)
      const doc = up.json as DocumentInfo
      assert.equal(doc.kind, 'class')
      const file = await call(`/api/documents/${doc.id}/file`, 'GET', {})
      assert.equal(file.status, 200, c.name)
      assert.equal(file.headers['content-type'], c.served, c.name)
      assert.match(String(file.headers['content-disposition']), c.inline ? /^inline; / : /^attachment; /, c.name)
      assert.equal(file.headers['content-security-policy'], c.inline ? undefined : 'sandbox', c.name)
      assert.ok(file.bytes.equals(c.bytes), `${c.name} served byte for byte`)
      if (c.name === 'page.html') {
        const page = (await call(`/api/documents/${doc.id}/pages/1`, 'GET', {})).json as PageText
        assert.equal(page.text, LECTURE[1], 'uploaded HTML is stored as its visible text')
      }
    }
  })

  test('x-doc-kind: paper is stored and listed; anything else is a 400', async () => {
    const up = await upload('paper.pdf', 'application/pdf', pdf, { 'x-doc-kind': 'paper' })
    assert.equal(up.status, 201)
    assert.equal((up.json as DocumentInfo).kind, 'paper')
    const bad = await upload('paper.pdf', 'application/pdf', pdf, { 'x-doc-kind': 'novel' })
    assert.deepEqual([bad.status, bad.json], [400, { error: 'bad-request' }])
  })

  test('refusals: unsupported types, bytes that do not match, images without a key', async () => {
    const refuse = async (name: string, type: string, bytes: Buffer) => {
      const r = await upload(name, type, bytes)
      return [r.status, (r.json as { error?: string } | null)?.error]
    }
    assert.deepEqual(await refuse('setup.exe', 'application/octet-stream', PNG_BYTES), [415, 'unsupported'])
    assert.deepEqual(await refuse('drawing.svg', 'image/svg+xml', Buffer.from('<svg/>')), [415, 'unsupported'])
    assert.deepEqual(await refuse('notes.docx', '', Buffer.from(LECTURE[1])), [415, 'bad-file'])
    assert.deepEqual(await refuse('board.png', 'image/png', JPEG_BYTES), [415, 'bad-file'])
    assert.deepEqual(await refuse('notes.txt', 'text/plain', PNG_BYTES), [415, 'bad-file'])
    assert.deepEqual(await refuse('slides.pptx', '', buildDocx(wordPara(LECTURE[0]))), [415, 'bad-file'])
    assert.deepEqual(await refuse('notes.pdf', 'text/plain', pdf), [415, 'not-pdf'])
    key = null
    try {
      assert.deepEqual(await refuse('board.png', 'image/png', PNG_BYTES), [503, 'no-key'])
    } finally {
      key = 'test-key'
    }
  })
})
