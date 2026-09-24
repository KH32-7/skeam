import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../data/api'
import { useStore } from '../state/store'
import { Price } from './ui'

export function StoreNav() {
  const { data } = useData()
  const wish = useStore((s) => s.wishlist.length)
  const nav = useNavigate()
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [hl, setHl] = useState(0)

  const tags = useMemo(() => {
    const count = new Map<string, number>()
    data?.games.forEach((g) => g.tags.forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)))
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [data])

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s || !data) return []
    return data.games
      .filter((g) => [g.title, g.titleEn, g.developer, ...g.tags].some((f) => f.toLowerCase().includes(s)))
      .slice(0, 5)
  }, [q, data])

  const submit = () => {
    if (hits[hl] && q.trim()) nav(`/app/${hits[hl].id}`)
    else nav(`/search?q=${encodeURIComponent(q.trim())}`)
    setQ('')
  }

  const Drop = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
    <div className="item" onMouseEnter={() => setOpen(id)} onMouseLeave={() => setOpen(null)} onClick={() => setOpen(open === id ? null : id)}>
      {label} <span className="caret">▼</span>
      {open === id && (
        <div className="dropdown" onClick={() => setOpen(null)}>
          {children}
        </div>
      )}
    </div>
  )

  return (
    <div className="store-nav">
      <Drop id="home" label="상점">
        <Link to="/">홈</Link>
        <Link to="/search?sort=new">신규 출시</Link>
        <Link to="/wishlist">찜 목록</Link>
        <Link to="/wallet">지갑</Link>
      </Drop>
      <Drop id="new" label="추천 제품">
        <Link to="/search?sort=new">인기 신규 출시</Link>
        <Link to="/search?price=free">무료 게임</Link>
        <Link to="/search?sale=1">특별 할인</Link>
        <Link to="/search?platform=web">브라우저에서 플레이</Link>
        <Link to="/search?platform=windows">Windows 다운로드</Link>
      </Drop>
      <Drop id="cat" label="카테고리">
        {tags.map((t) => (
          <Link key={t} to={`/search?tag=${encodeURIComponent(t)}`}>
            {t}
          </Link>
        ))}
      </Drop>
      <Link className="item" to="/register">
        게임 등록
      </Link>
      <Link className="item" to="/community">
        KING 소개
      </Link>
      <span className="grow" />
      <div className="store-search" style={{ position: 'relative' }}>
        <input
          placeholder="상점 검색"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setHl(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'ArrowDown') setHl((h) => Math.min(h + 1, hits.length - 1))
            if (e.key === 'ArrowUp') setHl((h) => Math.max(h - 1, 0))
            if (e.key === 'Escape') setQ('')
          }}
        />
        <button aria-label="검색" onClick={submit}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.2">
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M10.5 10.5 15 15" />
          </svg>
        </button>
        {hits.length > 0 && (
          <div className="suggest-box">
            {hits.map((g, i) => (
              <Link key={g.id} className={i === hl ? 'hl' : ''} to={`/app/${g.id}`} onClick={() => setQ('')}>
                <img src={g.images.header} alt="" />
                <div>
                  <div>{g.title}</div>
                  <div className="p">
                    <Price game={g} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <Link className="wish" to="/wishlist">
        ★ 찜 목록 <small>{wish}</small>
      </Link>
    </div>
  )
}
