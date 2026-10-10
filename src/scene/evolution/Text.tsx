import { Suspense } from 'react'
import { Label, type LabelProps } from '../windows/primitives'

// The windows' Label in its own Suspense boundary: a label suspends while its
// font loads, and that must never hide the blocks and panels around it.
export function Text(props: LabelProps) {
  return (
    <Suspense fallback={null}>
      <Label {...props} />
    </Suspense>
  )
}
