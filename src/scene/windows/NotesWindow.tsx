import { useFrame } from '@react-three/fiber'
import { useCallback, useRef, useState } from 'react'
import type { Mesh, MeshBasicMaterial } from 'three'
import { notesTabs, type NoteLine, type NoteTab } from '../../data/stageContent'
import { useDirector } from '../../state/director'
import { PALETTE } from '../layout3d'
import { BrowserWindow3D, type ContentBox, type WindowTab } from './BrowserWindow3D'
import { damp, Flat, Label, useEnter } from './primitives'
import { leftAnchoredPlane } from './shapes'
import { FONTS, ON_ACCENT, TINT, WINDOW_STYLE } from './windowStyle'

// The left window: the student's PDFs. Tabs are notesTabs (active =
// director.notesTab, a click calls setNotesTab). Lines stack top-down with
// measured heights; titles are big and bold, key lines are colour chips,
// cheat-sheet rows are a table with coloured policy pills. director.highlight
// sweeps a sun-yellow marker behind the matching line.

const N = WINDOW_STYLE.notes
const C = WINDOW_STYLE.content
const L = WINDOW_STYLE.layer
const TAB_COLORS = [PALETTE.coral, PALETTE.teal, PALETTE.violet, PALETTE.sun]

type Size = [number, number] // measured text block [width, height]
type Report = (id: string, size: Size) => void

const blockSize = (mesh: { textRenderInfo?: { blockBounds: number[] } }): Size | null => {
  const b = mesh.textRenderInfo?.blockBounds
  return b ? [b[2] - b[0], b[3] - b[1]] : null
}

// Sun-yellow highlighter that sweeps in from the left when active.
function Marker({ active, w, h, x, y, z = L }: { active: boolean; w: number; h: number; x: number; y: number; z?: number }) {
  const ref = useRef<Mesh>(null)
  const mat = useRef<MeshBasicMaterial>(null)
  const p = useRef(0)
  useFrame((_, dt) => {
    p.current = damp(p.current, active ? 1 : 0, N.marker.damp, dt)
    const m = ref.current
    if (!m) return
    m.scale.set(Math.max(w * p.current, 0.0001), h, 1)
    m.visible = p.current > 0.003
    if (mat.current) mat.current.opacity = Math.min(1, p.current * 1.4)
  })
  return (
    <mesh ref={ref} geometry={leftAnchoredPlane()} position={[x, y, z]} rotation={[0, 0, 0.008]} visible={false}>
      <meshBasicMaterial ref={mat} color={N.marker.color} transparent opacity={0} toneMapped={false} />
    </mesh>
  )
}

function lineHeight(line: NoteLine, size: Size | undefined): number {
  const textH = size?.[1] ?? N.text.size * N.text.lineHeight
  switch (line.kind) {
    case 'title':
      return N.kicker.size + 0.05 + (size?.[1] ?? N.title.size) + 0.035 + N.title.underline.h
    case 'heading':
      return size?.[1] ?? N.heading.size
    case 'key':
      return textH + N.key.padY * 2
    case 'row':
      return N.row.h
    default:
      return textH
  }
}

interface LineProps {
  line: NoteLine
  y: number // top of the line
  iw: number // inner width of the paper
  kicker: string
  size: Size | undefined
  report: Report
  highlighted: boolean
}

