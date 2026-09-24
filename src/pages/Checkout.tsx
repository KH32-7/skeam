import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StoreNav } from '../components/StoreNav'
import { Loading, Price } from '../components/ui'
import { useGame } from '../data/api'
import { platformLabel, walletWon, won } from '../format'
import { purchase, round2, useStore } from '../state/store'

export default function Checkout() {
  const { id } = useParams()
  const { game: g, data } = useGame(id)
  const wallet = useStore((s) => s.wallet)
  const owned = useStore((s) => (id ? !!s.owned[id] : false))
  const [agree, setAgree] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

  if (!data) return <Loading />
  if (!g)
    return (
      <div className="store">
        <div className="store-wrap empty-state">게임을 찾을 수 없습니다.</div>
      </div>
    )

  const total = g.finalPrice
  const short = total > wallet

  if (done)
    return (
      <div className="store">
        <div className="store-wrap">
          <StoreNav />
          <h1 className="page-title">구매해 주셔서 감사합니다!</h1>
          <div className="panel" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <img src={g.images.header} alt="" style={{ width: 300 }} />
            <div>
              <p style={{ color: '#fff', fontSize: 18, margin: 0 }}>{g.title}이(가) 라이브러리에 추가되었습니다.</p>
              <p>남은 지갑 잔액: {walletWon(wallet)}</p>
              <button className="btn-play" onClick={() => nav(`/library/${g.id}`)}>
                {g.platform === 'windows' ? '라이브러리에서 설치' : '▶ 지금 플레이'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )

  const buy = () => {
    setBusy(true)
    setTimeout(() => {
      if (purchase([{ id: g.id, title: g.title, price: total }])) setDone(true)
      setBusy(false)
    }, 900)
  }

  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        <h1 className="page-title">결제 검토</h1>
        {owned && <div className="notice">이미 라이브러리에 있는 게임입니다.</div>}
        <div className="checkout">
          <div>
            <div className="cart-line">
              <img src={g.images.header} alt="" />
              <div>
                <div className="t">{g.title}</div>
                <div style={{ fontSize: 12, color: '#8f98a0' }}>{platformLabel[g.platform]}</div>
              </div>
              <Price game={g} />
            </div>
            <Link to={`/app/${g.id}`}>← 상점 페이지로 돌아가기</Link>
          </div>
          <div className="panel">
            <div className="receipt">
              <span>예상 합계</span>
              <span className="tot">{won(total)}</span>
              <span>SKEAM 지갑 잔액</span>
              <span>{walletWon(wallet)}</span>
              {!short && (
                <>
                  <span>결제 후 잔액</span>
                  <span>{walletWon(round2(wallet - total))}</span>
                </>
              )}
            </div>
            {short ? (
              <>
                <div className="notice warn" style={{ marginTop: 16 }}>
                  지갑 잔액이 {walletWon(round2(total - wallet))} 부족합니다.
                </div>
                <button className="btn-green" style={{ width: '100%' }} onClick={() => nav(`/wallet?back=${encodeURIComponent(`/checkout/${g.id}`)}`)}>
                  지갑에 자금 추가
                </button>
              </>
            ) : (
              <>
                <label style={{ display: 'flex', gap: 8, margin: '18px 0', fontSize: 12, color: '#acb2b8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>이 게임을 재미있게 플레이하고, 만든 사람에게 칭찬 한마디를 남기겠다는 SKEAM 이용 약관에 동의합니다.</span>
                </label>
                <button className="btn-green" style={{ width: '100%' }} disabled={!agree || busy || owned} onClick={buy}>
                  {busy ? '처리 중…' : total === 0 ? '라이브러리에 추가' : '구매'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
