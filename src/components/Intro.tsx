// Start-up animation, after the one Steam Big Picture plays when it opens: the
// SKEAM mark assembles piece by piece, the crown drops on, the name comes up,
// and the store shows through. Drawn with SVG + CSS (see .intro in global.css),
// so there's no video file to download and it stays sharp at any size.
//
// Plays once per visit (tab session), and again for each new visitor in
// exhibition mode. Any click, key or tap skips it. "애니메이션 끄기" in the
// account menu turns it off. ?intro in the address replays it on purpose.

import { useEffect, useState } from 'react'
import { motionOn } from '../state/motion'

const SEEN = 'skeam:intro'
const LENGTH_MS = 3300
const EVENT = 'skeam:intro'

function firstTimeThisVisit() {
  if (new URLSearchParams(location.search).has('intro')) return true
  if (!motionOn()) return false
  try {
    if (sessionStorage.getItem(SEEN)) return false
    sessionStorage.setItem(SEEN, '1')
    return true
  } catch {
    return false
  }
}

/** Exhibition mode calls this when it resets for the next visitor. */
export function playIntro() {
  window.dispatchEvent(new Event(EVENT))
}

/**
 * A soft whoosh and a rising chord, timed to the crown landing. Browsers only
 * allow sound after someone has clicked or typed on the page, so on a fresh
 * visit this stays silent instead of blaring out of a classroom laptop.
 */
function chime() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  const ctx = new AC()
  if (ctx.state !== 'running') {
    ctx.close()
    return
  }
  const out = ctx.createGain()
  out.gain.value = 0.18
  out.connect(ctx.destination)
  const t0 = ctx.currentTime

  // whoosh: noise swept through a band-pass filter
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = noise
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(300, t0 + 0.2)
  bp.frequency.exponentialRampToValueAtTime(3000, t0 + 1.15)
  const wg = ctx.createGain()
  wg.gain.setValueAtTime(0, t0 + 0.2)
  wg.gain.linearRampToValueAtTime(0.5, t0 + 0.9)
  wg.gain.linearRampToValueAtTime(0, t0 + 1.25)
  src.connect(bp).connect(wg).connect(out)
  src.start(t0 + 0.2)
  src.stop(t0 + 1.3)

  // chord: C major, rolled upward as the crown lands
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const at = t0 + 1.3 + i * 0.07
    const o = ctx.createOscillator()
    o.type = i === 3 ? 'sine' : 'triangle'
    o.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(0.35, at + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, at + 1.8)
    o.connect(g).connect(out)
    o.start(at)
    o.stop(at + 1.9)
  })
  setTimeout(() => ctx.close(), 4000)
}

