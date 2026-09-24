import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, AVATAR_COUNT, Loading } from '../components/ui'
import { useData } from '../data/api'
import { hours, walletWon } from '../format'
import { setProfile, useStore } from '../state/store'

export default function Profile() {
  const { data } = useData()
  const profile = useStore((s) => s.profile)
  const owned = useStore((s) => s.owned)
  const ach = useStore((s) => s.achievements)
  const wallet = useStore((s) => s.wallet)
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [avatar, setAvatar] = useState(profile?.avatar ?? 0)
  if (!data) return <Loading />

  const mine = data.games.filter((g) => owned[g.id])
  const total = mine.reduce((a, g) => a + owned[g.id].playtime, 0)
  const achCount = Object.values(ach).reduce((a, m) => a + Object.keys(m).length, 0)
  const level = Math.max(1, mine.length * 2 + achCount)

  return (
    <div className="store" style={{ background: 'radial-gradient(ellipse at 50% 0, #2b4a68, #1b2838 60%)' }}>
      <div className="store-wrap" style={{ maxWidth: 976 }}>
        <div className="panel" style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 24 }}>
          <Avatar name={profile?.name ?? '?'} index={profile?.avatar ?? 7} size={164} />
          <div style={{ flex: 1 }}>
            {edit ? (
              <>
                <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} style={{ fontSize: 22, padding: 6, background: '#0e141b', color: '#fff', border: '1px solid #3d4450' }} />
                <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
                  {Array.from({ length: AVATAR_COUNT }, (_, i) => (
                    <button key={i} onClick={() => setAvatar(i)} style={{ padding: 0, background: 'none', border: `2px solid ${i === avatar ? '#66c0f4' : 'transparent'}` }}>
                      <Avatar name={name || '?'} index={i} size={32} />
                    </button>
                  ))}
                </div>
                <button
                  className="btn-green"
                  onClick={() => {
                    if (name.trim()) setProfile(name.trim(), avatar)
                    setEdit(false)
                  }}
                >
                  저장
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 26, color: '#fff' }}>{profile?.name ?? '게스트'}</div>
                <div style={{ color: '#8f98a0' }}>KING 동아리 SKEAM 회원</div>
                <button className="btn-gray" style={{ marginTop: 12 }} onClick={() => setEdit(true)}>
                  프로필 편집
                </button>
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
