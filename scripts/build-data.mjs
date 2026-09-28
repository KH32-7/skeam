// Reads games/, club/ and site.yml, validates them, and writes the JSON
// the site loads (public/data/*.json) plus the images it shows (public/g/).
//
//   node scripts/build-data.mjs            warn on problems, keep going
//   node scripts/build-data.mjs --strict   exit 1 on any problem
//
// A game that can't be shown (no title, no header image, nothing to play) is
// left out instead of failing the build, so one broken submission never
// blocks everyone else. Its problems go into site.json, where the register
// helper picks them up and tells the submitter what to fix.
//
// When GITHUB_TOKEN is set (or the API is reachable anonymously), games with
// a `repo:` field get their latest GitHub Release merged in: download link,
// size, version, and the release notes as a patch note.
//
// Games with a `steam:` field get their store page from Steam (see steam.mjs).
// If Steam can't be reached, the copy the live site built last time is used.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import * as yaml from 'js-yaml'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import { fetchPlayers, fetchReviews, fetchSteam, normalizeSteam, steamAppId, steamPopularity, steamRelease } from './steam.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..')
const STRICT = process.argv.includes('--strict')
const OUT_DATA = path.join(ROOT, 'public', 'data')
const OUT_IMG = path.join(ROOT, 'public', 'g')
const OUT_SHARE = path.join(ROOT, 'public', 'app')

// Markdown from creators ends up in the page as HTML: keep formatting, drop
// scripts, event handlers and javascript: links.
function md(text) {
  return sanitizeHtml(marked.parse(String(text ?? '')), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'del', 'details', 'summary'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'], '*': ['align'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noreferrer' }) },
  })
}

// Steam's own description: the same, plus the looping clips many store pages use.
function steamHtml(html) {
  return sanitizeHtml(String(html ?? ''), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'video', 'source'],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      video: ['autoplay', 'muted', 'loop', 'playsinline', 'poster', 'width', 'height'],
      source: ['src', 'type'],
    },
    allowedSchemes: ['https'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noreferrer' }) },
  })
}

const problems = []
const problem = (id, msg) => problems.push(`[${id}] ${msg}`)

const readYaml = (file) => yaml.load(fs.readFileSync(file, 'utf8')) ?? {}
const exists = (p) => fs.existsSync(p)

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

// "---\nkey: value\n---\nbody" -> { meta, body }
function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: text }
  return { meta: yaml.load(m[1]) ?? {}, body: m[2] }
}

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
function findImage(dir, base) {
  for (const ext of IMAGE_EXT) {
    const p = path.join(dir, base + ext)
    if (exists(p)) return p
  }
  return null
}

function listImages(dir) {
  if (!exists(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => IMAGE_EXT.includes(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(dir, f))
}

// "?v=<content hash>": a replaced image gets a new address, so browsers and
// GitHub Pages' 10-minute cache can't keep showing the old picture.
function version(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 8)
}

function publish(id, src) {
  const rel = path.relative(path.join(ROOT, 'games', id), src).split(path.sep).join('/')
  copy(src, path.join(OUT_IMG, id, rel))
  return `g/${id}/${rel}?v=${version(src)}`
}

// Coming-soon games may give "2026-10-15", just "2026-10", or nothing (미정).
function releaseOf(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const t = String(v ?? '').trim()
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(t)) return t
  return ''
}

// Today in Korea, so a game dated 2026-10-15 opens at midnight KST.
const TODAY_KST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

function toDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return v ? String(v) : ''
}

function asList(v) {
  if (v == null || v === '') return []
  return Array.isArray(v) ? v.map(String) : String(v).split(',').map((s) => s.trim()).filter(Boolean)
}

// Tags come as "a, b" or YAML lists, and some people write "#a #b" hashtags.
function tagList(v) {
  return [...new Set(asList(v).flatMap((t) => (t.includes('#') ? t.split('#') : [t])).map((t) => t.trim()).filter(Boolean))]
}

