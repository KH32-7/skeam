import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Loading, toast } from '../components/ui'
import { useGame } from '../data/api'
import { hours } from '../format'
import { addPlaytime, markLaunched, unlockAchievement, useStore } from '../state/store'

const TICK = 15

export default function Player() {
  const { id } = useParams()
  const { game: g, data } = useGame(id)
  const owned = useStore((s) => (id ? s.owned[id] : undefined))
  const [overlay, setOverlay] = useState(false)
  const [edge, setEdge] = useState(true)
  const frame = useRef<HTMLIFrameElement>(null)
  const nav = useNavigate()
  const started = useRef(Date.now())

  // Play time: count while this tab is visible.
  useEffect(() => {
    if (!g || !owned) return
    markLaunched(g.id)
    const t = setInterval(() => document.visibilityState === 'visible' && addPlaytime(g.id, TICK), TICK * 1000)
    toast({ title: 'SKEAM 오버레이', body: 'Shift+Tab 또는 화면 위쪽 가운데에 마우스를 올리면 열립니다.', glyph: '⌂' })
    const hide = setTimeout(() => setEdge(false), 4000)
    return () => {
      clearInterval(t)
      clearTimeout(hide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g?.id, !!owned])

  // Shift+Tab from this window, or from the game frame when it's same-origin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        setOverlay((v) => !v)
      }
      if (e.key === 'Escape') setOverlay(false)
    }
    window.addEventListener('keydown', onKey)
    let inner: Window | null = null
    const attach = () => {
      try {
        inner = frame.current?.contentWindow ?? null
        inner?.addEventListener('keydown', onKey)
      } catch {
        inner = null // cross-origin: the SDK's postMessage covers this
      }
    }
    const f = frame.current
    f?.addEventListener('load', attach)
    return () => {
      window.removeEventListener('keydown', onKey)
      f?.removeEventListener('load', attach)
      try {
        inner?.removeEventListener('keydown', onKey)
      } catch {
        /* ignore */
      }
    }
  }, [g?.id])

  // Messages from games that include skeam-sdk.js.
  useEffect(() => {
    if (!g) return
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'object' || !e.data) return
      if (e.data.skeam === 'overlay') setOverlay((v) => !v)
      if (e.data.skeam === 'unlock') {
        const a = g.achievements.find((x) => x.id === e.data.id)
        if (a && unlockAchievement(g.id, a.id)) toast({ title: '도전 과제 달성!', body: a.name, icon: a.icon || undefined, glyph: '🏆' })
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [g])

  if (!data) return <Loading />
  if (!g) return <Navigate to="/library" replace />
  if (!owned) return <Navigate to={`/app/${g.id}`} replace />
  if (!g.playUrl) return <Navigate to={`/library/${g.id}`} replace />

  const session = (Date.now() - started.current) / 1000

  return (
    <div className="player">
      <iframe ref={frame} src={g.playUrl} title={g.title} allow="fullscreen; autoplay; gamepad; clipboard-write; pointer-lock; microphone; camera; screen-wake-lock" allowFullScreen />
      <div className="hot" onMouseEnter={() => setEdge(true)} />
      <div className={`edge ${edge ? 'show' : ''}`} onMouseLeave={() => setEdge(false)}>
        <img src="./skeam-icon.svg" alt="" width={16} />
        {g.title}
        <button className="btn-gray" style={{ height: 24, fontSize: 12 }} onClick={() => setOverlay(true)}>
          오버레이
        </button>
        <button className="btn-gray" style={{ height: 24, fontSize: 12 }} onClick={() => nav(`/library/${g.id}`)}>
          나가기
        </button>
      </div>
      {overlay && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOverlay(false)}>
          <div className="ot">
            <img src={g.images.header} alt="" />
            <div>
              <div className="name">{g.title}</div>
              <div style={{ fontSize: 13 }}>
                이번 세션 {hours(session)} · 총 {hours(owned.playtime)}
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <button className="btn-gray" onClick={() => document.documentElement.requestFullscreen?.()}>
              전체 화면
            </button>
            <button className="btn-gray" onClick={() => window.open(g.playUrl, '_blank')}>
              새 탭에서 열기
            </button>
            <button className="btn-green" onClick={() => nav(`/library/${g.id}`)}>
              게임 종료
            </button>
          </div>
          <div className="panels">
            {g.achievements.length > 0 && <OverlayAchievements gameId={g.id} list={g.achievements} />}
            <div className="op">
              <h4>조작법</h4>
              <div style={{ fontSize: 13 }}>{g.controls || '게임 안내를 참고하세요.'}</div>
            </div>
            <div className="op">
              <h4>바로 가기</h4>
              <Link to={`/app/${g.id}`}>상점 페이지</Link>
              <br />
              <Link to="/library">라이브러리</Link>
            </div>
          </div>
          <div className="ob">Shift+Tab 또는 Esc로 닫기</div>
        </div>
      )}
    </div>
  )
}

function OverlayAchievements({ gameId, list }: { gameId: string; list: { id: string; name: string; desc: string; icon: string }[] }) {
  const got = useStore((s) => s.achievements[gameId])
  return (
    <div className="op">
      <h4>
        도전 과제 {list.filter((a) => got?.[a.id]).length}/{list.length}
      </h4>
      {list.map((a) => (
        <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, opacity: got?.[a.id] ? 1 : 0.45, fontSize: 13 }}>
          <div className="ach-icon" style={{ width: 36, height: 36 }}>
            {a.icon ? <img src={a.icon} alt="" /> : '🏆'}
          </div>
          <div>
            <div style={{ color: '#fff' }}>{a.name}</div>
            <div style={{ fontSize: 12 }}>{a.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