export function Intro() {
  const [run, setRun] = useState(() => (firstTimeThisVisit() ? 1 : 0))
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const again = () => {
      if (!motionOn()) return
      setLeaving(false)
      setRun((n) => n + 1)
    }
    window.addEventListener(EVENT, again)
    return () => window.removeEventListener(EVENT, again)
  }, [])

  useEffect(() => {
    if (!run) return
    chime()
    const t = setTimeout(() => setRun(0), LENGTH_MS)
    const skip = () => setLeaving(true)
    window.addEventListener('keydown', skip)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', skip)
    }
  }, [run])

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => {
      setRun(0)
      setLeaving(false)
    }, 250)
    return () => clearTimeout(t)
  }, [leaving])

  if (!run) return null
  return (
    <div key={run} className={`intro ${leaving ? 'leaving' : ''}`} onPointerDown={() => setLeaving(true)} aria-hidden="true">
      <div className="intro-glow" />
      <div className="intro-stage">
        {/* Same drawing as public/skeam-icon.svg, split into parts that animate in. */}
        <svg className="intro-mark" viewBox="-5.37 -4.54 70.84 70.84">
          <defs>
            <radialGradient id="intro-disc" cx="0.38" cy="0.28" r="0.85">
              <stop offset="0" stopColor="#2d5680" />
              <stop offset="0.5" stopColor="#16293f" />
              <stop offset="1" stopColor="#090f19" />
            </radialGradient>
            <linearGradient id="intro-ring" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f5f9fc" />
              <stop offset="0.55" stopColor="#b7c8d6" />
              <stop offset="1" stopColor="#7c90a3" />
            </linearGradient>
            <linearGradient id="intro-metal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#cddbe8" />
            </linearGradient>
            <linearGradient id="intro-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff1b8" />
              <stop offset="0.45" stopColor="#f7c748" />
              <stop offset="1" stopColor="#c88712" />
            </linearGradient>
            <linearGradient id="intro-band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbdc7c" />
              <stop offset="1" stopColor="#b3740c" />
            </linearGradient>
            <radialGradient id="intro-pearl" cx="0.35" cy="0.3" r="0.75">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#f1c44a" />
            </radialGradient>
            <radialGradient id="intro-ruby" cx="0.35" cy="0.3" r="0.75">
              <stop offset="0" stopColor="#ff9a8f" />
              <stop offset="1" stopColor="#a61f17" />
            </radialGradient>
            <radialGradient id="intro-sapphire" cx="0.35" cy="0.3" r="0.75">
              <stop offset="0" stopColor="#9fdcff" />
              <stop offset="1" stopColor="#1d63a6" />
            </radialGradient>
            <linearGradient id="intro-shine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <clipPath id="intro-clip">
              <circle cx="32" cy="36" r="26.2" />
              <path transform="translate(19.47 17.43) rotate(-34) scale(0.62)" d="M-14.2 -6.2 L-17.6 -19.4 L-8.6 -12.4 L0 -23.6 L8.6 -12.4 L17.6 -19.4 L14.2 -6.2 Q0 -3.4 -14.2 -6.2 Z" />
              <path transform="translate(19.47 17.43) rotate(-34) scale(0.62)" d="M-15.2 -6.9 Q0 -3.8 15.2 -6.9 L15.2 -1.2 Q0 1.9 -15.2 -1.2 Z" />
            </clipPath>
          </defs>
          <circle className="i-pulse" cx="32" cy="36" r="25" />
          <g className="i-disc">
            <circle cx="32" cy="36" r="26.6" fill="#050910" opacity="0.35" />
            <circle cx="32" cy="36" r="25" fill="url(#intro-disc)" />
            <circle cx="32" cy="36" r="23.6" fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth="0.8" />
          </g>
          <circle className="i-ring" cx="32" cy="36" r="25" />
          <path className="i-edge" d="M10.76 28.27 A22.6 22.6 0 0 1 40.47 15.05" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.3" strokeLinecap="round" />
          <g className="i-shadow" fill="#000" opacity="0.35" transform="translate(0.7 1.2)">
            <path d="M22.97 49.14 L42.4 33.69 L37.6 28.31 L20.03 45.86 Z" />
            <circle cx="40" cy="31" r="9.8" />
            <circle cx="21.5" cy="47.5" r="5.9" />
          </g>
          <path className="i-rod" d="M22.97 49.14 L42.4 33.69 L37.6 28.31 L20.03 45.86 Z" fill="url(#intro-metal)" />
          <g className="i-big">
            <circle cx="40" cy="31" r="8.2" fill="#0b1524" stroke="url(#intro-metal)" strokeWidth="3.2" />
            <circle cx="40" cy="31" r="3.4" fill="url(#intro-metal)" />
          </g>
          <circle className="i-small" cx="21.5" cy="47.5" r="4.6" fill="#0b1524" stroke="url(#intro-metal)" strokeWidth="2.6" />
          {/* the transform sits on an outer group: the drop-in animation sets its own transform on .i-crown */}
          <g transform="translate(19.47 17.43) rotate(-34) scale(0.62)">
            <g className="i-crown">
              <path d="M-14.2 -6.2 L-17.6 -19.4 L-8.6 -12.4 L0 -23.6 L8.6 -12.4 L17.6 -19.4 L14.2 -6.2 Q0 -3.4 -14.2 -6.2 Z" fill="url(#intro-gold)" stroke="#7a4d0b" strokeWidth="0.9" strokeLinejoin="round" />
              <path d="M0 -23.6 L-8.6 -12.4 L-14.2 -6.2 Q-7 -4.8 0 -4.6 Z" fill="#fff" opacity="0.22" />
              <path d="M-15.2 -6.9 Q0 -3.8 15.2 -6.9 L15.2 -1.2 Q0 1.9 -15.2 -1.2 Z" fill="url(#intro-band)" stroke="#7a4d0b" strokeWidth="0.9" strokeLinejoin="round" />
              <path d="M-13.4 -5.6 Q0 -2.9 13.4 -5.6" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" strokeLinecap="round" />
              <circle className="i-gem" cx="-17.6" cy="-19.4" r="2.2" fill="url(#intro-pearl)" stroke="#9a650c" strokeWidth="0.5" />
              <circle className="i-gem" cx="0" cy="-23.6" r="2.5" fill="url(#intro-pearl)" stroke="#9a650c" strokeWidth="0.5" />
              <circle className="i-gem" cx="17.6" cy="-19.4" r="2.2" fill="url(#intro-pearl)" stroke="#9a650c" strokeWidth="0.5" />
              <circle cx="-8.5" cy="-2.9" r="1.15" fill="url(#intro-sapphire)" />
              <circle cx="8.5" cy="-2.9" r="1.15" fill="url(#intro-sapphire)" />
              <path d="M0 -4.4 L1.6 -2.4 L0 -0.3999999999999999 L-1.6 -2.4 Z" fill="url(#intro-ruby)" stroke="#6b120d" strokeWidth="0.4" />
            </g>
          </g>
          <g clipPath="url(#intro-clip)">
            <rect className="i-shine" x="-30" y="-6" width="22" height="72" fill="url(#intro-shine)" transform="skewX(-20)" />
          </g>
        </svg>
        <div className="intro-word">
          {'SKEAM'.split('').map((c, i) => (
            <span key={i} style={{ animationDelay: `${1.75 + i * 0.06}s` }}>
              {c}
            </span>
          ))}
        </div>
        <div className="intro-tag">
          KING
        </div>
      </div>
    </div>
  )
}
