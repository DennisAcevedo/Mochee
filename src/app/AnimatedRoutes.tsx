import { useCallback, useEffect, useState, type AnimationEvent, type ReactNode } from 'react'
import { Routes, useLocation } from 'react-router'
import styles from './AnimatedRoutes.module.css'

// Matches the pageOut duration in AnimatedRoutes.module.css.
const OUT_MS = 140

// Soft page changes: the old page fades out, then the new one fades and
// slides in. The slide moves `top`, not `transform`, so the lesson's and
// Home's fixed canvases keep the viewport as their containing block.
export function AnimatedRoutes({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [shown, setShown] = useState(location)
  const [stage, setStage] = useState<'in' | 'out'>('in')

  const swap = useCallback(() => {
    setShown(location)
    setStage('in')
    window.scrollTo(0, 0)
  }, [location])

  useEffect(() => {
    if (location.key === shown.key) return
    setStage('out')
    // animationend doesn't fire while the tab isn't painting; never get stuck on it.
    const t = setTimeout(swap, OUT_MS + 80)
    return () => clearTimeout(t)
  }, [location, shown.key, swap])

  const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && stage === 'out') swap()
  }

  return (
    <div className={styles.page} data-stage={stage} onAnimationEnd={onAnimationEnd}>
      <Routes location={shown}>{children}</Routes>
    </div>
  )
}
