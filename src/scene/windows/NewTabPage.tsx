import { useCursor } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useState, type ReactNode } from 'react'
import type { DocumentInfo } from '../../../shared/docsTypes'
import { notesTabs } from '../../../shared/lessonNotes'
import { useWindows } from '../../state/windows'
import { errorText } from '../../ui/Drawers/docsClient'
import { useDocs } from '../../ui/Drawers/docsStore'
import { activateByStudent } from './lessonSync'
import { ArrowGlyph, Flat, Hit, Label } from './primitives'
import { roundedRect, roundedRectRing } from './shapes'
import { ellipsize } from './tabLayout'
import { BOARD_TITLE, QUIZ_TITLE } from './tabInfo'
import type { Tab, TabContent, WinId } from './tabModel'
import type { ContentBox } from './WindowContent'
import { FONTS, WINDOW_STYLE } from './windowStyle'

// The New tab page (design/sparkle-stage/NewTab.dc.html): a Scratch note,
// the lesson's sections, and the student's PDFs with a page picker. Picking
// an item turns this tab into it; a lesson section also tells the lesson,
// like a click on that tab would.

const NT = WINDOW_STYLE.newTab
const K = WINDOW_STYLE.kinds
const L = WINDOW_STYLE.layer
const BTN = NT.button

interface CardProps {
  w: number
  h: number
  x: number
  y: number // top edge
  name: string
  onPick: () => void
  bg?: string
  border?: string
  hoverBorder?: string
  children: ReactNode
}

// A flat card button: a border that turns blue on hover, a pointer cursor.
function Card({ w, h, x, y, name, onPick, bg = BTN.bg, border = BTN.border, hoverBorder = BTN.hoverBorder, children }: CardProps) {
  const [hover, setHover] = useState(false)
  useCursor(hover)
  const s = BTN.stroke
  return (
    <group position={[x, y, 0]}>
      <mesh
        name={name}
        geometry={roundedRect(w, h, BTN.radius)}
        position={[w / 2, -h / 2, 0]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHover(true)
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onPick()
        }}
      >
        <meshBasicMaterial color={bg} toneMapped={false} />
      </mesh>
      <mesh geometry={roundedRectRing(w - s * 2, h - s * 2, BTN.radius - s, s)} position={[w / 2, -h / 2, L]}>
        <meshBasicMaterial color={hover ? hoverBorder : border} toneMapped={false} />
      </mesh>
      <group position={[0, 0, L * 2]}>{children}</group>
    </group>
  )
}

