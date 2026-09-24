import { Link } from 'react-router-dom'
import { Loading } from '../components/ui'
import { useData } from '../data/api'

export default function Community() {
  const { data } = useData()
  if (!data) return <Loading />
  const { club, games } = data
  const count = (m: { name: string; github: string }) => games.filter((g) => g.developer === m.name).length

  return (
    <div className="store">
      <div className="store-wrap">
        <div className="club-hero">
          <h1>{club.name}</h1>
          <p>{club.tagline}</p>
          <div style={{ display: 'flex', gap: 24, marginTop: 20, color: '#c6d4df' }}>
            <span>
              <b style={{ color: '#fff', fontSize: 22 }}>{games.length}</b> 게임
            </span>
            <span>
              <b style={{ color: '#fff', fontSize: 22 }}>{club.members.length}</b> 멤버
            </span>
          </div>
          <img className="crown" src="./skeam-icon.svg" alt="" />
        </div>

        <div className="section-head">
          <h2>동아리 소개</h2>
        </div>
        <div className="panel about" dangerouslySetInnerHTML={{ __html: club.aboutHtml }} />

        {club.members.length > 0 && (
          <>
            <div className="section-head">
              <h2>멤버</h2>
            </div>
            <div className="members">
              {club.members.map((m) => (
                <Link key={m.name} className="member" to={`/search?dev=${encodeURIComponent(m.name)}`} style={{ color: 'inherit' }}>
                  <img className="av" src={m.avatar || (m.github ? `https://github.com/${m.github}.png?size=112` : './skeam-icon.svg')} alt="" />
                  <div>
                    <div className="n">{m.name}</div>
                    <div className="r">{m.role}</div>
                    <div className="g">
                      게임 {count(m)}개{m.bio && ` · ${m.bio}`}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {club.photos.length > 0 && (
          <>
            <div className="section-head">
              <h2>활동 사진</h2>
            </div>
            <div className="photos">
              {club.photos.map((p) => (
                <img key={p} src={p} alt="" />
              ))}
            </div>
          </>
        )}

        <div className="section-head">
          <h2>함께 만들기</h2>
        </div>
        <div className="panel">
          {club.join && <p style={{ marginTop: 0 }}>{club.join}</p>}
          <p style={{ marginTop: 0 }}>게임을 만들었다면 등록 도우미로 1분 만에 SKEAM에 올릴 수 있어요.</p>
          <Link className="btn-green" to="/register">
            게임 등록하기
          </Link>
        </div>
      </div>
    </div>
  )
}
