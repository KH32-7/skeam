import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../data/api'
import { walletWon } from '../format'
import { exportData, importData, markNewsSeen, resetForNextVisitor, setKiosk, setProfile, useStore } from '../state/store'
import { Avatar, AVATAR_COUNT, Modal } from './ui'

export function newsKey(n: { date: string; title: string }) {
  return `${n.date}|${n.title}`
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
  const [menu, setMenu] = useState<'skeam' | 'bell' | null>(null)
  const isLibrary = loc.pathname.startsWith('/library')
  const isCommunity = loc.pathname.startsWith('/community')
  const isStore = !isLibrary && !isCommunity && !loc.pathname.startsWith('/profile')
  const name = profile?.name ?? (kiosk ? '방문자' : '게스트')

  useEffect(() => {
    setMenu(null)
  }, [loc.pathname])

  return (
    <header className="chrome">
      {kiosk && <div className="kiosk-bar">전시회 모드 · 3분 동안 아무 입력이 없으면 다음 방문자를 위해 처음 화면으로 돌아갑니다</div>}
      <div className="chrome-top">
        <div style={{ position: 'relative' }}>
          <button className="brand" style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => setMenu(menu === 'skeam' ? null : 'skeam')}>
            <img src="./skeam-icon.svg" alt="" />
            SKEAM
          </button>
          {menu === 'skeam' && <SkeamMenu close={() => setMenu(null)} />}
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
          <button className={`chrome-btn bell ${updates.length ? 'has' : ''}`} title="알림" onClick={() => setMenu(menu === 'bell' ? null : 'bell')}>
            <svg width="12" height="13" viewBox="0 0 12 13" fill="#fff">
              <path d="M6 0a1 1 0 011 1v.6A4 4 0 0110 5.5V9l1.5 1.5v.5H.5v-.5L2 9V5.5A4 4 0 015 1.6V1a1 1 0 011-1zM4.5 12h3a1.5 1.5 0 01-3 0z" />
            </svg>
            {updates.length > 0 && <span className="dot">{updates.length}</span>}
          </button>
          {menu === 'bell' && (
            <div className="modal" style={{ position: 'absolute', right: 0, top: 28, width: 320, zIndex: 60 }}>
              <div className="mb">
                {updates.length === 0 && <div style={{ color: '#8f98a0' }}>새 알림이 없습니다.</div>}
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
        <Link className="account-pill" to="/wallet">
          <Avatar className="avatar" name={name} index={profile?.avatar ?? 7} size={22} />
          {name} <span className="bal">{walletWon(wallet)}</span>
        </Link>
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

function SkeamMenu({ close }: { close: () => void }) {
  const kiosk = useStore((s) => s.kiosk)
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
    <div style={{ position: 'absolute', top: 26, left: 0, zIndex: 60, width: 220, padding: '6px 0', background: '#3d4450', boxShadow: '0 6px 16px rgba(0,0,0,.6)' }}>
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
export function ProfileGate() {
  const profile = useStore((s) => s.profile)
  const kiosk = useStore((s) => s.kiosk)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(() => Math.floor(Math.random() * AVATAR_COUNT))
  if (profile || kiosk) return null
  const ok = name.trim().length > 0
  return (
    <Modal
      title="SKEAM에 오신 것을 환영합니다"
      footer={
        <button className="btn-green" disabled={!ok} onClick={() => setProfile(name.trim().slice(0, 20), avatar)}>
          시작하기
        </button>
      }
    >
      <p>KING 동아리가 AI로 만든 게임을 둘러보고, 가짜 돈으로 사고, 바로 플레이하세요. 계정은 이 브라우저에만 저장됩니다.</p>
      <div className="field">
        <label>닉네임</label>
        <input autoFocus value={name} maxLength={20} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok && setProfile(name.trim(), avatar)} placeholder="예: KH327" />
      </div>
      <div className="field">
        <label>아바타</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: AVATAR_COUNT }, (_, i) => (
            <button key={i} onClick={() => setAvatar(i)} style={{ padding: 0, border: `2px solid ${i === avatar ? '#66c0f4' : 'transparent'}`, background: 'none' }}>
              <Avatar name={name || '?'} index={i} size={40} />
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
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
