import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, AVATAR_COUNT, Loading } from '../components/ui'
import { saveStatus, useData, useProfiles } from '../data/api'
import { hours, walletWon } from '../format'
import { setProfile, useStore } from '../state/store'
import { developerPath, GameList } from './Developer'

export default function Profile() {
  const { data } = useData()
  const profiles = useProfiles()
  const profile = useStore((s) => s.profile)
  const session = useStore((s) => s.session)
  const owned = useStore((s) => s.owned)
  const ach = useStore((s) => s.achievements)
  const wallet = useStore((s) => s.wallet)
  const [edit, setEdit] = useState(false)
  const [avatar, setAvatar] = useState(profile?.avatar ?? 0)
  const [status, setStatus] = useState(profile?.status ?? '')
  const [role, setRole] = useState('')
  const [msg, setMsg] = useState('')
  if (!data) return <Loading />

  const me = profile?.name ?? ''
  const member = data.club.members.find((m) => m.name.toLowerCase() === me.toLowerCase())
  const shownRole = profiles[me.toLowerCase()]?.role || member?.role || ''
  const shownStatus = profiles[me.toLowerCase()]?.status || profile?.status || ''

  const mine = data.games.filter((g) => owned[g.id])
  // Games whose creator name matches this visitor's nickname.
  const made = profile ? data.games.filter((g) => g.developer.toLowerCase() === me.trim().toLowerCase()) : []
  const total = mine.reduce((a, g) => a + owned[g.id].playtime, 0)
  const achCount = Object.values(ach).reduce((a, m) => a + Object.keys(m).length, 0)
  const level = Math.max(1, mine.length * 2 + achCount)

  const startEdit = () => {
    setAvatar(profile?.avatar ?? 0)
    setStatus(shownStatus)
    setRole(shownRole)
    setMsg('')
    setEdit(true)
  }

  const saveAll = async () => {
    if (!profile) return
    setProfile(profile.name, avatar, status.trim())
    setEdit(false)
    const changed = status.trim() !== shownStatus || role.trim() !== shownRole
    if (!changed || !data.site.registerEndpoint) return
    if (!session) return setMsg('로그인해야 상태 메시지와 역할이 멤버 목록에 반영돼요.')
    setMsg('멤버 목록에 반영하는 중…')
    try {
      await saveStatus(data.site.registerEndpoint, { name: session.name, token: session.token }, status.trim(), role.trim())
      setMsg('멤버 목록에 반영됐어요. 새로고침하면 다른 사람에게도 보여요.')
    } catch (e) {
      setMsg(`반영하지 못했어요: ${(e as Error).message}`)
    }
  }

  const box = { width: '100%', padding: 8, background: '#0e141b', color: '#fff', border: '1px solid #3d4450', fontFamily: 'inherit', fontSize: 14 }

  return (
    <div className="store" style={{ background: 'radial-gradient(ellipse at 50% 0, #2b4a68, #1b2838 60%)' }}>
      <div className="store-wrap" style={{ maxWidth: 976 }}>
        <div className="panel" style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 24 }}>
          <Avatar name={me || '?'} index={edit ? avatar : profile?.avatar ?? 7} size={164} />
          <div style={{ flex: 1 }}>
            {edit ? (
              <>
                <div style={{ fontSize: 22, color: '#fff' }}>{me}</div>
                <div style={{ fontSize: 12, color: '#8f98a0', marginBottom: 8 }}>닉네임은 로그인 아이디라서 바꿀 수 없어요.</div>
                <div style={{ display: 'flex', gap: 6, margin: '0 0 10px' }}>
                  {Array.from({ length: AVATAR_COUNT }, (_, i) => (
                    <button key={i} onClick={() => setAvatar(i)} style={{ padding: 0, background: 'none', border: `2px solid ${i === avatar ? '#66c0f4' : 'transparent'}` }}>
                      <Avatar name={me || '?'} index={i} size={32} />
                    </button>
                  ))}
                </div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input value={role} maxLength={30} onChange={(e) => setRole(e.target.value)} placeholder="역할 (예: KING 15기 기획 · 16기 부회장). 비우면 '제작자'로 보여요" style={box} />
                  <span style={{ position: 'absolute', right: 8, top: 10, fontSize: 11, color: '#8f98a0' }}>{role.length}/30</span>
                </div>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <textarea
                    value={status}
                    maxLength={100}
                    onChange={(e) => setStatus(e.target.value.replace(/\s*\n\s*/g, ' '))}
                    placeholder="상태 메시지 (100자까지, 커뮤니티 멤버 목록에도 보여요)"
                    style={{ ...box, minHeight: 64, resize: 'vertical' }}
                  />
                  <span style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 11, color: '#8f98a0' }}>{status.length}/100</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-green" onClick={saveAll}>
                    저장
                  </button>
                  <button className="btn-gray" onClick={() => setEdit(false)}>
                    취소
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 26, color: '#fff' }}>{me || '게스트'}</div>
                {shownRole && <div style={{ color: 'var(--gold)' }}>{shownRole}</div>}
                <div style={{ color: shownStatus ? '#c6d4df' : '#8f98a0', wordBreak: 'break-all' }}>{shownStatus || 'KING 동아리 SKEAM 회원'}</div>
                {msg && <div style={{ color: '#a4d007', fontSize: 12, marginTop: 4 }}>{msg}</div>}
                {profile && (
                  <button className="btn-gray" style={{ marginTop: 12 }} onClick={startEdit}>
                    프로필 편집
                  </button>
                )}
              </>
            )}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: '#fff' }}>레벨</div>
            <div style={{ width: 48, height: 48, margin: '6px auto', borderRadius: '50%', border: '2px solid #f2c14e', display: 'grid', placeItems: 'center', fontSize: 20, color: '#fff' }}>{level}</div>
          </div>
        </div>

        <div className="row3" style={{ marginTop: 16 }}>
          <Stat label="보유 게임" value={`${mine.length}개`} />
          <Stat label="총 플레이 시간" value={hours(total)} />
          <Stat label="도전 과제" value={`${achCount}개`} />
        </div>

        {made.length > 0 && (
          <>
            <div className="section-head">
              <h2>내가 만든 게임</h2>
              <Link className="btn-more" to={developerPath(profile!.name)}>
                제작자 페이지
              </Link>
            </div>
            <GameList games={made} empty="" />
          </>
        )}

        <div className="section-head">
          <h2>최근 활동</h2>
          <Link className="btn-more" to="/wallet">
            지갑 {walletWon(wallet)}
          </Link>
        </div>
        {mine.length === 0 && <div className="panel">아직 게임이 없습니다.</div>}
        {mine
          .sort((a, b) => owned[b.id].lastPlayed - owned[a.id].lastPlayed)
          .map((g) => (
            <Link key={g.id} to={`/library/${g.id}`} className="cart-line" style={{ color: 'inherit' }}>
              <img src={g.images.header} alt="" />
              <div>
                <div className="t">{g.title}</div>
                <div style={{ fontSize: 12 }}>
                  {g.achievements.length > 0 && `도전 과제 ${Object.keys(ach[g.id] ?? {}).length}/${g.achievements.length}`}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13 }}>
                총 {hours(owned[g.id].playtime)}
                <br />
                <span style={{ color: '#8f98a0' }}>{owned[g.id].lastPlayed ? `마지막 실행 ${new Date(owned[g.id].lastPlayed).toLocaleDateString('ko-KR')}` : '아직 실행 안 함'}</span>
              </div>
            </Link>
          ))}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <div style={{ color: '#8f98a0', fontSize: 13 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 24 }}>{value}</div>
    </div>
  )
}