function NoteLineView({ line, y, iw, kicker, size, report, highlighted }: LineProps) {
  const onSync = (mesh: { textRenderInfo?: { blockBounds: number[] } }) => {
    const s = blockSize(mesh)
    if (s) report(line.id, s)
  }
  const tw = size?.[0] ?? iw * 0.6
  const th = size?.[1] ?? N.text.size
  const mk = N.marker

  if (line.kind === 'title') {
    const titleY = y - N.kicker.size - 0.05
    return (
      <group>
        <Label size={N.kicker.size} color={N.kicker.color} font={FONTS.mono} letterSpacing={N.kicker.letterSpacing} anchorY="top" position={[0, y, L]}>
          {kicker}
        </Label>
        <Marker active={highlighted} w={tw + mk.padX * 2} h={th + mk.padY * 2} x={-mk.padX} y={titleY - th / 2} />
        <Label size={N.title.size} color={N.title.color} anchorY="top" maxWidth={iw} position={[0, titleY, L * 2]} onSync={onSync}>
          {line.text}
        </Label>
        <Flat w={N.title.underline.w} h={N.title.underline.h} r={N.title.underline.h / 2} color={N.title.underline.color} position={[N.title.underline.w / 2, titleY - th - 0.035 - N.title.underline.h / 2, L]} />
      </group>
    )
  }

  if (line.kind === 'key') {
    const k = N.key
    const color = line.color ?? 'teal'
    const chipW = Math.min(iw, tw + k.padX * 2 + k.bar)
    const chipH = th + k.padY * 2
    return (
      <group position={[0, y, 0]}>
        <Flat w={chipW} h={chipH} r={k.radius} color={TINT[color]} position={[chipW / 2, -chipH / 2, 0]} />
        <Flat w={k.bar} h={chipH} r={[k.radius, 0, 0, k.radius]} color={PALETTE[color]} position={[k.bar / 2, -chipH / 2, L / 2]} />
        <Marker active={highlighted} w={chipW - k.bar} h={chipH} x={k.bar} y={-chipH / 2} />
        <Label size={k.size} color={k.color} anchorY="top" maxWidth={iw - k.padX * 2 - k.bar} lineHeight={N.text.lineHeight} position={[k.bar + k.padX, -k.padY, L * 2]} onSync={onSync}>
          {line.text}
        </Label>
      </group>
    )
  }

  if (line.kind === 'row') {
    const r = N.row
    const header = line.text === 'header'
    const cells = line.cells ?? []
    const cy = y - r.h / 2
    const col1 = iw * 0.36
    const color = line.color
    return (
      <group>
        {header ? (
          <Flat w={iw} h={r.h} r={0.03} color={r.headerBg} position={[iw / 2, cy, 0]} />
        ) : (
          <Flat w={iw} h={0.006} color={r.divider} position={[iw / 2, y - r.h, 0]} />
        )}
        <Marker active={highlighted} w={iw} h={r.h} x={0} y={cy} z={L / 2} />
        {header ? (
          cells.map((c, i) => (
            <Label
              key={c}
              size={r.headerSize}
              color={N.kicker.color}
              font={FONTS.monoBold}
              letterSpacing={0.06}
              anchorX={i === 2 ? 'right' : 'left'}
              position={[i === 0 ? 0.05 : i === 1 ? col1 : iw - 0.05, cy, L * 2]}
            >
              {c.toUpperCase()}
            </Label>
          ))
        ) : (
          <>
            <Flat w={col1 - 0.08} h={r.pill.h} r={r.pill.radius} color={color ? PALETTE[color] : PALETTE.ink} position={[(col1 - 0.08) / 2, cy, L]} />
            <Label size={r.size} color={color ? ON_ACCENT[color] : '#ffffff'} anchorX="center" position={[(col1 - 0.08) / 2, cy, L * 2]}>
              {cells[0]}
            </Label>
            <Label size={r.size} color={N.text.color} font={FONTS.semi} position={[col1, cy, L * 2]}>
              {cells[1]}
            </Label>
            <Label size={r.size * 1.1} color={PALETTE.ink} anchorX="right" position={[iw - 0.05, cy, L * 2]}>
              {cells[2]}
            </Label>
          </>
        )}
      </group>
    )
  }

  const style = line.kind === 'heading' ? N.heading : N.text
  return (
    <group>
      <Marker active={highlighted} w={tw + mk.padX * 2} h={th + mk.padY * 2} x={-mk.padX} y={y - th / 2} />
      <Label
        size={style.size}
        color={style.color}
        font={line.kind === 'heading' ? FONTS.bold : FONTS.semi}
        anchorY="top"
        maxWidth={iw}
        lineHeight={N.text.lineHeight}
        position={[0, y, L * 2]}
        onSync={onSync}
      >
        {line.text}
      </Label>
    </group>
  )
}

