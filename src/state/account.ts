// SKEAM accounts: nickname + password, kept by the registration desk (Apps
// Script + Google Sheet). Logging in on any device brings back the wallet,
// library, play time and achievements; changes are pushed a few seconds after
// they happen.

import { loadAll } from '../data/api'
import { getState, onChange, setState, syncedPart, type State, type Synced } from './store'

async function endpoint() {
  const { site } = await loadAll()
  if (!site.registerEndpoint) throw new Error('등록 창구가 연결되지 않았어요')
  return site.registerEndpoint
}

export async function call<T = Record<string, unknown>>(action: string, body: Record<string, unknown>): Promise<T & { ok: true }> {
  const res = await fetch(await endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body }),
  })
  const j = await res.json()
  if (!j.ok) throw new Error(j.error || '알 수 없는 오류')
  return j
}

/** Adds name + token to a desk request; throws if nobody is logged in here. */
export function authFields() {
  const s = getState().session
  if (!s) throw new Error('로그인이 필요해요')
  return { name: s.name, token: s.token }
}

/** Two copies of the same account: keep everything owned on either side. */
function merge(local: Synced, remote: Partial<Synced>): Synced {
  const achievements = { ...local.achievements }
  for (const [g, m] of Object.entries(remote.achievements ?? {})) achievements[g] = { ...achievements[g], ...m }
  return {
    profile: remote.profile ?? local.profile,
    wallet: typeof remote.wallet === 'number' ? remote.wallet : local.wallet,
    owned: { ...local.owned, ...(remote.owned ?? {}) },
    wishlist: [...new Set([...(remote.wishlist ?? []), ...local.wishlist])],
    achievements,
    seenNews: { ...local.seenNews, ...(remote.seenNews ?? {}) },
    watchRelease: [...new Set([...(remote.watchRelease ?? []), ...(local.watchRelease ?? [])])],
    seenReviewsAt: [remote.seenReviewsAt ?? '', local.seenReviewsAt ?? ''].sort().pop() ?? '',
    txns: remote.txns ?? local.txns,
  }
}

function applySession(name: string, token: string, lastSync: string, data?: Synced) {
  setState((s) => ({
    ...s,
    ...(data ?? {}),
    profile: { name, avatar: data?.profile?.avatar ?? s.profile?.avatar ?? 0, status: data?.profile?.status ?? s.profile?.status },
    session: { name, token, lastSync },
  }))
}

export async function signup(name: string, password: string, avatar: number) {
  const local = getState()
  const data = syncedPart({ ...local, profile: { name, avatar, status: local.profile?.status } })
  const r = await call<{ name: string; token: string; updated: string }>('signup', { name, password, data })
  applySession(r.name, r.token, r.updated, data)
}

export async function login(name: string, password: string) {
  const r = await call<{ name: string; token: string; data: Partial<Synced>; updated: string }>('login', { name, password })
  const local = syncedPart(getState())
  // Guest play on this device before logging in is kept, not thrown away.
  const hadGuestData = !getState().session && Object.keys(local.owned).length > 0
  const data = Object.keys(r.data ?? {}).length ? merge(hadGuestData ? local : syncedPart(initialLike()), r.data) : local
  applySession(r.name, r.token, r.updated, data)
  if (hadGuestData) schedule()
}

function initialLike(): State {
  return { ...getState(), wallet: 0, owned: {}, wishlist: [], achievements: {}, seenNews: {}, watchRelease: [], seenReviewsAt: '', txns: [] }
}

export async function logout() {
  const s = getState().session
  if (s) call('logout', { name: s.name, token: s.token }).catch(() => {})
  // Leave nothing behind on a shared computer.
  setState((st) => ({ ...st, session: null, profile: null, wallet: 0.64, owned: {}, wishlist: [], achievements: {}, seenNews: {}, watchRelease: [], seenReviewsAt: '', txns: [] }))
}

// ---- background sync ---------------------------------------------------------

let timer = 0
let saving = false

function schedule() {
  clearTimeout(timer)
  timer = window.setTimeout(push, 2500)
}

async function push() {
  const s = getState()
  if (!s.session || saving) return
  saving = true
  try {
    const r = await call<{ updated: string }>('save', { name: s.session.name, token: s.session.token, data: syncedPart(s) })
    setState((st) => (st.session ? { ...st, session: { ...st.session, lastSync: r.updated } } : st))
  } catch (e) {
    if (String(e).includes('로그인이 필요')) setState((st) => ({ ...st, session: null }))
  } finally {
    saving = false
  }
}

/** Start syncing: pull newer data from the server once, then push local changes. */
export async function startSync() {
  onChange((before, after) => {
    if (!after.session || after.kiosk) return
    // Only data changes need saving (not the session bookkeeping itself).
    if (JSON.stringify(syncedPart(before)) !== JSON.stringify(syncedPart(after))) schedule()
  })
  const s = getState().session
  if (!s) return
  try {
    const r = await call<{ data: Partial<Synced>; updated: string }>('load', { name: s.name, token: s.token })
    if (r.updated && r.updated > s.lastSync) {
      // Another device saved since we last synced: take its data, keep anything only we own.
      const data = merge(syncedPart(getState()), r.data)
      applySession(s.name, s.token, r.updated, data)
    }
  } catch (e) {
    if (String(e).includes('로그인이 필요')) setState((st) => ({ ...st, session: null }))
  }
}
