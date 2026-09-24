import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { BottomBar, Chrome, KioskWatcher, ProfileGate } from './components/Chrome'
import { Loading, Toasts } from './components/ui'
import AppPage from './pages/AppPage'
import Checkout from './pages/Checkout'
import Library from './pages/Library'
import Player from './pages/Player'
import Search from './pages/Search'
import StoreHome from './pages/StoreHome'
import Wallet from './pages/Wallet'

const Community = lazy(() => import('./pages/Community'))
const Profile = lazy(() => import('./pages/Profile'))
const Register = lazy(() => import('./pages/Register'))

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Shell() {
  const { pathname } = useLocation()
  const playing = pathname.startsWith('/play/')
  return (
    <div className="app-shell">
      {!playing && <Chrome />}
      <ScrollTop />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<StoreHome />} />
          <Route path="/search" element={<Search />} />
          <Route path="/wishlist" element={<Search wishlistOnly />} />
          <Route path="/app/:id" element={<AppPage />} />
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:id" element={<Library />} />
          <Route path="/play/:id" element={<Player />} />
          <Route path="/community" element={<Community />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<StoreHome />} />
        </Routes>
      </Suspense>
      {!playing && <BottomBar />}
      <ProfileGate />
      <KioskWatcher />
      <Toasts />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
