// SKEAM Cloud: save data of web games follows the account to any device.
//
// skeam-sdk.js inside the game captures its localStorage + IndexedDB and talks
// to the player page over postMessage; this file decides what to do with it
// and stores it through the registration desk ("saves" sheet).
//
//   game (SDK)                     SKEAM player (useCloudSync)
//   cloud-hello {ver, dirty, ...}  ->  cloud-wait, then after fetching the cloud copy:
//                                  <-  cloud-ready {upload}   keep this device's data
//                                  <-  cloud-restore {data}   replace it, SDK reloads
//                                  <-  cloud-off              not logged in
//   cloud-snapshot {seq, data}     ->  upload (at most once a minute, right away on exit)
//                                  <-  cloud-saved {ver, seq}
//   cloud-clean                    ->  nothing changed since the last upload

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from '../components/ui'
import { authFields, call } from './account'
import { useStore } from './store'

export type CloudStatus = 'none' | 'off' | 'checking' | 'synced' | 'saving' | 'conflict' | 'error' | 'toolarge'

export interface CloudConflict {
  /** When the cloud copy was saved. */
  cloudAt: string
  cloudSize: number
  /** When this device last changed its save (may be empty for old saves). */
  localAt: string
  /** Mid-game conflict: the cloud copy can't be loaded until the game restarts. */
  midGame: boolean
  choose: (useCloud: boolean) => void
}

const MAX = 2_000_000
const MIN_GAP = 60_000

// ---- encoding: structured-clone values (Dates, typed arrays...) <-> JSON <-> gzip base64 ----

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

function b64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
function unb64(s: string) {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function enc(v: unknown): Json {
  if (v === undefined) return { $u: 1 }
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) }
  if (typeof v === 'bigint') return { $b: v.toString() }
  if (v === null || typeof v !== 'object') return v as Json
  if (v instanceof Date) return { $d: v.getTime() }
  if (v instanceof ArrayBuffer) return { $ab: b64(new Uint8Array(v)) }
  if (ArrayBuffer.isView(v)) return { $ta: v.constructor.name, b: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) }
  if (Array.isArray(v)) return v.map(enc)
  if (v instanceof Map) return { $m: [...v].map(([a, b]) => [enc(a), enc(b)]) }
  if (v instanceof Set) return { $s: [...v].map(enc) }
  if (typeof Blob !== 'undefined' && v instanceof Blob) return { $u: 1 } // not synchronously readable; rare in saves
  const o: { [k: string]: Json } = {}
  for (const [k, x] of Object.entries(v)) o[k] = enc(x)
  return Object.keys(o).some((k) => k.startsWith('$')) ? { $o: o } : o
}

function dec(v: Json): unknown {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(dec)
  if ('$u' in v) return undefined
  if ('$n' in v) return Number(v.$n)
  if ('$b' in v) return BigInt(v.$b as string)
  if ('$d' in v) return new Date(v.$d as number)
  if ('$ab' in v) return unb64(v.$ab as string).buffer
  if ('$ta' in v) {
    const bytes = unb64(v.b as string)
    const Ctor = (globalThis as unknown as Record<string, new (b: ArrayBuffer) => unknown>)[v.$ta as string] ?? Uint8Array
    return new Ctor(bytes.buffer)
  }
  if ('$m' in v) return new Map((v.$m as Json[][]).map(([a, b]) => [dec(a), dec(b)]))
  if ('$s' in v) return new Set((v.$s as Json[]).map(dec))
  const src = ('$o' in v ? v.$o : v) as { [k: string]: Json }
  const o: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(src)) o[k] = dec(x)
  return o
}

async function pack(data: unknown) {
  const text = JSON.stringify(enc(data))
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return { packed: b64(new Uint8Array(await new Response(stream).arrayBuffer())), size: text.length }
}

