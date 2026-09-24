import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StoreNav } from '../components/StoreNav'
import { Loading, Price } from '../components/ui'
import { useData } from '../data/api'
import { koDate } from '../format'
import { useStore } from '../state/store'
import type { Game } from '../types'

export default function StoreHome() {
  const { data, error } = useData()
  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        {error && <div className="notice err">게임 목록을 불러오지 못했습니다: {error}</div>}
        {!data ? <Loading /> : data.games.length === 0 ? <Empty /> : <Home games={data.games} featuredIds={data.site.featured} />}
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="empty-state">
      <h3>아직 등록된 게임이 없습니다</h3>
      <p>
        첫 번째 게임을 올려 보세요. <Link to="/register">게임 등록하기</Link>
      </p>
    </div>
  )
}

function Home({ games, featuredIds }: { games: Game[]; featuredIds: string[] }) {
  const byNew = useMemo(() => [...games].sort((a, b) => b.release.localeCompare(a.release)), [games])
  const featured = featuredIds.length ? featuredIds.map((id) => games.find((g) => g.id === id)!).filter(Boolean) : byNew.slice(0, 12)
  const deals = games.filter((g) => g.discount > 0)
  const dealsOrNew = deals.length ? deals : byNew.slice(0, 6)

  return (
    <>
      <div className="section-head" style={{ marginTop: 10 }}>
        <h2>특집 및 추천 게임</h2>
        <Link className="btn-more" to="/wallet">
          지갑에 자금 추가
        </Link>
      </div>
      <Carousel games={featured} />

      <div className="section-head">
        <h2>{deals.length ? '할인 및 이벤트' : '새로 올라온 게임'}</h2>
        <Link className="btn-more" to={deals.length ? '/search?sale=1' : '/search?sort=new'}>
          더 보기
        </Link>
      </div>
      <Deals games={dealsOrNew.slice(0, 6)} />

      <TabbedList games={games} />

      <TagBrowse games={games} />
    </>
  )
}

function Carousel({ games }: { games: Game[] }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = games.length
  useEffect(() => {
    if (paused || n < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % n), 6000)
    return () => clearInterval(t)
  }, [paused, n])
  const g = games[i % n]
  const [shot, setShot] = useState<string | null>(null)
  useEffect(() => {
    setShot(null)
  }, [i])
  if (!g) return null
  const main = shot ?? g.images.header
  return (
    <div className="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {n > 1 && (
        <button className="arrow l" aria-label="이전" onClick={() => setI((i - 1 + n) % n)}>
          ‹
        </button>
      )}
      <Link className="feature" to={`/app/${g.id}`}>
        <div className="main">
          <img src={main} alt={g.title} />
        </div>
        <div className="side">
          <h3>{g.title}</h3>
          <div className="thumbs">
            {g.images.screenshots.slice(0, 4).map((s) => (
              <img key={s} src={s} alt="" onMouseEnter={() => setShot(s)} onMouseLeave={() => setShot(null)} />
            ))}
          </div>
          <div className="reason">
            <FeatureReason g={g} />
          </div>
          <div className="price-row">
            <Price game={g} />
          </div>
        </div>
      </Link>
      {n > 1 && (
        <button className="arrow r" aria-label="다음" onClick={() => setI((i + 1) % n)}>
          ›
        </button>
      )}
      <div className="dots">
        {games.map((x, j) => (
          <button key={x.id} className={j === i % n ? 'on' : ''} aria-label={x.title} onClick={() => setI(j)} />
        ))}
      </div>
    </div>
  )
}

function FeatureReason({ g }: { g: Game }) {
  const owned = useStore((s) => !!s.owned[g.id])
  if (owned)
    return (
      <div>
        <b>라이브러리에 있음</b>지금 바로 플레이
      </div>
    )
  const days = (Date.now() - new Date(g.release + 'T00:00:00').getTime()) / 86400000
  if (days <= 14)
    return (
      <div>
        <b>지금 이용 가능</b>
        {koDate(g.release)} 출시
      </div>
    )
  return (
    <div>
      <b>{g.platform === 'windows' ? 'Windows 다운로드' : '브라우저에서 바로 플레이'}</b>
      {g.developer} 제작
    </div>
  )
}