// "1.10.0" > "1.2" > "1.1.0"; missing versions sort last.
function compareVersions(a, b) {
  const pa = String(a || '').split(/[^0-9]+/).filter(Boolean).map(Number)
  const pb = String(b || '').split(/[^0-9]+/).filter(Boolean).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1)
    if (d) return d
  }
  return 0
}

function humanSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`
}

// A Drive share link opens a preview page; turn it into a direct download.
function directDownload(url) {
  const m = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{20,})/)
  return m ? `https://drive.usercontent.google.com/download?id=${m[1]}&export=download` : url
}

function parseRepo(url) {
  const m = String(url).match(/github\.com\/([^/]+)\/([^/#?]+)/)
  return m ? `${m[1]}/${m[2].replace(/\.git$/, '')}` : null
}

async function latestRelease(repo) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'skeam-build' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers })
    if (res.status === 404) return { missing: true }
    if (!res.ok) return { error: `GitHub API ${res.status}` }
    return { release: await res.json() }
  } catch (e) {
    return { error: String(e.message ?? e) }
  }
}

// Steam answers for this build, written to data/steam.json with a week of
// player and review samples. The file the live site built last time carries
// that history over, and stands in when Steam is down, so an hourly build
// never drops a Steam game or its pictures.
const steamData = {}
let lastSteam
function previousSteam(appid) {
  lastSteam ??= fetch(`${SITE_URL}data/steam.json`, { headers: { 'User-Agent': 'skeam-build' }, signal: AbortSignal.timeout(15000) })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return lastSteam.then((all) => all?.[appid] ?? null)
}

async function steamInfo(id, appid) {
  const [r, prev] = await Promise.all([fetchSteam(appid), previousSteam(appid)])
  let st = null
  if (r.data) {
    st = normalizeSteam(appid, r.data, steamHtml)
    // Out, but the Korean date didn't read: try the English store, then last time's date.
    if (!st.comingSoon && !st.release) {
      const en = await fetchSteam(appid, 'english')
      st.release = steamRelease(en.data?.release_date?.date) || prev?.release || ''
      if (!st.release) console.warn(`  [${id}] Steam 출시일을 읽지 못했습니다: ${st.releaseText}`)
    }
  } else if (r.missing) {
    problem(id, `Steam에서 앱 ${appid}을(를) 찾지 못했습니다 (주소를 확인하거나, 상점 페이지가 공개됐는지 확인해 주세요)`)
    return null
  } else {
    if (prev) console.warn(`  [${id}] Steam 확인 실패 (${r.error}), 지난번 정보로 진행`)
    else problem(id, `Steam 정보를 불러오지 못했습니다 (${r.error})`)
    st = prev && { ...prev }
  }
  if (!st) return null
  const [players, reviews] = await Promise.all([fetchPlayers(appid), fetchReviews(appid)])
  const pop = steamPopularity(prev?.history, players, reviews)
  st.history = pop.history
  // The day SKEAM first built this game: a Steam game that came out long ago
  // is still new here, so the new-releases tab goes by this.
  st.listed = prev?.listed || TODAY_KST
  // Steam down this hour: keep last time's review words instead of blanking them.
  st.popularity = reviews ? pop.summary : { ...pop.summary, positive: prev?.popularity?.positive ?? null, label: prev?.popularity?.label ?? '' }
  return st
}

/**
 * Whether a web game's page loads skeam-sdk.js (needed for cloud saves and
 * achievements). null when the page couldn't be read, so the site doesn't
 * claim either way.
 */
async function hasSdk(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'skeam-build' }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    return /skeam-sdk(\.min)?\.js/.test(await res.text())
  } catch {
    return null
  }
}

function pickAsset(assets) {
  const score = (a) => (/\.zip$/i.test(a.name) ? 3 : /\.exe$/i.test(a.name) ? 2 : /\.(7z|rar)$/i.test(a.name) ? 1 : 0)
  return [...(assets ?? [])].sort((a, b) => score(b) - score(a))[0]
}

