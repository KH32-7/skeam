import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FEATURED_TAGS, PILL_TAGS, TAG_COLUMNS, TINTS } from '../data/tags'
import type { Game } from '../types'

const tagUrl = (t: string) => `/search?tag=${encodeURIComponent(t)}`

/** How many SKEAM games carry each tag. */
export function useTagCounts(games: Game[]) {
  return useMemo(() => {
    const n = new Map<string, number>()
    games.forEach((g) => g.tags.forEach((t) => n.set(t, (n.get(t) ?? 0) + 1)))
    return n
  }, [games])
}

/**
 * Steam's "카테고리" mega menu: six picture cards, a row of tag pills, then
 * every genre and theme in columns (collapsed to three rows until 펼치기).
 * Cards and pills lead with tags SKEAM games actually use, topped up with
 * Steam's defaults.
 */
export function CategoryMenu({ games, onPick }: { games: Game[]; onPick: () => void }) {
  const counts = useTagCounts(games)
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('skeam:catOpen') === '1'
    } catch {
      return false
    }
  })
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem('skeam:catOpen', open ? '0' : '1')
    } catch {
      /* ignore */
    }
  }

  const popular = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  const cards = [...new Set([...popular, ...FEATURED_TAGS.map((f) => f.tag)])].slice(0, 6)
  const pills = [...new Set([...popular.filter((t) => !cards.includes(t)), ...PILL_TAGS])].filter((t) => !cards.includes(t)).slice(0, 12)

  const art = (tag: string, i: number) => {
    const g = games.find((x) => x.tags.includes(tag)) ?? games[i % Math.max(1, games.length)]
    return g ? g.images.screenshots[0] ?? g.images.header : ''
  }
  const tint = (tag: string, i: number) => FEATURED_TAGS.find((f) => f.tag === tag) ?? TINTS[i % TINTS.length]

  const rows = Math.max(...TAG_COLUMNS.map((c) => c.tags.length))

  return (
    <div className="cat-mega" onClick={(e) => (e.target as HTMLElement).closest('a') && onPick()}>
      <div className="cat-head">선호 카테고리</div>
      <div className="cat-cards">
        {cards.map((t, i) => {
          const c = tint(t, i)
          const img = art(t, i)
          return (
            <Link key={t} className="cat-card" to={tagUrl(t)}>
              {img && <img src={img} alt="" />}
              <span className="tint" style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }} />
              <span className="label">{t}</span>
            </Link>
          )
        })}
      </div>
      <div className="cat-pills">
        {pills.map((t) => (
          <Link key={t} className="cat-pill" to={tagUrl(t)}>
            {t}
          </Link>
        ))}
        <Link className="cat-all" to="/tags">
          모든 태그 보기 <b>›</b>
        </Link>
      </div>
      <div className="cat-head row">
        모든 장르 및 테마
        <button className="cat-toggle" onClick={toggle}>
          {open ? '접기' : '펼치기'} <b>{open ? '⌃' : '⌄'}</b>
        </button>
      </div>
      <div className="cat-cols">
        {TAG_COLUMNS.map((col) => (
          <div key={col.name} className="cat-col">
            {col.tags.slice(0, open ? rows : 3).map((t) => (
              <Link key={t} to={tagUrl(t)} className={counts.has(t) ? 'has' : ''}>
                {t}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
