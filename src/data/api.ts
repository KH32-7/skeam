import { useEffect, useState } from 'react'
import type { Club, Game, Site } from '../types'

let cache: Promise<{ games: Game[]; club: Club; site: Site }> | null = null

async function getJson<T>(name: string, fresh = false): Promise<T> {
  const res = await fetch(`data/${name}.json${fresh ? `?t=${Date.now()}` : ''}`, fresh ? { cache: 'no-store' } : undefined)
  if (!res.ok) throw new Error(`${name}.json ${res.status}`)
  return res.json()
}

export function loadAll() {
  cache ??= Promise.all([getJson<Game[]>('games'), getJson<Club>('club'), getJson<Site>('site')]).then(
    ([games, club, site]) => ({ games, club, site }),
  )
  return cache
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
