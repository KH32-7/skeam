// Steam store pages for games the club actually shipped on Steam.
//
// `steam: https://store.steampowered.com/app/1234560/...` in game.yml is enough:
// the build asks Steam's store API for the name, description, header image,
// screenshots, trailers, genres, price and release date, and game.yml or the
// game folder only needs what should look different on SKEAM.
//
// The store API has no CORS headers, so browsers can't ask it; the hourly
// build does, which also keeps prices and sales in step with Steam.

const API = 'https://store.steampowered.com/api/appdetails'

/** 1234560 from a store URL, "1234560", a number, or steam://store/1234560. */
export function steamAppId(v) {
  if (v == null || v === '') return null
  const t = String(v).trim()
  const m = t.match(/^\d{1,10}$/) ?? t.match(/(?:\/app\/|steam:\/\/(?:store|run|install)\/)(\d{1,10})/)
  return m ? Number(m[1] ?? m[0]) : null
}

export async function fetchSteam(appid) {
  try {
    const res = await fetch(`${API}?appids=${appid}&l=koreana&cc=kr`, {
      headers: { 'User-Agent': 'skeam-build', 'Accept-Language': 'ko' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { error: `Steam API ${res.status}` }
    const j = (await res.json())?.[appid]
    if (!j?.success || !j.data) return { missing: true }
    return { data: j.data }
  } catch (e) {
    return { error: String(e.message ?? e) }
  }
}

const decode = (s) =>
  String(s ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()

/**
 * Steam's Korean store gives "2016년 2월 26일", "2026년 10월", "2026년 4분기"
 * or "곧 출시 예정"; stores in other languages "26 Feb, 2016".
 * → "2016-02-26", "2026-10", or "" when there is no day or month to go by.
 */
export function steamRelease(text) {
  const t = String(text ?? '')
  const pad = (n) => String(n).padStart(2, '0')
  let m = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/)
  if (m) return `${m[1]}-${pad(m[2])}`
  if (/\d{1,2}.*\d{4}/.test(t) && !/분기|Q\d/i.test(t)) {
    const d = new Date(t + ' UTC')
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return ''
}

/**
 * Steam serves trailers as HLS/DASH streams now (older games may still have
 * mp4). Keep whatever a browser can play.
 */
function movies(list) {
  return (Array.isArray(list) ? list : [])
    .map((m) => ({
      name: decode(m.name),
      thumb: String(m.thumbnail ?? ''),
      mp4: String(m.mp4?.max ?? m.mp4?.['480'] ?? ''),
      hls: String(m.hls_h264 ?? ''),
    }))
    .filter((m) => m.mp4 || m.hls)
}

/** What SKEAM keeps from an appdetails answer; `html` sanitizes Steam's description. */
export function normalizeSteam(appid, d, html) {
  const po = d.price_overview
  return {
    appid,
    url: `https://store.steampowered.com/app/${appid}/`,
    name: decode(d.name),
    developers: (d.developers ?? []).map(String),
    short: decode(d.short_description),
    aboutHtml: html(d.about_the_game || d.detailed_description || ''),
    header: String(d.header_image ?? ''),
    background: String(d.background_raw ?? d.background ?? ''),
    screenshots: (d.screenshots ?? []).map((s) => String(s.path_full ?? '')).filter(Boolean),
    movies: movies(d.movies),
    genres: (d.genres ?? []).map((g) => decode(g.description)).filter(Boolean),
    isFree: Boolean(d.is_free),
    // KRW comes in hundredths, like cents: 1600000 is ₩ 16,000.
    price: po && po.currency === 'KRW' ? Math.round(po.initial / 100) : 0,
    discount: po ? Number(po.discount_percent) || 0 : 0,
    priceText: d.is_free ? '무료' : String(po?.final_formatted ?? ''),
    comingSoon: Boolean(d.release_date?.coming_soon),
    release: steamRelease(d.release_date?.date),
    releaseText: String(d.release_date?.date ?? ''),
    platforms: { windows: !!d.platforms?.windows, mac: !!d.platforms?.mac, linux: !!d.platforms?.linux },
  }
}
