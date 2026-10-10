import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { Vector3, type Group } from 'three'
import { useWindows } from '../../state/windows'
import { errorText, fetchPage } from '../../ui/Drawers/docsClient'
import { useDocs } from '../../ui/Drawers/docsStore'
import { PALETTE } from '../layout3d'
import { disposeImage, openPdf, PdfError, renderPage, renderWidth, type PageImage, type PageRender, type PdfFailure } from './pdfTexture'
import { PointerTrack, setCursor } from './pointer'
import { ArrowGlyph, damp, Flat, Hit, Label, useEnter } from './primitives'
import type { Tab, WinId } from './tabModel'
import { INVISIBLE, UNIT } from './TabView'
import type { ContentBox } from './WindowContent'
import { FONTS, WINDOW_STYLE } from './windowStyle'

// One page of a student's PDF in a window tab: the real page, drawn by pdfjs
// into a texture (pdfTexture.ts) and fit to the paper's width. A page taller
// than the tab scrolls: the mouse wheel anywhere over the tab, or a drag on the
// page (a window only moves from its strip or omnibox, so the two never fight).
// Scrolling on past the bottom turns to the next page, past the top to the
// previous one (landing at its bottom); the floating pager steps pages too.
// Each step turns this tab into that page, which remounts this component.
// Not a PDF (a transcript, an office file), or a page pdfjs cannot draw: the
// page's stored text, as before, under a line that says why.

const P = WINDOW_STYLE.pdf
const C = WINDOW_STYLE.content
const N = WINDOW_STYLE.notes
const L = WINDOW_STYLE.layer
const COBALT = WINDOW_STYLE.kinds.pdf

// The rendered page's layout and feel, in the content box's units.
const PV = {
  top: 0.24, // the page's top edge, down from the content's top (the kicker sits above it)
  kickerY: 0.155, // kicker top, down from the content's top
  rule: { h: 0.006, color: '#e4e2ec' }, // hairline under the kicker
  thumb: { w: 0.02, inset: 0.016, min: 0.1, color: COBALT, opacity: 0.55 }, // scrollbar
  pill: { w: 0.7, h: 0.15, bottom: 0.13, arrowX: 0.25, hit: 0.13, text: 0.05, color: COBALT, ink: '#ffffff', dim: '#9fb0f0' }, // floating pager
  over: { px: 220, idleMs: 450, quietMs: 600, h: 0.024, color: PALETTE.violet }, // wheel on past an end to turn the page
  rate: 16, // scroll easing (1/s)
  linePx: 40, // CSS px per wheel line (deltaMode 1)
  ppuGuess: 140, // CSS px per unit until the first measure
  regrowMs: 280, // a bigger on-screen size must hold this long before a sharper render
  memo: 40, // tabs whose scroll position is remembered
} as const

const NOTE: Record<PdfFailure, string> = {
  'not-found': 'The stored PDF is missing · showing its text',
  'not-pdf': 'Not a PDF file · showing its text',
  locked: 'This PDF is password-locked · showing its text',
  network: 'Could not load the PDF · showing its text',
  render: 'Could not draw this page · showing its text',
}

// Where each tab is scrolled (written by the live page), so a reload or a tab
// switch comes back to the same spot; and where a page this tab turned to
// should open: the top, or the bottom (Infinity) when it was reached by
// scrolling up. Two maps, because the page being left may still write its own
// position after the turn.
type Spot = { page: number; y: number }
const memo = new Map<string, Spot>()
const intent = new Map<string, Spot>()
function remember(map: Map<string, Spot>, tabId: string, page: number, y: number) {
  map.delete(tabId)
  map.set(tabId, { page, y })
  if (map.size > PV.memo) map.delete(map.keys().next().value as string)
}
const spotFor = (tabId: string, page: number) => [intent.get(tabId), memo.get(tabId)].find((s) => s?.page === page)?.y ?? 0

