import { useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CapsuleImg, GameLink } from '../components/GameHover'
import { StoreNav } from '../components/StoreNav'
import { Loading, Price } from '../components/ui'
import { useData } from '../data/api'
import { byPopularity, useStats } from '../data/stats'
import { platformText, won } from '../format'
import { clearCart, removeFromCart, useStore } from '../state/store'
import type { Game } from '../types'

/** Games that are bought through the cart: out, sold here (not on Steam), and not free. */
export const cartable = (g: Game) => !g.comingSoon && g.platform !== 'steam' && g.price > 0

/** The cart's games that can still be bought here, in the order they were added. */
export function useCartGames() {
  const { data } = useData()
  const cart = useStore((s) => s.cart ?? [])
  const owned = useStore((s) => s.owned)
  const games = useMemo(
    () => (data ? cart.map((id) => data.games.find((g) => g.id === id)).filter((g): g is Game => !!g && cartable(g) && !owned[g.id]) : []),
    [data, cart, owned],
  )
  // Drop what can't be bought any more (bought on another device, removed, now free).
  useEffect(() => {
    if (!data) return
    for (const id of cart) if (!games.some((g) => g.id === id)) removeFromCart(id)
  }, [data, cart, games])
  return { data, games }
}

/** Steam's cart page: the games, an estimated total, and a few picks to add. */
export default function Cart() {
  const { data, games } = useCartGames()
  const owned = useStore((s) => s.owned)
  const cart = useStore((s) => s.cart ?? [])
  const stats = useStats()
  const nav = useNavigate()

  const picks = useMemo(
    () => (data ? byPopularity(data.games.filter((g) => cartable(g) && !owned[g.id] && !cart.includes(g.id)), stats).slice(0, 3) : []),
    [data, owned, cart, stats],
  )

  if (!data) return <Loading />
  const total = games.reduce((a, g) => a + g.finalPrice, 0)
  const heading = `장바구니(제품 ${games.length}개)`

  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        <div className="crumbs">
          <Link to="/">홈</Link> &gt; {heading}
        </div>
        <h1 className="page-title" style={{ marginTop: 4 }}>
          {heading}
        </h1>

        <div className="cart-grid">
          <div>
            {games.length === 0 ? (
              <div className="cart-empty">
                장바구니가 비어 있어요.
                <div style={{ marginTop: 14 }}>
                  <Link className="btn-gray" to="/">
                    쇼핑 계속하기
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {games.map((g) => (
                  <div key={g.id} className="cart-item">
                    <Link to={`/app/${g.id}`}>
                      <img src={g.images.header} alt="" />
                    </Link>
                    <div className="info">
                      <Link className="t" to={`/app/${g.id}`}>
                        {g.title}
                      </Link>
                      <div className="sub">{g.developer} 제작</div>
                      <div className="plat">{platformText(g)}</div>
                    </div>
                    <div className="right">
                      <Price game={g} />
                      <button className="link" onClick={() => removeFromCart(g.id)}>
                        제거
                      </button>
                    </div>
                  </div>
                ))}
                <div className="cart-actions">
                  <Link className="btn-gray big" to="/">
                    쇼핑 계속하기
                  </Link>
                  <button className="btn-cart big" onClick={() => nav('/checkout/cart')}>
                    결제 계속하기
                  </button>
                  <span style={{ flex: 1 }} />
                  <button className="link" onClick={clearCart}>
                    모든 제품 제거
                  </button>
                </div>
              </>
            )}

          </div>

          <aside>
            <div className="cart-total">
              <div className="row">
                <span>예상 합계</span>
                <b>{won(total)}</b>
              </div>
              <div className="note">모든 돈은 가짜라서 세금도 가짜로 0원이에요.</div>
              <button className="btn-cart big" style={{ width: '100%' }} disabled={games.length === 0} onClick={() => nav('/checkout/cart')}>
                결제 계속하기
              </button>
            </div>
            <div className="cart-aside-note">
              SKEAM에서 게임을 구매하면 KING이 그 게임을 플레이할 수 있는 라이선스를 부여합니다. 구매한 게임은 라이브러리에 바로 추가돼요.
            </div>
          </aside>
          {picks.length > 0 && (
            <div className="cart-picks-wrap">
              <h3 className="cart-picks-head">맞춤 추천</h3>
              <div className="cart-picks">
                {picks.map((g) => (
                  <GameLink key={g.id} className="cart-pick" g={g}>
                    <CapsuleImg g={g} />
                    <div className="p">
                      <Price game={g} />
                    </div>
                  </GameLink>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
