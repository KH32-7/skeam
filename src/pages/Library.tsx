import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { newsKey } from '../components/Chrome'
import { Loading, Modal, toast } from '../components/ui'
import { useData } from '../data/api'
import { hours, koDate, shortDate } from '../format'
import { listCloud, revertCloud, useRememberedCloud, type CloudStatus, type CloudVersion } from '../state/cloud'
import { markLaunched, markNewsSeen, NONE, unlockAchievement, useStore, type Owned } from '../state/store'
import type { Game } from '../types'

export function needsUpdate(g: Game, o: Owned | undefined) {
  return !!(o?.downloadedVersion && g.version && o.downloadedVersion !== g.version && g.platform !== 'web')
}

export default function Library() {
  const { id } = useParams()
  const { data } = useData()
  const owned = useStore((s) => s.owned)
  const [q, setQ] = useState('')

  const mine = useMemo(() => (data ? data.games.filter((g) => owned[g.id]) : []), [data, owned])

  const groups = useMemo(() => {
    const f = mine.filter((g) => g.title.toLowerCase().includes(q.toLowerCase()))
    const recent = f.filter((g) => owned[g.id].lastPlayed > Date.now() - 14 * 86400000).sort((a, b) => owned[b.id].lastPlayed - owned[a.id].lastPlayed)
    const rest = f.filter((g) => !recent.includes(g))
    const byMonth = new Map<string, Game[]>()
    for (const g of rest.sort((a, b) => owned[b.id].purchasedAt - owned[a.id].purchasedAt)) {
      const d = new Date(owned[g.id].purchasedAt)
      const k = `${d.getFullYear()}년 ${d.getMonth() + 1}월`
      byMonth.set(k, [...(byMonth.get(k) ?? []), g])
    }
    return [['최근', recent] as const, ...byMonth.entries()].filter(([, gs]) => gs.length)
  }, [mine, owned, q])

  if (!data) return <Loading />
  const current = id ? mine.find((g) => g.id === id) : undefined

  return (
    <div className="library">
      <aside className="lib-side">
        <Link className={`home ${!id ? 'on' : ''}`} to="/library">
          홈 <span>▦</span>
        </Link>
        <div className="filter">
          <input placeholder="게임 및 소프트웨어 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {mine.length === 0 && (
          <div className="empty">
            아직 게임이 없습니다.
            <br />
            <Link to="/">상점에서 게임 찾기</Link>
          </div>
        )}
        {groups.map(([label, gs]) => (
          <div key={label}>
            <div className="group">
              — {label} <small>({gs.length})</small>
            </div>
            {gs.map((g) => (
              <Link key={g.id} className={`game ${g.id === id ? 'on' : ''}`} to={`/library/${g.id}`}>
                <img src={g.images.capsule} alt="" />
                {g.title}
                {needsUpdate(g, owned[g.id]) && <span className="upd"> - 업데이트 대기 상태</span>}
              </Link>
            ))}
          </div>
        ))}
      </aside>
      <main className="lib-main">{current ? <GameView key={current.id} g={current} o={owned[current.id]} /> : <LibHome games={mine} owned={owned} missing={!!id} />}</main>
    </div>
  )
}

