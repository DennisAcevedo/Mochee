import type { FxKind } from '../../state/director'
import { TUTOR_ASSETS, type FaceState } from './config'

// Per-clip metadata the blender build writes next to the GLB
// (public/models/tutor.manifest.json): loop flag, face state and timed fx.
// The file mirrors blender/tutor/clips.json minus the keys. A missing or
// malformed manifest is not an error: every clip then uses the defaults.

export interface ClipMeta {
  loop?: boolean
  duration?: number
  face?: FaceState
  fx: Array<[number, FxKind]>
}

export type Manifest = Record<string, ClipMeta>

const FACES: readonly FaceState[] = ['neutral', 'happy', 'closed', 'surprised', 'focused']
const FX_KINDS: readonly FxKind[] = ['confetti', 'sparkles', 'hearts', 'stars', 'ring', 'levelup']

function parseFx(raw: unknown): Array<[number, FxKind]> {
  if (!Array.isArray(raw)) return []
  const out: Array<[number, FxKind]> = []
  for (const item of raw) {
    // [time, kind] pairs, or { t|time|at, kind } objects.
    const t = Array.isArray(item) ? item[0] : (item?.t ?? item?.time ?? item?.at)
    const kind = Array.isArray(item) ? item[1] : item?.kind
    if (typeof t === 'number' && FX_KINDS.includes(kind)) out.push([t, kind])
  }
  return out.sort((a, b) => a[0] - b[0])
}

function parseClip(raw: Record<string, unknown>): ClipMeta {
  return {
    loop: typeof raw.loop === 'boolean' ? raw.loop : undefined,
    duration: typeof raw.duration === 'number' ? raw.duration : undefined,
    face: FACES.includes(raw.face as FaceState) ? (raw.face as FaceState) : undefined,
    fx: parseFx(raw.fx),
  }
}

// Accepts { clips: [{ name, ... }] }, { clips: { name: {...} } } or a bare map.
export function parseManifest(json: unknown): Manifest {
  const out: Manifest = {}
  if (!json || typeof json !== 'object') return out
  const clips = (json as { clips?: unknown }).clips ?? json
  if (Array.isArray(clips)) {
    for (const c of clips) if (c && typeof c.name === 'string') out[c.name] = parseClip(c)
  } else if (clips && typeof clips === 'object') {
    for (const [name, c] of Object.entries(clips)) if (c && typeof c === 'object') out[name] = parseClip(c as Record<string, unknown>)
  }
  return out
}

const pending = new Map<string, Promise<Manifest>>()

// The manifest sitting next to a model ('/models/tutor.glb' -> '/models/tutor.manifest.json').
export function manifestUrl(model: string): string {
  return model === TUTOR_ASSETS.model ? TUTOR_ASSETS.manifest : model.replace(/\.glb$/i, '.manifest.json')
}

// One fetch per URL per page; resolves to {} on any failure (the dev server
// answers a missing file with index.html, which fails the JSON parse).
export function loadManifest(url: string = TUTOR_ASSETS.manifest): Promise<Manifest> {
  let p = pending.get(url)
  if (!p) {
    p = fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then(parseManifest)
      .catch(() => ({}))
    pending.set(url, p)
  }
  return p
}

const probes = new Map<string, Promise<boolean>>()

// Whether a model URL really serves a GLB (the dev server answers a missing
// file with index.html, so a 200 alone proves nothing). Lets the safe wrapper
// fall back without throwing a load error first.
export function probeModel(url: string): Promise<boolean> {
  let p = probes.get(url)
  if (!p) {
    p = fetch(url, { method: 'HEAD', cache: 'no-cache' })
      .then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html'))
      .catch(() => false)
    probes.set(url, p)
  }
  return p
}