async function buildGame(id) {
  const dir = path.join(ROOT, 'games', id)
  const ymlPath = path.join(dir, 'game.yml')
  if (!exists(ymlPath)) {
    problem(id, 'game.yml이 없습니다')
    return null
  }
  let y
  try {
    y = readYaml(ymlPath)
  } catch (e) {
    problem(id, `game.yml 형식 오류: ${e.message}`)
    return null
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) problem(id, '폴더 이름(게임 id)은 영문 소문자, 숫자, -만 쓸 수 있습니다')

  // A Steam game fills in whatever game.yml and the folder leave out.
  const appid = steamAppId(y.steam)
  if (y.steam && !appid) problem(id, `steam 주소를 이해하지 못했습니다: ${y.steam} (예: https://store.steampowered.com/app/1234560/)`)
  const st = appid ? await steamInfo(id, appid) : null
  if (st) steamData[appid] = st
  const fromSteam = []
  const orSteam = (key, own, steam) => {
    const blank = (v) => v == null || v === '' || (Array.isArray(v) && !v.length)
    if (!blank(own)) return own
    if (st && !blank(steam)) fromSteam.push(key)
    return st ? steam : own
  }
  const title = orSteam('title', y.title, st?.name)
  const developer = orSteam('developer', y.developer, st?.developers[0])

  if (!title) problem(id, 'title(제목)이 비어 있습니다')
  if (!developer) problem(id, 'developer(제작자)가 비어 있습니다')
  // Steam decides whether a Steam game is out yet, unless game.yml says so itself.
  const steamDates = st && y.coming_soon == null && y.release == null
  const release = steamDates ? st.release : releaseOf(y.release)
  if (steamDates) fromSteam.push('release')
  // An exact date that has arrived releases the game on its own (the hourly build picks it up).
  // (Only if there is something to play by then; otherwise it stays coming soon.)
  const hasFiles = Boolean(y.play_url || y.repo || y.download || appid)
  const comingSoon = steamDates ? st.comingSoon : Boolean(y.coming_soon) && !(hasFiles && /^\d{4}-\d{2}-\d{2}$/.test(release) && release <= TODAY_KST)
  if (!comingSoon && !hasFiles) problem(id, 'play_url, repo, download, steam 중 하나는 있어야 합니다 (출시 예정 게임이면 coming_soon: true)')
  const price = Number(orSteam('price', y.price, st?.price) ?? 0)
  if (!Number.isFinite(price) || price < 0) problem(id, 'price는 0 이상의 숫자여야 합니다')
  const discount = Math.min(100, Math.max(0, Number(orSteam('discount', y.discount, st?.discount) ?? 0) || 0))

  const header = findImage(dir, 'header')
  if (!header && !st?.header) problem(id, 'header 이미지가 없습니다 (header.jpg, 920×430)')
  const shots = listImages(path.join(dir, 'screenshots'))
  const capsule = findImage(dir, 'capsule')
  const hero = findImage(dir, 'hero')
  const logo = findImage(dir, 'logo')

  // Pictures in the folder win; a Steam game borrows Steam's for the rest.
  const images = {
    header: header ? publish(id, header) : st?.header ?? '',
    capsule: capsule ? publish(id, capsule) : '',
    hero: hero ? publish(id, hero) : '',
    logo: logo ? publish(id, logo) : '',
    screenshots: shots.length ? shots.map((s) => publish(id, s)) : st?.screenshots ?? [],
  }
  images.capsule ||= images.header
  images.hero ||= images.screenshots[0] || images.header

  const aboutPath = path.join(dir, 'about.md')
  const aboutMd = exists(aboutPath) ? fs.readFileSync(aboutPath, 'utf8') : ''
  const aboutHtml = aboutMd ? md(aboutMd) : st?.aboutHtml ?? ''

  const achievements = (Array.isArray(y.achievements) ? y.achievements : []).map((a, i) => {
    const icon = a.icon && exists(path.join(dir, a.icon)) ? publish(id, path.join(dir, a.icon)) : ''
    if (!a.id) problem(id, `achievements ${i + 1}번째에 id가 없습니다`)
    return { id: String(a.id ?? `a${i}`), name: String(a.name ?? a.id ?? ''), desc: String(a.desc ?? ''), icon, code: a.code ? String(a.code) : undefined }
  })

  const news = []
  const newsDir = path.join(dir, 'news')
  if (exists(newsDir)) {
    for (const f of fs.readdirSync(newsDir).filter((f) => f.endsWith('.md'))) {
      const { meta, body } = frontMatter(fs.readFileSync(path.join(newsDir, f), 'utf8'))
      news.push({
        // Files from the register helper end in a base-36 timestamp, so names sort by upload time.
        order: String(meta.time ?? f),
        title: String(meta.title ?? f.replace(/\.md$/, '')),
        date: toDate(meta.date) || f.slice(0, 10),
        version: meta.version ? String(meta.version) : '',
        html: md(body),
        image: meta.image && exists(path.join(newsDir, meta.image)) ? publish(id, path.join(newsDir, meta.image)) : '',
      })
    }
  }

  const game = {
    id,
    title: String(title ?? id),
    titleEn: y.title_en ? String(y.title_en) : '',
    developer: String(developer ?? ''),
    release: comingSoon || steamDates ? release : toDate(y.release),
    comingSoon,
    price,
    discount,
    finalPrice: Math.round((price * (100 - discount)) / 100),
    playUrl: y.play_url ? String(y.play_url) : '',
    repo: y.repo ? String(y.repo) : '',
    download: y.download ? directDownload(String(y.download)) : '',
    downloadSize: y.download_size ? String(y.download_size) : '',
    version: y.version ? String(y.version) : '',
    tags: tagList(orSteam('tags', y.tags, st?.genres)),
    short: String(orSteam('short', y.short, st?.short) ?? ''),
    controls: String(y.controls ?? ''),
    aiTools: asList(y.ai_tools),
    aiNote: String(y.ai_note ?? ''),
    devPeriod: String(y.dev_period ?? ''),
    engine: String(y.engine ?? ''),
    video: y.video ? String(y.video) : '',
    trailers: st?.movies ?? [],
    steam: st
      ? { appid: st.appid, url: st.url, priceText: st.priceText, comingSoon: st.comingSoon, releaseText: st.releaseText, platforms: st.platforms, popularity: st.popularity, listed: st.listed, fromSteam }
      : null,
    mobile: Boolean(y.mobile),
    hidden: Boolean(y.hidden),
    updated: y.updated ? String(y.updated) : '',
    aboutHtml,
    aboutMd,
    images,
    achievements,
    news,
  }

  if (game.repo) {
    const repo = parseRepo(game.repo)
    if (!repo) problem(id, `repo 주소를 이해하지 못했습니다: ${game.repo}`)
    else {
      const r = await latestRelease(repo)
      if (r.release) {
        const asset = pickAsset(r.release.assets)
        if (asset) {
          game.download = asset.browser_download_url
          game.downloadSize = humanSize(asset.size)
        }
        game.version = r.release.tag_name?.replace(/^v/i, '') || game.version
        news.push({
          order: String(r.release.published_at ?? ''),
          title: r.release.name || r.release.tag_name,
          date: (r.release.published_at ?? '').slice(0, 10),
          version: game.version,
          html: md(r.release.body || '새 버전이 나왔습니다.'),
          image: '',
        })
      } else if (r.missing) {
        if (!game.download) problem(id, `${repo}에 공개 Release가 없습니다 (레포가 비공개이거나 아직 Release를 만들지 않음)`)
      } else {
        console.warn(`  [${id}] Release 확인 실패 (${r.error}) — 이전 정보로 진행`)
      }
    }
  }

  // Newest first: by date, then by version, then by upload order.
  news.sort((a, b) => b.date.localeCompare(a.date) || compareVersions(b.version, a.version) || b.order.localeCompare(a.order))
  news.forEach((n) => delete n.order)
  game.platform = game.playUrl && game.download ? 'both' : game.playUrl ? 'web' : game.download || !game.steam ? 'windows' : 'steam'
  game.sdk = game.playUrl ? await hasSdk(game.playUrl) : false
  return game
}

