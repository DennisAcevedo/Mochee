import { useEffect, useMemo, useRef, type RefObject } from 'react'
import type { Group, Mesh } from 'three'
import { CHARACTER, type Pose } from '../animation/config'
import { useLook, type FrameSource } from '../animation/useLook'
import { usePoses } from '../animation/usePoses'
import { useTick } from '../animation/useTick'
import { ACCESSORY_DEFAULT_COLORS, DEFAULT_LOOK, normalizeAccessory, type TutorLook } from './look'
import { useMaterials, type Materials } from './materials'
import { Book, BodyAccessories, CapLeaf, Mic, Pencil } from './parts/Accessories'
import { Body } from './parts/Body'
import { Cap } from './parts/Cap'
import { Face } from './parts/Face'
import { Hands } from './parts/Hands'
import { Shadow } from './parts/Shadow'
import { createRigState, type RigRefs } from './rig'

export interface CharacterProps {
  size?: number
  roam?: number
  rleft?: number
  rright?: number
  look?: TutorLook
  // Set `pose` to drive the character from props. Left undefined, it follows
  // the shared controller (performAction / setExpression), as the lesson does.
  pose?: Pose
  speaking?: boolean
  introDriven?: boolean // reads the Stage 2 intro state (the lesson only)
  frame?: FrameSource // rect the cursor is normalized against
  lite?: boolean // tick at LITE.tickHz instead of every frame (idle Home cards)
  // Ghost: the tick still runs and moves the (hidden) rig, but only the ground
  // shadow draws. The intro uses it to steer the Blender tutor (IntroTutor).
  ghost?: boolean
  rootOut?: RefObject<Group | null> // receives the rig's root group
}

// Which material each accessory's colour lands on.
const ACC_MATERIAL: Record<keyof typeof ACCESSORY_DEFAULT_COLORS, keyof Materials> = {
  glasses: 'frame',
  leaf: 'leaf',
  mic: 'micHead',
  bowtie: 'bow',
  headphones: 'earbud',
  scarf: 'tie',
  pencil: 'pencil',
}

// Port of the <tutor-3d> custom element from design/tutor-3d.js.
// Layout props mirror its attributes.
export function Character({
  size = CHARACTER.defaultSize,
  roam = CHARACTER.defaultRoam,
  rleft = 0,
  rright = 1,
  look = DEFAULT_LOOK,
  pose,
  speaking = false,
  introDriven = false,
  frame,
  lite = false,
  ghost = false,
  rootOut,
}: CharacterProps) {
  const materials = useMaterials()
  const refs: RigRefs = {
    root: useRef<Group>(null),
    body: useRef<Group>(null),
    eyeL: useRef<Mesh>(null),
    eyeR: useRef<Mesh>(null),
    happyL: useRef<Mesh>(null),
    happyR: useRef<Mesh>(null),
    sleepL: useRef<Mesh>(null),
    sleepR: useRef<Mesh>(null),
    sparkL: useRef<Mesh>(null),
    sparkR: useRef<Mesh>(null),
    book: useRef<Group>(null),
    mic: useRef<Group>(null),
    brows: useRef<Group>(null),
    browL: useRef<Mesh>(null),
    browR: useRef<Mesh>(null),
    smile: useRef<Mesh>(null),
    mouth: useRef<Group>(null),
    cap: useRef<Group>(null),
    tassel: useRef<Group>(null),
    hand_L: useRef<Group>(null),
    hand_R: useRef<Group>(null),
    shadow: useRef<Mesh>(null),
  }
  const state = useMemo(createRigState, [])
  const accessory = normalizeAccessory(look.accessory)

  // applyLook(): every accessory material back to its default, then the
  // active one takes acccolor.
  useEffect(() => {
    for (const [acc, key] of Object.entries(ACC_MATERIAL) as [keyof typeof ACC_MATERIAL, keyof Materials][]) {
      const mat = materials[key] as { color: { set: (c: string) => void } }
      const custom = acc === accessory && look.accColor
      try {
        mat.color.set(custom || ACCESSORY_DEFAULT_COLORS[acc])
      } catch {
        mat.color.set(ACCESSORY_DEFAULT_COLORS[acc])
      }
    }
  }, [materials, accessory, look.accColor])

  useEffect(() => {
    if (!rootOut) return
    rootOut.current = refs.root.current
    return () => {
      rootOut.current = null
    }
  })

  usePoses(state, pose === undefined ? undefined : { pose, speaking })
  useLook(state, frame)
  useTick(refs, state, { size, roam, rleft, rright, accessory, introDriven, lite })

  return (
    <group name="character">
      <group visible={!ghost}>
        <group ref={refs.root} name="root">
          <Body groupRef={refs.body} materials={materials}>
            <Face refs={refs} materials={materials} />
            <Cap capRef={refs.cap} tasselRef={refs.tassel} materials={materials} color={look.cap}>
              <CapLeaf accessory={accessory} materials={materials} />
            </Cap>
            <BodyAccessories accessory={accessory} materials={materials} />
          </Body>
          <Book groupRef={refs.book} materials={materials} />
        </group>
        <Hands
          leftRef={refs.hand_L}
          rightRef={refs.hand_R}
          material={materials.hand}
          left={<Mic groupRef={refs.mic} materials={materials} />}
          right={<Pencil accessory={accessory} materials={materials} />}
        />
      </group>
      <Shadow meshRef={refs.shadow} material={materials.blob} />
    </group>
  )
}