type PdfTab = Extract<Tab, { kind: 'pdf' }>
type Body = { kind: 'loading' } | { kind: 'image'; img: PageImage } | { kind: 'text'; note: string | null }
type TextLoad = { status: 'loading' } | { status: 'ok'; text: string } | { status: 'error'; message: string }

const corner = new Vector3()
const quad = new Float64Array(8) // the page viewport's corners on screen (CSS px)

// Not a PDF: a transcript is its text; anything else says what it is.
const textNote = (original: string) => (original === 'txt' ? null : `${original.toUpperCase()} file · showing the text read from it`)

export function PdfPage({ win, tab, box }: { win: WinId; tab: PdfTab; box: ContentBox }) {
  const gl = useThree((s) => s.gl)
  const info = useDocs((s) => s.documents.find((d) => d.id === tab.docId))
  const original = info?.original ?? null // unknown for a tab from another class: the file decides
  const drawable = original === null || original === 'pdf'
  const [pages, setPages] = useState<number | null>(null)
  const [body, setBody] = useState<Body>({ kind: 'loading' })
  const [text, setText] = useState<TextLoad>({ status: 'loading' })
  const count = pages ?? info?.pageCount ?? null
  const last = count ?? tab.page + 1
  const enter = useEnter()

  const pdf = useRef<PDFDocumentProxy | null>(null)
  const job = useRef<PageRender | null>(null)
  const asked = useRef(0) // px width of the last render asked for
  const want = useRef({ px: 0, since: 0 })
  const ppu = useRef<number>(PV.ppuGuess) // CSS px per content unit at the page's near edge
  const alive = useRef(true)
  const mountedAt = useRef(performance.now())
  const view = useRef<Group>(null)
  const thumb = useRef<Group>(null)
  const overBar = useRef<Group>(null)
  const drag = useRef<PointerTrack | null>(null)
  drag.current ??= new PointerTrack()
  const scroll = useRef<{ y: number; target: number; over: number; wheelAt: number; from: number; saved: number } | null>(null)
  if (!scroll.current) {
    const y = spotFor(tab.id, tab.page)
    scroll.current = { y, target: y, over: 0, wheelAt: 0, from: 0, saved: NaN }
  }

  // Geometry: the page fills the paper's width, from under the kicker to the bottom.
  const paperW = box.w - C.paperInset * 2
  const paperH = box.h - C.paperInset
  const vw = paperW
  const vh = box.h - PV.top
  const img = body.kind === 'image' ? body.img : null
  const imgH = img ? vw * img.aspect : 0
  const shownH = Math.min(imgH, vh)
  const max = img ? Math.max(0, imgH - vh) : null // null = no scroll range known yet
  const geo = useRef({ vh, max, kind: body.kind, img })
  geo.current = { vh, max, kind: body.kind, img }

  useEffect(() => {
    alive.current = true
    mountedAt.current = performance.now()
    const track = drag.current
    return () => {
      alive.current = false
      job.current?.cancel()
      job.current = null
      asked.current = 0
      track?.end()
      setCursor(null)
    }
  }, [])

  // The parsed PDF (cached per document across page turns), or the text fallback.
  useEffect(() => {
    if (!drawable) {
      setBody({ kind: 'text', note: textNote(original ?? '') })
      return
    }
    const { doc, release } = openPdf(tab.docId)
    let live = true
    doc.then(
      (d) => {
        if (!live) return
        setPages(d.numPages)
        if (tab.page > d.numPages) setBody({ kind: 'text', note: `This PDF has ${d.numPages} page${d.numPages === 1 ? '' : 's'}` })
        else pdf.current = d
      },
      (err: unknown) => {
        if (live) setBody({ kind: 'text', note: NOTE[err instanceof PdfError ? err.code : 'network'] })
      },
    )
    return () => {
      live = false
      pdf.current = null
      release()
    }
    // `original` only names the fallback; a change in it alone needs no reload.
  }, [tab.docId, tab.page, drawable])

  // A replaced (sharper) or unmounted page frees its texture. The first body is
  // never an image, so StrictMode's mount replay cannot free one in use.
  useEffect(() => () => void (img && disposeImage(img)), [img])

  // The stored text, only when the page is shown as text.
  const asText = body.kind === 'text'
  useEffect(() => {
    if (!asText) return
    let live = true
    void fetchPage(tab.docId, tab.page).then((r) => {
      if (!live) return
      if (r.ok) setText({ status: 'ok', text: r.data.text.replace(/\s+/g, ' ').trim().slice(0, P.maxChars) })
      else setText({ status: 'error', message: errorText(r.error) })
    })
    return () => {
      live = false
    }
  }, [asText, tab.docId, tab.page])

  const go = (page: number, y = 0) => {
    remember(intent, tab.id, page, y)
    useWindows.getState().turnInto(win, tab.id, { kind: 'pdf', docId: tab.docId, page, title: tab.title })
  }

  const draw = (px: number) => {
    const d = pdf.current
    if (!d || job.current) return
    asked.current = px
    const caps = gl.capabilities
    const r = renderPage(d, tab.page, px, caps.maxTextureSize, caps.getMaxAnisotropy())
    job.current = r
    r.promise.then(
      (image) => {
        if (job.current === r) job.current = null
        if (!alive.current) disposeImage(image)
        else setBody({ kind: 'image', img: image })
      },
      () => {
        if (job.current === r) job.current = null
        if (r.cancelled || !alive.current) return
        // A failed sharper copy keeps the page already shown.
        setBody((b) => (b.kind === 'image' ? b : { kind: 'text', note: NOTE.render }))
      },
    )
  }

  // Behind the maximized window the page ignores the wheel and drags.
  const veiled = () => {
    const m = useWindows.getState().maximized
    return m !== null && m !== win
  }

  const onWheel = (e: ThreeEvent<WheelEvent>) => {
    e.stopPropagation()
    const s = scroll.current
    const g = geo.current
    if (!s || g.kind === 'loading' || veiled()) return
    const ne = e.nativeEvent
    const dy = ne.deltaMode === 1 ? ne.deltaY * PV.linePx : ne.deltaMode === 2 ? ne.deltaY * g.vh * ppu.current : ne.deltaY
    if (!dy) return
    const range = g.max ?? 0
    const now = performance.now()
    const pastEnd = dy > 0 ? s.target >= range - 1e-4 : s.target <= 1e-4
    if (!pastEnd) {
      s.over = 0
      s.target = Math.min(range, Math.max(0, s.target + dy / ppu.current))
      return
    }
    // At an end: keep wheeling to turn the page. Not while a fling from the page
    // before is still coming in, and not past the first or the last page.
    const next = dy > 0 ? tab.page + 1 : tab.page - 1
    if (now - mountedAt.current < PV.over.quietMs || next < 1 || next > last) return
    if (Math.sign(s.over) !== Math.sign(dy)) s.over = 0
    s.over += dy
    s.wheelAt = now
    if (Math.abs(s.over) >= PV.over.px) {
      s.over = 0
      go(next, dy > 0 ? 0 : Infinity)
    }
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const s = scroll.current
    const t = drag.current
    if (!s || !t || e.nativeEvent.button !== 0 || !(geo.current.max ?? 0) || veiled()) return
    e.stopPropagation()
    s.from = s.target
    t.press(e.nativeEvent, gl.domElement)
  }

  useFrame((state, dt) => {
    const g = view.current
    const s = scroll.current
    if (!g || !s) return
    const now = performance.now()
    const k = Math.min(dt, 0.05)

    // How big the page is on screen: CSS px per unit along its nearer side edge.
    const canvas = gl.domElement
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    let onScreen = cw > 0 && ch > 0
    g.updateWorldMatrix(true, false)
    for (let i = 0; i < 4 && onScreen; i++) {
      corner.set(i >= 2 ? vw : 0, i % 2 ? -vh : 0, 0).applyMatrix4(g.matrixWorld).project(state.camera)
      if (corner.z < -1 || corner.z > 1) onScreen = false
      quad[i * 2] = ((corner.x + 1) / 2) * cw
      quad[i * 2 + 1] = ((1 - corner.y) / 2) * ch
    }
    if (onScreen) {
      const edge = Math.max(Math.hypot(quad[0] - quad[2], quad[1] - quad[3]), Math.hypot(quad[4] - quad[6], quad[5] - quad[7]))
      if (edge > 1) ppu.current = edge / vh
    }

    // Sharpness: draw the page as wide as it shows (device px); redraw sharper
    // once a bigger size (a maximize) has held for a moment. Never smaller.
    const cur = geo.current
    if (pdf.current && !job.current && cur.kind !== 'text') {
      const px = renderWidth(vw * ppu.current * gl.getPixelRatio(), gl.capabilities.maxTextureSize)
      if (!cur.img) draw(px)
      else if (px > asked.current) {
        if (want.current.px !== px) want.current = { px, since: now }
        else if (now - want.current.since >= PV.regrowMs) draw(px)
      }
    }

    // Scroll: drag follows the pointer exactly, the wheel eases.
    const range = cur.max
    const t = drag.current
    if (t?.active) {
      if (t.dragging && range !== null) {
        s.target = Math.min(range, Math.max(0, s.from + (t.startY - t.y) / ppu.current))
        setCursor('grabbing')
      }
      if (t.up) {
        t.end()
        setCursor(null)
      }
    }
    if (range !== null) {
      s.target = Math.min(range, Math.max(0, s.target))
      s.y = !Number.isFinite(s.y) || t?.dragging ? s.target : damp(s.y, s.target, PV.rate, k)
      if (s.target !== s.saved) {
        s.saved = s.target
        remember(memo, tab.id, tab.page, s.target)
        if (intent.get(tab.id)?.page === tab.page) intent.delete(tab.id) // arrived
      }
    }
    if (s.over !== 0 && now - s.wheelAt > PV.over.idleMs) s.over = Math.abs(s.over) < 2 ? 0 : damp(s.over, 0, 10, k)

    const img = cur.img
    if (img && range !== null && range > 0) {
      const ih = range + vh
      img.texture.repeat.set(1, vh / ih)
      img.texture.offset.set(0, 1 - (s.y + vh) / ih)
      const th = thumb.current
      if (th) {
        const h = Math.max(PV.thumb.min, (vh * vh) / ih)
        th.position.y = -(s.y / range) * (vh - h) - h / 2
        th.scale.y = h
      }
    }
    const ob = overBar.current
    if (ob) {
      const p = Math.min(1, Math.abs(s.over) / PV.over.px)
      ob.visible = p > 0.01
      ob.scale.x = Math.max(p, 1e-3)
      ob.position.y = s.over > 0 ? -vh + PV.over.h / 2 : -PV.over.h / 2
    }
  })

  const kicker = `${tab.title.toUpperCase()} · PAGE ${tab.page}${count ? ` OF ${count}` : ''}`
  const iw = paperW - C.pad * 2
  const scrolls = max !== null && max > 0
  const textBody = text.status === 'ok' ? text.text || 'This page has no text.' : text.status === 'error' ? text.message : 'Loading the page…'
  const note = body.kind === 'text' ? body.note : null
  const textTop = PV.top + 0.06
  const bodyTop = textTop + (note ? 0.12 : 0)
  const pill = PV.pill

  return (
    <group ref={enter}>
      <Flat w={paperW} h={paperH} r={[0.03, 0.03, 0, 0]} color={C.paper} position={[box.w / 2, -C.paperInset - paperH / 2, 0]} />
      <Label size={P.kicker} color={N.kicker.color} font={FONTS.mono} letterSpacing={0.06} anchorY="top" maxWidth={iw} position={[C.paperInset + C.pad, -PV.kickerY, L]}>
        {kicker}
      </Label>
      <Flat w={paperW} h={PV.rule.h} color={PV.rule.color} position={[box.w / 2, -PV.top + PV.rule.h / 2, L]} />

      {/* Wheel anywhere over the tab; drag on it to scroll. */}
      <mesh geometry={UNIT} material={INVISIBLE} scale={[paperW, paperH, 1]} position={[box.w / 2, -C.paperInset - paperH / 2, L * 0.5]} onWheel={onWheel} onPointerDown={onDown} />

      <group ref={view} position={[C.paperInset, -PV.top, 0]}>
        {img && (
          <mesh position={[vw / 2, -shownH / 2, L]} name={`pdf-page-${win}`}>
            <planeGeometry args={[vw, shownH]} />
            <meshBasicMaterial map={img.texture} toneMapped={false} />
          </mesh>
        )}
        {scrolls && (
          <group ref={thumb} position={[vw - PV.thumb.inset - PV.thumb.w / 2, -PV.thumb.min / 2, L * 2]} scale={[1, PV.thumb.min, 1]}>
            <Flat w={PV.thumb.w} h={1} color={PV.thumb.color} opacity={PV.thumb.opacity} />
          </group>
        )}
        <group ref={overBar} position={[0, -vh, L * 3]} visible={false}>
          <Flat w={vw} h={PV.over.h} color={PV.over.color} position={[vw / 2, 0, 0]} />
        </group>
        {body.kind === 'loading' && (
          <Label size={P.size} color={N.kicker.color} font={FONTS.semi} anchorX="center" position={[vw / 2, -Math.min(vh, vw * 1.3) * 0.3, L]}>
            Drawing the page…
          </Label>
        )}
      </group>

      {body.kind === 'text' && (
        <>
          {note && (
            <Label size={P.kicker * 1.15} color={COBALT} font={FONTS.monoBold} anchorY="top" maxWidth={iw} position={[C.paperInset + C.pad, -textTop, L]}>
              {note.toUpperCase()}
            </Label>
          )}
          <Label
            size={P.size}
            color={text.status === 'error' ? N.kicker.color : P.color}
            font={FONTS.semi}
            anchorY="top"
            maxWidth={iw}
            lineHeight={P.lineHeight}
            clipRect={[-0.02, -Math.max(0.1, box.h - bodyTop - pill.bottom - pill.h), iw + 0.02, 0.1]}
            position={[C.paperInset + C.pad, -bodyTop, L]}
          >
            {textBody}
          </Label>
        </>
      )}

      {/* Floating pager, like a browser's PDF toolbar. */}
      <group position={[box.w / 2, -box.h + pill.bottom, L * 4]}>
        <Flat w={pill.w} h={pill.h} r={pill.h / 2} color={pill.color} />
        <Hit size={pill.hit} disabled={tab.page <= 1} onClick={() => go(tab.page - 1)} position={[-pill.arrowX, 0, L]}>
          <ArrowGlyph size={0.06} stroke={0.013} color={tab.page > 1 ? pill.ink : pill.dim} dir={-1} />
        </Hit>
        <Label size={pill.text} color={pill.ink} font={FONTS.monoBold} anchorX="center" position={[0, 0, L]}>
          {`${tab.page}${count ? ` / ${count}` : ''}`}
        </Label>
        <Hit size={pill.hit} disabled={tab.page >= last} onClick={() => go(tab.page + 1)} position={[pill.arrowX, 0, L]}>
          <ArrowGlyph size={0.06} stroke={0.013} color={tab.page < last ? pill.ink : pill.dim} dir={1} />
        </Hit>
      </group>
    </group>
  )
}
