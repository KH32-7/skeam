import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../data/api'
import { walletWon } from '../format'
import { login, logout, signup } from '../state/account'
import { exportData, importData, markNewsSeen, markReleaseSeen, markReviewsSeen, resetForNextVisitor, setKiosk, setProfile, useStore } from '../state/store'
import { Avatar, AVATAR_COUNT, Modal, toast } from './ui'

export function newsKey(n: { date: string; title: string }) {
  return `${n.date}|${n.title}`
}

interface ReviewAlert {
  game: string
  title: string
  capsule: string
  name: string
  recommend: boolean
  text: string
  time: string
}

let reviewAlertCache: { at: number; list: ReviewAlert[] } | null = null
const reviewAlertListeners = new Set<(l: ReviewAlert[]) => void>()

/**
 * New reviews on games this person made (not written by themselves). Checked
 * when the site opens and every 5 minutes; the first time, only the last week
 * counts so old reviews don't all pop up at once.
 */
export function useReviewAlerts() {
  const { data } = useData()
  const me = useStore((s) => s.session?.name ?? s.profile?.name ?? '')
  const seen = useStore((s) => s.seenReviewsAt ?? '')
  const [all, setAll] = useState<ReviewAlert[]>(reviewAlertCache?.list ?? [])

  useEffect(() => {
    reviewAlertListeners.add(setAll)
    return () => void reviewAlertListeners.delete(setAll)
  }, [])

  useEffect(() => {
    const endpoint = data?.site.registerEndpoint
    if (!data || !endpoint || !me) return
    const mine = data.games.filter((g) => g.developer.toLowerCase() === me.toLowerCase())
    if (!mine.length) return
    const load = async () => {
      if (reviewAlertCache && Date.now() - reviewAlertCache.at < 4 * 60 * 1000) return
      try {
        const j = await fetch(`${endpoint}?action=reviews`).then((r) => r.json())
        if (!j.ok) return
        const list: ReviewAlert[] = j.reviews
          .filter((r: { game: string; name: string }) => mine.some((g) => g.id === r.game) && String(r.name).toLowerCase() !== me.toLowerCase())
          .map((r: { game: string; name: string; recommend: boolean; text: string; time: string }) => {
            const g = mine.find((x) => x.id === r.game)!
            return { game: g.id, title: g.title, capsule: g.images.capsule, name: String(r.name), recommend: !!r.recommend, text: String(r.text), time: String(r.time) }
          })
        reviewAlertCache = { at: Date.now(), list }
        reviewAlertListeners.forEach((l) => l(list))
      } catch {
        /* try again later */
      }
    }
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [data, me])

  const since = seen || new Date(Date.now() - 7 * 86400000).toISOString()
  return all.filter((r) => r.time > since)
}

interface OpenPr {
  number: number
  title: string
  user: string
  url: string
}

/**
 * Open pull requests on the SKEAM repo, for admins (site.yml `admins`) only.
 * A PR still open means it wasn't auto-merged and needs a look.
 */
export function useOpenPrs() {
  const { data } = useData()
  const me = useStore((s) => s.session?.name ?? '')
  const [prs, setPrs] = useState<OpenPr[]>([])
  const admin = !!data && !!me && data.site.admins.some((a) => a.toLowerCase() === me.toLowerCase())
  const repo = data?.site.repo || 'KH32-7/skeam'
  useEffect(() => {
    if (!admin) return
    const load = async () => {
      try {
        const r = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=20`, { cache: 'no-store' })
        if (!r.ok) return
        const list = (await r.json()) as { number: number; title: string; user: { login: string }; html_url: string }[]
        setPrs(list.map((p) => ({ number: p.number, title: p.title, user: p.user.login, url: p.html_url })))
      } catch {
        /* offline */
      }
    }
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [admin, repo])
  return admin ? prs : []
}

/** Games wishlisted while coming soon that have since come out. */
export function useReleased() {
  const { data } = useData()
  const watch = useStore((s) => s.watchRelease)
  if (!data || !watch?.length) return []
  return data.games.filter((g) => watch.includes(g.id) && !g.comingSoon)
}

function useUpdates() {
  const { data } = useData()
  const owned = useStore((s) => s.owned)
  const seen = useStore((s) => s.seenNews)
  if (!data) return []
  return data.games.filter((g) => owned[g.id] && g.news[0] && seen[g.id] !== newsKey(g.news[0]) && g.news[0].date >= new Date(owned[g.id].purchasedAt).toISOString().slice(0, 10))
}

export function Chrome() {
  const profile = useStore((s) => s.profile)
  const wallet = useStore((s) => s.wallet)
  const kiosk = useStore((s) => s.kiosk)
  const nav = useNavigate()
  const loc = useLocation()
  const updates = useUpdates()
  const released = useReleased()
  const reviews = useReviewAlerts()
  const prs = useOpenPrs()
  const alerts = updates.length + released.length + reviews.length + prs.length
  const [menu, setMenu] = useState<'account' | 'bell' | null>(null)
  const isLibrary = loc.pathname.startsWith('/library')
  const isCommunity = loc.pathname.startsWith('/community')
  const isStore = !isLibrary && !isCommunity && !loc.pathname.startsWith('/profile')
  const name = profile?.name ?? (kiosk ? '방문자' : '게스트')

  useEffect(() => {
    setMenu(null)
  }, [loc.pathname])

  // Click anywhere else closes the open dropdown.
  useEffect(() => {
    if (!menu) return
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.account-menu, .account-pill, .chrome-btn.bell, .modal')) setMenu(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menu])

  return (
    <header className="chrome">
      {kiosk && <div className="kiosk-bar">전시회 모드 · 3분 동안 아무 입력이 없으면 다음 방문자를 위해 처음 화면으로 돌아갑니다</div>}
      <div className="chrome-top">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Logo = back to the store front with a full reload, so new games show up. */}
          <a
            className="brand"
            href="./#/"
            title="상점 홈 (새로고침)"
            onClick={(e) => {
              e.preventDefault()
              location.hash = '#/'
              location.reload()
            }}
          >
            <img src="./skeam-icon.svg" alt="" />
            SKEAM
          </a>
        </div>
        <Link className="menu-link" to="/library">
          보기
        </Link>
        <Link className="menu-link" to="/community">
          친구
        </Link>
        <Link className="menu-link" to="/register">
          게임
        </Link>
        <Link className="menu-link" to="/register?guide=1">
          지원
        </Link>
        <span className="spacer" />
        <button className="chrome-btn news" title="새 소식" onClick={() => nav('/search?sort=new')}>
          <svg width="14" height="12" viewBox="0 0 14 12" fill="#fff">
            <path d="M0 4h3l6-4v12L3 8H0zM11 3.5c1.5 1 1.5 4 0 5l-.7-.8c.9-.7.9-2.7 0-3.4z" />
          </svg>
        </button>
        <div style={{ position: 'relative' }}>
          <button className={`chrome-btn bell ${alerts ? 'has' : ''}`} title="알림" onClick={() => setMenu(menu === 'bell' ? null : 'bell')}>
            <svg width="12" height="13" viewBox="0 0 12 13" fill="#fff">
              <path d="M6 0a1 1 0 011 1v.6A4 4 0 0110 5.5V9l1.5 1.5v.5H.5v-.5L2 9V5.5A4 4 0 015 1.6V1a1 1 0 011-1zM4.5 12h3a1.5 1.5 0 01-3 0z" />
            </svg>
            {alerts > 0 && <span className="dot">{alerts}</span>}
          </button>
          {menu === 'bell' && (
            <div className="modal" style={{ position: 'absolute', right: 0, top: 28, width: 320, zIndex: 60 }}>
              <div className="mb">
                {alerts === 0 && <div style={{ color: '#8f98a0' }}>새 알림이 없습니다.</div>}
                {prs.length > 0 && (
                  <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                    <b style={{ color: '#f2c14e', display: 'block', fontSize: 12 }}>SKEAM 레포에 확인할 PR {prs.length}개</b>
                    {prs.map((p) => (
                      <a key={p.number} href={p.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, marginTop: 2, color: '#c7d5e0' }}>
                        #{p.number} {p.title} <span style={{ color: '#8f98a0' }}>· {p.user}</span>
                      </a>
                    ))}
                  </div>
                )}
                {reviews.length > 0 && (
                  <a
                    href={`#/app/${reviews[0].game}?reviews=1`}
                    onClick={() => markReviewsSeen(reviews.map((r) => r.time).sort().pop()!)}
                    style={{ display: 'block', padding: '6px 0', color: '#c7d5e0' }}
                  >
                    <b style={{ color: '#66c0f4', display: 'block', fontSize: 12 }}>내 게임에 새 평가 {reviews.length}개</b>
                    {reviews.slice(0, 3).map((r) => (
                      <span key={r.time + r.name} style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                        {r.recommend ? '👍' : '👎'} <b style={{ color: '#fff' }}>{r.name}</b> · {r.title}: {r.text.slice(0, 40)}
                        {r.text.length > 40 && '…'}
                      </span>
                    ))}
                  </a>
                )}
                {released.map((g) => (
                  <a key={g.id} href={`#/app/${g.id}`} onClick={() => markReleaseSeen([g.id])} style={{ display: 'flex', gap: 10, padding: '6px 0', color: '#c7d5e0' }}>
                    <img src={g.images.header} alt="" style={{ width: 92, height: 43, objectFit: 'cover' }} />
                    <span style={{ fontSize: 12 }}>
                      <b style={{ color: '#a4d007', display: 'block' }}>찜한 게임이 출시됐어요!</b>
                      {g.title}
                    </span>
                  </a>
                ))}
                {updates.map((g) => (
                  <a
                    key={g.id}
                    href={`#/library/${g.id}`}
                    onClick={() => markNewsSeen(g.id, newsKey(g.news[0]))}
                    style={{ display: 'flex', gap: 10, padding: '6px 0', color: '#c7d5e0' }}
                  >
                    <img src={g.images.header} alt="" style={{ width: 92, height: 43, objectFit: 'cover' }} />
                    <span style={{ fontSize: 12 }}>
                      <b style={{ color: '#fff', display: 'block' }}>{g.title} 업데이트</b>
                      {g.news[0].title}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button className={`account-pill ${menu === 'account' ? 'open' : ''}`} onClick={() => setMenu(menu === 'account' ? null : 'account')}>
            <Avatar className="avatar" name={name} index={profile?.avatar ?? 7} size={22} />
            {name} <span className="caret">▾</span> <span className="bal">{walletWon(wallet)}</span>
          </button>
          {menu === 'account' && <AccountMenu name={name} close={() => setMenu(null)} />}
        </div>
      </div>
      <nav className="chrome-nav">
        <div className="arrows">
          <button aria-label="뒤로" onClick={() => nav(-1)}>
            ←
          </button>
          <button aria-label="앞으로" onClick={() => nav(1)}>
            →
          </button>
        </div>
        <NavLink className={`tab ${isStore ? 'active' : ''}`} to="/">
          상점
        </NavLink>
        <NavLink className={`tab ${isLibrary ? 'active' : ''}`} to="/library">
          라이브러리
        </NavLink>
        <NavLink className={`tab ${isCommunity ? 'active' : ''}`} to="/community">
          커뮤니티
        </NavLink>
        <NavLink className={({ isActive }) => `tab user ${isActive ? 'active' : ''}`} to="/profile">
          {name}
        </NavLink>
      </nav>
    </header>
  )
}

/** The account pill's dropdown: profile first, logout last. */
function AccountMenu({ name, close }: { name: string; close: () => void }) {
  const kiosk = useStore((s) => s.kiosk)
  const session = useStore((s) => s.session)
  const fileRef = useRef<HTMLInputElement>(null)
  const item = { display: 'block', width: '100%', padding: '7px 14px', background: 'none', border: 'none', color: '#dcdedf', textAlign: 'left' as const, fontSize: 13 }

  const download = () => {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'skeam-내데이터.json'
    a.click()
    close()
  }

  return (
    <div className="account-menu">
      <Link style={{ ...item, color: '#fff', fontWeight: 700 }} to="/profile" onClick={close}>
        내 프로필 ({name})
      </Link>
      <div className="sep" />
      <Link style={item} to="/wallet" onClick={close}>
        지갑에 자금 추가
      </Link>
      <Link style={item} to="/register" onClick={close}>
        게임 등록 / 수정
      </Link>
      <button
        style={item}
        onClick={() => {
          if (kiosk) setKiosk(false)
          else if (confirm('전시회 모드를 켤까요? 지금 브라우저의 SKEAM 데이터가 초기화되고, 방문자마다 ₩50,000이 지급됩니다.')) resetForNextVisitor()
          close()
        }}
      >
        전시회 모드 {kiosk ? '끄기' : '켜기'}
      </button>
      <button style={item} onClick={download}>
        내 데이터 내보내기
      </button>
      <button style={item} onClick={() => fileRef.current?.click()}>
        내 데이터 불러오기
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          try {
            importData(await f.text())
            alert('불러왔습니다.')
          } catch (err) {
            alert(String(err))
          }
          close()
        }}
      />
      {session && (
        <button
          style={{ ...item, borderTop: '1px solid rgba(255,255,255,.1)' }}
          onClick={() => {
            if (confirm(`${session.name} 계정에서 로그아웃할까요? 이 기기에 남은 기록은 지워지고, 다시 로그인하면 돌아와요.`)) logout()
            close()
          }}
        >
          로그아웃 ({session.name})
        </button>
      )}
    </div>
  )
}

export function BottomBar() {
  const owned = useStore((s) => Object.keys(s.owned).length)
  return (
    <footer className="bottom-bar">
      <Link to="/register">
        <span className="plus">+</span>게임 추가
      </Link>
      <div className="center">
        <Link to="/library">
          다운로드 - {owned}개 중 {owned}개 완료
        </Link>
      </div>
      <Link to="/community">친구 및 채팅</Link>
    </footer>
  )
}

/** First visit: pick a nickname and avatar, like making a Steam account. */
/**
 * First visit (or an old nickname-only profile): make a SKEAM account or log
 * in. Without a registration desk the site falls back to a nickname kept in
 * this browser only.
 */
export function ProfileGate() {
  const profile = useStore((s) => s.profile)
  const session = useStore((s) => s.session)
  const kiosk = useStore((s) => s.kiosk)
  const { data } = useData()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [name, setName] = useState(profile?.name ?? '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [avatar, setAvatar] = useState(() => profile?.avatar ?? Math.floor(Math.random() * AVATAR_COUNT))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (profile?.name && !name) setName(profile.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.name])

  if (kiosk || session || !data) return null
  const desk = !!data.site.registerEndpoint

  // No desk: the old local-only nickname.
  if (!desk) {
    if (profile) return null
    const ok = name.trim().length > 0
    return (
      <Modal title="SKEAM에 오신 것을 환영합니다" footer={<button className="btn-green" disabled={!ok} onClick={() => setProfile(name.trim().slice(0, 20), avatar)}>시작하기</button>}>
        <div className="field">
          <label>닉네임</label>
          <input autoFocus value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="예: KH327" />
        </div>
      </Modal>
    )
  }

  const existing = !!profile // made a nickname before accounts existed
  const signupOk = name.trim().length > 0 && pw.length >= 4 && pw === pw2
  const loginOk = name.trim().length > 0 && pw.length >= 4

  const submit = async () => {
    if (busy || !(mode === 'signup' ? signupOk : loginOk)) return
    setBusy(true)
    setErr('')
    try {
      if (mode === 'signup') await signup(name.trim(), pw, avatar)
      else await login(name.trim(), pw)
      setPw('')
      setPw2('')
    } catch (e) {
      setErr((e as Error).message)
      if (String((e as Error).message).includes('이미 쓰고 있는 닉네임')) setMode('login')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'login' ? 'SKEAM 로그인' : existing ? '비밀번호를 만들어 주세요' : 'SKEAM 계정 만들기'
  return (
    <Modal
      title={title}
      footer={
        <>
          <button className="btn-green" disabled={busy || !(mode === 'signup' ? signupOk : loginOk)} onClick={submit}>
            {busy ? '잠시만요…' : mode === 'signup' ? (existing ? '비밀번호 만들기' : '계정 만들기') : '로그인'}
          </button>
        </>
      }
    >
      <div className="tabs-row" style={{ margin: '0 0 14px', gap: 18 }}>
        <button className={mode === 'signup' ? 'on' : ''} style={{ fontSize: 15 }} onClick={() => (setMode('signup'), setErr(''))}>
          {existing ? '비밀번호 만들기' : '계정 만들기'}
        </button>
        <button className={mode === 'login' ? 'on' : ''} style={{ fontSize: 15 }} onClick={() => (setMode('login'), setErr(''))}>
          다른 기기에서 쓰던 계정으로 로그인
        </button>
      </div>
      {mode === 'signup' && (
        <p style={{ marginTop: 0 }}>
          {existing
            ? 'SKEAM에 로그인 기능이 생겼어요. 비밀번호를 만들면 지금 이 브라우저의 지갑, 라이브러리, 플레이 기록이 계정에 저장되고, 컴퓨터·노트북·휴대폰 어디서든 이어서 쓸 수 있어요.'
            : 'KING 동아리가 AI로 만든 게임을 둘러보고, 가짜 돈으로 사고, 바로 플레이하세요. 계정을 만들면 어느 기기에서든 이어서 쓸 수 있어요.'}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="field">
          <label>닉네임</label>
          <input autoFocus={!existing} value={name} maxLength={20} onChange={(e) => setName(e.target.value.replace(/\s/g, ''))} placeholder="예: KH327" autoComplete="username" />
        </div>
        <div className="field">
          <label>
            비밀번호 <small>4자 이상 · 다른 사이트에서 쓰는 비밀번호는 쓰지 마세요</small>
          </label>
          <input type="password" autoFocus={existing} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        </div>
        {mode === 'signup' && (
          <div className="field">
            <label>비밀번호 확인</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            {pw2 && pw !== pw2 && <span className="err">비밀번호가 서로 달라요</span>}
          </div>
        )}
        {mode === 'signup' && !existing && (
          <div className="field">
            <label>아바타</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Array.from({ length: AVATAR_COUNT }, (_, i) => (
                <button type="button" key={i} onClick={() => setAvatar(i)} style={{ padding: 0, border: `2px solid ${i === avatar ? '#66c0f4' : 'transparent'}`, background: 'none' }}>
                  <Avatar name={name || '?'} index={i} size={40} />
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="submit" hidden />
      </form>
      {err.trim() && <div className="notice err">{err}</div>}
      {mode === 'login' && <div style={{ fontSize: 12, color: '#8f98a0' }}>비밀번호를 잊었다면 운영진에게 초기화를 부탁하세요. 데이터는 그대로 남아요.</div>}
    </Modal>
  )
}

/** Pops a toast once per visit for each wishlisted game that just came out, and for new reviews on my games. */
export function ReleaseNotifier() {
  const released = useReleased()
  const reviews = useReviewAlerts()
  useEffect(() => {
    if (!reviews.length) return
    const key = `skeam:toasted:reviews:${reviews.map((r) => r.time).sort().pop()}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      /* ignore */
    }
    const r = reviews[0]
    toast({ title: `내 게임에 새 평가 ${reviews.length}개`, body: `${r.recommend ? '👍' : '👎'} ${r.name} · ${r.title}`, icon: r.capsule })
  }, [reviews.map((r) => r.time).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    for (const g of released) {
      const key = `skeam:toasted:${g.id}`
      try {
        if (sessionStorage.getItem(key)) continue
        sessionStorage.setItem(key, '1')
      } catch {
        /* ignore */
      }
      toast({ title: '찜한 게임이 출시됐어요!', body: g.title, icon: g.images.capsule })
    }
  }, [released.map((g) => g.id).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** Kiosk mode: after 3 idle minutes, reset for the next visitor. */
export function KioskWatcher() {
  const kiosk = useStore((s) => s.kiosk)
  const nav = useNavigate()
  useEffect(() => {
    if (!kiosk) return
    let t = 0
    const arm = () => {
      clearTimeout(t)
      t = window.setTimeout(() => {
        // Input inside a game iframe never reaches this window, so a
        // visitor who is playing would look idle. Don't reset mid-game.
        if (window.location.hash.startsWith('#/play/')) return arm()
        resetForNextVisitor()
        nav('/')
      }, 3 * 60 * 1000)
    }
    const evs = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel']
    evs.forEach((e) => window.addEventListener(e, arm, { passive: true }))
    arm()
    return () => {
      clearTimeout(t)
      evs.forEach((e) => window.removeEventListener(e, arm))
    }
  }, [kiosk, nav])
  return null
}