function LibHome({ games, owned, missing }: { games: Game[]; owned: Record<string, Owned>; missing: boolean }) {
  const recent = [...games].sort((a, b) => Math.max(owned[b.id].lastPlayed, owned[b.id].purchasedAt) - Math.max(owned[a.id].lastPlayed, owned[a.id].purchasedAt))
  return (
    <div className="lib-home">
      {missing && <div className="notice warn">이 게임은 아직 라이브러리에 없습니다. 상점에서 먼저 받아 주세요.</div>}
      {games.length === 0 ? (
        <div className="empty-state">
          <h3>라이브러리가 비어 있습니다</h3>
          <p>상점에서 게임을 사면 여기에 모입니다. 지갑이 비었다면 먼저 자금을 추가하세요.</p>
          <Link className="btn-green" to="/">
            상점 둘러보기
          </Link>
        </div>
      ) : (
        <>
          <h3>최근 게임</h3>
          <div className="shelf">
            {recent.map((g) => (
              <Link key={g.id} to={`/library/${g.id}`}>
                <div className="cap">
                  <img src={g.images.capsule} alt="" />
                  <span className="cap-title">{g.title}</span>
                </div>
                <div className="when">{owned[g.id].lastPlayed ? shortDate(owned[g.id].lastPlayed) : '새로 추가됨'}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function GameView({ g, o }: { g: Game; o: Owned }) {
  const nav = useNavigate()
  const [install, setInstall] = useState(false)
  const [menu, setMenu] = useState(false)
  const achieved = useStore((s) => s.achievements[g.id] ?? NONE)
  const upd = needsUpdate(g, o)
  const got = g.achievements.filter((a) => achieved[a.id])

  const play = () => {
    if (g.news[0]) markNewsSeen(g.id, newsKey(g.news[0]))
    nav(`/play/${g.id}`)
  }

  return (
    <div>
      <div className="lib-hero">
        <img src={g.images.hero} alt="" />
        {g.images.logo ? <img className="logo" src={g.images.logo} alt={g.title} /> : <div className="logo-text">{g.title}</div>}
      </div>
      <div className="lib-bar">
        {g.platform === 'windows' ? (
          <button className={`btn-play ${upd ? 'update' : o.downloadedVersion ? '' : 'install'}`} onClick={() => setInstall(true)}>
            {upd ? '⟳ 업데이트' : o.downloadedVersion ? '⬇ 다시 받기' : '⬇ 설치'}
          </button>
        ) : (
          <div className="play-split">
            <button className="btn-play" onClick={play}>
              <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">
                <path d="M2 1.5v17L17 10z" fill="currentColor" />
              </svg>
              플레이
            </button>
            <button className="btn-play caret" title="다른 방법으로 실행" onClick={() => setMenu((v) => !v)}>
              <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
                <path d="M0 0h12L6 8z" fill="currentColor" />
              </svg>
            </button>
            {menu && (
              <div className="play-menu" onMouseLeave={() => setMenu(false)}>
                <button onClick={play}>▶ SKEAM에서 플레이</button>
                {g.playUrl && <button onClick={() => (setMenu(false), window.open(g.playUrl, '_blank'))}>↗ 새 탭에서 열기 (클라우드 저장 안 됨)</button>}
                {g.platform === 'both' && <button onClick={() => (setMenu(false), setInstall(true))}>⬇ Windows 버전 받기</button>}
              </div>
            )}
          </div>
        )}
        {g.platform === 'windows' ? (
          <>
            <LibStat icon="disk" label="필요한 공간" value={g.downloadSize || '-'} />
            <LibStat icon="tag" label="최신 버전" value={g.version ? `v${g.version}` : '-'} />
            <LibStat icon="check" label="받은 버전" value={o.downloadedVersion ? `v${o.downloadedVersion}` : '아직 안 받음'} />
          </>
        ) : (
          <>
            <CloudStat g={g} />
            <LibStat label="마지막 플레이" value={o.lastPlayed ? shortDate(o.lastPlayed) : '아직 안 함'} />
            <LibStat icon="clock" label="플레이 시간" value={hours(o.playtime)} />
          </>
        )}
        {g.achievements.length > 0 && (
          <LibStat icon="medal" label="도전 과제" value={`${got.length}/${g.achievements.length}`}>
            <div className="ach-bar">
              <i style={{ width: `${(got.length / g.achievements.length) * 100}%` }} />
            </div>
          </LibStat>
        )}
      </div>
      <div className="lib-links">
        <Link to={`/app/${g.id}`}>상점 페이지</Link>
        <a href="#news" onClick={(e) => (e.preventDefault(), document.getElementById('news')?.scrollIntoView({ behavior: 'smooth' }))}>
          패치 노트
        </a>
        {g.repo && (
          <a href={g.repo} target="_blank" rel="noreferrer">
            GitHub
          </a>
        )}
        {g.playUrl && (
          <a href={g.playUrl} target="_blank" rel="noreferrer">
            새 탭에서 열기
          </a>
        )}
      </div>
      <div className="lib-cols">
        <div id="news">
          <div className="lib-card">
            <h4>활동</h4>
            <div className="news-item">
              <div className="kind">{shortDate(o.purchasedAt)}</div>
              {g.title}을(를) {o.paid ? `${o.paid.toLocaleString('ko-KR')}원에 구매` : '라이브러리에 추가'}했습니다.
            </div>
          </div>
          <div className="lib-card">
            <h4>최신 뉴스 · 패치 노트</h4>
            {g.news.length === 0 && <div style={{ color: '#8b929a' }}>아직 올라온 업데이트가 없습니다.</div>}
            {g.news.map((n) => (
              <div key={newsKey(n)} className="news-item">
                <div className="kind">
                  일반 업데이트 · {koDate(n.date)} {n.version && `· v${n.version}`}
                </div>
                <h4>{n.title}</h4>
                {n.image && <img src={n.image} alt="" style={{ maxWidth: 360, margin: '6px 0' }} />}
                <div className="body about" dangerouslySetInnerHTML={{ __html: n.html }} />
              </div>
            ))}
          </div>
        </div>
        <div>
          {g.achievements.length > 0 && <Achievements g={g} achieved={achieved} />}
          {g.playUrl && <CloudCard g={g} />}
          <div className="lib-card">
            <h4>게임 정보</h4>
            <div>제작: {g.developer}</div>
            <div>출시: {koDate(g.release)}</div>
            {g.controls && <div style={{ marginTop: 6 }}>조작: {g.controls}</div>}
          </div>
        </div>
      </div>
      {install && <InstallModal g={g} onClose={() => setInstall(false)} />}
    </div>
  )
}

// ---- Steam-style stats in the bar under the hero image ----

const ICONS: Record<string, ReactNode> = {
  cloud: <path d="M8 19h10a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 6.1 9.2 5 5 0 0 0 8 19z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5.5l3.5 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  medal: (
    <>
      <path d="M8 13l-3 8 4-1.5L11 22l1-6zM16 13l3 8-4-1.5L13 22l-1-6z" />
      <path d="M12 2l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.1L12 18l-2.2-1.6-2.7.1-.8-2.6L4.1 12.3 5 9.7l-.9-2.6 2.2-1.6.8-2.6 2.7.1z" />
    </>
  ),
  disk: <path d="M4 4h13l3 3v13H4zM7 4v5h9V4M7 14h10v6H7z" fill="none" stroke="currentColor" strokeWidth="2" />,
  tag: <path d="M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  check: <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />,
}

function LibStat({ icon, label, value, badge, children }: { icon?: string; label: string; value: string; badge?: 'ok' | 'bad'; children?: ReactNode }) {
  return (
    <div className="lib-stat">
      {icon && (
        <span className="lib-stat-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {ICONS[icon]}
          </svg>
          {badge && <span className={`lib-stat-badge ${badge}`}>{badge === 'ok' ? '✓' : '!'}</span>}
        </span>
      )}
      <div>
        <span className="lib-stat-label">{label}</span>
        <b>{value}</b>
        {children}
      </div>
    </div>
  )
}

const CLOUD_TEXT: Partial<Record<CloudStatus, string>> = {
  synced: '동기화 완료',
  conflict: '동기화 충돌',
  error: '동기화 실패',
  toolarge: '용량 초과',
  off: '로그인 필요',
}

/** Steam's "클라우드 상태": how the last session here ended, or what the account has in the cloud. */
function CloudStat({ g }: { g: Game }) {
  const loggedIn = useStore((s) => !!s.session)
  const last = useRememberedCloud(g.id)
  const [saved, setSaved] = useState<boolean | null>(null)
  useEffect(() => {
    if (!loggedIn) return
    let alive = true
    listCloud()
      .then((all) => alive && setSaved(!!all[g.id]?.length))
      .catch(() => alive && setSaved(null))
    return () => {
      alive = false
    }
  }, [g.id, loggedIn])
  let text: string
  let badge: 'ok' | 'bad' | undefined
  if (!loggedIn) text = '로그인 필요'
  else if (last && last !== 'off' && CLOUD_TEXT[last]) {
    text = CLOUD_TEXT[last]!
    badge = last === 'synced' ? 'ok' : 'bad'
  } else if (saved) {
    text = '클라우드에 저장됨'
    badge = 'ok'
  } else text = saved === false ? '저장 없음' : '확인 중'
  return <LibStat icon="cloud" label="클라우드 상태" value={text} badge={badge} />
}

const cloudWhen = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const cloudKb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** Steam's "클라우드 상태": when this game was last saved to the account, and older copies to go back to. */
function CloudCard({ g }: { g: Game }) {
  const loggedIn = useStore((s) => !!s.session)
  const [versions, setVersions] = useState<CloudVersion[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!loggedIn) return
    let alive = true
    listCloud()
      .then((all) => alive && setVersions(all[g.id] ?? []))
      .catch(() => alive && setVersions(null))
    return () => {
      alive = false
    }
  }, [g.id, loggedIn])

  const revert = async (v: CloudVersion) => {
    if (!confirm(`${cloudWhen(v.ver)} 저장으로 되돌릴까요? 지금 클라우드 저장은 기록에 남아요.`)) return
    setBusy(true)
    try {
      await revertCloud(g.id, v.ver)
      setVersions((await listCloud())[g.id] ?? [])
      toast({ title: 'SKEAM 클라우드', body: '다음에 게임을 시작하면 이 저장을 불러와요.', glyph: '☁' })
    } catch (e) {
      toast({ title: '되돌리지 못했어요', body: String((e as Error).message ?? e), glyph: '!' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lib-card">
      <h4>SKEAM 클라우드</h4>
      {!loggedIn ? (
        <div style={{ color: '#8b929a', fontSize: 13 }}>로그인하면 세이브 데이터가 클라우드에 저장돼서 다른 기기에서도 이어서 할 수 있어요.</div>
      ) : versions === null ? (
        <div style={{ color: '#8b929a', fontSize: 13 }}>클라우드 상태를 확인하는 중...</div>
      ) : versions.length === 0 ? (
        <div style={{ color: '#8b929a', fontSize: 13 }}>
          아직 클라우드에 저장된 데이터가 없어요. SKEAM SDK를 넣은 웹 게임은 플레이하면 자동으로 저장돼요.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13 }}>
            ☁ 마지막 저장: {cloudWhen(versions[0].ver)} · {cloudKb(versions[0].size)}
          </div>
          {versions.length > 1 && (
            <details style={{ marginTop: 8, fontSize: 13 }}>
              <summary style={{ cursor: 'pointer', color: '#8b929a' }}>이전 저장 {versions.length - 1}개</summary>
              {versions.slice(1).map((v) => (
                <div key={v.ver} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ flex: 1 }}>
                    {cloudWhen(v.ver)} · {cloudKb(v.size)}
                  </span>
                  <button className="btn-gray" style={{ height: 24, fontSize: 12 }} disabled={busy} onClick={() => revert(v)}>
                    이 저장으로 되돌리기
                  </button>
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  )
}

function Achievements({ g, achieved }: { g: Game; achieved: Record<string, number> }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const got = g.achievements.filter((a) => achieved[a.id])
  const hasCodes = g.achievements.some((a) => a.code)
  // Show the game's own code shape, e.g. "RKT-XXXX".
  const sample = g.achievements.find((a) => a.code)?.code ?? ''
  const codeHint = sample.replace(/[A-Z0-9]/gi, (c, i) => (sample.slice(0, i).includes('-') ? 'X' : c)) || 'CODE-XXXX'
  const redeem = () => {
    const a = g.achievements.find((x) => x.code && x.code.toUpperCase() === code.trim().toUpperCase())
    if (!a) return setMsg('맞는 코드가 없습니다.')
    if (!unlockAchievement(g.id, a.id)) return setMsg('이미 달성한 도전 과제입니다.')
    toast({ title: '도전 과제 달성!', body: a.name, icon: a.icon || undefined, glyph: '🏆' })
    setMsg('')
    setCode('')
  }
  return (
    <div className="lib-card">
      <h4>도전 과제</h4>
      <div>
        {got.length}개 달성 / 전체 {g.achievements.length}개 ({Math.round((got.length / g.achievements.length) * 100)}%)
      </div>
      <div className="ach-bar">
        <div style={{ width: `${(got.length / g.achievements.length) * 100}%` }} />
      </div>
      <div className="ach-grid">
        {g.achievements.map((a) => (
          <div key={a.id} className={`ach-icon ${achieved[a.id] ? '' : 'locked'}`} title={`${a.name}\n${a.desc}${achieved[a.id] ? `\n${shortDate(achieved[a.id])} 달성` : ''}`}>
            {a.icon ? <img src={a.icon} alt="" /> : '🏆'}
          </div>
        ))}
      </div>
      {hasCodes && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 2 }}>도전 과제 코드 입력 (Windows판)</div>
          <div style={{ fontSize: 11, color: '#8b929a', marginBottom: 6 }}>다운로드한 게임에서 도전 과제를 달성하면 코드가 나와요. 여기에 넣으면 SKEAM에도 달성돼요.</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && redeem()}
              placeholder={codeHint}
              style={{ flex: 1, padding: '6px 8px', background: '#1c1f25', border: '1px solid #3d4450', color: '#fff', borderRadius: 2 }}
            />
            <button className="btn-gray" onClick={redeem}>
              확인
            </button>
          </div>
          {msg && <div style={{ color: '#e57373', fontSize: 12, marginTop: 4 }}>{msg}</div>}
        </div>
      )}
    </div>
  )
}

function InstallModal({ g, onClose }: { g: Game; onClose: () => void }) {
  if (!g.download)
    return (
      <Modal title="아직 다운로드 파일이 없습니다" onClose={onClose} footer={<button className="btn-gray" onClick={onClose}>닫기</button>}>
        제작자가 아직 Windows 빌드를 올리지 않았습니다. 조금만 기다려 주세요.
      </Modal>
    )
  return (
    <Modal
      title={`${g.title} 설치`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-gray" onClick={onClose}>
            취소
          </button>
          <a
            className="btn-green"
            href={g.download}
            onClick={() => {
              markLaunched(g.id, g.version || 'unknown')
              setTimeout(onClose, 300)
            }}
          >
            ⬇ 다운로드 {g.downloadSize && `(${g.downloadSize})`}
          </a>
        </>
      }
    >
      <ol style={{ paddingLeft: 18, lineHeight: 1.9 }}>
        <li>다운로드한 zip 파일의 압축을 풉니다 (마우스 오른쪽 → 모두 압축 풀기).</li>
        <li>폴더 안의 exe 파일을 더블클릭합니다.</li>
        <li>
          파란 <b style={{ color: '#fff' }}>"Windows의 PC 보호"</b> 창이 뜨면 <b style={{ color: '#fff' }}>추가 정보 → 실행</b>을 누릅니다. 동아리원이 직접 만든 게임이라 서명이
          없어서 뜨는 경고입니다.
        </li>
      </ol>
      <div style={{ fontSize: 12, color: '#8f98a0' }}>
        버전 {g.version || '—'} · 새 버전이 나오면 라이브러리에 "업데이트 대기 상태"가 표시됩니다.
      </div>
    </Modal>
  )
}
