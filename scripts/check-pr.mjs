// Decides whether a pull request can be merged without a human looking at it.
// Run by .github/workflows/auto-merge.yml on the base branch's checkout; the
// PR's code is never executed, only its games/<id>/ files are read as data.
//
//   BASE_SHA=... HEAD_SHA=... PR_AUTHOR=... REPO_OWNER=... node scripts/check-pr.mjs
//
// A PR passes when:
//   - it only touches one games/<id>/ folder (no symlinks, game.yml kept),
//   - its author may change that game: the repo owner, the game's own GitHub
//     account (from `github:`, play_url or repo), or, for a new game, anyone
//     in site.yml `trusted_github`,
//   - the data build shows the game with no problems.
// Writes ok=true|false to $GITHUB_OUTPUT and the reason to pr-check.md.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import * as yaml from 'js-yaml'

const { BASE_SHA, HEAD_SHA, PR_AUTHOR = '', REPO_OWNER = '' } = process.env
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
const asList = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v.map(String) : String(v).split(',').map((s) => s.trim()).filter(Boolean))

function finish(ok, lines) {
  const body = ok
    ? `✅ 자동 확인을 통과해서 바로 머지합니다.\n\n${lines.join('\n')}`
    : `🔍 자동 머지 조건에 맞지 않아 운영자가 직접 확인할게요.\n\n${lines.map((l) => `- ${l}`).join('\n')}`
  fs.writeFileSync('pr-check.md', body + '\n')
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ok=${ok}\n`)
  console.log(body)
  process.exit(0)
}

function ownerOf(ymlText) {
  let g = {}
  try {
    g = yaml.load(ymlText) ?? {}
  } catch {
    return ''
  }
  if (g.github) return String(g.github).replace(/^@/, '')
  const m = String(g.play_url ?? '').match(/^https:\/\/([\w-]+)\.github\.io\//i) ?? String(g.repo ?? '').match(/github\.com\/([\w-]+)\//i)
  return m ? m[1] : ''
}

const show = (sha, file) => {
  try {
    return git('show', `${sha}:${file}`)
  } catch {
    return null
  }
}

// 1. What changed.
const raw = git('diff', '--raw', '--no-renames', `${BASE_SHA}...${HEAD_SHA}`).trim()
const changes = raw
  ? raw.split('\n').map((l) => {
      const [meta, file] = l.split('\t')
      const [, , newMode, , , status] = meta.split(/\s+/)
      return { file, newMode, status }
    })
  : []
if (!changes.length) finish(false, ['바뀐 파일이 없어요.'])

const outside = changes.filter((c) => !/^games\/[a-z0-9][a-z0-9-]*\/./.test(c.file)).map((c) => c.file)
if (outside.length) finish(false, [`games/<게임 id>/ 밖의 파일이 바뀌었어요: ${outside.slice(0, 5).join(', ')}`])
const ids = [...new Set(changes.map((c) => c.file.split('/')[1]))]
if (ids.length > 1) finish(false, [`게임 여러 개(${ids.join(', ')})를 한 번에 바꿨어요. 게임 하나씩 PR을 보내 주세요.`])
const id = ids[0]
const links = changes.filter((c) => c.newMode === '120000').map((c) => c.file)
if (links.length) finish(false, [`심볼릭 링크는 받을 수 없어요: ${links.join(', ')}`])

const baseYml = show(BASE_SHA, `games/${id}/game.yml`)
const headYml = show(HEAD_SHA, `games/${id}/game.yml`)
if (headYml == null) finish(false, [`games/${id}/game.yml이 없어요. 게임 삭제는 운영자가 직접 처리해요.`])

// 2. Who may change it.
const site = yaml.load(fs.readFileSync('site.yml', 'utf8')) ?? {}
const trusted = asList(site.trusted_github)
const isNew = baseYml == null
const owner = ownerOf(isNew ? headYml : baseYml)
const why = same(PR_AUTHOR, REPO_OWNER)
  ? '레포 주인'
  : same(PR_AUTHOR, owner)
    ? `이 게임의 GitHub 계정(${owner})`
    : isNew && trusted.some((t) => same(t, PR_AUTHOR))
      ? '신뢰 목록(site.yml trusted_github)에 있는 계정'
      : ''
if (!why) {
  finish(false, [
    isNew
      ? `새 게임인데 보낸 사람(${PR_AUTHOR})이 게임 주소의 GitHub 계정(${owner || '알 수 없음'})과 다르고 신뢰 목록에도 없어요.`
      : `이미 있는 게임 '${id}'의 GitHub 계정(${owner || '알 수 없음'})과 보낸 사람(${PR_AUTHOR})이 달라요.`,
  ])
}

// 3. Does it build cleanly? Swap in the PR's copy of the folder (data only)
// and run the base branch's own build script.
fs.rmSync(`games/${id}`, { recursive: true, force: true })
git('checkout', HEAD_SHA, '--', `games/${id}`)
try {
  execFileSync('node', ['scripts/build-data.mjs'], { stdio: 'inherit' })
} catch {
  finish(false, ['데이터 빌드가 실패했어요. Actions 로그를 확인해 주세요.'])
}
const built = JSON.parse(fs.readFileSync('public/data/site.json', 'utf8'))
const issues = built.problems?.[id] ?? []
if (built.skipped?.includes(id)) issues.unshift('게임이 스토어에 표시될 수 없어요 (제목, 헤더 이미지, 플레이 주소/다운로드 중 빠진 것이 있어요).')
if (issues.length) finish(false, issues)

finish(true, [`- 게임: ${id}${isNew ? ' (새 게임)' : ''}`, `- 보낸 사람: ${PR_AUTHOR} — ${why}`])
