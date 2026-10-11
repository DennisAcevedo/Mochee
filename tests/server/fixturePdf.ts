import { notesTabs } from '../../shared/lessonNotes.ts'

// A minimal, valid multi-page PDF written by hand (Helvetica text objects, no
// compression) so the backend tests ingest real bytes without a binary
// fixture in the repo. The text is the real CS111 lecture content the stage
// already teaches (shared/lessonNotes.ts).

const FIXTURE = {
  pageWidth: 612,
  pageHeight: 792,
  marginLeft: 72,
  firstBaseline: 720,
  fontSize: 12,
  leading: 18, // points between lines of one paragraph
  paragraphGap: 14, // extra points before a new paragraph
} as const

const lecture = notesTabs[0]
const cheatSheet = notesTabs[2]
const line = (id: string) => lecture.lines.find((l) => l.id === id)?.text ?? ''

// Page 1: the FCFS definition. Page 2: the convoy effect and the 24/3/3 ms example.
export const FIXTURE_PAGES: string[][] = [
  [
    line('l4-title'),
    `${line('l4-def')} ${line('l4-queue')}`,
    line('l4-wait'),
    'Jobs that arrive while the CPU is busy wait their turn at the back of the ready queue.',
  ],
  [
    line('l4-convoy'),
    'A long CPU-bound job holds the processor while every short job queues behind it, so the average waiting time grows.',
    line('l4-example'),
    'FCFS runs P1 first, so P2 waits 24 ms and P3 waits 27 ms: the average wait is (0 + 24 + 27) / 3 = 17 ms.',
    ...cheatSheet.lines
      .filter((l) => l.kind === 'row' && l.cells && l.text !== 'header')
      .map((l) => `${l.cells?.[0]}: order ${l.cells?.[1]}, average wait ${l.cells?.[2]}.`),
  ],
]

const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

// Wraps a paragraph to lines of at most maxChars, on spaces.
function wrap(text: string, maxChars: number): string[] {
  const out: string[] = []
  let current = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (current && current.length + 1 + word.length > maxChars) {
      out.push(current)
      current = word
    } else current = current ? `${current} ${word}` : word
  }
  if (current) out.push(current)
  return out
}

function pageStream(paragraphs: string[]): string {
  const ops = [`BT /F1 ${FIXTURE.fontSize} Tf ${FIXTURE.marginLeft} ${FIXTURE.firstBaseline} Td`]
  paragraphs.forEach((para, i) => {
    if (i > 0) ops.push(`0 -${FIXTURE.leading + FIXTURE.paragraphGap} Td`)
    wrap(para, 80).forEach((l, j) => {
      if (j > 0) ops.push(`0 -${FIXTURE.leading} Td`)
      ops.push(`(${escapePdf(l)}) Tj`)
    })
  })
  ops.push('ET')
  return ops.join('\n')
}

// Builds the PDF bytes: catalog, page tree, font, then one page + content stream per page.
export function buildPdf(pages: string[][] = FIXTURE_PAGES): Buffer {
  const objects: string[] = []
  const pageIds = pages.map((_, i) => 4 + i * 2)
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  pages.forEach((paras, i) => {
    const pageId = pageIds[i]
    const stream = pageStream(paras)
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${FIXTURE.pageWidth} ${FIXTURE.pageHeight}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`
    objects[pageId + 1] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  })

  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(body, 'latin1')
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xrefAt = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id++) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}
