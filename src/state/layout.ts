import { layout as L } from '../theme'
import { useTutorStore } from './store'

export interface StageLayout {
  boardW: number
  boardRight: number
  topBarRight: number
  regionRight: number
}

// Direct port of layout() from the export's DCLogic class.
export function computeLayout(stageW: number, panelOpen: boolean): StageLayout {
  const W = stageW || 1000
  const boardW = Math.round(Math.max(L.boardMin, Math.min(L.boardMax, W * L.boardFraction)))
  const boardRight = panelOpen ? L.panelWidth + L.panelGap + L.boardInset : L.boardRightClosed
  const regionRight = Math.max(L.regionMin, (W - boardRight - boardW - 12) / W)
  return {
    boardW,
    boardRight,
    topBarRight: panelOpen ? L.panelWidth + L.panelGap : 0,
    regionRight: Number(regionRight.toFixed(3)),
  }
}

export function useLayout(): StageLayout {
  const stageW = useTutorStore((s) => s.stageW)
  const panelOpen = useTutorStore((s) => s.panelOpen)
  return computeLayout(stageW, panelOpen)
}