// "p. 7 of 18" -> 7 / 18, for the footer's reading-progress bar.
function pageShare(page: string): number {
  const m = page.match(/(\d+)\D+(\d+)/)
  return m ? Math.min(1, Number(m[1]) / Number(m[2])) : 0
}

function NotesPage({ tab, box, highlight }: { tab: NoteTab; box: ContentBox; highlight: string | null }) {
  const [sizes, setSizes] = useState<Record<string, Size>>({})
  const report = useCallback<Report>((id, s) => {
    setSizes((prev) => {
      const p = prev[id]
      if (p && Math.abs(p[0] - s[0]) < 1e-4 && Math.abs(p[1] - s[1]) < 1e-4) return prev
      return { ...prev, [id]: s }
    })
  }, [])

  // Paper sheet inset in the grey viewer.
  const paperW = box.w - C.paperInset * 2
  const paperH = box.h - C.paperInset
  const iw = paperW - C.pad * 2
  const kicker = tab.title.replace(/\.pdf$/i, '').toUpperCase()

  let y = 0
  const placed = tab.lines.map((line) => {
    const at = y
    y -= lineHeight(line, sizes[line.id]) + N.gap
    return { line, y: at }
  })

  const f = N.footer
  const footY = -paperH + C.pad * 0.7
  const barW = paperW * 0.32
  const enter = useEnter()
  return (
    <group ref={enter}>
      <Flat w={paperW} h={paperH} r={[0.03, 0.03, 0, 0]} color={C.paper} position={[box.w / 2, -C.paperInset - paperH / 2, 0]} />
      <Flat w={paperW + 0.02} h={paperH + 0.01} r={[0.04, 0.04, 0, 0]} color="#000000" opacity={0.06} position={[box.w / 2, -C.paperInset - paperH / 2 - 0.004, -L / 2]} />
      <group position={[C.paperInset + C.pad, -C.paperInset - C.pad * 0.85, L]}>
        {placed.map(({ line, y: ly }) => (
          <NoteLineView key={line.id} line={line} y={ly} iw={iw} kicker={kicker} size={sizes[line.id]} report={report} highlighted={highlight === line.id} />
        ))}
      </group>
      {/* Footer: reading progress + page number. */}
      <group position={[C.paperInset + C.pad, footY, L]}>
        <Flat w={barW} h={f.bar.h} r={f.bar.h / 2} color={f.bar.track} position={[barW / 2, 0, 0]} />
        <Flat w={barW * pageShare(tab.page)} h={f.bar.h} r={f.bar.h / 2} color={f.bar.color} position={[(barW * pageShare(tab.page)) / 2, 0, L]} />
        <Label size={f.size} color={f.color} font={FONTS.mono} anchorX="right" position={[iw, 0, L]}>
          {tab.page}
        </Label>
      </group>
    </group>
  )
}

export function NotesWindow() {
  const notesTab = useDirector((s) => s.notesTab)
  const highlight = useDirector((s) => s.highlight)
  const setNotesTab = useDirector((s) => s.setNotesTab)
  const [reloads, setReloads] = useState(0) // the reload button re-runs the page's slide-in
  const index = Math.min(Math.max(0, notesTab), notesTabs.length - 1)
  const tab = notesTabs[index]
  const tabs: WindowTab[] = notesTabs.map((t, i) => ({ title: t.title, color: TAB_COLORS[i % TAB_COLORS.length] }))

  return (
    <BrowserWindow3D id="notes" tabs={tabs} active={index} onTab={setNotesTab} url={WINDOW_STYLE.urlHost + tab.url} contentBg={C.notesBg} onReload={() => setReloads((n) => n + 1)}>
      {(box) => <NotesPage key={`${index}-${reloads}`} tab={tab} box={box} highlight={highlight} />}
    </BrowserWindow3D>
  )
}
