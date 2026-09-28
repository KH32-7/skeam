import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

const RELOADED = 'skeam:reloaded-for'

/**
 * GitHub Pages lets browsers keep index.html for 10 minutes, so right after a
 * deploy the first visit can run the previous build's code (old intro, old
 * icon) until someone refreshes. site.json is always checked with the server
 * and comes from the same build as this code: if its build time differs, this
 * page is stale, so load it again (once, so a mismatch can never loop).
 */
async function staleBuild() {
  if (import.meta.env.DEV || !__BUILT_AT__) return false
  try {
    const res = await fetch('data/site.json', { cache: 'no-cache', signal: AbortSignal.timeout(1500) })
    const live = String((await res.json()).builtAt ?? '')
    if (!live || live === __BUILT_AT__) return false
    if (sessionStorage.getItem(RELOADED) === live) return false
    sessionStorage.setItem(RELOADED, live)
    return true
  } catch {
    return false
  }
}

staleBuild().then((stale) => {
  if (stale) return location.reload()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
