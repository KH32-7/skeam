import { useEffect, useState, type ReactNode } from 'react'
import type { Game } from '../types'
import { won } from '../format'

export function Price({ game, className = '' }: { game: Pick<Game, 'price' | 'discount' | 'finalPrice'>; className?: string }) {
  if (game.price === 0) {
    return (
      <span className={`price free ${className}`}>
        <span className="vals">
          <span className="final">무료</span>
        </span>
      </span>
    )
  }
  if (game.discount > 0) {
    return (
      <span className={`price disc ${className}`}>
        <span className="pct">-{game.discount}%</span>
        <span className="vals">
          <span className="orig">{won(game.price)}</span>
          <span className="final">{won(game.finalPrice)}</span>
        </span>
      </span>
    )
  }
  return (
    <span className={`price ${className}`}>
      <span className="vals">
        <span className="final">{won(game.price)}</span>
      </span>
    </span>
  )
}

const AVATAR_COLORS = [
  ['#e0a526', '#7a5310'],
  ['#5a9fd4', '#1c4f7a'],
  ['#8cc63f', '#3f6e14'],
  ['#d45a7a', '#7a1c3b'],
  ['#9b7ad4', '#4a2c7a'],
  ['#4fc3b8', '#15665f'],
  ['#e6734d', '#7a3014'],
  ['#9aa5b1', '#3a434d'],
]

export function Avatar({ name, index, size = 32, className = '' }: { name: string; index: number; size?: number; className?: string }) {
  const [a, b] = AVATAR_COLORS[index % AVATAR_COLORS.length]
  const letter = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={`av${index}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" fill={`url(#av${index})`} />
      <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff" fontFamily="Noto Sans KR, Arial">
        {letter}
      </text>
    </svg>
  )
}
export const AVATAR_COUNT = AVATAR_COLORS.length

export function Modal({ title, children, footer, onClose, wide }: { title?: ReactNode; children: ReactNode; footer?: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    if (!onClose) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        {title && <div className="mh">{title}</div>}
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  )
}

// ---- toasts (achievement unlocked, "Shift+Tab" hint, ...) --------------------

export interface ToastData {
  id: number
  title: string
  body?: string
  icon?: string
  glyph?: string
}
let toastId = 0
const toastListeners = new Set<(t: ToastData) => void>()
export function toast(t: Omit<ToastData, 'id'>) {
  const full = { ...t, id: ++toastId }
  toastListeners.forEach((l) => l(full))
}

export function Toasts() {
  const [items, setItems] = useState<ToastData[]>([])
  useEffect(() => {
    const add = (t: ToastData) => {
      setItems((xs) => [...xs, t])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 6200)
    }
    toastListeners.add(add)
    return () => void toastListeners.delete(add)
  }, [])
  return (
    <>
      {items.map((t, i) => (
        <div key={t.id} className="toast" style={{ bottom: 18 + i * 92 }}>
          {t.icon ? <img src={t.icon} alt="" /> : <div className="ico">{t.glyph ?? '★'}</div>}
          <div>
            <b>{t.title}</b>
            {t.body}
          </div>
        </div>
      ))}
    </>
  )
}

export function Loading() {
  return <div className="spinner" style={{ marginTop: 80 }} />
}

export function Tags({ tags, max = 99 }: { tags: string[]; max?: number }) {
  return (
    <>
      {tags.slice(0, max).map((t) => (
        <a key={t} className="tag" href={`#/search?tag=${encodeURIComponent(t)}`}>
          {t}
        </a>
      ))}
    </>
  )
}
