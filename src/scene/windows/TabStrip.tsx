import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Matrix4, Plane, Vector3, type Camera, type Group, type Mesh } from 'three'
import { useWindows } from '../../state/windows'
import { activateByStudent } from './lessonSync'
import { facePlane, pointerOnPlane, PointerTrack, setCursor } from './pointer'
import { damp, PlusGlyph } from './primitives'
import { windowHits } from './registry'
import { closeShown, slotIndex, tabLook, tabTargetWidth, type StripSpan } from './tabLayout'
import { WIN, type Tab, type WinTabs } from './tabModel'
import { INVISIBLE, placeTab, TAB_H, TabView, UNIT, type Anim, type Parts } from './TabView'
import { WINDOW_UI } from './windowConfig'
import { WINDOW_STYLE } from './windowStyle'
import { bringBrowserForward } from './windowStack'

// The window's Chrome tab strip. Tabs share the strip and shrink evenly as
// more open; a new tab grows in from zero width while its title fades in, a
// closed tab shrinks to zero while its neighbours slide over. Press a tab to
// select it, drag it sideways to reorder (it lifts, the others slide aside
// and it stays on the strip however far the pointer strays). Middle-click or
// the x closes; + opens a New tab page.
//
// One invisible mesh over the strip takes every pointer event and hit-tests
// against the animated layout, so hover and press always agree with what is
// drawn. All animation runs in one useFrame that writes straight to the
// tabs' meshes (no re-render, no allocation per frame).

const S = WINDOW_STYLE.tabStrip
const T = WINDOW_UI.tabs
const L = WINDOW_STYLE.layer

interface Row {
  tab: Tab
  ghost: boolean // closed: shrinking out
}

interface Ghost {
  tab: Tab
  after: string | null // the id it sat after
}

type HoverPart = 'tab' | 'close' | 'plus' | 'empty' | null
type PressKind = 'tab' | 'close' | 'plus' | 'middle'

interface Props {
  wt: WinTabs // the tabs the window draws (BrowserWindow3D holds the old ones while a close animates out)
  width: number // window width
  top: number // window's top edge, window-local y
  z: number // front face of the frame
  pivot: RefObject<Group | null>
  onEmptyPress: (e: ThreeEvent<PointerEvent>) => void // window move, or a double-click to maximize
}

const local = new Vector3()
const world = new Vector3()

// Live tabs in store order with closing ghosts kept where they were.
function rowsOf(tabs: Tab[], ghosts: Ghost[]): Row[] {
  const rows: Row[] = []
  for (const g of ghosts) if (g.after === null) rows.push({ tab: g.tab, ghost: true })
  for (const tab of tabs) {
    rows.push({ tab, ghost: false })
    for (const g of ghosts) if (g.after === tab.id) rows.push({ tab: g.tab, ghost: true })
  }
  for (const g of ghosts) if (g.after !== null && !rows.some((r) => r.tab.id === g.tab.id)) rows.push({ tab: g.tab, ghost: true })
  return rows
}

