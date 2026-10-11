import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Color, Matrix4, Plane, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { useDirector } from '../../state/director'
import { useWindows } from '../../state/windows'
import { anchors } from '../anchors'
import { WINDOW, WINDOWS } from '../layout3d'
import { glowTexture } from '../room/bakedTextures'
import { useBoardReplay } from './LectureBoard'
import { activateByStudent, useLessonTabs } from './lessonSync'
import { facePlane, pointerOnPlane, PointerTrack, setCursor } from './pointer'
import { ArrowGlyph, damp, Flat, GripGlyph, Hit, Label, MaximizeGlyph, ReloadGlyph } from './primitives'
import { windowFrames, windowHits } from './registry'
import { roundedRect, roundedRectRing, roundedSlab } from './shapes'
import { MinimizeRig } from './minimizeRig'
import { clampSize, ellipsize } from './tabLayout'
import { tabInfo } from './tabInfo'
import { WIN, type WinId, type WinTabs } from './tabModel'
import { TabStrip } from './TabStrip'
import { INVISIBLE, UNIT } from './TabView'
import { WINDOW_UI } from './windowConfig'
import { CONTENT_BG, WindowContent } from './WindowContent'
import { controlParts, useWindowControls } from './WindowControls'
import { clampOffset, maximizedPlace, yawAt } from './windowPlace'
import { FONTS, WINDOW_STYLE as W } from './windowStyle'

// The room's one mini Chrome window as a 3D object, driven by the windows
// store (src/state/windows.ts): rounded frame, tab strip (TabStrip.tsx),
// toolbar (back / forward through the tabs, reload, omnibox, maximize) and the
// active tab's page. Every tab lives here: the lesson notes, the board, the
// quick check, scratch, new tab and PDF pages. Drag the empty strip or the
// omnibox to move it (it stays on screen and turns toward the stage centre the
// way the default does), drag the corner grip to resize it, double-click the
// strip or press maximize (or the green light) to bring it big and centred in
// front of the stage. The yellow light folds it into a restore chip, the red
// one shrinks it away with no chip (minimizeRig.ts; the lights and the chip
// are DOM buttons, WindowControls.tsx). When the tutor focuses it
// (director.focus is anything but 'none') it turns, scales and lights up.
// Every frame it writes its world centre into anchors.notes and anchors.board
// (the old two windows' names, both read by the tutor and the effects) and its
// placement into windowFrames.notes.

export type { ContentBox } from './WindowContent'
export type WindowId = WinId

const L = W.layer
const S = W.tabStrip
const T = W.toolbar
const MX = T.maximize
const G = W.grip
const M = WINDOW_UI.maximize
const Z_AXIS = new Vector3(0, 0, 1)
const RING_FOCUS = new Color(W.focus.ring.color)
const RING_MAX = new Color(W.maximizedRing)
const GRIP_Z = W.z + 0.18 // in front of the tallest page content (the quiz keys)

// The four resize grips: (cx, cy) is the corner's side (+1 right / top). Each
// straddles its corner, half off the frame, so the top two stay clear of the
// traffic lights and the + button. The glyph turns to face its corner.
type Corner = { cx: 1 | -1; cy: 1 | -1; turn: number; cursor: string }
const CORNERS: Corner[] = [
  { cx: 1, cy: -1, turn: 0, cursor: 'nwse-resize' },
  { cx: -1, cy: -1, turn: -Math.PI / 2, cursor: 'nesw-resize' },
  { cx: -1, cy: 1, turn: Math.PI, cursor: 'nwse-resize' },
  { cx: 1, cy: 1, turn: Math.PI / 2, cursor: 'nesw-resize' },
]

const hitPoint = new Vector3()
const clamped: [number, number] = [0, 0]
const sized: [number, number] = [0, 0]

