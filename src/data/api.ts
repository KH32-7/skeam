import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Club, Game, Site } from '../types'

let cache: Promise<{ games: Game[]; club: Club; site: Site }> | null = null

// GitHub Pages lets browsers cache files for 10 minutes. 'no-cache' makes every
// page load ask whether the list changed (a cheap 304 when it hasn't), so a
// newly registered game shows up on the next refresh.
async function getJson<T>(name: string, fresh = false): Promise<T> {
  const res = await fetch(`data/${name}.json${fresh ? `?t=${Date.now()}` : ''}`, { cache: fresh ? 'no-store' : 'no-cache' })
  if (!res.ok) throw new Error(`${name}.json ${res.status}`)
  return res.json()
}

export function loadAll() {
  cache ??= Promise.all([getJson<Game[]>('games'), getJson<Club>('club'), getJson<Site>('site')]).then(
    ([games, club, site]) => ({ games, club, site }),
  )
  return cache
}

// ---- status messages & roles, kept in the registration desk's "profiles" sheet ----
//
// The desk takes a second or two to answer, so the last list we saw is kept
// in this browser and shown straight away; the fresh one replaces it when it
// arrives. Saving updates it on the spot.

export type Profiles = Record<string, { name: string; status: string; role: string }>

const PROFILES_KEY = 'skeam:profiles'
let profiles: Profiles = (() => {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '{}')
  } catch {
    return {}
  }
})()
const profileListeners = new Set<() => void>()
let profilesLoading: Promise<void> | null = null

function setProfiles(next: Profiles) {
  profiles = next
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  profileListeners.forEach((l) => l())
}

export function loadProfiles(endpoint: string, fresh = false): Promise<void> {
  if (!endpoint) return Promise.resolve()
  if (fresh || !profilesLoading)
    profilesLoading = fetch(`${endpoint}?action=profiles`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.profiles) setProfiles(j.profiles)
      })
      .catch(() => {})
  return profilesLoading
}

/** Status messages and roles by lower-cased nickname. */
export function useProfiles() {
  const { data } = useData()
  const p = useSyncExternalStore(
    (l) => {
      profileListeners.add(l)
      return () => void profileListeners.delete(l)
    },
    () => profiles,
  )
  useEffect(() => {
    if (data) loadProfiles(data.site.registerEndpoint)
  }, [data])
  return p
}

/** Status message and member-list role; the desk checks name + token. */
export async function saveStatus(endpoint: string, auth: { name: string; token: string }, text: string, role: string) {
  const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'status', ...auth, text, role }) })
  const j = await r.json()
  if (!j.ok) throw new Error(j.error)
  setProfiles({ ...profiles, [auth.name.toLowerCase()]: { name: auth.name, status: text, role } })
  loadProfiles(endpoint, true)
}

/** Bypasses the cache; the register page polls this to see a submission go live. */
export const fetchLiveGames = () => getJson<Game[]>('games', true)
export const fetchLiveSite = () => getJson<Site>('site', true)

export function useData() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAll>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadAll().then(setData, (e) => setError(String(e)))
  }, [])
  return { data, error }
}

export function useGame(id: string | undefined) {
  const { data, error } = useData()
  return { game: data?.games.find((g) => g.id === id), data, error }
}
