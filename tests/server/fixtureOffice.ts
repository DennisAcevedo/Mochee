import { crc32, deflateRawSync } from 'node:zlib'

// Minimal, valid DOCX and PPTX files written by hand (a zip of the XML parts
// Office needs), so the backend tests read real Office bytes without a binary
// fixture in the repo.

// A classic zip: deflated entries (or stored, with store: true).
export function buildZip(files: Record<string, string | Buffer>, opts: { store?: boolean } = {}): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const method = opts.store ? 0 : 8
    const body = method ? deflateRawSync(data) : data
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, body)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(method, 10)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(body.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBuf.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBuf)
    offset += local.length + nameBuf.length + body.length
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

// One Word paragraph of plain text.
export const wordPara = (text: string) => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`
export const WORD_PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

// A .docx whose body is the given paragraph XML (see wordPara / WORD_PAGE_BREAK).
export function buildDocx(bodyXml: string): Buffer {
  return buildZip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`,
  })
}

export interface SlideSpec {
  lines: string[] // one DrawingML paragraph each; '\n' inside a line becomes an a:br
  notes?: string[]
}

const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

const drawingParas = (lines: string[]) =>
  lines
    .map((l) => `<a:p>${l.split('\n').map((part) => `<a:r><a:rPr lang="en-US" dirty="0"/><a:t>${xmlEscape(part)}</a:t></a:r>`).join('<a:br><a:rPr lang="en-US"/></a:br>')}</a:p>`)
    .join('')

const shape = (paras: string) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`

// A .pptx with slides stored as slide1.xml.. in the given order, listed in the
// presentation in `order` (indices into `slides`; default = as given).
export function buildPptx(slides: SlideSpec[], order: number[] = slides.map((_, i) => i)): Buffer {
  const files: Record<string, string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${A_NS}><p:sldIdLst>${order.map((i, k) => `<p:sldId id="${256 + k}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides
      .map((_, i) => `<Relationship Id="rId${i + 2}" Type="${REL_NS}/slide" Target="slides/slide${i + 1}.xml"/>`)
      .join('')}</Relationships>`,
  }
  slides.forEach((s, i) => {
    const n = i + 1
    files[`ppt/slides/slide${n}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><p:sld ${A_NS}><p:cSld><p:spTree>${s.lines.length ? shape(drawingParas(s.lines)) : ''}</p:spTree></p:cSld></p:sld>`
    if (s.notes) {
      files[`ppt/slides/_rels/slide${n}.xml.rels`] =
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`
      // Real notes slides carry the slide-number field next to the notes text.
      files[`ppt/notesSlides/notesSlide${n}.xml`] =
        `<?xml version="1.0" encoding="UTF-8"?><p:notes ${A_NS}><p:cSld><p:spTree>${shape(drawingParas(s.notes))}${shape(`<a:p><a:fld id="{1}" type="slidenum"><a:t>${n}</a:t></a:fld></a:p>`)}</p:spTree></p:cSld></p:notes>`
    }
  })
  return buildZip(files)
}

// The real opening bytes of a PNG (signature + IHDR) and a JPEG (SOI + JFIF
// APP0), NULs included as in any real image: enough for the magic check
// (Gemini is a fake in the tests, so the pixels are never decoded).
export const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 0x10, 0, 0, 0, 0x10, 8, 6, 0, 0, 0])
export const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