export function BrowserWindow3D() {
  useLessonTabs()
  const place = WINDOW
  const size = useWindows((s) => s.layout.size)
  const isMax = useWindows((s) => s.maximized !== null)
  // Maximized, the window takes the maximized size (content reflows); restore brings its own back.
  const mp = maximizedPlace()
  const width = isMax ? mp.w : size ? size[0] : place.width
  const height = isMax ? mp.h : size ? size[1] : place.height
  const live = useWindows((s) => s.tabs[WIN])
  // The red light: the store swaps in the fresh lesson tabs at once (what the
  // lesson and the Reader read next), but the window keeps drawing the tabs it
  // had until its close animation ends, so its strip and page don't jump on
  // the way out. Reopening (or the animation finishing) lets them go.
  const [held, setHeld] = useState<WinTabs | null>(null)
  const holding = useRef(false)
  useEffect(
    () =>
      useWindows.subscribe((s, p) => {
        if (s.closed && !p.closed) {
          holding.current = true
          setHeld(p.tabs[WIN])
        } else if (!s.closed && p.closed && holding.current) {
          holding.current = false
          setHeld(null)
        }
      }),
    [],
  )
  const wt = held ?? live
  const tab = wt.tabs.find((t) => t.id === wt.active) ?? wt.tabs[0]
  const index = wt.tabs.indexOf(tab)
  const info = tabInfo(tab)
  const canvas = useThree((s) => s.gl.domElement)
  const [reloads, setReloads] = useState(0)
  const replay = useBoardReplay()

  const outer = useRef<Group>(null)
  const mini = useRef<Group>(null) // the minimize fold: carries the window into its chip
  const pivot = useRef<Group | null>(null)
  const ringMat = useRef<MeshBasicMaterial>(null)
  const glowMat = useRef<MeshBasicMaterial>(null)
  const glow = useMemo(() => glowTexture(), [])
  useEffect(() => () => glow.dispose(), [glow])

  // The DOM lights and restore chip, and the fold that drives them.
  const parts = useMemo(controlParts, [])
  useWindowControls(parts, canvas)
  const rig = useMemo(() => {
    const st = useWindows.getState()
    return new MinimizeRig(parts, st.minimized, st.closed)
  }, [parts])

  // Registry: the e2e (window.__gg.windows.rects) reads these.
  const setPivot = useCallback((g: Group | null) => {
    pivot.current = g
    windowHits.pivot = g
  }, [])
  const setFrame = useCallback((m: Mesh | null) => void (windowHits.frame = m), [])
  const setMax = useCallback((g: Group | null) => void (windowHits.max = g), [])
  const setGrip = useCallback((g: Group | null) => void (windowHits.grip = g), [])
  const setOmni = useCallback((m: Mesh | null) => void (windowHits.omni = m), [])

  // Resting placement at mount (afterwards the frame loop owns it). A stored
  // offset comes back through the move clamp first: one saved before the
  // clamp or the default placement changed could sit off screen or past the wall.
  const initial = useMemo(() => {
    const st = useWindows.getState()
    const [sw, sh] = st.layout.size ?? [place.width, place.height]
    const o = clampOffset(st.layout.offset[0], st.layout.offset[1], sw, sh, [0, 0])
    const x = place.position[0] + o[0]
    return { offset: o, position: [x, place.position[1] + o[1], place.position[2]] as [number, number, number], rotation: [0, yawAt(x), 0] as [number, number, number] }
  }, [place])
  useEffect(() => useWindows.getState().setOffset(WIN, initial.offset), [initial]) // a no-op when the stored offset already fit

  // ---- Moving (empty strip or omnibox) and resizing (corner grip)
  const moveTrack = useMemo(() => new PointerTrack(), [])
  const sizeTrack = useMemo(() => new PointerTrack(), [])
  const move = useRef({ px: 0, py: 0, ox: 0, oy: 0, x: 0, y: 0, live: false })
  const movePlane = useMemo(() => new Plane(), [])
  const resize = useRef({ w0: 0, h0: 0, ox: 0, oy: 0, dx: 0, dy: 0, sx: 1, sy: 1, cx: 1, cy: -1 })
  const sizePlane = useMemo(() => new Plane(), [])
  const sizeInv = useMemo(() => new Matrix4(), [])
  const lastStrip = useRef({ t: -1e9, x: 0, y: 0 })

  useEffect(
    () => () => {
      moveTrack.end()
      sizeTrack.end()
      setCursor(null)
    },
    [moveTrack, sizeTrack],
  )

  const startMove = (e: ThreeEvent<PointerEvent>, fromStrip: boolean) => {
    e.stopPropagation()
    const ne = e.nativeEvent
    if (ne.button !== 0) return
    if (fromStrip) {
      // Double-click on the strip toggles maximize, like Chrome.
      const last = lastStrip.current
      const now = performance.now()
      if (now - last.t < WINDOW_UI.doubleClickMs && Math.hypot(ne.clientX - last.x, ne.clientY - last.y) < WINDOW_UI.doubleClickPx) {
        last.t = -1e9
        useWindows.getState().toggleMaximize(WIN)
        return
      }
      lastStrip.current = { t: now, x: ne.clientX, y: ne.clientY }
    }
    if (useWindows.getState().maximized !== null) return // a maximized window stays put
    const o = useWindows.getState().layout.offset
    movePlane.setFromNormalAndCoplanarPoint(Z_AXIS, e.point)
    move.current = { px: e.point.x, py: e.point.y, ox: o[0], oy: o[1], x: o[0], y: o[1], live: false }
    moveTrack.press(ne, canvas)
  }

  const startResize = (e: ThreeEvent<PointerEvent>, corner: Corner) => {
    e.stopPropagation()
    const g = pivot.current
    const ne = e.nativeEvent
    if (!g || ne.button !== 0 || useWindows.getState().maximized !== null) return
    const st = useWindows.getState().layout
    const [w0, h0] = st.size ?? [place.width, place.height]
    facePlane(g, sizePlane)
    sizeInv.copy(g.matrixWorld).invert()
    const p = hitPoint.copy(e.point).applyMatrix4(sizeInv)
    // The grabbed corner keeps its offset from the pointer; the opposite corner stays put.
    const { cx, cy } = corner
    resize.current = { w0, h0, ox: st.offset[0], oy: st.offset[1], dx: (cx * w0) / 2 - p.x, dy: (cy * h0) / 2 - p.y, sx: Math.cos(g.rotation.y) * g.scale.x, sy: g.scale.y, cx, cy }
    sizeTrack.press(ne, canvas)
    setCursor(corner.cursor)
  }

  const hoverCursor = (cursor: string) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      if (!moveTrack.active && !sizeTrack.active) setCursor(cursor)
    },
    onPointerOut: () => {
      if (!moveTrack.active && !sizeTrack.active) setCursor(null)
    },
  })

  useFrame((state, dt) => {
    anchors.camera.copy(state.camera.position) // for the pointing gate (pointGate.ts)
    const g = outer.current
    const pv = pivot.current
    const mn = mini.current
    if (!g || !pv || !mn) return
    const k = Math.min(dt, 0.05)
    const st = useWindows.getState()
    const lay = st.layout
    const max = st.maximized !== null
    const cw = max ? mp.w : lay.size ? lay.size[0] : place.width
    const ch = max ? mp.h : lay.size ? lay.size[1] : place.height

    // Window move: the pointer on a plane facing the camera through the grab point.
    const mv = move.current
    if (moveTrack.active) {
      if (moveTrack.dragging && pointerOnPlane(moveTrack.x, moveTrack.y, state.camera, state.gl.domElement, movePlane, hitPoint)) {
        clampOffset(mv.ox + hitPoint.x - mv.px, mv.oy + hitPoint.y - mv.py, cw, ch, clamped)
        mv.x = clamped[0]
        mv.y = clamped[1]
        if (!mv.live) setCursor('grabbing')
        mv.live = true
      }
      if (moveTrack.up) {
        if (mv.live) st.setOffset(WIN, [mv.x, mv.y])
        mv.live = false
        moveTrack.end()
        setCursor(null)
      }
    }

    // Resize from a corner grip, in the window's own (frozen) frame: the
    // grabbed corner follows the pointer and the centre moves half the growth
    // toward it, so the opposite corner stays where it was.
    if (sizeTrack.active) {
      const r = resize.current
      if (sizeTrack.dragging && pointerOnPlane(sizeTrack.x, sizeTrack.y, state.camera, state.gl.domElement, sizePlane, hitPoint)) {
        const p = hitPoint.applyMatrix4(sizeInv)
        clampSize(r.cx * (p.x + r.dx) + r.w0 / 2, r.cy * (p.y + r.dy) + r.h0 / 2, sized)
        if (sized[0] !== cw || sized[1] !== ch) {
          st.setSize(WIN, [sized[0], sized[1]])
          st.setOffset(WIN, [r.ox + r.cx * ((sized[0] - r.w0) / 2) * r.sx, r.oy + r.cy * ((sized[1] - r.h0) / 2) * r.sy])
        }
      }
      if (sizeTrack.up) {
        sizeTrack.end()
        setCursor(null)
        const o = useWindows.getState().layout.offset
        clampOffset(o[0], o[1], cw, ch, clamped)
        st.setOffset(WIN, [clamped[0], clamped[1]])
      }
    }

    // Where the window should be this frame.
    const ox = mv.live ? mv.x : lay.offset[0]
    const oy = mv.live ? mv.y : lay.offset[1]
    let tx = place.position[0] + ox
    let ty = place.position[1] + oy
    let tz = place.position[2]
    let yaw = yawAt(tx)
    let scale = 1
    let lift = 0
    const focused = !max && useDirector.getState().focus !== 'none'
    if (max) {
      tx = mp.x
      ty = mp.y
      tz = mp.z
      yaw = 0
      scale = mp.scale
    } else if (focused) {
      yaw *= WINDOWS.focusYaw / Math.abs(place.yaw || 1)
      scale = WINDOWS.focusScale
      lift = W.focus.lift
    }
    if (mv.live || sizeTrack.active) g.position.set(tx, ty, tz) // pointer-driven: no lag
    else {
      g.position.x = damp(g.position.x, tx, M.rate, k)
      g.position.y = damp(g.position.y, ty, M.rate, k)
      g.position.z = damp(g.position.z, tz, M.rate, k)
    }
    const rate = max ? M.rate : W.focus.damp
    pv.rotation.y = damp(pv.rotation.y, yaw, rate, k)
    pv.scale.setScalar(damp(pv.scale.x, scale, rate, k))
    pv.position.z = damp(pv.position.z, lift, rate, k)

    if (ringMat.current) {
      ringMat.current.color.copy(max ? RING_MAX : RING_FOCUS)
      ringMat.current.opacity = damp(ringMat.current.opacity, max || focused ? 1 : 0, rate, k)
    }
    if (glowMat.current) glowMat.current.opacity = damp(glowMat.current.opacity, focused ? W.focus.glow.opacity : 0, W.focus.damp, k)

    rig.step(dt, state.clock.elapsedTime * 1000, st.minimized, st.closed, g, mn, cw, ch, pv.scale.x, state.camera, state.gl.domElement)
    rig.glue(pv, cw, ch, state.camera, state.gl.domElement)
    if (holding.current && rig.c >= 1) {
      holding.current = false // gone from view: drop the old tabs (and their pages)
      setHeld(null)
    }

    pv.getWorldPosition(anchors.notes)
    anchors.board.copy(anchors.notes) // the board, the quiz and the notes all live in this window now
    const f = windowFrames[WIN]
    f.center.copy(anchors.notes)
    f.halfW = (cw / 2) * pv.scale.x
    f.halfH = (ch / 2) * pv.scale.y
    f.yaw = pv.rotation.y
  })

  // Strip, toolbar and content stacked from the top edge down.
  const top = height / 2
  const stripY = top - S.height / 2
  const toolY = top - S.height - T.height / 2
  const contentTop = top - S.height - T.height
  const contentH = contentTop + height / 2
  const z = W.z
  // Pages zoom with the window: laid out for the default size, scaled by the
  // tighter of how much wider and how much taller the window is, times the
  // page zoom. The page gets whatever room is left in the other direction.
  const refH = place.height - S.height - T.height
  const contentScale = WINDOW_UI.window.contentZoom * Math.min(width / place.width, contentH / refH)
  const box = { w: width / contentScale, h: contentH / contentScale }
  // Maximized, the strip shows only the tab being read (the others come back on restore).
  const stripTabs = useMemo(() => (isMax ? { ...wt, tabs: [tab] } : wt), [isMax, wt, tab])

  const ring = W.focus.ring
  const omniW = width - T.omnibox.x - T.omnibox.right
  const omniX = -width / 2 + T.omnibox.x + omniW / 2
  const url = W.urlHost + info.path

  const go = (i: number) => {
    const next = wt.tabs[i]
    if (next) activateByStudent(next)
  }
  const reload = tab.kind === 'notes' || tab.kind === 'pdf' ? () => setReloads((n) => n + 1) : tab.kind === 'board' ? replay : undefined

  return (
    <group ref={outer} name={`${WIN}-window`} position={initial.position}>
      <group ref={mini}>
        <group ref={setPivot} rotation={initial.rotation}>
          {/* Focus glow behind the window and a ring around it (teal focused, blue maximized). */}
          <mesh position={[0, 0, -W.depth]} scale={[width + W.focus.glow.pad * 2, height + W.focus.glow.pad * 2, 1]} renderOrder={-1}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial ref={glowMat} map={glow} color={W.focus.glow.color} transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh geometry={roundedRectRing(width + ring.gap * 2, height + ring.gap * 2, W.radius + ring.gap, ring.stroke)} position={[0, 0, z - W.depth / 2]}>
            <meshBasicMaterial ref={ringMat} color={ring.color} transparent opacity={0} toneMapped={false} />
          </mesh>

          <mesh ref={setFrame} geometry={roundedSlab(width, height, W.radius, W.depth, W.bevel)} castShadow={W.castShadow}>
            <meshStandardMaterial color={W.frameColor} roughness={0.45} />
          </mesh>

          {/* Tab strip. */}
          <Flat w={width} h={S.height} r={[W.radius, W.radius, 0, 0]} color={S.color} position={[0, stripY, z]} />
          {/* Traffic lights: red closes the window, yellow folds it into its chip,
              green toggles maximized. These are the dots; the DOM buttons over them
              take the clicks and show the glyphs (WindowControls.tsx). */}
          {S.lights.colors.map((c, i) => (
            <mesh key={c} position={[-width / 2 + S.lights.x + i * S.lights.gap, stripY + S.lights.dy, z + L * 8]}>
              <circleGeometry args={[S.lights.size, 28]} />
              <meshBasicMaterial color={c} toneMapped={false} />
            </mesh>
          ))}
          <TabStrip wt={stripTabs} width={width} top={top} z={z} pivot={pivot} onEmptyPress={(e) => startMove(e, true)} />

          {/* Toolbar: back, forward, reload, omnibox (also a drag handle), maximize. */}
          <Flat w={width} h={T.height} color={T.color} position={[0, toolY, z]} />
          <Flat w={width} h={0.008} color={T.divider} position={[0, contentTop + 0.004, z + L]} />
          <group position={[-width / 2 + T.glyph.x, toolY, z + L]}>
            <Hit size={T.glyph.size} disabled={index <= 0} onClick={() => go(index - 1)}>
              <ArrowGlyph size={T.glyph.size} stroke={T.glyph.stroke} color={index > 0 ? T.glyph.color : T.glyph.dim} dir={-1} />
            </Hit>
            <Hit size={T.glyph.size} disabled={index >= wt.tabs.length - 1} onClick={() => go(index + 1)} position={[T.glyph.gap, 0, 0]}>
              <ArrowGlyph size={T.glyph.size} stroke={T.glyph.stroke} color={index < wt.tabs.length - 1 ? T.glyph.color : T.glyph.dim} dir={1} />
            </Hit>
            <Hit size={T.glyph.size} disabled={!reload} onClick={() => reload?.()} position={[T.glyph.gap * 2, 0, 0]}>
              <ReloadGlyph size={T.glyph.size} stroke={T.glyph.stroke} color={reload ? T.glyph.color : T.glyph.dim} />
            </Hit>
          </group>
          <mesh ref={setOmni} geometry={roundedRect(omniW, T.omnibox.h, T.omnibox.h / 2)} position={[omniX, toolY, z + L]} onPointerDown={(e) => startMove(e, false)} {...hoverCursor('grab')}>
            <meshBasicMaterial color={T.omnibox.color} toneMapped={false} />
          </mesh>
          <mesh position={[omniX - omniW / 2 + 0.08, toolY, z + L * 2]}>
            <circleGeometry args={[0.022, 16]} />
            <meshBasicMaterial color={T.omnibox.lock} toneMapped={false} />
          </mesh>
          <Label size={T.omnibox.size} color={T.omnibox.text} font={FONTS.mono} position={[omniX - omniW / 2 + 0.13, toolY, z + L * 2]}>
            {ellipsize(url, omniW - 0.2, T.omnibox.size * 1.06)}
          </Label>
          <group ref={setMax} position={[width / 2 - MX.inset, toolY, z + L]}>
            <Hit size={MX.size} onClick={() => useWindows.getState().toggleMaximize(WIN)}>
              <Flat w={MX.size} h={MX.size} r={MX.radius} color={MX.bg} />
              <MaximizeGlyph size={MX.glyph} stroke={MX.stroke} color={MX.color} bg={MX.bg} restore={isMax} position={[0, 0, L]} />
            </Hit>
          </group>

          {/* The active tab's page, drawn from its top-left corner. A page in
              its own boundary: one whose font or texture is still loading
              (the board's Caveat on its first showing) leaves the page blank
              for that moment instead of hiding the whole window. */}
          <Flat w={width} h={contentH} r={[0, 0, W.radius, W.radius]} color={CONTENT_BG[tab.kind]} position={[0, contentTop - contentH / 2, z]} />
          <group position={[-width / 2, contentTop, z + L * 2]} scale={contentScale}>
            <Suspense fallback={null}>
              <WindowContent win={WIN} tab={tab} box={box} reloads={reloads} />
            </Suspense>
          </group>
          {/* Loads the board's handwriting font with the window, so the first
              switch to the Board tab draws at once. Never shown. */}
          <group visible={false}>
            <Suspense fallback={null}>
              <Label size={0.01} font={FONTS.hand}>
                .
              </Label>
            </Suspense>
          </group>

          {/* Resize grips on all four corners (the bottom-right one is the registry's). */}
          {CORNERS.map((c) => (
            <group
              key={`${c.cx}${c.cy}`}
              ref={c.cx > 0 && c.cy < 0 ? setGrip : undefined}
              position={[c.cx * (width / 2 - G.inset), c.cy * (height / 2 - G.inset), GRIP_Z]}
              visible={!isMax}
            >
              <mesh geometry={roundedRect(G.size + G.border * 2, G.size + G.border * 2, G.radius + G.border)} position={[0, 0, -L]}>
                <meshBasicMaterial color={G.edge} toneMapped={false} />
              </mesh>
              <mesh geometry={roundedRect(G.size, G.size, G.radius)} onPointerDown={isMax ? undefined : (e: ThreeEvent<PointerEvent>) => startResize(e, c)} {...hoverCursor(c.cursor)}>
                <meshBasicMaterial color={G.bg} toneMapped={false} />
              </mesh>
              <group rotation={[0, 0, c.turn]}>
                <GripGlyph size={G.size * 0.62} stroke={G.stroke} color={G.color} position={[0, 0, L]} />
              </group>
            </group>
          ))}

          {/* Keeps clicks on the window's body from reaching what is behind it. */}
          <mesh geometry={UNIT} material={INVISIBLE} scale={[width, height, 1]} position={[0, 0, z - L]} onPointerDown={(e: ThreeEvent<PointerEvent>) => e.stopPropagation()} />
        </group>
      </group>
    </group>
  )
}
