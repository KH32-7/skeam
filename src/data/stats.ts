// Play numbers from everyone's synced accounts, worked out by the registration
// desk (?action=stats, cached there for 10 minutes): this week's popularity
// and how rare each achievement is. Like the status messages, the last answer
// is kept in this browser so lists don't jump around while the desk wakes up.

import { useEffect, useSyncExternalStore } from 'react'
import { koDate } from '../format'
import type { Game } from '../types'
import { useData } from './api'

export interface GameStats {
  /** Accounts that own the game. */
  owners: number
  /** Seconds played, all time, all accounts. */
  total: number
  /** Accounts that played it in the last 7 days. */
  players: number
  /** Accounts that got it in the last 7 days. */
  newOwners: number
  /** Seconds played in the last 7 days, at most 5 hours per person. */
  week: number
  /** Achievement id -> owners who have it. */
  ach: Record<string, number>
}

export type Stats = Record<string, GameStats>

const KEY = 'skeam:stats'
let stats: Stats = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
})()
const listeners = new Set<() => void>()
let loading: Promise<void> | null = null

function load(endpoint: string) {
  if (!endpoint || loading) return
  loading = fetch(`${endpoint}?action=stats`)
    .then((r) => r.json())
    .then((j) => {
      // An older desk answers without `games`: keep what we have.
      if (!j.ok || !j.games) return
      stats = j.games
      try {
        localStorage.setItem(KEY, JSON.stringify(stats))
      } catch {
        /* ignore */
      }
      listeners.forEach((l) => l())
    })
    .catch(() => {})
}

export function useStats(): Stats {
  const { data } = useData()
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => stats,
  )
  useEffect(() => {
    if (data) load(data.site.registerEndpoint)
  }, [data])
  return s
}

/**
 * This week's popularity: people who played it count most, then people who
 * just got it, then hours played (capped per person, so one fan can't carry a game).
 */
export function weeklyScore(s: GameStats | undefined) {
  if (!s) return 0
  return s.players * 3 + s.newOwners * 2 + s.week / 3600
}

/**
 * Steam releases are played in Steam, not here, so they also score from what
 * the build samples on Steam, on the same scale: the week's peak players online
 * count like weekly players (at least that many played), and new Steam reviews
 * like new owners (fewer people review than buy).
 */
export function steamScore(g: Game) {
  const p = g.steam?.popularity
  return p ? p.peak * 3 + p.newReviews * 2 : 0
}

export const gameScore = (g: Game, stats: Stats) => weeklyScore(stats[g.id]) + steamScore(g)

/** Most popular this week first; ties go to more owners, then more play, then newer. */
export function byPopularity(games: Game[], stats: Stats) {
  return [...games].sort(
    (a, b) =>
      gameScore(b, stats) - gameScore(a, stats) ||
      (b.steam?.popularity?.reviews ?? 0) - (a.steam?.popularity?.reviews ?? 0) ||
      (stats[b.id]?.owners ?? 0) - (stats[a.id]?.owners ?? 0) ||
      (stats[b.id]?.total ?? 0) - (stats[a.id]?.total ?? 0) ||
      b.release.localeCompare(a.release),
  )
}

/** "이번 주 4명 플레이 · 6.5시간", for lists sorted by popularity. */
export function weekLine(stats: Stats, g: Game) {
  const s = stats[g.id]
  const p = g.steam?.popularity
  // A Steam game whose numbers come mostly from Steam says so.
  if (p && (p.peak || p.newReviews) && steamScore(g) >= weeklyScore(s)) {
    const parts = p.peak ? [`Steam 이번 주 최고 ${p.peak.toLocaleString('ko-KR')}명 동시 플레이`] : []
    if (p.newReviews) parts.push(`새 리뷰 ${p.newReviews}개`)
    return parts.join(' · ')
  }
  if (!s || (!s.players && !s.newOwners)) return s?.owners ? `${s.owners}명이 보유` : `출시: ${koDate(g.release)}`
  const parts = [s.players ? `이번 주 ${s.players}명 플레이` : `이번 주 ${s.newOwners}명이 받음`]
  if (s.week >= 360) parts.push(`${(s.week / 3600).toFixed(1).replace(/\.0$/, '')}시간`)
  return parts.join(' · ')
}

/** Share of the game's owners with this achievement, 0-100, or null when nobody owns it yet. */
export function achievementRate(s: GameStats | undefined, achId: string) {
  if (!s?.owners) return null
  return Math.min(100, ((s.ach[achId] ?? 0) / s.owners) * 100)
}

/** "0.5%", "12%", "100%": small numbers keep one decimal like Steam. */
export function pct(n: number) {
  return n > 0 && n < 10 ? `${n.toFixed(1).replace(/\.0$/, '')}%` : `${Math.round(n)}%`
}

/** Hover text for an achievement icon: name, description, and how many club members have it. */
export function achievementTitle(a: { id: string; name: string; desc: string }, s: GameStats | undefined, extra = '') {
  const r = achievementRate(s, a.id)
  return [a.name, a.desc, extra, r === null ? '' : `동아리원 ${pct(r)} 달성${isRare(s, a.id) ? ' (희귀)' : ''}`].filter(Boolean).join('\n')
}

/** Rare = few owners have it, and enough people own the game for that to mean something. */
export function isRare(s: GameStats | undefined, achId: string) {
  const r = achievementRate(s, achId)
  return r !== null && r > 0 && r <= 10 && (s?.owners ?? 0) >= 5
}
