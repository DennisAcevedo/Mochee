import styles from './PlayHud.module.css'

// A gold coin, for the balance and the prices.
export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg className={[styles.coinIcon, className].filter(Boolean).join(' ')} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" fill="#E9A21A" />
      <circle cx="8" cy="7.6" r="6.3" fill="#FFC83D" />
      <circle cx="8" cy="7.6" r="4.3" fill="none" stroke="#E9A21A" strokeWidth="1.2" />
      <path d="M5.6 5.4a3.4 3.4 0 0 1 2.2-1.1" fill="none" stroke="#FFF1C2" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
