import { Link, useParams } from 'react-router-dom'
import { StoreNav } from '../components/StoreNav'
import { Loading, Price } from '../components/ui'
import { useData } from '../data/api'
import { koDate, platformLabel } from '../format'
import type { Club, Game } from '../types'

export function memberAvatar(m: Club['members'][number] | undefined) {
  if (m?.avatar) return m.avatar
  if (m?.github) return `https://github.com/${m.github}.png?size=184`
  return './skeam-icon.svg'
}

export const developerPath = (name: string) => `/developer/${encodeURIComponent(name)}`

/** A creator's page, like a Steam developer page: who they are and every game they made. */
export default function Developer() {
  const { name = '' } = useParams()
  const { data } = useData()
  if (!data) return <Loading />
  const key = name.toLowerCase()
  const member = data.club.members.find((m) => m.name.toLowerCase() === key)
  const games = data.games.filter((g) => g.developer.toLowerCase() === key).sort((a, b) => b.release.localeCompare(a.release))

  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        <div className="crumbs">
          <Link to="/community">커뮤니티</Link> &gt; 제작자
        </div>
        <div className="panel" style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 10 }}>
          <img src={memberAvatar(member)} alt="" style={{ width: 96, height: 96, objectFit: 'cover', border: '2px solid #4d9a2a' }} />
          <div>
            <div style={{ fontSize: 28, color: '#fff', fontWeight: 700 }}>{member?.name ?? name}</div>
            {member?.role && <div style={{ color: 'var(--gold)' }}>{member.role}</div>}
            {member?.bio && <div style={{ marginTop: 4 }}>{member.bio}</div>}
            <div style={{ color: '#8f98a0', fontSize: 13, marginTop: 4 }}>
              SKEAM에 올린 게임 {games.length}개
              {member?.github && (
                <>
                  {' · '}
                  <a href={`https://github.com/${member.github}`} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="section-head">
          <h2>{member?.name ?? name}의 게임</h2>
        </div>
        <GameList games={games} empty="아직 올린 게임이 없습니다." />
      </div>
    </div>
  )
}

export function GameList({ games, empty }: { games: Game[]; empty: string }) {
  if (!games.length) return <div className="panel">{empty}</div>
  return (
    <>
      {games.map((g) => (
        <Link key={g.id} className="search-row" to={`/app/${g.id}`}>
          <img src={g.images.header} alt="" />
          <div>
            <div className="t">{g.title}</div>
            <div className="plat">
              {platformLabel[g.platform]} · {g.tags.slice(0, 3).join(', ')}
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#8f98a0' }}>{koDate(g.release)}</div>
          <Price game={g} />
        </Link>
      ))}
    </>
  )
}
