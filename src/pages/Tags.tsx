import { Link } from 'react-router-dom'
import { useTagCounts } from '../components/CategoryMenu'
import { StoreNav } from '../components/StoreNav'
import { Loading } from '../components/ui'
import { useData } from '../data/api'
import { DEFAULT_TAGS, TAG_COLUMNS } from '../data/tags'

/** "모든 태그 보기": every default tag by column, plus tags creators made up. */
export default function Tags() {
  const { data } = useData()
  const counts = useTagCounts(data?.games ?? [])
  if (!data) return <Loading />
  const custom = [...counts.keys()].filter((t) => !DEFAULT_TAGS.includes(t)).sort((a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b))
  const link = (t: string) => (
    <Link key={t} to={`/search?tag=${encodeURIComponent(t)}`} className={counts.has(t) ? '' : 'none'}>
      {t}
      {counts.has(t) && <small> {counts.get(t)}</small>}
    </Link>
  )
  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        <h1 className="page-title" style={{ fontSize: 26 }}>
          모든 태그
        </h1>
        <div className="tags-page">
          {TAG_COLUMNS.map((c) => (
            <section key={c.name}>
              <h3>{c.name}</h3>
              {c.tags.map(link)}
            </section>
          ))}
          <section>
            <h3>그 밖의 태그</h3>
            {DEFAULT_TAGS.filter((t) => !TAG_COLUMNS.some((c) => c.tags.includes(t))).map(link)}
          </section>
          {custom.length > 0 && (
            <section>
              <h3>SKEAM 제작자들이 만든 태그</h3>
              {custom.map(link)}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
