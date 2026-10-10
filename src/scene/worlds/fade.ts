import type { Material, Mesh, Object3D } from 'three'
import { WORLD } from './worldConfig'

// The Study / Play cross-fade, done on the worlds' own materials (no render
// targets). Both worlds share one room shell, so during a fade the incoming
// shell is drawn over the outgoing one at opacity k (a polygon offset wins
// the coplanar depth test), while every other mesh of the incoming world
// fades in and every non-shell mesh of the outgoing world fades out. The
// tutor, the windows and the toys are opaque and drawn first, so the fade
// never touches them. The worlds' own materials are created transparent, so
// a fade never recompiles a shader; a borrowed opaque one (the sparkle
// platform) is flipped once and its program is cached after that.

export type FadeRole = 'in' | 'out' | 'rest'

interface Base {
  transparent: boolean
  opacity: number
  depthWrite: boolean
  polygonOffset: boolean
  factor: number
  units: number
}

const bases = new WeakMap<Material, Base>()
const orders = new WeakMap<Object3D, number>()

function baseOf(m: Material): Base {
  let b = bases.get(m)
  if (!b) {
    b = {
      transparent: m.transparent,
      opacity: m.opacity,
      depthWrite: m.depthWrite,
      polygonOffset: m.polygonOffset,
      factor: m.polygonOffsetFactor,
      units: m.polygonOffsetUnits,
    }
    bases.set(m, b)
  }
  return b
}

function setTransparent(m: Material, on: boolean) {
  if (m.transparent === on) return
  m.transparent = on
  m.needsUpdate = true
}

function restore(m: Material, b: Base) {
  setTransparent(m, b.transparent)
  m.opacity = b.opacity
  m.depthWrite = b.depthWrite
  m.polygonOffset = b.polygonOffset
  m.polygonOffsetFactor = b.factor
  m.polygonOffsetUnits = b.units
}

// Marks a mesh as part of a world's room shell (floor, walls, wall bands).
export const SHELL = { worldShell: true } as const

// Applies one frame of the fade to a world. k runs 0 -> 1 over the fade:
// 'in' shows the world at k, 'out' hides its non-shell meshes at 1 - k,
// 'rest' puts every material and render order back as authored.
export function setFade(root: Object3D, role: FadeRole, k: number) {
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.material) return
    const shell = o.userData.worldShell === true
    if (!orders.has(o)) orders.set(o, o.renderOrder)
    const order = orders.get(o)!
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      const b = baseOf(m)
      if (role === 'rest' || (role === 'out' && shell)) {
        restore(m, b)
        continue
      }
      setTransparent(m, true)
      m.opacity = b.opacity * (role === 'in' ? k : 1 - k)
      if (role === 'in' && shell) {
        m.depthWrite = false
        m.polygonOffset = true
        m.polygonOffsetFactor = -1
        m.polygonOffsetUnits = -1
      }
    }
    o.renderOrder = role === 'in' && shell ? order + WORLD.fade.incomingOrder : order
  })
}

// Smoothstep: symmetric, so reversing a fade half way keeps the picture still.
export const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}
