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
  repo: string
  download: string
  downloadSize: string
  version: string
  platform: 'web' | 'windows' | 'both'
  tags: string[]
  short: string
  controls: string
  aiTools: string[]
  aiNote: string
  devPeriod: string
  engine: string
  video: string
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
  featured: string[]
  registerEndpoint: string
  repo: string
  problems: Record<string, string[]>
  admins: string[]
  skipped: string[]
}
