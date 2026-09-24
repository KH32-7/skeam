export function won(n: number) {
  if (n === 0) return '무료'
  const s = Number.isInteger(n) ? n.toLocaleString('ko-KR') : n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `₩ ${s}`
}

export function walletWon(n: number) {
  return won(n) === '무료' ? '₩ 0' : won(n)
}

export function koDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** "2026-10-15" → 2026년 10월 15일, "2026-10" → 2026년 10월, "" → 출시일 미정 */
export function koRelease(release: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(release)) return koDate(release)
  const m = release.match(/^(\d{4})-(\d{2})$/)
  if (m) return `${m[1]}년 ${Number(m[2])}월`
  return '출시일 미정'
}

export function shortDate(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return '오늘'
  return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}월 ${d.getDate()}일` : koDate(d.toISOString())
}

export function hours(sec: number) {
  if (sec < 60) return `${Math.round(sec)}초`
  if (sec < 3600) return `${Math.round(sec / 60)}분`
  return `${(sec / 3600).toFixed(1)}시간`
}

export const platformLabel = { web: '브라우저에서 플레이', windows: 'Windows 다운로드', both: '브라우저 · Windows' } as const

/** Platform line for a game; a coming-soon game with no files yet has none. */
export function platformText(g: { platform: keyof typeof platformLabel; comingSoon?: boolean; playUrl: string; download: string; repo: string }) {
  if (g.comingSoon && !g.playUrl && !g.download && !g.repo) return '출시 예정'
  return platformLabel[g.platform]
}
