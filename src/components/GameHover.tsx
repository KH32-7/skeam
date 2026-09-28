// Steam's hover card: rest the mouse on a game's picture and the picture
// starts flipping through its screenshots while a card beside it shows the
// release date, description, review summary and tags. Mouse only; touch
// screens just open the game.

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useData } from '../data/api'
import { useStats } from '../data/stats'
import { koDate, koRelease } from '../format'
import type { Game } from '../types'
import { reviewLabel } from './Reviews'

const SHOW_AFTER = 250
const FIRST_SHOT = 450
const NEXT_SHOT = 1600

// ---- which card is open (one at a time, drawn once at the top of the app) ------

let current: { g: Game; el: HTMLElement } | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
function show(g: Game, el: HTMLElement) {
  current = { g, el }
  emit()
}
function hide(g?: Game) {
  if (!current || (g && current.g !== g)) return
  current = null
  emit()
}

const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches

// Screenshots are loaded ahead so the picture never flips to a blank frame.
const preloaded = new Map<string, HTMLImageElement>()
function preload(src: string) {
  if (preloaded.has(src)) return
  const img = new Image()
  img.src = src
  preloaded.set(src, img)
}
const ready = (src: string) => {
  const img = preloaded.get(src)
  return !!img && img.complete && img.naturalWidth > 0
}

/** Mouse handlers for the game's link, and the screenshot its picture should show now. */
function useGameHover(g: Game) {
  const [shot, setShot] = useState<string | null>(null)
  const timers = useRef<number[]>([])
  const stop = () => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    setShot(null)
    hide(g)
  }
  // Leaving the page (clicking the game, say) closes the card too.
  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t))
      hide(g)
    },
    [g],
  )
  const onMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (!canHover()) return
    const el = e.currentTarget
    const shots = g.images.screenshots.slice(0, 6)
    shots.forEach(preload)
    timers.current.push(window.setTimeout(() => show(g, el), SHOW_AFTER))
    if (!shots.length) return
    let i = 0
    const next = () => {
      const s = shots[i % shots.length]
      if (!ready(s)) return
      setShot(s)
      i++
    }
    timers.current.push(
      window.setTimeout(() => {
        next()
        timers.current.push(window.setInterval(next, NEXT_SHOT))
      }, FIRST_SHOT),
    )
  }
  return { bind: { onMouseEnter, onMouseLeave: stop }, shot }
}

const ShotCtx = createContext<string | null>(null)

/** A link to the game's store page with the hover card; put a <CapsuleImg> inside. */
export function GameLink({ g, className, children }: { g: Game; className?: string; children: ReactNode }) {
  const { bind, shot } = useGameHover(g)
  return (
    <ShotCtx.Provider value={shot}>
      <Link className={className} to={`/app/${g.id}`} {...bind}>
        {children}
      </Link>
    </ShotCtx.Provider>
  )
}

/** The game's header picture, or the screenshot the hover is showing. */
export function CapsuleImg({ g }: { g: Game }) {
  const shot = useContext(ShotCtx)
  return <img key={shot ?? ''} className={shot ? 'shot-in' : undefined} src={shot ?? g.images.header} alt="" />
}

// ---- review summaries for every game, from one request ---------------------------

type Summary = Record<string, { pos: number; n: number }>
const SUM_KEY = 'skeam:review-summary'
let summary: Summary = (() => {
  try {
    return JSON.parse(localStorage.getItem(SUM_KEY) ?? '{}')
  } catch {
    return {}
  }
})()
let summaryAt = 0
const summaryListeners = new Set<() => void>()

function loadSummary(endpoint: string) {
  if (!endpoint || Date.now() - summaryAt < 5 * 60 * 1000) return
  summaryAt = Date.now()
  fetch(`${endpoint}?action=reviews`)
    .then((r) => r.json())
    .then((j) => {
      if (!j.ok) return
      const next: Summary = {}
      for (const r of j.reviews as { game: string; recommend: boolean }[]) {
        const s = (next[r.game] ??= { pos: 0, n: 0 })
        s.n++
        if (r.recommend) s.pos++
      }
      summary = next
      try {
        localStorage.setItem(SUM_KEY, JSON.stringify(summary))
      } catch {
        /* ignore */
      }
      summaryListeners.forEach((l) => l())
    })
    .catch(() => {
      summaryAt = 0
    })
}