// A pencil for the Scratch note card.
function Pencil({ color, position }: { color: string; position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, 0, Math.PI / 4]}>
      <Flat w={0.13} h={0.034} r={0.008} color={color} />
      <Flat w={0.02} h={0.034} color="#ffffff" position={[0.04, 0, L]} />
      <mesh position={[-0.078, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <circleGeometry args={[0.02, 3]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

// The topic a page falls in: the last one starting on or before it.
function topicAt(doc: DocumentInfo, page: number) {
  let best: { title: string; firstPage: number } | null = null
  for (const t of doc.topics) if (t.firstPage <= page && (!best || t.firstPage >= best.firstPage)) best = t
  return best?.title ?? null
}

const firstPage = (doc: DocumentInfo) => Math.max(1, Math.min(doc.pageCount, doc.topics[0]?.firstPage ?? 1))

function PdfRow({ doc, page, w, y, x, onStep, onOpen }: { doc: DocumentInfo; page: number; w: number; x: number; y: number; onStep: (d: number) => void; onOpen: () => void }) {
  const R = NT.pdfRow
  const textX = 0.27
  const textW = w - textX - R.step * 2 - 0.12
  const topic = topicAt(doc, page)
  const sub = `p. ${page} of ${doc.pageCount}${topic ? ` · ${topic}` : ''}`
  const stepX = w - R.step * 1.5 - 0.04
  return (
    <Card w={w} h={R.h} x={x} y={y} name={`newtab-pdf-${doc.id}`} onPick={onOpen}>
      <Flat w={0.15} h={0.075} r={0.02} color={R.badge} position={[0.13, -R.h / 2, 0]} />
      <Label size={0.038} color="#ffffff" anchorX="center" position={[0.13, -R.h / 2, L]}>
        PDF
      </Label>
      <Label size={R.title} anchorY="top" position={[textX, -0.035, 0]}>
        {ellipsize(doc.title.slice(0, NT.maxTitle), textW, R.title)}
      </Label>
      <Label size={R.sub} color={NT.scratch.subColor} font={FONTS.semi} anchorY="top" position={[textX, -0.035 - R.title * 1.35, 0]}>
        {ellipsize(sub, textW, R.sub)}
      </Label>
      <Hit size={R.step * 0.7} disabled={page <= 1} onClick={() => onStep(-1)} position={[stepX, -R.h / 2, L]}>
        <ArrowGlyph size={0.055} stroke={0.012} color={page > 1 ? BTN.hoverBorder : BTN.border} dir={-1} />
      </Hit>
      <Hit size={R.step * 0.7} disabled={page >= doc.pageCount} onClick={() => onStep(1)} position={[stepX + R.step, -R.h / 2, L]}>
        <ArrowGlyph size={0.055} stroke={0.012} color={page < doc.pageCount ? BTN.hoverBorder : BTN.border} dir={1} />
      </Hit>
    </Card>
  )
}

export function NewTabPage({ win, tabId, box }: { win: WinId; tabId: string; box: ContentBox }) {
  const docs = useDocs((s) => s.documents)
  const status = useDocs((s) => s.status)
  const error = useDocs((s) => s.error)
  const [pages, setPages] = useState<Record<string, number>>({})

  // The Learning drawer loads the list too; this page asks once if nobody has.
  useEffect(() => {
    if (useDocs.getState().status === 'idle') void useDocs.getState().refresh()
  }, [])

  const pick = (content: TabContent) => {
    useWindows.getState().turnInto(win, tabId, content)
    activateByStudent(win, { ...content, id: tabId } as Tab)
  }

  const pad = NT.pad
  const iw = box.w - pad * 2
  const G = NT.grid
  const colW = (iw - G.gap * (G.cols - 1)) / G.cols
  const sections: { title: string; color: string; content: TabContent; key: string }[] = [
    ...notesTabs.map((t, i) => ({ title: t.title, color: K.notes[i % K.notes.length], content: { kind: 'notes', note: i } as TabContent, key: `notes-${i}` })),
    { title: BOARD_TITLE, color: K.board, content: { kind: 'board' }, key: 'board' },
    { title: QUIZ_TITLE, color: K.quiz, content: { kind: 'quiz' }, key: 'quiz' },
  ]
  const gridTop = NT.lessonY + G.top

  const R = NT.pdfRow
  const rowsTop = NT.pdfsY + R.top
  const fit = Math.max(0, Math.floor((box.h - rowsTop - 0.04 + R.gap) / (R.h + R.gap)))
  const shown = docs.length > fit ? docs.slice(0, Math.max(0, fit - 1)) : docs
  const more = docs.length - shown.length
  const pageOf = (d: DocumentInfo) => pages[d.id] ?? firstPage(d)
  const empty =
    status === 'error' ? errorText(error ?? 'internal') : status === 'ready' && !docs.length ? 'No PDFs yet. Upload one in the Learning drawer.' : status !== 'ready' ? 'Loading your PDFs…' : ''

  const kicker = (text: string, y: number) => (
    <Label size={NT.kicker.size} color={NT.kicker.color} font={FONTS.monoBold} letterSpacing={NT.kicker.letterSpacing} position={[pad, -y, 0]}>
      {text}
    </Label>
  )
  const S = NT.scratch
  return (
    <group>
      <Label size={NT.heading.size} color={NT.heading.color} position={[pad, -NT.heading.y, 0]}>
        Open in this tab
      </Label>

      <Card w={iw} h={S.h} x={pad} y={-S.y} name="newtab-scratch" bg={S.bg} border={S.bg} hoverBorder={S.border} onPick={() => pick({ kind: 'scratch' })}>
        <Pencil color={S.icon} position={[0.16, -S.h / 2, 0]} />
        <Label size={S.title} position={[0.3, -S.h / 2 + 0.045, 0]}>
          Scratch note
        </Label>
        <Label size={S.sub} color={S.subColor} font={FONTS.semi} position={[0.3, -S.h / 2 - 0.05, 0]}>
          {ellipsize('A blank page for your own notes. Saved on this device.', iw - 0.38, S.sub)}
        </Label>
      </Card>

      {kicker('LESSON SECTIONS', NT.lessonY)}
      {sections.map((s, i) => {
        const col = i % G.cols
        const row = Math.floor(i / G.cols)
        return (
          <Card key={s.key} w={colW} h={G.h} x={pad + col * (colW + G.gap)} y={-(gridTop + row * (G.h + G.gap))} name={`newtab-${s.key}`} onPick={() => pick(s.content)}>
            <mesh position={[0.08, -G.h / 2, 0]}>
              <circleGeometry args={[G.dot, 16]} />
              <meshBasicMaterial color={s.color} toneMapped={false} />
            </mesh>
            <Label size={G.size} position={[0.14, -G.h / 2, 0]}>
              {ellipsize(s.title, colW - 0.2, G.size)}
            </Label>
          </Card>
        )
      })}

      {kicker('YOUR PDFS · PICK A PAGE', NT.pdfsY)}
      {empty ? (
        <Label size={NT.empty.size} color={NT.empty.color} font={FONTS.semi} anchorY="top" maxWidth={iw} position={[pad, -rowsTop, 0]}>
          {empty}
        </Label>
      ) : (
        shown.map((d, i) => (
          <PdfRow
            key={d.id}
            doc={d}
            page={pageOf(d)}
            w={iw}
            x={pad}
            y={-(rowsTop + i * (R.h + R.gap))}
            onStep={(step) => setPages((p) => ({ ...p, [d.id]: Math.max(1, Math.min(d.pageCount, pageOf(d) + step)) }))}
            onOpen={() => pick({ kind: 'pdf', docId: d.id, page: pageOf(d), title: d.title.slice(0, NT.maxTitle) })}
          />
        ))
      )}
      {!empty && more > 0 && (
        <Label size={NT.empty.size} color={NT.empty.color} font={FONTS.semi} anchorY="top" position={[pad, -(rowsTop + shown.length * (R.h + R.gap)), 0]}>
          {`+ ${more} more (drag the corner to make the window taller)`}
        </Label>
      )}
    </group>
  )
}
