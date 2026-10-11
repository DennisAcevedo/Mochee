import '@fontsource/caveat/700.css'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type Group } from 'three'
import { useWindows } from '../../state/windows'
import { Flat, Label } from './primitives'
import type { WinId } from './tabModel'
import { quadTransform } from './domQuad'
import { loadNote, noteEpoch, saveNote } from './scratchNote'
import { WINDOW_UI } from './windowConfig'
import type { ContentBox } from './WindowContent'
import { FONTS, WINDOW_STYLE } from './windowStyle'

// The window's own Scratch note: a ruled paper sheet in 3D with a real
// <textarea> laid over it, so typing, selection and the IME all just work.
// The textarea lives in the canvas's wrapper and is mapped onto the sheet's
// four projected corners with a CSS matrix3d every frame, so it stays glued
// to the sheet while the window moves, turns, resizes or maximizes. (drei's
// <Html transform> assumes the camera fills the canvas; CameraRig renders
// through a view offset, so the projection is done here.) Its text is saved
// in localStorage (scratchNote.ts); the red light discards it.

const SC = WINDOW_STYLE.scratch
const C = WINDOW_STYLE.content
const L = WINDOW_STYLE.layer


// Keys and pointer events typed into the note never reach the app's shortcuts or the 3D scene.
const SWALLOW = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerout', 'wheel', 'keydown', 'keyup', 'keypress', 'click', 'dblclick', 'contextmenu']

const corner = new Vector3()

export function ScratchPage({ win, box }: { win: WinId; box: ContentBox }) {
  const gl = useThree((s) => s.gl)
  const sheet = useRef<Group>(null) // local (0, 0) .. (aw, -ah) is the writing area
  const el = useRef<HTMLTextAreaElement | null>(null)
  const last = useRef({ transform: '', shown: false })
  const quad = useMemo(() => ({ q: new Float64Array(8), prev: new Float64Array(8) }), []) // the sheet's corners on screen (x, y)

  const paperW = box.w - C.paperInset * 2
  const paperH = box.h - C.paperInset
  const top = C.paperInset + SC.pad + SC.kicker + 0.05
  const aw = paperW - SC.pad * 2
  const ah = paperH - (top - C.paperInset) - SC.pad * 0.6
  const pxW = Math.round(aw * SC.pxPerUnit)
  const pxH = Math.round(ah * SC.pxPerUnit)

  // One textarea per mounted page.
  useEffect(() => {
    const host = gl.domElement.parentElement
    if (!host) return
    const ta = document.createElement('textarea')
    ta.dataset.gg = `scratch-${win}`
    ta.setAttribute('aria-label', 'Scratch note')
    ta.spellcheck = false
    ta.value = loadNote(win)
    const epoch = noteEpoch() // a red-light close after this discards the note: no more saves
    Object.assign(ta.style, {
      position: 'absolute',
      left: '0px',
      top: '0px',
      transformOrigin: '0 0',
      margin: '0',
      padding: '6px 10px',
      border: '0',
      outline: 'none',
      resize: 'none',
      background: 'transparent',
      color: SC.color,
      font: `700 ${SC.font}px/${SC.ruleGap * SC.pxPerUnit}px Caveat, cursive`,
      boxSizing: 'border-box',
      overflow: 'hidden',
      visibility: 'hidden',
      zIndex: '1',
    } satisfies Partial<CSSStyleDeclaration>)
    const stop = (e: Event) => e.stopPropagation()
    for (const type of SWALLOW) ta.addEventListener(type, stop)
    let timer: ReturnType<typeof setTimeout> | undefined
    const onInput = () => {
      clearTimeout(timer)
      timer = setTimeout(() => saveNote(win, ta.value, epoch), WINDOW_UI.saveDebounceMs)
    }
    ta.addEventListener('input', onInput)
    host.appendChild(ta)
    el.current = ta
    last.current = { transform: '', shown: false }
    return () => {
      clearTimeout(timer)
      saveNote(win, ta.value, epoch)
      ta.remove()
      el.current = null
    }
  }, [gl, win])

  useEffect(() => {
    const ta = el.current
    if (!ta) return
    ta.style.width = `${pxW}px`
    ta.style.height = `${pxH}px`
    last.current.transform = ''
  }, [pxW, pxH])

  useFrame(({ camera }) => {
    const ta = el.current
    const g = sheet.current
    if (!ta || !g) return
    const s = useWindows.getState()
    // A minimized window folds away under its chip and a closed one is gone: hide it.
    let show = !s.minimized && !s.closed
    const { q, prev } = quad
    const canvas = gl.domElement
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    if (show) {
      g.updateWorldMatrix(true, false)
      for (let i = 0; i < 4; i++) {
        corner.set(i === 1 || i === 2 ? aw : 0, i >= 2 ? -ah : 0, 0).applyMatrix4(g.matrixWorld).project(camera)
        if (corner.z < -1 || corner.z > 1) show = false
        q[i * 2] = canvas.offsetLeft + ((corner.x + 1) / 2) * cw
        q[i * 2 + 1] = canvas.offsetTop + ((1 - corner.y) / 2) * ch
      }
    }
    if (show !== last.current.shown) {
      ta.style.visibility = show ? 'visible' : 'hidden'
      last.current.shown = show
    }
    if (!show) return
    // Only rebuild the transform when a corner moved (a resting window costs nothing).
    let moved = last.current.transform === ''
    for (let i = 0; i < 8 && !moved; i++) moved = Math.abs(q[i] - prev[i]) > 0.05
    if (!moved) return
    prev.set(q)
    const t = quadTransform(q, pxW, pxH)
    ta.style.transform = t
    last.current.transform = t
  })

  // Ruled lines under the text, one per line of the textarea.
  const rules = Math.max(0, Math.floor((ah - 0.03) / SC.ruleGap))
  return (
    <group>
      <Flat w={paperW} h={paperH} r={[0.03, 0.03, 0, 0]} color={SC.paper} position={[box.w / 2, -C.paperInset - paperH / 2, 0]} />
      <Label size={SC.kicker} color={WINDOW_STYLE.newTab.kicker.color} font={FONTS.monoBold} letterSpacing={0.08} anchorY="top" position={[C.paperInset + SC.pad, -C.paperInset - SC.pad, L]}>
        SCRATCH NOTE · SAVED ON THIS DEVICE
      </Label>
      <group ref={sheet} position={[C.paperInset + SC.pad, -top, L]}>
        {Array.from({ length: rules }, (_, i) => (
          <Flat key={i} w={aw} h={0.006} color={SC.rule} position={[aw / 2, -(i + 1) * SC.ruleGap + 0.012, 0]} />
        ))}
      </group>
    </group>
  )
}
