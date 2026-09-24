import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { StoreNav } from '../components/StoreNav'
import { Loading, Price } from '../components/ui'
import { useData } from '../data/api'
import { koDate, koRelease, platformText } from '../format'
import { useStore } from '../state/store'
import type { Game } from '../types'

export default function Search({ wishlistOnly = false }: { wishlistOnly?: boolean }) {
  const { data } = useData()
  const [p, setP] = useSearchParams()
  const wishlist = useStore((s) => s.wishlist)
  const q = p.get('q') ?? ''
  const tag = p.get('tag') ?? ''
  const dev = p.get('dev') ?? ''
  const platform = p.get('platform') ?? ''
  const price = p.get('price') ?? ''
  const sale = p.get('sale') === '1'
  const soon = p.get('soon') === '1'

  const tags = useMemo(() => [...new Set(data?.games.flatMap((g) => g.tags) ?? [])].sort(), [data])

  const list = useMemo(() => {
    if (!data) return []
    let gs: Game[] = [...data.games]
    if (wishlistOnly) gs = gs.filter((g) => wishlist.includes(g.id))
    if (q) gs = gs.filter((g) => [g.title, g.titleEn, g.developer, g.short, ...g.tags].some((f) => f.toLowerCase().includes(q.toLowerCase())))
    if (tag) gs = gs.filter((g) => g.tags.includes(tag))
    if (dev) gs = gs.filter((g) => g.developer === dev)
    if (platform === 'web') gs = gs.filter((g) => g.platform !== 'windows')
    if (platform === 'windows') gs = gs.filter((g) => g.platform !== 'web')
    if (price === 'free') gs = gs.filter((g) => g.price === 0)
    if (sale) gs = gs.filter((g) => g.discount > 0 && !g.comingSoon)
    if (soon) gs = gs.filter((g) => g.comingSoon)
    if (price === 'free') gs = gs.filter((g) => !g.comingSoon)
    return gs.sort((a, b) => b.release.localeCompare(a.release))
  }, [data, q, tag, dev, platform, price, sale, soon, wishlistOnly, wishlist])

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(p)
    if (v) n.set(k, v)
    else n.delete(k)
    setP(n)
  }

  const heading = wishlistOnly ? '내 찜 목록' : tag ? `${tag} 게임` : dev ? `${dev}의 게임` : q ? `"${q}" 검색 결과` : '모든 게임'

  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        <h1 className="page-title" style={{ fontSize: 26 }}>
          {heading}
        </h1>
        {!data ? (
          <Loading />
        ) : (
          <div className="search-layout">
            <div>
              <div style={{ fontSize: 12, color: '#8f98a0', marginBottom: 8 }}>검색어와 일치하는 결과 {list.length}개</div>
              {list.length === 0 && <div className="empty-state">{wishlistOnly ? '찜한 게임이 없습니다.' : '조건에 맞는 게임이 없습니다.'}</div>}
              {list.map((g) => (
                <Link key={g.id} className="search-row" to={`/app/${g.id}`}>
                  <img src={g.images.header} alt="" />
                  <div>
                    <div className="t">{g.title}</div>
                    <div className="plat">
                      {platformText(g)} · {g.developer}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#8f98a0' }}>{g.comingSoon ? `출시 예정 · ${koRelease(g.release)}` : koDate(g.release)}</div>
                  <Price game={g} />
                </Link>
              ))}
            </div>
            {!wishlistOnly && (
              <div>
                <div className="filter-box" style={{ marginBottom: 10 }}>
                  <h4>검색어</h4>
                  <input
                    defaultValue={q}
                    onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)}
                    placeholder="제목, 제작자, 태그"
                    style={{ width: '100%', padding: 6, background: 'rgba(0,0,0,.3)', border: '1px solid #2a475e', color: '#fff' }}
                  />
                </div>
                <div className="filter-box" style={{ marginBottom: 10 }}>
                  <h4>실행 방식</h4>
                  {[
                    ['', '전체'],
                    ['web', '브라우저에서 플레이'],
                    ['windows', 'Windows 다운로드'],
                  ].map(([v, l]) => (
                    <label key={v}>
                      <input type="radio" checked={platform === v} onChange={() => set('platform', v)} /> {l}
                    </label>
                  ))}
                </div>
                <div className="filter-box" style={{ marginBottom: 10 }}>
                  <h4>가격</h4>
                  <label>
                    <input type="checkbox" checked={price === 'free'} onChange={(e) => set('price', e.target.checked ? 'free' : '')} /> 무료만
                  </label>
                  <label>
                    <input type="checkbox" checked={sale} onChange={(e) => set('sale', e.target.checked ? '1' : '')} /> 할인 중
                  </label>
                  <label>
                    <input type="checkbox" checked={soon} onChange={(e) => set('soon', e.target.checked ? '1' : '')} /> 출시 예정만
                  </label>
                </div>
                <div className="filter-box">
                  <h4>태그</h4>
                  {tags.map((t) => (
                    <label key={t}>
                      <input type="checkbox" checked={tag === t} onChange={(e) => set('tag', e.target.checked ? t : '')} /> {t}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