function Deals({ games }: { games: Game[] }) {
  const wish = useStore((s) => s.wishlist)
  return (
    <div className="deals">
      {games.map((g) => (
        <Link key={g.id} className="deal" to={`/app/${g.id}`}>
          <img src={g.images.header} alt="" />
          <span className={`badge ${g.discount ? '' : 'blue'}`}>{g.discount ? '주중 특가' : g.platform === 'windows' ? 'Windows' : '브라우저'}</span>
          {wish.includes(g.id) && <span className="wish-ribbon">★ 찜 목록에 있음</span>}
          <div className="body">
            <span className="title">{g.title}</span>
            <Price game={g} />
          </div>
        </Link>
      ))}
    </div>
  )
}

const TABS = [
  { key: 'new', label: '인기 신규 출시 게임' },
  { key: 'web', label: '브라우저에서 플레이' },
  { key: 'win', label: 'Windows 게임' },
  { key: 'sale', label: '특별 할인' },
  { key: 'free', label: '주목받는 무료 게임' },
] as const

function TabbedList({ games }: { games: Game[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('new')
  const list = useMemo(() => {
    const sorted = [...games].sort((a, b) => b.release.localeCompare(a.release))
    switch (tab) {
      case 'web':
        return sorted.filter((g) => g.platform !== 'windows')
      case 'win':
        return sorted.filter((g) => g.platform !== 'web')
      case 'sale':
        return sorted.filter((g) => g.discount > 0)
      case 'free':
        return sorted.filter((g) => g.price === 0)
      default:
        return sorted
    }
  }, [games, tab])
  const [hover, setHover] = useState(0)
  useEffect(() => {
    setHover(0)
  }, [tab])
  const pv = list[hover]

  return (
    <>
      <div className="tabs-row">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        <div className="tab-list">
          {list.length === 0 && <div className="empty-state">여기에 해당하는 게임이 아직 없습니다.</div>}
          {list.map((g, i) => (
            <Link key={g.id} className={`tab-item ${i === hover ? 'hl' : ''}`} to={`/app/${g.id}`} onMouseEnter={() => setHover(i)}>
              <img src={g.images.header} alt="" />
              <div>
                <div className="t">{g.title}</div>
                <div className="tags">{g.tags.join(', ')}</div>
                <div className="rel">출시: {koDate(g.release)}</div>
              </div>
              <Price game={g} />
            </Link>
          ))}
        </div>
        {pv && (
          <div className="tab-preview">
            <h3>{pv.title}</h3>
            <div className="ai">
              제작 {pv.developer}
              {pv.aiTools.length > 0 && ` · ${pv.aiTools.join(', ')}`}
            </div>
            <div style={{ margin: '8px 0' }}>
              {pv.tags.slice(0, 5).map((t) => (
                <span key={t} className="tag plain">
                  {t}
                </span>
              ))}
            </div>
            {(pv.images.screenshots.length ? pv.images.screenshots : [pv.images.header]).slice(0, 4).map((s) => (
              <img key={s} src={s} alt="" />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function TagBrowse({ games }: { games: Game[] }) {
  const tags = useMemo(() => {
    const m = new Map<string, Game[]>()
    games.forEach((g) => g.tags.forEach((t) => m.set(t, [...(m.get(t) ?? []), g])))
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8)
  }, [games])
  if (!tags.length) return null
  return (
    <>
      <div className="section-head">
        <h2>카테고리별 둘러보기</h2>
      </div>
      <div className="tag-cloud">
        {tags.map(([t, gs]) => (
          <Link key={t} className="tag-card" to={`/search?tag=${encodeURIComponent(t)}`} style={{ backgroundImage: `url(${gs[0].images.screenshots[0] ?? gs[0].images.header})` }}>
            {t}
          </Link>
        ))}
      </div>
    </>
  )
}
