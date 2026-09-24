import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Reviews, reviewLabel, useReviews } from '../components/Reviews'
import { StoreNav } from '../components/StoreNav'
import { Loading, Price, Tags } from '../components/ui'
import { useGame } from '../data/api'
import { koDate, koRelease, platformText } from '../format'
import { NONE, toggleWishlist, useStore } from '../state/store'
import type { Game } from '../types'
import { developerPath } from './Developer'

function youtubeId(url: string) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)
  return m?.[1] ?? null
}

export default function AppPage() {
  const { id } = useParams()
  const { game, data } = useGame(id)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])
  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        {!data ? (
          <Loading />
        ) : !game ? (
          <div className="empty-state">
            <h3>게임을 찾을 수 없습니다</h3>
            <Link to="/">상점으로 돌아가기</Link>
          </div>
        ) : (
          <App g={game} endpoint={data.site.registerEndpoint} />
        )}
      </div>
    </div>
  )
}

function App({ g, endpoint }: { g: Game; endpoint: string }) {
  const { reviews } = useReviews(endpoint, g.id)
  const label = reviews ? reviewLabel(reviews.filter((r) => r.recommend).length, reviews.length) : null
  const owned = useStore((s) => s.owned[g.id])
  const wished = useStore((s) => s.wishlist.includes(g.id))
  const achieved = useStore((s) => s.achievements[g.id] ?? NONE)
  const nav = useNavigate()

  return (
    <>
      <div className="crumbs">
        <Link to="/search">모든 게임</Link> &gt; {g.tags[0] && <Link to={`/search?tag=${encodeURIComponent(g.tags[0])}`}>{g.tags[0]}</Link>} &gt; {g.title}
      </div>
      <h1 className="app-title">{g.title}</h1>

      <div className="app-top">
        <Media g={g} />
        <div className="app-side">
          <img className="header" src={g.images.header} alt="" />
          <p className="desc">{g.short}</p>
          <div className="meta-grid">
            {endpoint && (
              <>
                <span>모든 평가:</span>
                <span className={`v review-${label?.cls ?? ''}`}>
                  {label ? `${label.text} (${reviews!.length})` : '…'}
                </span>
              </>
            )}
            <span>플랫폼:</span>
            <span className="v pos">{platformText(g)}</span>
            <span>출시일:</span>
            <span className="v">{g.comingSoon ? `${koRelease(g.release)} (출시 예정)` : koDate(g.release)}</span>
            <span>제작자:</span>
            <span className="v">
              <Link to={developerPath(g.developer)}>{g.developer}</Link>
            </span>
            {g.engine && (
              <>
                <span>엔진:</span>
                <span className="v">{g.engine}</span>
              </>
            )}
            {g.version && (
              <>
                <span>버전:</span>
                <span className="v">{g.version}</span>
              </>
            )}
          </div>
          <div className="tags-row">
            이 제품의 인기 태그:
            <div style={{ marginTop: 4 }}>
              <Tags tags={g.tags} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0 0' }}>
        <button className="btn-blue" onClick={() => toggleWishlist(g.id, g.comingSoon)}>
          {wished ? '✓ 찜 목록에 있음' : '찜 목록에 추가'}
        </button>
        {g.repo && (
          <a className="btn-gray" href={g.repo} target="_blank" rel="noreferrer">
            GitHub 레포
          </a>
        )}
      </div>

      <div className="app-body">
        <div>
          {g.comingSoon ? (
            <div className="buy-box">
              <h2>{g.title} 출시 예정</h2>
              <div className="plat">출시일: {koRelease(g.release)}</div>
              <div className="plat" style={{ marginTop: 6 }}>찜 목록에 추가하면 출시될 때 알림으로 알려 드려요.</div>
              <div className="buy-action">
                <button className={wished ? 'btn-gray' : 'btn-green'} onClick={() => toggleWishlist(g.id, true)}>
                  {wished ? '✓ 찜 목록에 있음' : '★ 찜 목록에 추가'}
                </button>
              </div>
            </div>
          ) : owned ? (
            <div className="owned-banner">
              <span>
                <span className="badge">SKEAM에 있음</span>
                {g.title}이(가) 라이브러리에 있습니다
              </span>
              <button className="btn-play" style={{ height: 36, fontSize: 16, padding: '0 20px' }} onClick={() => nav(`/library/${g.id}`)}>
                {g.platform === 'windows' ? '라이브러리에서 설치' : '▶ 플레이'}
              </button>
            </div>
          ) : (
            <div className="buy-box">
              <h2>{g.price === 0 ? `${g.title} 무료로 받기` : `${g.title} 구매`}</h2>
              <div className="plat">{platformText(g)}</div>
              {g.discount > 0 && <div className="plat" style={{ color: '#beee11' }}>특별 할인 중!</div>}
              <div className="buy-action">
                <Price game={g} />
                <button className="btn-green" onClick={() => nav(`/checkout/${g.id}`)}>
                  {g.price === 0 ? '라이브러리에 추가' : '구매하기'}
                </button>
              </div>
            </div>
          )}

          {g.news.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h3 className="block-head">최근 업데이트</h3>
              <div className="news-item">
                <div className="kind">
                  {koDate(g.news[0].date)} {g.news[0].version && `· v${g.news[0].version}`}
                </div>
                <h4>{g.news[0].title}</h4>
                <div className="body about" dangerouslySetInnerHTML={{ __html: g.news[0].html }} />
              </div>
            </div>
          )}

          <h3 className="block-head">게임 정보</h3>
          <div className="about" dangerouslySetInnerHTML={{ __html: g.aboutHtml || `<p>${g.short}</p>` }} />

          {g.controls && (
            <>
              <h3 className="block-head" style={{ marginTop: 28 }}>
                조작법
              </h3>
              <div className="about">{g.controls}</div>
            </>
          )}

          <h3 className="block-head" style={{ marginTop: 28 }}>
            AI 제작 정보
          </h3>
          <div className="ai-box">
            <div>
              <div className="k">사용한 AI 도구</div>
              <div className="v">{g.aiTools.length ? g.aiTools.join(', ') : '적지 않음'}</div>
            </div>
            <div>
              <div className="k">제작 기간</div>
              <div className="v">{g.devPeriod || '적지 않음'}</div>
            </div>
            {g.engine && (
              <div>
                <div className="k">엔진·도구</div>
                <div className="v">{g.engine}</div>
              </div>
            )}
            <div>
              <div className="k">실행 환경</div>
              <div className="v">{g.platform === 'windows' ? `Windows 64비트${g.downloadSize ? ` · ${g.downloadSize}` : ''}` : '최신 크롬·엣지 브라우저'}</div>
            </div>
            {g.aiNote && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="k">제작 후기</div>
                <div className="v">“{g.aiNote}”</div>
              </div>
            )}
          </div>

          <Reviews endpoint={endpoint} gameId={g.id} title={g.title} />
        </div>

        <aside>
          <div className="side-block">
            <div className="plat-badge">
              <span className="ico">{g.platform === 'windows' ? '⊞' : '◎'}</span>
              <span>
                <b>{platformText(g)}</b>
                {g.platform === 'windows' ? '구매 후 라이브러리에서 설치' : '설치 없이 바로 실행'}
              </span>
            </div>
          </div>
          {g.achievements.length > 0 && (
            <div className="side-block">
              <h4>SKEAM 도전 과제 {g.achievements.length}개</h4>
              <div className="ach-grid">
                {g.achievements.slice(0, 8).map((a) => (
                  <div key={a.id} className={`ach-icon ${achieved[a.id] ? '' : 'locked'}`} title={`${a.name}\n${a.desc}`}>
                    {a.icon ? <img src={a.icon} alt="" /> : '🏆'}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="side-block">
            <h4>제작자</h4>
            <Link to={developerPath(g.developer)}>{g.developer}</Link>의 다른 게임 보기
          </div>
          <div className="side-block">
            <h4>공유</h4>
            <ShareBox g={g} />
          </div>
        </aside>
      </div>
    </>
  )
}

function Media({ g }: { g: Game }) {
  const vid = g.video ? youtubeId(g.video) : null
  const items = [...(vid ? [{ kind: 'video' as const, src: vid }] : []), ...g.images.screenshots.map((s) => ({ kind: 'img' as const, src: s }))]
  if (!items.length) items.push({ kind: 'img', src: g.images.header })
  const [i, setI] = useState(0)
  const cur = items[Math.min(i, items.length - 1)]
  return (
    <div>
      <div className="media-main">
        {cur.kind === 'video' ? (
          <iframe src={`https://www.youtube-nocookie.com/embed/${cur.src}?rel=0`} title="영상" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
        ) : (
          <img src={cur.src} alt="" />
        )}
      </div>
      {items.length > 1 && (
        <div className="media-strip">
          {items.map((m, j) => (
            <button key={m.src} className={j === i ? 'on' : ''} onClick={() => setI(j)}>
              <img src={m.kind === 'video' ? `https://i.ytimg.com/vi/${m.src}/mqdefault.jpg` : m.src} alt="" />
              {m.kind === 'video' && <span className="play-ico">▶</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ShareBox({ g }: { g: Game }) {
  const url = `${location.origin}${location.pathname}#/app/${g.id}`
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const toggleQr = async () => {
    if (qr) return setQr(null)
    const QR = await import('qrcode')
    setQr(await QR.toDataURL(url, { width: 400, margin: 1 }))
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn-gray"
          onClick={() => {
            navigator.clipboard?.writeText(url)
            setCopied(true)
          }}
        >
          {copied ? '복사됨' : '링크 복사'}
        </button>
        <button className="btn-gray" onClick={toggleQr}>
          QR 코드
        </button>
      </div>
      {qr && <img style={{ marginTop: 10, width: 200 }} src={qr} alt={`${g.title} QR 코드`} />}
    </div>
  )
}
