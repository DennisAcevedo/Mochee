// Small stroke icons for the drawers. currentColor, 20x20 grid.

const base = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const BookIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M4 3.5h8.5a3 3 0 0 1 3 3V17H7a3 3 0 0 1-3-3V3.5Z" />
    <path d="M4 14a3 3 0 0 1 3-3h8.5" />
  </svg>
)

export const UploadIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M10 13V3.5M6 7l4-4 4 4" />
    <path d="M3.5 13v2a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2" />
  </svg>
)

export const CheckIcon = () => (
  <svg {...base} strokeWidth={2.6} aria-hidden>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
)

export const SendIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M3.5 10h12M11 5l5 5-5 5" />
  </svg>
)

export const ChevronIcon = ({ dir = 'right' }: { dir?: 'left' | 'right' }) => (
  <svg {...base} strokeWidth={2.4} aria-hidden style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }}>
    <path d="M8 4.5l5.5 5.5L8 15.5" />
  </svg>
)

export const SparkIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4M5 5l2 2M13 13l2 2M15 5l-2 2M7 13l-2 2" />
  </svg>
)
