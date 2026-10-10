import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Matrix4, Plane, Vector3, type Camera, type Group, type Mesh } from 'three'
import { useWindows } from '../../state/windows'
import { activateByStudent } from './lessonSync'
import { facePlane, pointerOnPlane, PointerTrack, setCursor } from './pointer'
import { damp, PlusGlyph } from './primitives'
import { dropHint, windowHits } from './registry'
import { closeShown, dropIndex, slotIndex, tabLook, tabTargetWidth, type StripSpan } from './tabLayout'
import { findTab, isLesson, otherWin, type Tab, type WinId } from './tabModel'
import { INVISIBLE, placeTab, TAB_H, TabView, UNIT, type Anim, type Parts } from './TabView'
import { WINDOW_UI } from './windowConfig'
import { WINDOW_STYLE } from './windowStyle'

// One window's Chrome tab strip. Tabs share the strip and shrink evenly as
// more open; a new tab grows in from zero width while its title fades in, a
// closed tab shrinks to zero while its neighbours slide over. Press a tab to
// select it, drag it sideways to reorder (it lifts, the others slide aside),
// or pull it onto the other window's strip to move it there; dropped anywhere
// else it snaps back. Middle-click or the x closes; + opens a New tab page.
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
  win: WinId
  width: number // window width
  top: number // window's top edge, window-local y
  z: number // front face of the frame
  pivot: RefObject<Group | null>
  onEmptyPress: (e: ThreeEvent<PointerEvent>) => void // window move, or a double-click to maximize
}

const local = new Vector3()
const world = new Vector3()
const frontPlane = new Plane()
const otherPlane = new Plane()
const otherLocal = new Vector3()

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

