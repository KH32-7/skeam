export interface Achievement {
  id: string
  name: string
  desc: string
  icon: string
  code?: string
}

export interface NewsItem {
  title: string
  date: string
  version: string
  html: string
  image: string
}

/** A Steam trailer: an HLS stream (newer store pages) or an mp4 (older ones). */
export interface Trailer {
  name: string
  thumb: string
  mp4: string
  hls: string
}

/** A game the club released on Steam; its store page is filled in from Steam. */
export interface SteamInfo {
  appid: number
  url: string
  /** Steam's current price, e.g. "₩ 8,800" or "무료"; '' before release. */
  priceText: string
  comingSoon: boolean
  releaseText: string
  platforms: { windows: boolean; mac: boolean; linux: boolean }
  /** game.yml fields that were blank and came from Steam (the register helper leaves them blank again). */
  fromSteam: string[]
}

export interface Game {
  id: string
  title: string
  titleEn: string
  developer: string
  release: string
  /** Not out yet: can be wishlisted, not bought. release may be '2026-10', '2026-10-15' or ''. */
  comingSoon: boolean
  price: number
  discount: number
  finalPrice: number
  playUrl: string
  /** The web build loads skeam-sdk.js (cloud saves, achievements). null: couldn't check. */
  sdk: boolean | null
  repo: string
  download: string
  downloadSize: string
  version: string
  /** 'steam': only on Steam (no browser build or download on SKEAM). */
  platform: 'web' | 'windows' | 'both' | 'steam'
  tags: string[]
  short: string
  controls: string
  aiTools: string[]
  aiNote: string
  devPeriod: string
  engine: string
  video: string
  trailers: Trailer[]
  steam: SteamInfo | null
  mobile: boolean
  updated: string
  aboutHtml: string
  aboutMd: string
  images: { header: string; capsule: string; hero: string; logo: string; screenshots: string[] }
  achievements: Achievement[]
  news: NewsItem[]
}

export interface Club {
  name: string
  tagline: string
  aboutHtml: string
  banner: string
  join: string
  members: { name: string; role: string; github: string; avatar: string; bio: string }[]
  photos: string[]
}

export interface Site {
  builtAt: string
  /** Where the site lives, e.g. https://kh32-7.github.io/skeam/ */
  url: string
  featured: string[]
  /** 운영자 추천 from site.yml, with the admin's one-line note. */
  picks: { id: string; note: string }[]
  registerEndpoint: string
  repo: string
  problems: Record<string, string[]>
  admins: string[]
  skipped: string[]
}
