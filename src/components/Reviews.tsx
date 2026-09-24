import { useCallback, useEffect, useState } from 'react'
import { hours, shortDate } from '../format'
import { useStore } from '../state/store'

interface Review {
  time: string
  name: string
  recommend: boolean
  text: string
  playtime: number
}

export function reviewLabel(pos: number, n: number) {
  if (n === 0) return { text: '평가 없음', cls: '' }
  const r = pos / n
  if (r >= 0.95 && n >= 50) return { text: '압도적으로 긍정적', cls: 'pos' }
  if (r >= 0.8 && n >= 10) return { text: '매우 긍정적', cls: 'pos' }
  if (r >= 0.8) return { text: '긍정적', cls: 'pos' }
  if (r >= 0.7) return { text: '대체로 긍정적', cls: 'pos' }
  if (r >= 0.4) return { text: '복합적', cls: 'mixed' }
  if (r >= 0.2) return { text: '대체로 부정적', cls: 'neg' }
  return { text: '부정적', cls: 'neg' }
}

export function useReviews(endpoint: string, gameId: string) {
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const load = useCallback(async () => {
    if (!endpoint) return setReviews([])
    try {
      const r = await fetch(`${endpoint}?action=reviews&game=${encodeURIComponent(gameId)}`)
      const j = await r.json()
      setReviews(j.ok ? j.reviews : [])
    } catch {
      setReviews([])
    }
  }, [endpoint, gameId])
  useEffect(() => {
    load()
  }, [load])
  return { reviews, reload: load }
}

export function Reviews({ endpoint, gameId, title }: { endpoint: string; gameId: string; title: string }) {
  const { reviews, reload } = useReviews(endpoint, gameId)
  const owned = useStore((s) => s.owned[gameId])
  const name = useStore((s) => s.profile?.name ?? '방문자')
  const [rec, setRec] = useState<boolean | null>(null)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | string>('idle')

  if (!endpoint) return null
  const pos = reviews?.filter((r) => r.recommend).length ?? 0
  const n = reviews?.length ?? 0
  const label = reviewLabel(pos, n)

  const post = async () => {
    setState('sending')
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'review', game: gameId, name, recommend: rec, text, playtime: owned?.playtime ?? 0 }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setState('done')
      setText('')
      reload()
    } catch (e) {
      setState(String((e as Error).message ?? e))
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <h3 className="block-head">{title} 사용자 평가</h3>
      <div style={{ marginBottom: 14, fontSize: 14 }}>
        전체 평가: <span className={`review-${label.cls}`}>{label.text}</span> <span style={{ color: '#8f98a0' }}>({n}개)</span>
      </div>

      {owned && state !== 'done' && (
        <div className="review-write">
          <div style={{ color: '#fff', marginBottom: 8 }}>{title}에 대한 평가 작성하기</div>
          <textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="이 게임의 어떤 점이 좋았나요? 만든 사람에게 한마디!" />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 13 }}>이 게임을 추천하시겠습니까?</span>
            <button className={`btn-blue ${rec === true ? 'on' : ''}`} onClick={() => setRec(true)}>
              👍 예
            </button>
            <button className={`btn-blue ${rec === false ? 'on' : ''}`} onClick={() => setRec(false)}>
              👎 아니요
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn-green" disabled={rec === null || !text.trim() || state === 'sending'} onClick={post}>
              {state === 'sending' ? '게시 중…' : '평가 게시'}
            </button>
          </div>
          {state !== 'idle' && state !== 'sending' && <div className="notice err" style={{ marginTop: 8 }}>{state}</div>}
        </div>
      )}
      {state === 'done' && <div className="notice">평가를 게시했습니다. 고마워요!</div>}

      {reviews === null && <div className="spinner" />}
      {reviews?.length === 0 && <div style={{ color: '#8f98a0' }}>아직 평가가 없습니다. {owned ? '첫 평가를 남겨 주세요!' : '게임을 받으면 평가를 남길 수 있어요.'}</div>}
      {reviews?.slice(0, 20).map((r, i) => (
        <div key={i} className="review">
          <div className="who">
            <b>{r.name}</b>
            <span>기록상 {hours(r.playtime)}</span>
          </div>
          <div>
            <div className={`verdict ${r.recommend ? 'up' : 'down'}`}>
              <span className="thumb">{r.recommend ? '👍' : '👎'}</span>
              {r.recommend ? '추천' : '비추천'}
            </div>
            <div className="date">게시 일시: {shortDate(new Date(r.time).getTime())}</div>
            <div className="text">{r.text}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