export function TabStrip({ win, width, top, z, pivot, onEmptyPress }: Props) {
  const wt = useWindows((s) => s.tabs[win])
  const canvas = useThree((s) => s.gl.domElement)
  const span: StripSpan = { left: -width / 2 + S.tabsX, right: width / 2 - T.rightPad }
  const tw = tabTargetWidth(wt.tabs.length, span)
  const look = tabLook(tw)
  const rowY = top - S.height + TAB_H / 2
  const bottom = top - S.height

  // Closed tabs linger as ghosts while they shrink out (derived during render,
  // so a closing tab never blinks out for a frame). A tab that moved to the
  // other window is not a ghost: it grows in over there.
  const [prevTabs, setPrevTabs] = useState(wt.tabs)
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  if (prevTabs !== wt.tabs) {
    setPrevTabs(wt.tabs)
    const all = useWindows.getState().tabs
    const gone: Ghost[] = []
    prevTabs.forEach((t, i) => {
      if (!wt.tabs.some((n) => n.id === t.id) && !findTab(all, t.id)) gone.push({ tab: t, after: i > 0 ? prevTabs[i - 1].id : null })
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
  const marker = useRef<Mesh>(null)
  const plusX = useRef(0)
  const setPlus = useCallback(
    (g: Group | null) => {
      plus.current = g
      windowHits[win].plus = g
    },
    [win],
  )
  const setStrip = useCallback((m: Mesh | null) => void (windowHits[win].strip = m), [win])

  const hover = useRef({ part: null as HoverPart, id: '' })
  const track = useMemo(() => new PointerTrack(), [])
  const press = useRef({ kind: 'tab' as PressKind, id: '' })
  const drag = useRef({ id: '', grab: 0, left: 0, y: 0, z: 0, slot: 0, inStrip: true, started: false })
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
      if (found) activateByStudent(win, found) // Chrome selects on press
      const a = anims.current.get(h.id)
      const left = a?.x ?? p.x
      drag.current = { id: h.id, grab: p.x - left, left, y: 0, z: 0, slot: tabs.findIndex((t) => t.id === h.id), inStrip: true, started: false }
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
      const tab = c.wt.tabs.find((t) => t.id === d.id)
      if (tab && d.inStrip) store.reorderTab(win, d.id, d.slot)
      else if (tab && dropHint.win) {
        const to = dropHint.win
        store.moveTab(win, d.id, to, dropHint.index)
        if (isLesson(tab)) activateByStudent(to, tab) // the lesson follows the student's pick
      }
      // Dropped anywhere else: no change, the tab springs back to its slot.
    } else if (!track.dragging) {
      const h = hover.current
      if (kind === 'close' && h.part === 'close' && h.id === id) store.closeTab(win, id)
      else if (kind === 'middle' && (h.part === 'tab' || h.part === 'close') && h.id === id) store.closeTab(win, id)
      else if (kind === 'plus' && h.part === 'plus') store.openTab(win)
    }
    d.id = ''
    d.started = false
    dropHint.win = null
    track.end()
    setCursor(null)
  }

  // A dragged tab: along the strip it reorders; pulled off, it rides in front
  // of both windows and looks for the other window's strip.
  const follow = (camera: Camera, dom: HTMLElement) => {
    const d = drag.current
    const c = live.current
    const g = pivot.current
    if (!g || !pointerOnPlane(track.x, track.y, camera, dom, framePlane, world)) return
    const p = world.applyMatrix4(frameInv)
    if (!d.started) {
      d.started = true
      setCursor('grabbing')
    }
    const count = c.wt.tabs.length
    d.inStrip = Math.abs(p.y - c.rowY) < T.detachY && p.x > -c.width / 2 - 0.1 && p.x < c.width / 2 + 0.1
    dropHint.win = null
    if (d.inStrip) {
      const lastLeft = c.span.left + (count - 1) * (c.tw + T.gap)
      d.left = Math.max(c.span.left, Math.min(lastLeft, p.x - d.grab))
      d.y = 0
      d.z = 0
      d.slot = slotIndex(d.left + c.tw / 2, c.span, c.tw, count)
      return
    }
    g.getWorldPosition(world)
    frontPlane.normal.set(0, 0, 1)
    frontPlane.constant = -Math.max(T.detachZ, world.z + 0.45)
    if (pointerOnPlane(track.x, track.y, camera, dom, frontPlane, world)) {
      g.worldToLocal(world)
      d.left = world.x - d.grab
      d.y = world.y - c.rowY
      d.z = world.z - (c.z + L)
    }
    const to = otherWin(win)
    const oh = windowHits[to]
    if (!oh.pivot) return
    facePlane(oh.pivot, otherPlane)
    if (!pointerOnPlane(track.x, track.y, camera, dom, otherPlane, otherLocal)) return
    oh.pivot.worldToLocal(otherLocal)
    const s0 = oh.strip0
    const m = 0.08
    if (otherLocal.y > s0.bottom - m && otherLocal.y < s0.top + m && otherLocal.x > s0.left - 0.15 && otherLocal.x < s0.right + 0.15) {
      dropHint.win = to
      dropHint.index = dropIndex(otherLocal.x, s0, s0.width, s0.count)
    }
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
    const reorderId = dragging && d.inStrip ? d.id : ''
    const hv = hover.current
    let cursor = c.span.left
    let ghostDone = false
    // A tab dragged here from the other window: the tabs open a slot where it would land.
    const dropAt = dropHint.win === win ? dropHint.index : -1
    let slotX = c.span.left

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
        a.y = d.y
        a.z = d.z
        a.lift = damp(a.lift, 1, T.liftRate, k)
      } else {
        a.w = damp(a.w, row.ghost ? 0 : c.tw, T.widthRate, k)
        a.x = damp(a.x, cursor, T.slideRate, k)
        a.y = damp(a.y, 0, T.slideRate, k)
        a.z = damp(a.z, 0, T.slideRate, k)
        a.lift = damp(a.lift, 0, T.liftRate, k)
      }
      a.alpha = damp(a.alpha, !row.ghost && a.w > c.tw * T.titleFade ? 1 : 0, row.ghost ? 40 : 14, k)
      // Pulled off the strip, the dragged tab leaves no gap behind (it comes back on a snap-back).
      if (!(dragging && id === d.id && !d.inStrip)) cursor += a.w + T.gap * Math.min(1, a.w / Math.max(c.tw, 1e-3))
      if (row.ghost && a.w < 0.004) ghostDone = true
      const p = parts.current.get(id)
      if (!p) return
      const active = !row.ghost && c.wt.active === id
      const isHover = hv.id === id && (hv.part === 'tab' || hv.part === 'close')
      const closeOn = !row.ghost && closeShown(c.tw, active, isHover)
      placeTab(p, a, c.rowY, active, c.look, closeOn, closeOn && hv.part === 'close' && hv.id === id, isHover)
      const reg = windowHits[win].tabs.get(id)
      if (reg) reg.closeVisible = closeOn
    }

    // Lay the row out left to right; a tab dragged along the strip takes the
    // slot under it and the rest flow around it.
    let draggedRow: Row | undefined
    if (reorderId) for (const r of c.rows) if (r.tab.id === reorderId) draggedRow = r
    let li = 0
    let placedDrag = !draggedRow
    let opened = dropAt < 0
    for (const row of c.rows) {
      if (row.tab.id === reorderId) continue
      if (!row.ghost) {
        if (!placedDrag && li === d.slot && draggedRow) {
          place(draggedRow)
          placedDrag = true
          li++
        }
        if (!opened && li === dropAt) {
          slotX = cursor
          cursor += c.tw + T.gap
          opened = true
        }
        li++
      }
      place(row)
    }
    if (!placedDrag && draggedRow) place(draggedRow)
    if (!opened) {
      slotX = cursor
      cursor += c.tw + T.gap
    }
    first.current = false

    // + rides right after the last tab.
    plusX.current = cursor - T.gap + T.plus.gap + T.plus.size / 2
    if (plus.current) plus.current.position.set(plusX.current, c.rowY, 0)
    if (plusFace.current) plusFace.current.scale.setScalar(damp(plusFace.current.scale.x, hv.part === 'plus' ? 1.12 : 1, 16, k))

    // Where a tab dragged from the other window would land: a bar at the open slot's leading edge.
    const m = marker.current
    if (m) {
      m.visible = dropAt >= 0
      if (m.visible) m.position.set(slotX - T.gap / 2, c.rowY - S.marker.drop, L * 3)
    }

    const s0 = windowHits[win].strip0
    s0.left = c.span.left
    s0.right = c.span.right
    s0.end = c.span.right + T.rightPad
    s0.width = c.tw
    s0.count = c.wt.tabs.length
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
        <TabView key={row.tab.id} win={win} tab={row.tab} active={!row.ghost && wt.active === row.tab.id} ghost={row.ghost} tw={tw} look={look} register={register} />
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
      <mesh ref={marker} geometry={UNIT} scale={[S.marker.w, S.marker.h, 1]} visible={false}>
        <meshBasicMaterial color={S.marker.color} toneMapped={false} />
      </mesh>
    </group>
  )
}