// Guess a creator's GitHub account from where their games live.
function githubOf(g) {
  const m = (g.playUrl.match(/^https:\/\/([\w-]+)\.github\.io\//i) ?? g.repo.match(/github\.com\/([\w-]+)\//i)) || null
  return m ? m[1] : ''
}

/** Members from club.yml, plus every other creator who has a game on SKEAM. */
function buildClub(games) {
  const dir = path.join(ROOT, 'club')
  const y = exists(path.join(dir, 'club.yml')) ? readYaml(path.join(dir, 'club.yml')) : {}
  const about = exists(path.join(dir, 'about.md')) ? md(fs.readFileSync(path.join(dir, 'about.md'), 'utf8')) : ''
  const pub = (p) => {
    const src = path.join(dir, p)
    if (!exists(src)) return ''
    copy(src, path.join(OUT_IMG, '_club', p))
    return `g/_club/${p.split(path.sep).join('/')}?v=${version(src)}`
  }
  return {
    name: String(y.name ?? 'KING'),
    tagline: String(y.tagline ?? ''),
    aboutHtml: about,
    banner: y.banner ? pub(y.banner) : '',
    join: String(y.join ?? ''),
    members: (() => {
      // Admins (site.yml `admins`) show as 관리자 unless club.yml or their profile says otherwise.
      const admins = new Set(asList(SITE_YML.admins).map((a) => a.toLowerCase()))
      const defaultRole = (name) => (admins.has(String(name).toLowerCase()) ? '관리자' : '제작자')
      const listed = (y.members ?? []).map((m) => ({
        name: String(m.name ?? ''),
        role: m.role ? String(m.role) : defaultRole(m.name ?? ''),
        github: m.github ? String(m.github) : '',
        avatar: m.avatar ? pub(m.avatar) : '',
        bio: String(m.bio ?? ''),
      }))
      const known = new Set(listed.map((m) => m.name.toLowerCase()))
      const extra = []
      for (const g of [...games].sort((a, b) => a.release.localeCompare(b.release))) {
        const key = g.developer.toLowerCase()
        if (!g.developer || known.has(key)) continue
        known.add(key)
        extra.push({ name: g.developer, role: defaultRole(g.developer), github: githubOf(g), avatar: '', bio: '' })
      }
      return [...listed, ...extra]
    })(),
    photos: listImages(path.join(dir, 'photos')).map((p) => pub(path.relative(dir, p))),
  }
}

// Where the site lives, for link previews (they need absolute addresses).
// On GitHub Actions this follows the repo, so moving it to the club org just works.
function siteUrl(siteYml) {
  const own = siteYml.url || process.env.SKEAM_SITE_URL
  if (own) return String(own).replace(/\/?$/, '/')
  const m = String(process.env.GITHUB_REPOSITORY ?? '').match(/^([^/]+)\/(.+)$/)
  return m ? `https://${m[1].toLowerCase()}.github.io/${m[2]}/` : 'https://kh32-7.github.io/skeam/'
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function plainText(markdown) {
  return String(markdown)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * app/<id>/index.html: a tiny page per game whose only job is the link card
 * in KakaoTalk, Discord and the like. Those read the <meta> tags and never run
 * scripts; a person opening the link runs the script and lands on the store page.
 */
function writeSharePage(g, base) {
  const price = g.comingSoon ? '출시 예정' : g.finalPrice === 0 ? '무료' : `₩ ${g.finalPrice.toLocaleString('ko-KR')}${g.discount ? ` (-${g.discount}%)` : ''}`
  const about = g.short || plainText(g.aboutMd).slice(0, 120)
  const desc = `${about}${about ? '\n' : ''}${g.developer} 제작 · ${price}`
  const url = `${base}app/${g.id}/`
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${esc(g.title)} | SKEAM</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SKEAM">
<meta property="og:title" content="${esc(g.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(new URL(g.images.header, base).href)}">
${/^https?:/.test(g.images.header) ? '' : '<meta property="og:image:width" content="920">\n<meta property="og:image:height" content="430">\n'}<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#66c0f4">
<link rel="icon" type="image/svg+xml" href="../../skeam-icon.svg?v=${version(path.join(ROOT, 'public', 'skeam-icon.svg'))}">
<script>location.replace('../../#/app/${g.id}')</script>
</head>
<body style="background:#1b2838;color:#c7d5e0;font-family:sans-serif">
<p><a style="color:#66c0f4" href="../../#/app/${g.id}">SKEAM에서 ${esc(g.title)} 보기</a></p>
</body>
</html>
`
  fs.mkdirSync(path.join(OUT_SHARE, g.id), { recursive: true })
  fs.writeFileSync(path.join(OUT_SHARE, g.id, 'index.html'), html)
}

/** site.yml picks: `- id: celrush` + `note: "..."` (or just an id). */
function readPicks(v, games) {
  const out = []
  for (const p of Array.isArray(v) ? v : []) {
    const id = String(typeof p === 'object' && p ? p.id ?? '' : p ?? '').trim()
    if (!id) continue
    if (!games.some((g) => g.id === id)) {
      problem('site.yml', `picks에 없는 게임 id: ${id}`)
      continue
    }
    out.push({ id, note: typeof p === 'object' && p?.note ? String(p.note).trim().slice(0, 200) : '' })
  }
  return out
}

const SITE_YML = exists(path.join(ROOT, 'site.yml')) ? readYaml(path.join(ROOT, 'site.yml')) : {}
const SITE_URL = siteUrl(SITE_YML)

async function main() {
  rmrf(OUT_DATA)
  rmrf(OUT_IMG)
  rmrf(OUT_SHARE)
  fs.mkdirSync(OUT_DATA, { recursive: true })

  const gamesDir = path.join(ROOT, 'games')
  const ids = fs
    .readdirSync(gamesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)

  const built = await Promise.all(ids.map(buildGame))
  const showable = (g) => g && g.title && g.images.header && (g.comingSoon || g.playUrl || g.download || g.repo || g.steam)
  const skipped = ids.filter((id, i) => !showable(built[i]))
  const games = built.filter(showable).filter((g) => !g.hidden)
  const problemsById = {}
  for (const p of problems) {
    const m = p.match(/^\[([^\]]+)\] (.*)$/)
    if (m) (problemsById[m[1]] ??= []).push(m[2])
  }
  const siteYml = SITE_YML
  const featured = asList(siteYml.featured).filter((id) => games.some((g) => g.id === id))
  for (const id of asList(siteYml.featured)) if (!games.some((g) => g.id === id)) problem('site.yml', `없는 게임 id: ${id}`)

  const url = SITE_URL
  for (const g of games) writeSharePage(g, url)

  const site = {
    builtAt: new Date().toISOString(),
    url,
    featured,
    picks: readPicks(siteYml.picks, games),
    registerEndpoint: String(siteYml.register_endpoint ?? process.env.SKEAM_REGISTER_ENDPOINT ?? ''),
    repo: String(siteYml.repo ?? process.env.GITHUB_REPOSITORY ?? ''),
    problems: problemsById,
    admins: asList(siteYml.admins),
    skipped,
  }

  fs.writeFileSync(path.join(OUT_DATA, 'games.json'), JSON.stringify(games))
  fs.writeFileSync(path.join(OUT_DATA, 'club.json'), JSON.stringify(buildClub(games)))
  fs.writeFileSync(path.join(OUT_DATA, 'site.json'), JSON.stringify(site))
  fs.writeFileSync(path.join(OUT_DATA, 'steam.json'), JSON.stringify(steamData))

  console.log(`SKEAM 데이터: 게임 ${games.length}개${skipped.length ? ` (빠진 게임: ${skipped.join(', ')})` : ''}`)
  if (problems.length) {
    console.log(`\n확인이 필요한 항목 ${problems.length}개:`)
    for (const p of problems) console.log('  - ' + p)
    if (STRICT) process.exit(1)
  }
}

main()
