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

export async function fetchSteam(appid, lang = 'koreana') {
  try {
    const res = await fetch(`${API}?appids=${appid}&l=${lang}&cc=kr`, {
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

// ---- popularity ----------------------------------------------------------
//
// Steam games aren't played inside SKEAM, so the club's play numbers never see
// them. The hourly build samples Steam instead: players online right now and
// the review count. data/steam.json keeps a week of samples (carried over from
// the last deploy), and games.json gets the week's summary.

const HOUR = 3600e3
const WEEK = 7 * 24 * HOUR

/** Players in the game right now; null when Steam won't say (not out yet, or down). */
export async function fetchPlayers(appid) {
  try {
    const res = await fetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`, {
      headers: { 'User-Agent': 'skeam-build' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const r = (await res.json())?.response
    return r?.result === 1 && Number.isFinite(r.player_count) ? r.player_count : null
  } catch {
    return null
  }
}

// Steam's review_score 1-9, as the Korean store words it.
const SCORE_KO = ['', '압도적으로 부정적', '매우 부정적', '부정적', '대체로 부정적', '복합적', '대체로 긍정적', '긍정적', '매우 긍정적', '압도적으로 긍정적']

/** All-language review totals: { total, positive, label }; null when Steam won't say. */
export async function fetchReviews(appid) {
  try {
    const res = await fetch(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&filter=recent&num_per_page=0`, {
      headers: { 'User-Agent': 'skeam-build' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const j = await res.json()
    const q = j?.success === 1 ? j.query_summary : null
    if (!q || !Number.isFinite(q.total_reviews)) return null
    return { total: q.total_reviews, positive: q.total_positive ?? 0, label: SCORE_KO[q.review_score] || (q.total_reviews ? `사용자 평가 ${q.total_reviews}개` : '') }
  } catch {
    return null
  }
}

/**
 * Adds this hour's sample to the history and sums up the last 7 days:
 * the most players online at once, and reviews written this week.
 * Samples go back 8 days so there is always one from before the week began.
 */
export function steamPopularity(history, players, reviews, now = Date.now()) {
  const samples = (Array.isArray(history) ? history : []).filter((s) => s && s.t > now - WEEK - 24 * HOUR && s.t < now)
  if (players != null || reviews) samples.push({ t: now, players: players ?? undefined, reviews: reviews?.total })
  const inWeek = samples.filter((s) => s.t >= now - WEEK)
  const peak = Math.max(0, ...inWeek.map((s) => s.players ?? 0))
  const withReviews = samples.filter((s) => s.reviews != null)
  const before = withReviews.filter((s) => s.t <= now - WEEK).pop() ?? withReviews[0]
  const latest = withReviews[withReviews.length - 1]
  return {
    history: samples,
    summary: {
      peak,
      reviews: latest?.reviews ?? 0,
      newReviews: before && latest ? Math.max(0, latest.reviews - before.reviews) : 0,
      positive: reviews ? Math.round((reviews.positive / Math.max(1, reviews.total)) * 100) : null,
      label: reviews?.label ?? '',
    },
  }
}
