import { useEffect, useState } from 'react'
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

// ---- status messages, kept in the registration desk's "profiles" sheet ----------

export type Profiles = Record<string, { name: string; status: string }>
let profilesCache: Promise<Profiles> | null = null

export function loadProfiles(endpoint: string, fresh = false): Promise<Profiles> {
  if (!endpoint) return Promise.resolve({})
  if (fresh || !profilesCache)
    profilesCache = fetch(`${endpoint}?action=profiles`)
      .then((r) => r.json())
      .then((j) => (j.ok && j.profiles ? j.profiles : {}))
      .catch(() => ({}))
  return profilesCache
}

/** Status messages by lower-cased nickname ({} until loaded or without a desk). */
export function useProfiles() {
  const { data } = useData()
  const [p, setP] = useState<Profiles>({})
  useEffect(() => {
    if (data) loadProfiles(data.site.registerEndpoint).then(setP)
  }, [data])
  return p
}

export async function saveStatus(endpoint: string, name: string, text: string) {
  const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'status', name, text }) })
  const j = await r.json()
  if (!j.ok) throw new Error(j.error)
  await loadProfiles(endpoint, true)
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
