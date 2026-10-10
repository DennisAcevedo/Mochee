import { useEffect, useMemo } from 'react'
import { Color, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { INTRO } from '../animation/config'
import { radialTexture } from './geometry'

// Materials ported 1:1 from design/tutor-3d.js. Shared across parts so the
// body, hands and cap pieces pick up identical shading.
export function createMaterials() {
  const white = new MeshPhysicalMaterial({
    color: 0xf7f7f5,
    roughness: 0.6,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: new Color(0xffffff),
    clearcoat: 0.12,
    clearcoatRoughness: 0.6,
  })
  const hand = white.clone()
  hand.color.set(0xfdfdfc)
  const eye = new MeshPhysicalMaterial({ color: 0x131316, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 })
  const highlight = new MeshBasicMaterial({ color: 0xffffff })
  const ink = new MeshStandardMaterial({ color: 0x2c2224, roughness: 0.55 })
  const mouth = new MeshStandardMaterial({ color: 0x3a2224, roughness: 0.7 })
  const tongue = new MeshStandardMaterial({ color: 0xe48c88, roughness: 0.6 })
  const cheek = new MeshBasicMaterial({
    map: radialTexture('rgba(250,140,150,0.75)', 'rgba(250,140,150,0)'),
    transparent: true,
    depthWrite: false,
  })
  const cap = new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.7,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: new Color(0xb8c4ff),
  })
  const gold = new MeshPhysicalMaterial({ color: 0xc9d2ff, roughness: 0.3, metalness: 0.35, clearcoat: 1 })
  const spark = new MeshPhysicalMaterial({
    color: 0xfbfaff,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0.6,
    iridescenceIOR: 1.4,
    emissive: 0xffffff,
    emissiveIntensity: 0.12,
  })
  const blob = new MeshBasicMaterial({
    map: radialTexture('rgba(70,64,58,0.5)', 'rgba(70,64,58,0)'),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  // Stage 2: the wake-up twinkle. Unlit so it reads against the white body.
  const twinkle = new MeshBasicMaterial({ color: INTRO.wake.sparkleColor, toneMapped: false })

  // Accessories and the reading book (tutor-3d.js). The first material of
  // each accessory takes `acccolor`; see ACCESSORY_DEFAULT_COLORS.
  const frame = new MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.35, metalness: 0.4 })
  const leaf = new MeshPhysicalMaterial({ color: 0x62b46e, roughness: 0.45, sheen: 0.6, sheenColor: new Color(0xd8ffd0) })
  const leafStem = new MeshStandardMaterial({ color: 0x4a7a3a, roughness: 0.6 })
  const micBody = new MeshPhysicalMaterial({ color: 0x3a3a46, roughness: 0.5, sheen: 1, sheenColor: new Color(0xffffff), clearcoat: 0.12 })
  const micHead = new MeshPhysicalMaterial({ color: 0x5cc4c9, roughness: 0.5, sheen: 1, sheenColor: new Color(0xe6fffd), clearcoat: 0.2 })
  const bow = new MeshPhysicalMaterial({ color: 0x7c5cf2, roughness: 0.5, sheen: 1, sheenColor: new Color(0xffffff) })
  const earbud = new MeshPhysicalMaterial({ color: 0xe0607a, roughness: 0.4, clearcoat: 0.6, sheen: 0.5, sheenColor: new Color(0xffffff) })
  const tie = new MeshPhysicalMaterial({ color: 0xf2b84b, roughness: 0.55, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new Color(0xffffff), clearcoat: 0.15 })
  const pencil = new MeshPhysicalMaterial({ color: 0x5cc4c9, roughness: 0.5, clearcoat: 0.3 })
  const pencilWood = new MeshStandardMaterial({ color: 0xf2d3a0, roughness: 0.8 })
  const pencilLead = new MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.6 })
  const ferrule = new MeshStandardMaterial({ color: 0xd9dbe2, roughness: 0.4, metalness: 0.5 })
  const eraser = new MeshStandardMaterial({ color: 0xf2a0aa, roughness: 0.8 })
  const bookCover = new MeshPhysicalMaterial({ color: 0x1f8a92, roughness: 0.55, sheen: 0.5 })
  const bookPage = new MeshStandardMaterial({ color: 0xfbf8f0, roughness: 0.9 })

  return {
    white, hand, eye, highlight, ink, mouth, tongue, cheek, cap, gold, spark, blob, twinkle,
    frame, leaf, leafStem, micBody, micHead, bow, earbud, tie, pencil, pencilWood, pencilLead, ferrule, eraser, bookCover, bookPage,
  }
}

export type Materials = ReturnType<typeof createMaterials>

export function useMaterials(): Materials {
  const m = useMemo(createMaterials, [])
  useEffect(
    () => () => {
      Object.values(m).forEach((mat) => {
        if ('map' in mat && mat.map) mat.map.dispose()
        mat.dispose()
      })
    },
    [m],
  )
  return m
}