async function unpack(packed: string) {
  const stream = new Blob([unb64(packed)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return dec(JSON.parse(await new Response(stream).text()))
}

// ---- desk calls -------------------------------------------------------------------

export interface CloudVersion {
  ver: string
  size: number
}

function getCloud(game: string, ver?: string) {
  return call<{ ver: string; size: number; data: string }>('cloudGet', { ...authFields(), game, ver })
}

function putCloud(game: string, base: string, data: string, size: number, force: boolean) {
  return call<{ ver: string; conflict?: boolean; size?: number }>('cloudPut', { ...authFields(), game, base, data, size, force })
}

export async function listCloud() {
  const r = await call<{ games: Record<string, CloudVersion[]> }>('cloudList', authFields())
  return r.games
}

export async function revertCloud(game: string, ver: string) {
  return (await call<{ ver: string }>('cloudRevert', { ...authFields(), game, ver })).ver
}

// ---- the player side --------------------------------------------------------------

interface Hello {
  ver: string
  dirty: boolean
  at: string
  hasData: boolean
}

/**
 * Runs cloud sync for the game in `frame`. Returns the status to show, a
 * conflict to ask about (Steam's "클라우드 동기화 충돌" dialog), and flush(),
 * which saves the latest state before leaving.
 */
export function useCloudSync(gameId: string | undefined, frame: RefObject<HTMLIFrameElement | null>, origin: string) {
  const loggedIn = useStore((s) => !!s.session)
  const [status, setStatus] = useState<CloudStatus>('none')
  const [savedAt, setSavedAt] = useState('')
  const [conflict, setConflict] = useState<CloudConflict | null>(null)
  const flushRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    if (!gameId) return
    const game = gameId
    let alive = true
    const post = (m: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(m, origin)
    const cloudP = loggedIn ? getCloud(game) : null
    cloudP?.catch(() => {})

    let base = ''
    let force = false
    let pending: { seq: number; data: unknown } | null = null
    let uploading = false
    let last = 0
    let timer = 0
    let stopped = false // after a mid-game conflict the user chose to leave alone
    let flushWaiters: (() => void)[] = []
    const settle = () => {
      flushWaiters.splice(0).forEach((f) => f())
    }

    const restore = async (c: { ver: string; data: string }) => {
      const data = await unpack(c.data)
      base = c.ver
      post({ skeam: 'cloud-restore', ver: c.ver, data })
    }

    const kick = async (urgent = false) => {
      clearTimeout(timer)
      if (uploading || !pending || stopped) return
      const wait = last + MIN_GAP - Date.now()
      if (wait > 0 && !urgent) {
        timer = window.setTimeout(() => kick(), wait)
        return
      }
      uploading = true
      const { seq, data } = pending
      pending = null
      if (alive) setStatus('saving')
      try {
        const { packed, size } = await pack(data)
        if (packed.length > MAX) {
          if (alive) setStatus('toolarge')
          toast({ title: 'SKEAM 클라우드', body: '세이브 데이터가 너무 커서 클라우드에 올리지 못했어요 (최대 약 1.5MB).', glyph: '☁' })
          stopped = true
          return
        }
        const r = await putCloud(game, base, packed, size, force)
        if (r.conflict) {
          stopped = true
          if (alive) {
            setStatus('conflict')
            setConflict({
              cloudAt: r.ver,
              cloudSize: r.size ?? 0,
              localAt: new Date().toISOString(),
              midGame: true,
              choose: (useCloud) => {
                setConflict(null)
                if (useCloud) {
                  setStatus('synced') // next launch loads the cloud copy (this device stays "changed")
                  return
                }
                force = true
                stopped = false
                pending = { seq, data }
                kick(true)
              },
            })
          }
          return
        }
        base = r.ver
        force = false
        last = Date.now()
        post({ skeam: 'cloud-saved', ver: r.ver, seq })
        if (alive) {
          setStatus('synced')
          setSavedAt(r.ver)
        }
      } catch (e) {
        if (alive) setStatus('error')
        pending ??= { seq, data } // try again later
        timer = window.setTimeout(() => kick(), MIN_GAP)
        console.warn('SKEAM cloud upload failed', e)
      } finally {
        uploading = false
        settle()
        if (pending && !stopped) kick()
      }
    }

    const decide = async (h: Hello) => {
      if (!cloudP) {
        post({ skeam: 'cloud-off' })
        setStatus('off')
        return
      }
      post({ skeam: 'cloud-wait' })
      setStatus('checking')
      let c: { ver: string; size: number; data: string }
      try {
        c = await cloudP
      } catch {
        post({ skeam: 'cloud-off' })
        if (alive) setStatus('error')
        return
      }
      if (!alive) return
      if (!c.ver) {
        post({ skeam: 'cloud-ready', upload: h.hasData })
        setStatus('synced')
      } else if (h.ver === c.ver) {
        base = c.ver
        post({ skeam: 'cloud-ready', upload: h.dirty })
        setStatus('synced')
        setSavedAt(c.ver)
      } else if (!h.hasData || (h.ver && !h.dirty)) {
        // New device, or this device hasn't changed since an older cloud copy.
        await restore(c)
      } else {
        setStatus('conflict')
        setConflict({
          cloudAt: c.ver,
          cloudSize: c.size,
          localAt: h.at,
          midGame: false,
          choose: async (useCloud) => {
            setConflict(null)
            if (useCloud) return restore(c)
            base = c.ver
            force = true
            post({ skeam: 'cloud-ready', upload: true })
            setStatus('synced')
          },
        })
      }
    }

    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data || typeof e.data !== 'object') return
      const m = e.data as { skeam?: string } & Record<string, unknown>
      if (m.skeam === 'cloud-hello') decide(m as unknown as Hello)
      else if (m.skeam === 'cloud-snapshot') {
        pending = { seq: Number(m.seq) || 0, data: m.data }
        kick(!last || flushWaiters.length > 0)
      } else if (m.skeam === 'cloud-clean') settle()
      else if (m.skeam === 'cloud-gaveup' && alive) setStatus('error')
    }
    window.addEventListener('message', onMsg)

    flushRef.current = () =>
      new Promise<void>((resolve) => {
        if (!loggedIn || stopped) return resolve()
        flushWaiters.push(resolve)
        post({ skeam: 'cloud-flush' })
        setTimeout(resolve, 8000)
      })

    return () => {
      alive = false
      window.removeEventListener('message', onMsg)
      clearTimeout(timer)
      // Leaving the player: send whatever is waiting now instead of in a minute.
      if (pending && !uploading && !stopped) kick(true)
      flushWaiters = []
    }
  }, [gameId, loggedIn, frame, origin])

  const flush = useCallback(() => flushRef.current(), [])
  return { status, savedAt, conflict, flush }
}
