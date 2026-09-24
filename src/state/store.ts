// Everything a visitor "owns" lives in their browser: profile, wallet,
// library, wishlist, achievements. Nothing here is real money.

import { useSyncExternalStore } from 'react'

export interface Owned {
  purchasedAt: number
  paid: number
  playtime: number // seconds
  lastPlayed: number
  downloadedVersion?: string
}

export interface Txn {
  at: number
  kind: 'fund' | 'purchase'
  amount: number
  label: string
}

export interface State {
  profile: { name: string; avatar: number; status?: string } | null
  wallet: number
  owned: Record<string, Owned>
  wishlist: string[]
  achievements: Record<string, Record<string, number>>
  seenNews: Record<string, string>
  txns: Txn[]
  kiosk: boolean
}

const KEY = 'skeam:v1'

// A fresh account starts with the same ₩0.64 as the Steam wallet in the
// screenshots the club gave us.
const initial: State = {
  profile: null,
  wallet: 0.64,
  owned: {},
  wishlist: [],
  achievements: {},
  seenNews: {},
  txns: [],
  kiosk: false,
}

function load(): State {
  // Dev only: ?demo=1 fills in an account so screenshots show a lived-in library.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
    const day = 86400000
    return {
      ...initial,
      profile: { name: 'KH327', avatar: 0 },
      wallet: 38120,
      owned: {
        'sizzle-kitchen': { purchasedAt: Date.now() - 2 * day, paid: 9900, playtime: 5400, lastPlayed: Date.now() - 3600000 },
        'taskbar-express': { purchasedAt: Date.now() - day, paid: 0, playtime: 0, lastPlayed: 0, downloadedVersion: '0.9.0' },
      },
      wishlist: ['celrush'],
    }
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...initial, ...JSON.parse(raw) }
  } catch {
    /* private mode or blocked storage: start fresh */
  }
  return initial
}

let state = load()
const listeners = new Set<() => void>()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function setState(fn: (s: State) => State) {
  state = fn(state)
  save()
  listeners.forEach((l) => l())
}

export function getState() {
  return state
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

// Another tab (the player, say) wrote playtime: pick it up here too.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load()
    listeners.forEach((l) => l())
  }
})

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

// ---- actions ---------------------------------------------------------------

/** Stable empty value for selectors, so useSyncExternalStore sees no change. */
export const NONE: Record<string, number> = Object.freeze({}) as Record<string, number>

export const round2 = (n: number) => Math.round(n * 100) / 100

export function addFunds(amount: number) {
  setState((s) => ({
    ...s,
    wallet: round2(s.wallet + amount),
    txns: [{ at: Date.now(), kind: 'fund', amount, label: '지갑 자금 추가' }, ...s.txns],
  }))
}

export function purchase(items: { id: string; title: string; price: number }[]) {
  const total = items.reduce((a, b) => a + b.price, 0)
  if (total > state.wallet) return false
  const now = Date.now()
  setState((s) => {
    const owned = { ...s.owned }
    for (const it of items) owned[it.id] = { purchasedAt: now, paid: it.price, playtime: 0, lastPlayed: 0 }
    return {
      ...s,
      wallet: round2(s.wallet - total),
      owned,
      wishlist: s.wishlist.filter((w) => !items.some((i) => i.id === w)),
      txns: [...items.map((i) => ({ at: now, kind: 'purchase' as const, amount: -i.price, label: i.title })), ...s.txns],
    }
  })
  return true
}

export function toggleWishlist(id: string) {
  setState((s) => ({
    ...s,
    wishlist: s.wishlist.includes(id) ? s.wishlist.filter((w) => w !== id) : [...s.wishlist, id],
  }))
}

export function addPlaytime(id: string, sec: number) {
  setState((s) => {
    const o = s.owned[id]
    if (!o) return s
    return { ...s, owned: { ...s.owned, [id]: { ...o, playtime: o.playtime + sec, lastPlayed: Date.now() } } }
  })
}

export function markLaunched(id: string, version?: string) {
  setState((s) => {
    const o = s.owned[id]
    if (!o) return s
    return {
      ...s,
      owned: { ...s.owned, [id]: { ...o, lastPlayed: Date.now(), ...(version !== undefined ? { downloadedVersion: version } : {}) } },
    }
  })
}

export function unlockAchievement(gameId: string, achId: string) {
  if (state.achievements[gameId]?.[achId]) return false
  setState((s) => ({
    ...s,
    achievements: { ...s.achievements, [gameId]: { ...s.achievements[gameId], [achId]: Date.now() } },
  }))
  return true
}

export function setProfile(name: string, avatar: number, status?: string) {
  setState((s) => ({ ...s, profile: { name, avatar, status: status ?? s.profile?.status } }))
}

export function setKiosk(on: boolean) {
  setState((s) => ({ ...s, kiosk: on }))
}

/** Kiosk mode: wipe the visitor's data and hand the next one ₩50,000. */
export function resetForNextVisitor() {
  setState(() => ({ ...initial, kiosk: true, wallet: 50000 }))
}

export function markNewsSeen(id: string, key: string) {
  setState((s) => ({ ...s, seenNews: { ...s.seenNews, [id]: key } }))
}

export function exportData() {
  return JSON.stringify(state, null, 2)
}

export function importData(json: string) {
  const parsed = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.wallet !== 'number') throw new Error('SKEAM 데이터 파일이 아닙니다')
  setState(() => ({ ...initial, ...parsed }))
}