function useSummary() {
  return useSyncExternalStore(
    (l) => {
      summaryListeners.add(l)
      return () => void summaryListeners.delete(l)
    },
    () => summary,
  )
}

// ---- the card ----------------------------------------------------------------------

const W = 310
const GAP = 10

export function GameHoverLayer() {
  const cur = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => current,
  )
  const { data } = useData()
  useEffect(() => {
    if (cur && data) loadSummary(data.site.registerEndpoint)
  }, [cur, data])
  // The card is pinned to the screen, so scrolling puts it away.
  useEffect(() => {
    if (!cur) return
    const off = () => hide()
    window.addEventListener('scroll', off, { passive: true, capture: true })
    window.addEventListener('resize', off)
    return () => {
      window.removeEventListener('scroll', off, { capture: true })
      window.removeEventListener('resize', off)
    }
  }, [cur])
  if (!cur) return null
  return createPortal(<Card key={cur.g.id} g={cur.g} el={cur.el} />, document.body)
}

function Card({ g, el }: { g: Game; el: HTMLElement }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const sum = useSummary()[g.id]
  const owners = useStats()[g.id]?.owners ?? 0

  // Beside the picture, on whichever side has room; never off the screen.
  useLayoutEffect(() => {
    const r = el.getBoundingClientRect()
    const h = box.current?.offsetHeight ?? 0
    const clampTop = (t: number) => Math.max(8, Math.min(t, innerHeight - h - 8))
    let left = r.right + GAP
    if (left + W > innerWidth - 8) left = r.left - GAP - W
    if (left >= 8) return setPos({ left, top: clampTop(r.top) })
    // A wide row (search results) has no room beside it: under its right end
    // (or over it, near the bottom of the screen), leaving the row itself readable.
    left = Math.max(8, Math.min(r.right - W, innerWidth - W - 8))
    if (left < r.left) return setPos(null)
    setPos({ left, top: r.bottom + 4 + h <= innerHeight - 8 ? r.bottom + 4 : clampTop(r.top - 4 - h) })
  }, [el, g, sum, owners])

  const review = reviewLine(g, sum)
  return (
    <div ref={box} className={`game-hover ${pos ? 'on' : ''}`} style={{ width: W, left: pos?.left ?? -9999, top: pos?.top ?? 0 }} aria-hidden="true">
      <h4>{g.title}</h4>
      <div className="date">{g.comingSoon ? `출시 예정: ${koRelease(g.release)}` : `출시: ${koDate(g.release)}`}</div>
      {g.short && <p className="desc">{g.short}</p>}
      <div className="rev">
        <div className="k">{review.where}</div>
        {review.label ? (
          <>
            <span className={`review-${review.cls}`}>{review.label}</span>
            {review.count && <span className="n"> ({review.count})</span>}
          </>
        ) : (
          <span className="n">사용자 평가 없음</span>
        )}
      </div>
      {g.tags.length > 0 && (
        <>
          <div className="k">사용자 태그:</div>
          <div className="tags">
            {g.tags.slice(0, 5).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </>
      )}
      {owners > 0 && <div className="owners">SKEAM에서 {owners.toLocaleString('ko-KR')}명이 가지고 있음</div>}
    </div>
  )
}

/** Steam releases show Steam's own summary; everything else, SKEAM's reviews. */
function reviewLine(g: Game, sum?: { pos: number; n: number }) {
  const p = g.steam?.popularity
  if (p) {
    // With few reviews Steam's label is just the count ("사용자 평가 3개").
    if (!p.reviews || p.label.startsWith('사용자 평가')) return { where: 'Steam 사용자 평가:', label: p.reviews ? p.label : '', cls: '', count: '' }
    const cls = p.label.includes('긍정') ? 'pos' : p.label.includes('부정') ? 'neg' : 'mixed'
    return { where: 'Steam 사용자 평가:', label: p.label, cls, count: `평가 ${p.reviews.toLocaleString('ko-KR')}개` }
  }
  if (!sum?.n) return { where: 'SKEAM 사용자 평가:', label: '', cls: '', count: '' }
  const l = reviewLabel(sum.pos, sum.n)
  return { where: 'SKEAM 사용자 평가:', label: l.text, cls: l.cls, count: `평가 ${sum.n.toLocaleString('ko-KR')}개` }
}