export function TabStrip({ wt, width, top, z, pivot, onEmptyPress }: Props) {
  const canvas = useThree((s) => s.gl.domElement)
  const span: StripSpan = { left: -width / 2 + S.tabsX, right: width / 2 - T.rightPad }
  const tw = tabTargetWidth(wt.tabs.length, span)
  const look = tabLook(tw)
  const rowY = top - S.height + TAB_H / 2
  const bottom = top - S.height

  // Closed tabs linger as ghosts while they shrink out (derived during render,
  // so a closing tab never blinks out for a frame).
  const [prevTabs, setPrevTabs] = useState(wt.tabs)
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  if (prevTabs !== wt.tabs) {
    setPrevTabs(wt.tabs)
    const gone: Ghost[] = []
    prevTabs.forEach((t, i) => {
      if (!wt.tabs.some((n) => n.id === t.id)) gone.push({ tab: t, after: i > 0 ? prevTabs[i - 1].id : null })
    })
    if (gone.length) setGhosts((g) => [...g.filter((x) => !wt.tabs.some((n) => n.id === x.tab.id)), ...gone])
  }
  const rows = rowsOf(wt.tabs, ghosts)

  // Everything the frame loop reads, refreshed every render.
  const snap = { rows, wt, span, tw, look, rowY, top, bottom, width, z }
  const live = useRef(snap)
  live.current = snap

  const parts = useRef(new Map<string, Parts>())
  const register = useCallback((id: string, p: Parts | null) => {
    if (p) parts.current.set(id, p)
    else parts.current.delete(id)
  }, [])
  const anims = useRef(new Map<string, Anim>())
  const first = useRef(true)
  const plus = useRef<Group | null>(null)
  const plusFace = useRef<Group>(null)
  const plusX = useRef(0)
  const setPlus = useCallback((g: Group | null) => {
    plus.current = g
    windowHits.plus = g
  }, [])
  const setStrip = useCallback((m: Mesh | null) => void (windowHits.strip = m), [])

  const hover = useRef({ part: null as HoverPart, id: '' })
  const track = useMemo(() => new PointerTrack(), [])
  const press = useRef({ kind: 'tab' as PressKind, id: '' })
  const drag = useRef({ id: '', grab: 0, left: 0, slot: 0, started: false })
  const framePlane = useMemo(() => new Plane(), [])
  const frameInv = useMemo(() => new Matrix4(), [])

  // Forget animation state of tabs that left this strip.
  useEffect(() => {
    for (const id of anims.current.keys()) if (!rows.some((r) => r.tab.id === id)) anims.current.delete(id)
  })

  useEffect(
    () => () => {
      track.end()
      setCursor(null)
    },
    [track],
  )

  // Middle-click closes tabs: keep the browser's autoscroll out of it. (R3F's
  // pointer listeners are passive, so this needs its own mousedown listener.)
  useEffect(() => {
    const noAutoscroll = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    }
    canvas.addEventListener('mousedown', noAutoscroll)
    return () => canvas.removeEventListener('mousedown', noAutoscroll)
  }, [canvas])

  // Strip-local hit test against the drawn layout.
  const hitTest = (x: number, y: number): { part: HoverPart; id: string } => {
    const c = live.current
    if (y < c.bottom || y > c.top || x < c.span.left - 0.06 || x > c.width / 2) return { part: null, id: '' }
    const inRow = Math.abs(y - c.rowY) <= TAB_H / 2
    for (const row of c.rows) {
      if (row.ghost) continue
      const a = anims.current.get(row.tab.id)
      if (!a || !inRow || x < a.x || x > a.x + a.w) continue
      const active = c.wt.active === row.tab.id
      const cx = c.look === 'tiny' ? a.x + a.w / 2 : a.x + a.w - S.close.inset
      if (closeShown(c.tw, active, true) && Math.hypot(x - cx, y - c.rowY) <= S.close.hit / 2) return { part: 'close', id: row.tab.id }
      return { part: 'tab', id: row.tab.id }
    }
    const reach = T.plus.size / 2 + 0.03
    if (Math.abs(x - plusX.current) <= reach && Math.abs(y - c.rowY) <= reach) return { part: 'plus', id: '' }
    return { part: 'empty', id: '' }
  }

  const toLocal = (p: Vector3) => {
    const g = pivot.current
    return g ? g.worldToLocal(local.copy(p)) : null
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (track.active) return
    const p = toLocal(e.point)
    if (!p) return
    const h = hitTest(p.x, p.y)
    hover.current = h
    setCursor(h.part === 'close' || h.part === 'plus' ? 'pointer' : h.part === 'empty' ? 'grab' : null)
  }

  const onLeave = () => {
    if (track.active) return
    hover.current = { part: null, id: '' }
    setCursor(null)
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const p = toLocal(e.point)
    const g = pivot.current
    if (!p || !g) return
    const h = hitTest(p.x, p.y)
    if (!h.part) return
    bringBrowserForward()
    e.stopPropagation()
    hover.current = h
    const ne = e.nativeEvent
    if (ne.button === 1) {
      if (h.part !== 'tab' && h.part !== 'close') return
      press.current = { kind: 'middle', id: h.id }
      track.press(ne, canvas)
      return
    }
    if (ne.button !== 0) return
    if (h.part === 'empty') {
      onEmptyPress(e)
      return
    }
    press.current = { kind: h.part, id: h.id }
    if (h.part === 'tab') {
      const tabs = live.current.wt.tabs
      const found = tabs.find((t) => t.id === h.id)
      if (found) activateByStudent(found) // Chrome selects on press
      const a = anims.current.get(h.id)
      const left = a?.x ?? p.x
      drag.current = { id: h.id, grab: p.x - left, left, slot: tabs.findIndex((t) => t.id === h.id), started: false }
      facePlane(g, framePlane)
      frameInv.copy(g.matrixWorld).invert()
    }
    track.press(ne, canvas)
  }

  // A press ended: drags finish, clicks act.
  const release = () => {
    const { kind, id } = press.current
    const c = live.current
    const store = useWindows.getState()
    const d = drag.current
    if (kind === 'tab' && d.started) {
      if (c.wt.tabs.some((t) => t.id === d.id)) store.reorderTab(WIN, d.id, d.slot)
    } else if (!track.dragging) {
      const h = hover.current
      if (kind === 'close' && h.part === 'close' && h.id === id) store.closeTab(WIN, id)
      else if (kind === 'middle' && (h.part === 'tab' || h.part === 'close') && h.id === id) store.closeTab(WIN, id)
      else if (kind === 'plus' && h.part === 'plus') store.openTab(WIN)
    }
    d.id = ''
    d.started = false
    track.end()
    setCursor(null)
  }

  // A dragged tab slides along the strip (clamped to it) and takes the slot under it.
  const follow = (camera: Camera, dom: HTMLElement) => {
    const d = drag.current
    const c = live.current
    if (!pointerOnPlane(track.x, track.y, camera, dom, framePlane, world)) return
    const p = world.applyMatrix4(frameInv)
    if (!d.started) {
      d.started = true
      setCursor('grabbing')
    }
    const count = c.wt.tabs.length
    const lastLeft = c.span.left + (count - 1) * (c.tw + T.gap)
    d.left = Math.max(c.span.left, Math.min(lastLeft, p.x - d.grab))
    d.slot = slotIndex(d.left + c.tw / 2, c.span, c.tw, count)
  }

  useFrame((state, dt) => {
    const c = live.current
    const k = Math.min(dt, 0.05)

    if (track.active) {
      if (press.current.kind === 'tab' && track.dragging) follow(state.camera, state.gl.domElement)
      if (track.up) release()
    }

    const d = drag.current
    const dragging = d.id !== '' && d.started
    const reorderId = dragging ? d.id : ''
    const hv = hover.current
    let cursor = c.span.left
    let ghostDone = false

    const place = (row: Row) => {
      const id = row.tab.id
      let a = anims.current.get(id)
      if (!a) {
        a = { x: cursor, w: first.current ? c.tw : 0, alpha: first.current ? 1 : 0, lift: 0, y: 0, z: 0 }
        anims.current.set(id, a)
      }
      if (dragging && id === d.id) {
        a.w = c.tw
        a.x = d.left
        a.y = 0
        a.z = 0
        a.lift = damp(a.lift, 1, T.liftRate, k)
      } else {
        a.w = damp(a.w, row.ghost ? 0 : c.tw, T.widthRate, k)
        a.x = damp(a.x, cursor, T.slideRate, k)
        a.y = damp(a.y, 0, T.slideRate, k)
        a.z = damp(a.z, 0, T.slideRate, k)
        a.lift = damp(a.lift, 0, T.liftRate, k)
      }
      a.alpha = damp(a.alpha, !row.ghost && a.w > c.tw * T.titleFade ? 1 : 0, row.ghost ? 40 : 14, k)
      cursor += a.w + T.gap * Math.min(1, a.w / Math.max(c.tw, 1e-3))
      if (row.ghost && a.w < 0.004) ghostDone = true
      const p = parts.current.get(id)
      if (!p) return
      const active = !row.ghost && c.wt.active === id
      const isHover = hv.id === id && (hv.part === 'tab' || hv.part === 'close')
      const closeOn = !row.ghost && closeShown(c.tw, active, isHover)
      placeTab(p, a, c.rowY, active, c.look, closeOn, closeOn && hv.part === 'close' && hv.id === id, isHover)
      const reg = windowHits.tabs.get(id)
      if (reg) reg.closeVisible = closeOn
    }

    // Lay the row out left to right; a tab dragged along the strip takes the
    // slot under it and the rest flow around it.
    let draggedRow: Row | undefined
    if (reorderId) for (const r of c.rows) if (r.tab.id === reorderId) draggedRow = r
    let li = 0
    let placedDrag = !draggedRow
    for (const row of c.rows) {
      if (row.tab.id === reorderId) continue
      if (!row.ghost) {
        if (!placedDrag && li === d.slot && draggedRow) {
          place(draggedRow)
          placedDrag = true
          li++
        }
        li++
      }
      place(row)
    }
    if (!placedDrag && draggedRow) place(draggedRow)
    first.current = false

    // + rides right after the last tab.
    plusX.current = cursor - T.gap + T.plus.gap + T.plus.size / 2
    if (plus.current) plus.current.position.set(plusX.current, c.rowY, 0)
    if (plusFace.current) plusFace.current.scale.setScalar(damp(plusFace.current.scale.x, hv.part === 'plus' ? 1.12 : 1, 16, k))

    const s0 = windowHits.strip0
    s0.end = c.span.right + T.rightPad
    s0.plusRight = plusX.current + T.plus.size / 2
    s0.top = c.top
    s0.bottom = c.bottom

    if (ghostDone) {
      setGhosts((g) => {
        const next = g.filter((x) => (anims.current.get(x.tab.id)?.w ?? 0) >= 0.004)
        return next.length === g.length ? g : next
      })
    }
  })

  const stripLeft = span.left - 0.06
  const stripW = width / 2 - stripLeft
  const full = wt.tabs.length >= T.maxPerWindow
  return (
    <group position={[0, 0, z + L]}>
      {/* The one mesh that takes the strip's pointer events. */}
      <mesh
        ref={setStrip}
        geometry={UNIT}
        material={INVISIBLE}
        position={[stripLeft + stripW / 2, top - S.height / 2, L * 6]}
        scale={[stripW, S.height, 1]}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerDown={onDown}
      />
      {rows.map((row) => (
        <TabView key={row.tab.id} tab={row.tab} active={!row.ghost && wt.active === row.tab.id} ghost={row.ghost} tw={tw} look={look} register={register} />
      ))}
      <group ref={setPlus}>
        <group ref={plusFace}>
          <mesh position={[0.004, -0.008, -L / 2]}>
            <circleGeometry args={[T.plus.size / 2 + 0.006, 28]} />
            <meshBasicMaterial color={S.shadowColor} transparent opacity={S.plus.shadow} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh>
            <circleGeometry args={[T.plus.size / 2, 28]} />
            <meshBasicMaterial color={S.plus.bg} toneMapped={false} />
          </mesh>
          <PlusGlyph size={S.plus.glyph} stroke={S.plus.stroke} color={full ? S.close.color : S.plus.color} position={[0, 0, L]} />
        </group>
      </group>
    </group>
  )
}
