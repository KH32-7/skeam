import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { BottomBar, Chrome, KioskWatcher, ProfileGate, ReleaseNotifier } from './components/Chrome'
import { GameHoverLayer } from './components/GameHover'
import { Intro } from './components/Intro'
import { Loading, Toasts } from './components/ui'
import { startSync } from './state/account'
import AppPage from './pages/AppPage'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Library from './pages/Library'
import Player from './pages/Player'
import Search from './pages/Search'
import StoreHome from './pages/StoreHome'
import Wallet from './pages/Wallet'

const Community = lazy(() => import('./pages/Community'))
const Profile = lazy(() => import('./pages/Profile'))
const Register = lazy(() => import('./pages/Register'))
const Developer = lazy(() => import('./pages/Developer'))
const Tags = lazy(() => import('./pages/Tags'))

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/**
 * Which "screen" a path is, for the page-change animation: every store page is
 * its own, but picking another game inside the library isn't a new screen
 * (the sidebar shouldn't flash).
 */
function screenOf(pathname: string) {
  return pathname.startsWith('/library') ? '/library' : pathname
}

function Shell() {
  const { pathname } = useLocation()
  const playing = pathname.startsWith('/play/')
  return (
    <div className="app-shell">
      {!playing && <Chrome />}
      <ScrollTop />
      {/* Remounting on a new screen replays the fade-in (.page-in in global.css).
          The player has its own launch screen, and a transform here would
          trap its fixed-position layout, so it isn't animated. */}
      <div key={screenOf(pathname)} className={playing ? 'screen' : 'screen page-in'}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<StoreHome />} />
            <Route path="/search" element={<Search />} />
            <Route path="/wishlist" element={<Search wishlistOnly />} />
            <Route path="/app/:id" element={<AppPage />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout/:id" element={<Checkout />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/library" element={<Library />} />
            <Route path="/library/:id" element={<Library />} />
            <Route path="/play/:id" element={<Player />} />
            <Route path="/community" element={<Community />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/register" element={<Register />} />
            <Route path="/developer/:name" element={<Developer />} />
            <Route path="/tags" element={<Tags />} />
            <Route path="*" element={<StoreHome />} />
          </Routes>
        </Suspense>
      </div>
      {!playing && <BottomBar />}
      <ProfileGate />
      <KioskWatcher />
      <ReleaseNotifier />
      <Toasts />
      <GameHoverLayer />
      <Intro />
    </div>
  )
}

startSync()

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
