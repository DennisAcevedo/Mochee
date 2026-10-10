import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Color, type Material, type Mesh } from 'three'
import { capColor } from '../../play/actions'
import { usePlay } from '../../play/playStore'
import { useProgress } from '../../state/progress'

// Level-4 unlock: recolours his graduation cap. Finds every material named
// `cap` in the scene (the Blender tutor's contract; the lab placeholder uses
// the same name) and tints it, keeping the original to restore. Works with any
// tutor component without it having to know about the play system.

const CHECK_EVERY = 0.5 // s; re-scan so a tutor that mounts later is tinted too

type Tintable = Material & { color?: Color }

export function CapTint() {
  const scene = useThree((s) => s.scene)
  const originals = useRef(new Map<Tintable, Color>())
  const applied = useRef<string | null | undefined>(undefined)
  const since = useRef(CHECK_EVERY)

  useFrame((_, delta) => {
    since.current += delta
    const want = capColor(useProgress.getState().level, usePlay.getState().capIndex)
    if (want === applied.current && since.current < CHECK_EVERY) return
    since.current = 0
    applied.current = want

    scene.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      const list = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Tintable[]
      for (const m of list) {
        if (m?.name !== 'cap' || !m.color) continue
        if (!originals.current.has(m)) originals.current.set(m, m.color.clone())
        m.color.copy(want ? new Color(want) : originals.current.get(m)!)
      }
    })
  })

  return null
}
