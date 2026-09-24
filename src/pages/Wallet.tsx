import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { StoreNav } from '../components/StoreNav'
import { Modal } from '../components/ui'
import { walletWon, won } from '../format'
import { addFunds, useStore } from '../state/store'

const AMOUNTS = [5000, 10000, 25000, 50000, 100000]

export default function Wallet() {
  const wallet = useStore((s) => s.wallet)
  const name = useStore((s) => s.profile?.name ?? '방문자')
  const txns = useStore((s) => s.txns)
  const [paying, setPaying] = useState<number | null>(null)
  const [params] = useSearchParams()
  const back = params.get('back')

  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        <div className="crumbs">
          <Link to="/">홈</Link> &gt; <Link to="/profile">계정</Link> &gt; SKEAM 지갑에 자금 추가
        </div>
        <h1 className="page-title">SKEAM 지갑에 자금 추가</h1>
        <div className="wallet-grid">
          <div>
            <p style={{ marginTop: 0, color: '#fff' }}>{name}의 계정에 자금 추가</p>
            <p style={{ color: '#acb2b8' }}>
              SKEAM 지갑 자금으로 SKEAM의 모든 게임을 살 수 있습니다. <b style={{ color: '#fff' }}>진짜 돈이 아니며, 결제는 전부 연출입니다.</b> 버튼을 누르면
              바로 충전됩니다.
            </p>
            {AMOUNTS.map((a, i) => (
              <div key={a} className="fund-row">
                <div>
                  <h3>{won(a)} 추가</h3>
                  {i === 0 && <small>최소 충전액</small>}
                </div>
                <div className="act">
                  <span className="amt">{won(a)}</span>
                  <button className="btn-green" onClick={() => setPaying(a)}>
                    자금 추가
                  </button>
                </div>
              </div>
            ))}
            <p className="fine">
              자세한 정보는 <Link to="/community">KING 동아리 소개</Link>를 참고해 주세요. 지갑 잔액은 이 브라우저에만 저장됩니다.
            </p>
          </div>
          <div className="acct-box">
            <div className="h">SKEAM 계정</div>
            <div className="row">
              현재 지갑 잔액 <b>{walletWon(wallet)}</b>
            </div>
            <Link className="link" to="/profile">
              내 계정 정보 보기
            </Link>
            <Link className="link" to="/library">
              라이브러리로 가기
            </Link>
            {txns.length > 0 && (
              <div style={{ padding: '0 16px 16px', fontSize: 12 }}>
                <div style={{ color: '#8f98a0', margin: '8px 0 4px' }}>최근 거래</div>
                {txns.slice(0, 6).map((t) => (
                  <div key={t.at + t.label} style={{ display: 'flex', justifyContent: 'space-between', color: '#c6d4df', padding: '2px 0' }}>
                    <span>{t.label}</span>
                    <span style={{ color: t.amount > 0 ? '#a4d007' : '#c6d4df' }}>
                      {t.amount > 0 ? '+' : '-'}
                      {walletWon(Math.abs(t.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {paying && <KingPay amount={paying} back={back} onClose={() => setPaying(null)} />}
    </div>
  )
}

function KingPay({ amount, back, onClose }: { amount: number; back: string | null; onClose: () => void }) {
  const [stage, setStage] = useState<'review' | 'paying' | 'done'>('review')
  const wallet = useStore((s) => s.wallet)
  const nav = useNavigate()
  const pay = () => {
    setStage('paying')
    setTimeout(() => {
      addFunds(amount)
      setStage('done')
    }, 1400)
  }
  if (stage === 'paying')
    return (
      <Modal title="결제 처리 중">
        <div className="spinner" />
        <p style={{ textAlign: 'center' }}>KING 페이가 왕실 금고를 여는 중입니다…</p>
      </Modal>
    )
  if (stage === 'done')
    return (
      <Modal
        title="자금이 추가되었습니다"
        onClose={onClose}
        footer={
          back ? (
            <button className="btn-green" onClick={() => nav(back)}>
              구매 계속하기
            </button>
          ) : (
            <button className="btn-green" onClick={onClose}>
              확인
            </button>
          )
        }
      >
        <div className="receipt">
          <span>추가한 금액</span>
          <span>{won(amount)}</span>
          <span className="tot">새 지갑 잔액</span>
          <span className="tot">{walletWon(wallet)}</span>
        </div>
      </Modal>
    )
  return (
    <Modal
      title="구매 검토"
      onClose={onClose}
      footer={
        <>
          <button className="btn-gray" onClick={onClose}>
            취소
          </button>
          <button className="btn-green" onClick={pay}>
            구매
          </button>
        </>
      }
    >
      <div className="receipt" style={{ marginBottom: 12 }}>
        <span>SKEAM 지갑 자금</span>
        <span>{won(amount)}</span>
        <span className="tot">합계</span>
        <span className="tot">{won(amount)}</span>
      </div>
      <div className="kingpay">
        <img src="./skeam-icon.svg" alt="" />
        <div>
          <b>KING 페이</b>
          <div style={{ fontSize: 12, color: '#acb2b8' }}>동아리 왕실 금고에서 결제 · 실제 결제가 아닙니다</div>
        </div>
      </div>
    </Modal>
  )
}
