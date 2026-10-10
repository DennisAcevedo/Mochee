import { PropertyBinding, Quaternion, Vector3, type Material, type Mesh, type Object3D } from 'three'
import { CAP_MATERIAL, NODE_NAMES, SNEAKER_MATERIAL, type NodeKey } from './config'

// Looks up the contract's bones and face parts in a loaded tutor scene and
// remembers their rest transforms, so the per-frame code can write absolute
// values (rest x multiplier) instead of accumulating.

export interface RigNode {
  node: Object3D
  restPos: Vector3
  restQuat: Quaternion
  restScale: Vector3
}

export type RigNodes = Partial<Record<NodeKey, RigNode>>

function depth(o: Object3D): number {
  let d = 0
  for (let p = o.parent; p; p = p.parent) d++
  return d
}

// GLTFLoader sanitizes names ('hand.L' -> 'handL') and de-duplicates them
// ('body', 'body_1'), so a bone and the mesh hanging off it can share a base
// name. Collect every candidate and keep the one highest in the hierarchy:
// that is the bone, and the mesh rides on it.
function find(scene: Object3D, names: readonly string[]): Object3D | undefined {
  const wanted = new Set<string>()
  for (const n of names) {
    wanted.add(n)
    wanted.add(PropertyBinding.sanitizeNodeName(n))
  }
  let best: Object3D | undefined
  let bestDepth = Infinity
  scene.traverse((o) => {
    const base = o.name.replace(/_\d+$/, '')
    if (!wanted.has(o.name) && !wanted.has(base)) return
    const d = depth(o)
    if (d < bestDepth) {
      best = o
      bestDepth = d
    }
  })
  return best
}

export function collectRigNodes(scene: Object3D): RigNodes {
  const out: RigNodes = {}
  for (const key of Object.keys(NODE_NAMES) as NodeKey[]) {
    const node = find(scene, NODE_NAMES[key])
    if (node) out[key] = { node, restPos: node.position.clone(), restQuat: node.quaternion.clone(), restScale: node.scale.clone() }
  }
  return out
}

// Every mesh drawing with a named material (one Blender material can export
// as several primitives).
export function meshesWithMaterial(scene: Object3D, name: string): Mesh[] {
  const out: Mesh[] = []
  scene.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]
    if (mats.some((m) => m.name === name)) out.push(mesh)
  })
  return out
}

export const capMeshes = (scene: Object3D): Mesh[] => meshesWithMaterial(scene, CAP_MATERIAL)

// The feet's sneaker sole band (GLBs built before v2 have none: an empty list).
export const sneakerMeshes = (scene: Object3D): Mesh[] => meshesWithMaterial(scene, SNEAKER_MATERIAL)
