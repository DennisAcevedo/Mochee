import { Component, Suspense, use, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Character } from '../Character'
import { tutorActor } from './actor'
import { BlenderTutor, type BlenderTutorProps } from './BlenderTutor'
import { TUTOR_ASSETS } from './config'
import { probeModel } from './manifest'

interface Props extends BlenderTutorProps {
  fallback?: ReactNode // what to show if the GLB is missing or broken; defaults to the classic character
}

interface BoundaryProps {
  fallback: ReactNode
  children: ReactNode
}

// Catches a GLB that exists but fails to parse or play, and shows the fallback.
class TutorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[BlenderTutor] falling back to the classic character:', error.message, info.componentStack?.split('\n')[1]?.trim())
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

// Marks the classic character as the one on stage while the fallback is shown
// (the intro frames him differently and roaming leaves him alone).
function ClassicStandIn({ children }: { children: ReactNode }) {
  useEffect(() => {
    tutorActor.classic = true
    return () => {
      tutorActor.classic = false
    }
  }, [])
  return children
}

// A missing GLB never reaches the loader: probe first, fall back quietly.
function Gate({ fallback, ...props }: BlenderTutorProps & { fallback: ReactNode }) {
  const present = use(probeModel(props.src ?? TUTOR_ASSETS.model))
  return present ? <BlenderTutor {...props} /> : fallback
}

// The Blender tutor, guarded: nothing while the GLB loads, the classic
// <Character> if it is missing or fails, so the lesson never breaks.
// introDriven reaches the default fallback too, so a classic stand-in still spins.
export function BlenderTutorSafe({ fallback, ...props }: Props) {
  const given = fallback ?? (props.visible === false ? null : <Character roam={0} introDriven={props.introDriven} />)
  const shown = given === null ? null : <ClassicStandIn>{given}</ClassicStandIn>
  return (
    <TutorBoundary fallback={shown}>
      <Suspense fallback={null}>
        <Gate {...props} fallback={shown} />
      </Suspense>
    </TutorBoundary>
  )
}
