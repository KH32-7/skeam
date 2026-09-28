import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StoreNav } from '../components/StoreNav'
import { Loading, Price } from '../components/ui'
import { useGame } from '../data/api'
import { platformText, walletWon, won } from '../format'
import { purchase, round2, useStore } from '../state/store'
import type { Game } from '../types'
import { useCartGames } from './Cart'

export default function Checkout() {
  const { id } = useParams()
  // /checkout/cart pays for everything in the cart at once; /checkout/<id> for one game.
  const isCart = id === 'cart'
  const { game, data } = useGame(isCart ? undefined : id)
  const { games: cartGames } = useCartGames()
  const wallet = useStore((s) => s.wallet)
  const owned = useStore((s) => (id && !isCart ? !!s.owned[id] : false))
  const [agree, setAgree] = useState(false)
  const [done, setDone] = useState<Game[] | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

  if (!data) return <Loading />
  if (done) return <Thanks games={done} wallet={wallet} />
  if (isCart) {
    if (!cartGames.length)
      return (
        <div className="store">
          <div className="store-wrap">
            <StoreNav />
            <div className="notice" style={{ marginTop: 20 }}>
              장바구니가 비어 있어요. <Link to="/">상점</Link>에서 게임을 담아 보세요.
            </div>
          </div>
        </div>
      )
    return <Review items={cartGames} owned={false} back={{ to: '/cart', label: '← 장바구니로 돌아가기' }} self="/checkout/cart" {...{ wallet, agree, setAgree, busy, setBusy, setDone, nav }} />
  }
  const g = game
  if (!g)
    return (
      <div className="store">
        <div className="store-wrap empty-state">게임을 찾을 수 없습니다.</div>
      </div>
    )

  if (g.comingSoon)
    return (
      <div className="store">
        <div className="store-wrap">
          <StoreNav />
          <div className="notice warn" style={{ marginTop: 20 }}>
            {g.title}은(는) 아직 출시 전이에요. <Link to={`/app/${g.id}`}>상점 페이지</Link>에서 찜해 두면 출시될 때 알려 드려요.
          </div>
        </div>
      </div>
    )

  // Steam games are bought on Steam (a link to this page may be old or typed by hand).
  if (g.platform === 'steam')
    return (
      <div className="store">
        <div className="store-wrap">
          <StoreNav />
          <div className="notice warn" style={{ marginTop: 20 }}>
            {g.title}은(는) Steam에서 판매하는 게임이에요.{' '}
            <a href={g.steam!.url} target="_blank" rel="noreferrer">
              Steam 상점 페이지
            </a>
            에서 구매해 주세요.
          </div>
        </div>
      </div>
    )

  return <Review items={[g]} owned={owned} back={{ to: `/app/${g.id}`, label: '← 상점 페이지로 돌아가기' }} self={`/checkout/${g.id}`} {...{ wallet, agree, setAgree, busy, setBusy, setDone, nav }} />
}

/** The order review: the games, the wallet, and the buy button. */
function Review({
  items,
  owned,
  back,
  self,
  wallet,
  agree,
  setAgree,
  busy,
  setBusy,
  setDone,
  nav,
}: {
  items: Game[]
  owned: boolean
  back: { to: string; label: string }
  self: string
  wallet: number
  agree: boolean
  setAgree: (v: boolean) => void
  busy: boolean
  setBusy: (v: boolean) => void
  setDone: (g: Game[]) => void
  nav: (to: string) => void
}) {
  const total = items.reduce((a, g) => a + g.finalPrice, 0)
  const short = total > wallet

  const buy = () => {
    setBusy(true)
    setTimeout(() => {
      if (purchase(items.map((g) => ({ id: g.id, title: g.title, price: g.finalPrice })))) setDone(items)
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
            {items.map((g) => (
              <div key={g.id} className="cart-line">
                <img src={g.images.header} alt="" />
                <div>
                  <div className="t">{g.title}</div>
                  <div style={{ fontSize: 12, color: '#8f98a0' }}>{platformText(g)}</div>
                </div>
                <Price game={g} />
              </div>
            ))}
            <Link to={back.to}>{back.label}</Link>
          </div>
          <div className="panel">
            <div className="receipt">
              <span>예상 합계{items.length > 1 ? ` (${items.length}개)` : ''}</span>
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
                <button className="btn-green" style={{ width: '100%' }} onClick={() => nav(`/wallet?back=${encodeURIComponent(self)}`)}>
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

function Thanks({ games, wallet }: { games: Game[]; wallet: number }) {
  const nav = useNavigate()
  const g = games[0]
  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        <h1 className="page-title">구매해 주셔서 감사합니다!</h1>
        <div className="panel" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <img src={g.images.header} alt="" style={{ width: 300, maxWidth: '100%' }} />
          <div>
            <p style={{ color: '#fff', fontSize: 18, margin: 0 }}>
              {games.length > 1 ? `${g.title} 외 ${games.length - 1}개가` : `${g.title}이(가)`} 라이브러리에 추가되었습니다.
            </p>
            <p>남은 지갑 잔액: {walletWon(wallet)}</p>
            <button className="btn-play" onClick={() => nav(`/library/${g.id}`)}>
              {games.length > 1 ? '라이브러리로 가기' : g.platform === 'windows' ? '라이브러리에서 설치' : '▶ 지금 플레이'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
