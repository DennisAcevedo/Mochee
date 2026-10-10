import type { TopicInfo } from '../../shared/docsTypes'

// A small fixed cast of bosses. Each topic gets one, picked by a stable hash of
// its id, and the boss "guards" the real topic title. Names are flavour only:
// nothing here claims a fact about the topic.

export interface Archetype {
  name: string
  body: string // main colour
  shade: string // top / accent colour
  disc: string // arena disc colour
}

export const ARCHETYPES: readonly Archetype[] = [
  { name: 'THE GOLEM', body: '#55597a', shade: '#6b6f92', disc: '#5c4a7a' },
  { name: 'QUIZ HYDRA', body: '#2f8f5b', shade: '#46b07a', disc: '#2c6b4f' },
  { name: 'THE FOG', body: '#7c5cf2', shade: '#9b84f7', disc: '#5a3fbf' },
  { name: 'PAGE WRAITH', body: '#c4402f', shade: '#e2604f', disc: '#8e2f24' },
  { name: 'THE KNOT', body: '#d89a00', shade: '#fbbc04', disc: '#9a6e00' },
  { name: 'BLUR BEAST', body: '#3d5ad6', shade: '#6283f0', disc: '#2b3f99' },
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function archetypeFor(topic: Pick<TopicInfo, 'id'>): Archetype {
  return ARCHETYPES[hash(topic.id) % ARCHETYPES.length]
}
