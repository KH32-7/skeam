import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Cropper } from '../components/Cropper'
import { StoreNav } from '../components/StoreNav'
import { Loading, Price, Tags } from '../components/ui'
import { fetchLiveGames, fetchLiveSite, useData } from '../data/api'
import { koDate } from '../format'
import type { Game, Site } from '../types'
import { authFields } from '../state/account'
import { useStore } from '../state/store'
import { DEFAULT_TAGS, TAG_COLUMNS } from '../data/tags'

/** "My games": the creator name matches this visitor's SKEAM nickname. */
function useMyName() {
  // Logged in: the account name is what the desk checks. Otherwise the local nickname.
  return useStore((s) => s.session?.name ?? s.profile?.name.trim() ?? '')
}
const isMine = (g: Game, name: string) => !!name && g.developer.trim().toLowerCase() === name.toLowerCase()

function NotMine({ name }: { name: string }) {
  return (
    <div className="notice warn">
      {name ? (
        <>
          제작자 이름이 내 닉네임 <b>{name}</b>과(와) 같은 게임이 없어요. 게임을 등록할 때 쓴 제작자 이름으로{' '}
          <Link to="/profile">프로필 닉네임</Link>을 바꾸면 여기에 나타나요.
        </>
      ) : (
        <>먼저 SKEAM 닉네임을 정해 주세요.</>
      )}
    </div>
  )
}

// ---- shape of the form -------------------------------------------------------

type WinMode = 'none' | 'repo' | 'upload' | 'link'

interface Ach {
  id: string
  name: string
  desc: string
  code: string
  icon?: string // data URL (new) or published path (existing)
  iconFile?: File
}

interface Form {
  id: string
  title: string
  titleEn: string
  developer: string
  price: string
  discount: string
  short: string
  tags: string
  controls: string
  aiTools: string
  devPeriod: string
  aiNote: string
  engine: string
  video: string
  playUrl: string
  win: WinMode
  repo: string
  link: string
  version: string
  downloadSize: string
  about: string
  release: string
  /** Coming soon: not playable yet, can be wishlisted. */
  soon: boolean
  releaseMode: 'date' | 'month' | 'tba'
  releaseMonth: string
}

const empty: Form = {
  id: '',
  title: '',
  titleEn: '',
  developer: '',
  price: '0',
  discount: '0',
  short: '',
  tags: '',
  controls: '',
  aiTools: 'Claude Code',
  devPeriod: '',
  aiNote: '',
  engine: '',
  video: '',
  playUrl: '',
  win: 'none',
  repo: '',
  link: '',
  version: '1.0.0',
  downloadSize: '',
  about: '',
  release: new Date().toISOString().slice(0, 10),
  soon: false,
  releaseMode: 'date',
  releaseMonth: new Date().toISOString().slice(0, 7),
}

const SLOTS = {
  header: { w: 920, h: 430, label: '가로 배너 (필수)', hint: '상점 목록·검색·상세 페이지에 쓰입니다' },
  capsule: { w: 600, h: 900, label: '세로 포스터', hint: '라이브러리 격자에 쓰입니다. 없으면 가로 배너를 씁니다' },
  hero: { w: 1920, h: 620, label: '라이브러리 배경', hint: '없으면 첫 스크린샷을 씁니다' },
} as const
type Slot = keyof typeof SLOTS

const MAX_UPLOAD = 30 * 1024 * 1024

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function fromGame(g: Game, site: Site): Form {
  const hosted = site.repo && g.download.includes(`github.com/${site.repo}/releases/download/`)
  return {
    ...empty,
    id: g.id,
    title: g.title,
    titleEn: g.titleEn,
    developer: g.developer,
    price: String(g.price),
    discount: String(g.discount),
    short: g.short,
    tags: g.tags.join(', '),
    controls: g.controls,
    aiTools: g.aiTools.join(', '),
    devPeriod: g.devPeriod,
    aiNote: g.aiNote,
    engine: g.engine,
    video: g.video,
    playUrl: g.playUrl,
    win: g.repo ? 'repo' : hosted ? 'upload' : g.download ? 'link' : 'none',
    repo: g.repo,
    link: hosted ? '' : g.download,
    version: g.version || '1.0.0',
    downloadSize: g.downloadSize,
    about: '', // filled from about.md below
    release: /^\d{4}-\d{2}-\d{2}$/.test(g.release) ? g.release : empty.release,
    soon: g.comingSoon,
    releaseMode: !g.comingSoon || /^\d{4}-\d{2}-\d{2}$/.test(g.release) ? 'date' : /^\d{4}-\d{2}$/.test(g.release) ? 'month' : 'tba',
    releaseMonth: /^\d{4}-\d{2}/.test(g.release) ? g.release.slice(0, 7) : empty.releaseMonth,
  }
}

const q = (s: string) => JSON.stringify(s)
const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
// Tags also accept "#a #b" hashtag style.
const tagList = (s: string) => [...new Set(list(s).flatMap((t) => (t.includes('#') ? t.split('#') : [t])).map((t) => t.trim()).filter(Boolean))]

function toYaml(f: Form, extra: { download?: string; downloadSize?: string; achievements: Ach[]; updated: string }) {
  const L: string[] = []
  L.push(`title: ${q(f.title)}`)
  if (f.titleEn) L.push(`title_en: ${q(f.titleEn)}`)
  L.push(`developer: ${q(f.developer)}`)
  if (!f.soon) L.push(`release: ${f.release}`)
  else {
    L.push('coming_soon: true')
    if (f.releaseMode === 'date') L.push(`release: ${f.release}`)
    if (f.releaseMode === 'month') L.push(`release: ${q(f.releaseMonth)}`)
  }
  L.push(`price: ${Number(f.price) || 0}`)
  if (Number(f.discount)) L.push(`discount: ${Number(f.discount)}`)
  if (f.playUrl) L.push(`play_url: ${q(f.playUrl)}`)
  if (f.win === 'repo') L.push(`repo: ${q(f.repo)}`)
  if (extra.download) L.push(`download: ${q(extra.download)}`)
  if (extra.downloadSize) L.push(`download_size: ${q(extra.downloadSize)}`)
  if (f.win !== 'none' && f.version) L.push(`version: ${q(f.version)}`)
  L.push(`tags: [${tagList(f.tags).map(q).join(', ')}]`)
  L.push(`short: ${q(f.short)}`)
  if (f.controls) L.push(`controls: ${q(f.controls)}`)
  L.push(`ai_tools: [${list(f.aiTools).map(q).join(', ')}]`)
  if (f.devPeriod) L.push(`dev_period: ${q(f.devPeriod)}`)
  if (f.aiNote) L.push(`ai_note: ${q(f.aiNote)}`)
  if (f.engine) L.push(`engine: ${q(f.engine)}`)
  if (f.video) L.push(`video: ${q(f.video)}`)
  if (extra.achievements.length) {
    L.push('achievements:')
    for (const a of extra.achievements) {
      L.push(`  - id: ${q(a.id)}`)
      L.push(`    name: ${q(a.name)}`)
      if (a.desc) L.push(`    desc: ${q(a.desc)}`)
      if (a.code) L.push(`    code: ${q(a.code)}`)
      if (a.icon) L.push(`    icon: ${q(`achievements/${a.id}.png`)}`)
    }
  }
  L.push(`updated: ${q(extra.updated)}`)
  return L.join('\n') + '\n'
}

const b64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1)

function fileToB64(file: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(b64(String(r.result)))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(file)
  })
}

async function urlToB64(url: string) {
  const blob = await (await fetch(url)).blob()
  return fileToB64(new File([blob], 'x'))
}

// ---- page -------------------------------------------------------------------

export default function Register() {
  const { data } = useData()
  const [params, setParams] = useSearchParams()
  const tab = params.get('guide') ? 'guide' : params.get('tab') ?? 'new'
  const setTab = (t: string) => setParams(t === 'new' ? {} : t === 'guide' ? { guide: '1' } : { tab: t })

  return (
    <div className="store">
      <div className="store-wrap">
        <StoreNav />
        <h1 className="page-title">게임 등록 도우미</h1>
        <div className="tabs-row" style={{ marginTop: 0, marginBottom: 20 }}>
          {[
            ['new', '새 게임 등록'],
            ['edit', '내 게임 수정'],
            ['news', '패치 노트 올리기'],
            ['guide', '등록 가이드'],
          ].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        {!data ? (
          <Loading />
        ) : tab === 'guide' ? (
          <Guide />
        ) : tab === 'news' ? (
          <NewsForm games={data.games} site={data.site} />
        ) : tab === 'edit' ? (
          <EditPicker games={data.games} site={data.site} />
        ) : (
          <GameForm key="new" games={data.games} site={data.site} />
        )}
      </div>
    </div>
  )
}

function EditPicker({ games: all, site }: { games: Game[]; site: Site }) {
  const me = useMyName()
  const games = all.filter((g) => isMine(g, me))
  const [id, setId] = useState('')
  const g = games.find((x) => x.id === id)
  if (!games.length) return <NotMine name={me} />
  return (
    <>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>수정할 게임</label>
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">게임을 고르세요</option>
            {games.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title} ({x.developer})
              </option>
            ))}
          </select>
        </div>
      </div>
      {g && (
        <>
          {g.repo && <SyncBox site={site} g={g} />}
          <GameForm key={g.id} games={all} site={site} existing={g} existingAbout={g.aboutMd} />
        </>
      )}
    </>
  )
}

function GameForm({ games, site, existing, existingAbout }: { games: Game[]; site: Site; existing?: Game; existingAbout?: string }) {
  const me = useMyName()
  const [f, setF] = useState<Form>(() => (existing ? { ...fromGame(existing, site), about: existingAbout ?? '' } : { ...empty, developer: me }))
  const [idTouched, setIdTouched] = useState(!!existing)
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({})
  const [crops, setCrops] = useState<Partial<Record<Slot, string>>>({})
  const [shotFiles, setShotFiles] = useState<File[]>([])
  const [shotCrops, setShotCrops] = useState<Record<number, string>>({})
  const [exe, setExe] = useState<File | null>(null)
  const [achs, setAchs] = useState<Ach[]>(() =>
    (existing?.achievements ?? []).map((a) => ({ id: a.id, name: a.name, desc: a.desc, code: a.code ?? '', icon: a.icon || undefined })),
  )
  const [showErrors, setShowErrors] = useState(false)
  const [submit, setSubmit] = useState<SubmitState | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  // Tags already used on SKEAM, most common first, so creators reuse them.
  const knownTags = useMemo(() => {
    const n = new Map<string, number>()
    games.forEach((g) => g.tags.forEach((t) => n.set(t, (n.get(t) ?? 0) + 1)))
    return [...n.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([t]) => t)
  }, [games])
  useEffect(() => {
    if (!idTouched) set('id', slug(f.titleEn || ''))
  }, [f.titleEn, idTouched])

  const taken = existing ? undefined : games.find((g) => g.id === f.id)
  const clash = !!taken && isMine(taken, me)
  const othersGame = !!taken && !isMine(taken, me)

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (!f.title.trim()) e.title = '제목을 적어 주세요'
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(f.id)) e.id = '영문 소문자, 숫자, -로 2~40자'
    else if (othersGame) e.id = `이미 ${taken!.developer}의 게임(${taken!.title})이 쓰는 이름이에요. 다른 이름을 써 주세요`
    if (!f.developer.trim()) e.developer = '제작자 이름을 적어 주세요'
    if (!f.short.trim()) e.short = '한 줄 소개를 적어 주세요'
    if (!(Number(f.price) >= 0)) e.price = '0 이상의 숫자'
    if (!f.soon && !f.playUrl && f.win === 'none') e.playUrl = '브라우저 주소나 Windows 다운로드 중 하나는 있어야 합니다 (아직 없으면 "출시 예정 게임"을 체크하세요)'
    if (f.playUrl && !/^https:\/\//.test(f.playUrl)) e.playUrl = 'https://로 시작하는 주소'
    if (f.win === 'repo' && !/github\.com\/[^/]+\/[^/]+/.test(f.repo)) e.repo = 'https://github.com/아이디/레포 형태'
    if (f.win === 'upload' && !exe && !existing?.download) e.exe = 'zip 파일을 골라 주세요'
    if (f.win === 'upload' && exe && exe.size > MAX_UPLOAD) e.exe = '30MB를 넘습니다. 구글 드라이브 링크나 GitHub 레포를 써 주세요'
    if (f.win === 'link' && !/^https:\/\//.test(f.link)) e.link = 'https://로 시작하는 주소'
    if (!crops.header && !existing) e.header = '가로 배너 이미지를 올려 주세요'
    achs.forEach((a, i) => {
      if (!a.name.trim()) e[`ach${i}`] = '도전 과제 이름을 적어 주세요'
    })
    return e
  }, [f, exe, crops.header, existing, achs, othersGame, taken])
  const ok = Object.keys(errors).length === 0
  const err = (k: string) => showErrors && errors[k] && <span className="err">{errors[k]}</span>

  const preview: Pick<Game, 'price' | 'discount' | 'finalPrice'> = {
    price: Number(f.price) || 0,
    discount: Number(f.discount) || 0,
    finalPrice: Math.round(((Number(f.price) || 0) * (100 - (Number(f.discount) || 0))) / 100),
  }

  const go = async () => {
    if (site.registerEndpoint && !me) return setSubmit({ stage: 'failed', id: f.id, updated: '', error: '로그인이 필요해요. 새로고침해서 로그인해 주세요.' })
    setShowErrors(true)
    if (!ok) return window.scrollTo({ top: 0, behavior: 'smooth' })
    if (clash && !confirmOverwrite) return setConfirmOverwrite(true)
    setConfirmOverwrite(false)
    const updated = new Date().toISOString()
    const achList = achs.map((a, i) => ({ ...a, id: a.id || `a${i + 1}` }))
    const out: { path: string; data: string }[] = []
    const download = f.win === 'link' ? f.link : f.win === 'upload' && !exe ? existing?.download : undefined
    const downloadSize = f.win === 'upload' && exe ? `${Math.max(1, Math.round(exe.size / 1048576))} MB` : f.win === 'link' ? f.downloadSize : f.win === 'upload' ? existing?.downloadSize : undefined
    out.push({ path: 'game.yml', data: btoa(unescape(encodeURIComponent(toYaml(site.registerEndpoint ? { ...f, developer: me } : f, { download, downloadSize, achievements: achList, updated })))) })
    out.push({ path: 'about.md', data: btoa(unescape(encodeURIComponent(f.about || f.short))) })
    for (const s of Object.keys(SLOTS) as Slot[]) if (crops[s]) out.push({ path: `${s}.jpg`, data: b64(crops[s]!) })
    const newShots = shotFiles.map((_, i) => shotCrops[i]).filter(Boolean)
    newShots.forEach((d, i) => out.push({ path: `screenshots/${i + 1}.jpg`, data: b64(d) }))
    for (const a of achList) {
      if (a.icon?.startsWith('data:')) out.push({ path: `achievements/${a.id}.png`, data: b64(a.icon) })
      else if (a.icon && existing) out.push({ path: `achievements/${a.id}.png`, data: await urlToB64(a.icon) })
    }
    const payload = {
      action: 'register',
      ...(site.registerEndpoint ? authFields() : {}),
      id: f.id,
      files: out,
      clear: newShots.length ? ['screenshots/'] : [],
      exe: f.win === 'upload' && exe ? { name: exe.name.replace(/[^\w.-]+/g, '_'), version: f.version, data: await fileToB64(exe) } : undefined,
      updated,
    }
    setSubmit({ stage: 'sending', id: f.id, updated })
    if (!site.registerEndpoint) {
      await downloadZip(f.id, out)
      setSubmit({ stage: 'zip', id: f.id, updated })
      return
    }
    try {
      const res = await fetch(site.registerEndpoint, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || '알 수 없는 오류')
      setSubmit({ stage: 'building', id: f.id, updated })
    } catch (e) {
      setSubmit({ stage: 'failed', id: f.id, updated, error: String((e as Error).message ?? e) })
    }
  }

  if (submit) return <SubmitStatus s={submit} setS={setSubmit} />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, alignItems: 'start' }}>
      <div>
        {showErrors && !ok && <div className="notice err">빠진 항목이 {Object.keys(errors).length}개 있습니다. 빨간 글씨를 확인해 주세요.</div>}

        <Section title="1. 기본 정보">
          <div className="row2">
            <div className="field">
              <label>제목</label>
              <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="지글지글 키친" />
              {err('title')}
            </div>
            <div className="field">
              <label>
                영문 제목 <small>선택</small>
              </label>
              <input value={f.titleEn} onChange={(e) => set('titleEn', e.target.value)} placeholder="Sizzle Kitchen" />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>
                게임 주소 이름 <small>SKEAM 주소 끝에 붙습니다</small>
              </label>
              <input
                value={f.id}
                disabled={!!existing}
                onChange={(e) => {
                  setIdTouched(true)
                  set('id', e.target.value.toLowerCase())
                }}
                placeholder="sizzle-kitchen"
              />
              {err('id')}
              {clash && <span className="err">내가 이미 올린 게임이에요. 등록하면 그 게임을 덮어씁니다.</span>}
              {othersGame && !showErrors && <span className="err">다른 사람의 게임이 쓰는 이름이에요.</span>}
            </div>
            <div className="field">
              <label>제작자</label>
              <input value={f.developer} disabled={!!site.registerEndpoint} onChange={(e) => set('developer', e.target.value)} placeholder="동아리 닉네임" />
              {site.registerEndpoint && <span className="hint">로그인한 닉네임으로 등록돼요. 이 닉네임만 나중에 수정할 수 있어요.</span>}
              {err('developer')}
            </div>
          </div>
          <div className="field">
            <label>한 줄 소개</label>
            <input value={f.short} maxLength={90} onChange={(e) => set('short', e.target.value)} placeholder="상점 목록에 나오는 짧은 소개" />
            {err('short')}
          </div>
          <div className="row3">
            <div className="field">
              <label>가격 (원)</label>
              <input type="number" min={0} step={100} value={f.price} onChange={(e) => set('price', e.target.value)} />
              {err('price')}
            </div>
            <div className="field">
              <label>할인율 (%)</label>
              <input type="number" min={0} max={90} value={f.discount} onChange={(e) => set('discount', e.target.value)} />
            </div>
            <div className="field">
              <label>{f.soon ? '출시 예정일' : '출시일'}</label>
              {f.soon && f.releaseMode === 'month' ? (
                <input type="month" value={f.releaseMonth} onChange={(e) => set('releaseMonth', e.target.value)} />
              ) : f.soon && f.releaseMode === 'tba' ? (
                <input value="출시일 미정" disabled />
              ) : (
                <input type="date" value={f.release} onChange={(e) => set('release', e.target.value)} />
              )}
            </div>
          </div>
          <div className="field soon-box">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', color: '#fff' }}>
              <input type="checkbox" checked={f.soon} onChange={(e) => set('soon', e.target.checked)} />
              출시 예정 게임이에요 (아직 플레이할 수 없고, 찜만 할 수 있어요)
            </label>
            {f.soon && (
              <>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
                  {(
                    [
                      ['date', '날짜까지 정확히'],
                      ['month', '월까지만 (예: 2026년 10월)'],
                      ['tba', '아직 미정'],
                    ] as const
                  ).map(([v, l]) => (
                    <label key={v} style={{ display: 'flex', gap: 6, cursor: 'pointer' }}>
                      <input type="radio" checked={f.releaseMode === v} onChange={() => set('releaseMode', v)} />
                      {l}
                    </label>
                  ))}
                </div>
                <span className="hint">
                  {f.releaseMode === 'date'
                    ? '그 날짜가 되면 자동으로 출시돼요. 게임 주소나 다운로드는 그 전에 "내 게임 수정"에서 채워 두세요.'
                    : '출시할 때 "내 게임 수정"에서 이 체크를 끄고 게임 주소를 넣으면 돼요.'}{' '}
                  찜한 사람들에게 출시 알림이 가요.
                </span>
              </>
            )}
          </div>
          <div className="field">
            <label>
              태그 <small>쉼표로 구분</small>
            </label>
            <input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="요리, 시뮬레이션, 캐주얼" />
            <TagPicker value={tagList(f.tags)} used={knownTags} onChange={(ts) => set('tags', ts.join(', '))} />
          </div>
          <div className="field">
            <label>조작법</label>
            <input value={f.controls} onChange={(e) => set('controls', e.target.value)} placeholder="WASD 이동, 마우스 클릭" />
          </div>
        </Section>

        <Section title="2. 게임 파일">
          <div className="field">
            <label>
              브라우저 게임 주소 <small>GitHub Pages 등. 레포에 push하면 SKEAM에도 바로 반영됩니다</small>
            </label>
            <input value={f.playUrl} onChange={(e) => set('playUrl', e.target.value.trim())} placeholder="https://내아이디.github.io/게임/" />
            {err('playUrl')}
          </div>
          <div className="field">
            <label>Windows 다운로드</label>
            <span className="hint">GitHub Pages나 Unity Play처럼 브라우저 링크로 올리는 게임이면 여기는 "없음"으로 두세요.</span>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
              {(
                [
                  ['none', '없음'],
                  ['repo', 'GitHub 레포의 최신 Release (자동 업데이트)'],
                  ['upload', 'zip 파일 직접 올리기 (30MB 이하)'],
                  ['link', '다운로드 링크 (구글 드라이브 등)'],
                ] as const
              ).map(([v, l]) => (
                <label key={v} style={{ display: 'flex', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" checked={f.win === v} onChange={() => set('win', v)} />
                  {l}
                </label>
              ))}
            </div>
          </div>
          {f.win === 'repo' && (
            <div className="field">
              <label>GitHub 레포 주소</label>
              <input value={f.repo} onChange={(e) => set('repo', e.target.value.trim())} placeholder="https://github.com/내아이디/게임" />
              <span className="hint">공개 레포여야 합니다. 새 Release를 만들면 1시간 안에 SKEAM 다운로드가 바뀌고, Release 설명은 패치 노트가 됩니다.</span>
              {err('repo')}
            </div>
          )}
          {f.win === 'upload' && (
            <div className="field">
              <label>게임 zip 파일</label>
              <input type="file" accept=".zip,.7z" onChange={(e) => setExe(e.target.files?.[0] ?? null)} />
              {existing?.download && !exe && <span className="hint">지금 올라가 있는 파일을 그대로 씁니다. 새 버전을 올릴 때만 고르세요.</span>}
              {err('exe')}
            </div>
          )}
          {f.win === 'link' && (
            <div className="row2">
              <div className="field">
                <label>다운로드 링크</label>
                <input value={f.link} onChange={(e) => set('link', e.target.value.trim())} placeholder="https://drive.google.com/..." />
                {err('link')}
              </div>
              <div className="field">
                <label>
                  파일 크기 <small>선택</small>
                </label>
                <input value={f.downloadSize} onChange={(e) => set('downloadSize', e.target.value)} placeholder="120 MB" />
              </div>
            </div>
          )}
          {f.win !== 'none' && f.win !== 'repo' && (
            <div className="field" style={{ maxWidth: 200 }}>
              <label>버전</label>
              <input value={f.version} onChange={(e) => set('version', e.target.value)} />
              <span className="hint">버전을 올리면 예전 버전을 받은 사람에게 "업데이트"가 뜹니다</span>
            </div>
          )}
        </Section>

        <Section title="3. 소개글">
          <div className="field">
            <label>
              상세 페이지 소개 <small>### 제목, - 목록, **굵게** 를 쓸 수 있어요</small>
            </label>
            <textarea value={f.about} onChange={(e) => set('about', e.target.value)} style={{ minHeight: 200 }} placeholder={'### 어떤 게임인가요\n\n게임 설명...\n\n### 특징\n\n- 특징 하나\n- 특징 둘'} />
          </div>
          <div className="row2">
            <div className="field">
              <label>사용한 AI 도구</label>
              <input value={f.aiTools} onChange={(e) => set('aiTools', e.target.value)} placeholder="Claude Code, Midjourney" />
            </div>
            <div className="field">
              <label>제작 기간</label>
              <input value={f.devPeriod} onChange={(e) => set('devPeriod', e.target.value)} placeholder="2주" />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>엔진·도구</label>
              <input value={f.engine} onChange={(e) => set('engine', e.target.value)} placeholder="Godot 4.7" />
            </div>
            <div className="field">
              <label>
                유튜브 영상 <small>선택</small>
              </label>
              <input value={f.video} onChange={(e) => set('video', e.target.value.trim())} placeholder="https://youtu.be/..." />
            </div>
          </div>
          <div className="field">
            <label>
              제작 후기 한 줄 <small>선택</small>
            </label>
            <input value={f.aiNote} onChange={(e) => set('aiNote', e.target.value)} placeholder="AI한테 물리 엔진을 설명시키다 밤을 새웠다" />
          </div>
        </Section>

        <Section title="4. 이미지">
          <p style={{ marginTop: 0, fontSize: 13 }}>아무 크기의 그림을 올리면 규격에 맞게 잘라 드립니다. 자를 위치는 끌어서 고르세요.</p>
          {(Object.keys(SLOTS) as Slot[]).map((s) => (
            <div key={s} className="field">
              <label>
                {SLOTS[s].label} <small>{SLOTS[s].hint}</small>
              </label>
              {files[s] ? (
                <Cropper file={files[s]!} width={SLOTS[s].w} height={SLOTS[s].h} onCrop={(d) => setCrops((c) => ({ ...c, [s]: d }))} />
              ) : existing ? (
                <img src={existing.images[s]} alt="" style={{ maxWidth: 360 }} />
              ) : null}
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && setFiles((x) => ({ ...x, [s]: e.target.files![0] }))} />
              {err(s)}
            </div>
          ))}
          <div className="field">
            <label>
              스크린샷 <small>1920×1080으로 맞춥니다. {existing && '새로 고르면 기존 스크린샷을 모두 바꿉니다'}</small>
            </label>
            {shotFiles.length === 0 && existing && (
              <div className="shots-list">
                {existing.images.screenshots.map((s) => (
                  <div key={s} className="s">
                    <img src={s} alt="" />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {shotFiles.map((file, i) => (
                <div key={file.name + i} style={{ position: 'relative' }}>
                  <Cropper file={file} width={1920} height={1080} onCrop={(d) => setShotCrops((c) => ({ ...c, [i]: d }))} />
                  <button
                    className="btn-gray"
                    style={{ position: 'absolute', top: 4, right: 4, height: 24 }}
                    onClick={() => {
                      setShotFiles((x) => x.filter((_, j) => j !== i))
                      setShotCrops((c) => {
                        const n: Record<number, string> = {}
                        Object.entries(c).forEach(([k, v]) => {
                          const ki = Number(k)
                          if (ki < i) n[ki] = v
                          if (ki > i) n[ki - 1] = v
                        })
                        return n
                      })
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <input type="file" accept="image/*" multiple onChange={(e) => setShotFiles((x) => [...x, ...Array.from(e.target.files ?? [])].slice(0, 10))} />
          </div>
        </Section>

        <Section title="5. 도전 과제 (선택)">
          <p style={{ marginTop: 0, fontSize: 13 }}>
            HTML 게임은 게임 코드에서 <code>SKEAM.unlock("아이디")</code>를 부르면 달성됩니다. EXE 게임은 게임 안에서 코드를 보여주고, 플레이어가 라이브러리에 입력하면 달성됩니다.{' '}
            <Link to="/register?guide=1">자세히</Link>
          </p>
          {achs.map((a, i) => (
            <div key={i} className="panel" style={{ marginBottom: 10, display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12 }}>
              <label className="ach-icon" style={{ width: 64, height: 64, cursor: 'pointer' }} title="아이콘 고르기">
                {a.icon ? <img src={a.icon} alt="" /> : '＋'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const icon = await squareIcon(file)
                    setAchs((xs) => xs.map((x, j) => (j === i ? { ...x, icon } : x)))
                  }}
                />
              </label>
              <div>
                <div className="row3">
                  <input className="mini" value={a.id} onChange={(e) => setAchs((xs) => xs.map((x, j) => (j === i ? { ...x, id: slug(e.target.value).replace(/-/g, '_') } : x)))} placeholder="아이디 (first_win)" />
                  <input className="mini" value={a.name} onChange={(e) => setAchs((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="이름 (첫 승리)" />
                  <input className="mini" value={a.code} onChange={(e) => setAchs((xs) => xs.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))} placeholder="코드 (EXE용, 선택)" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input className="mini" style={{ flex: 1 }} value={a.desc} onChange={(e) => setAchs((xs) => xs.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} placeholder="설명 (첫 판을 이기세요)" />
                  <button className="btn-gray" onClick={() => setAchs((xs) => xs.filter((_, j) => j !== i))}>
                    삭제
                  </button>
                </div>
                {err(`ach${i}`)}
              </div>
            </div>
          ))}
          <button className="btn-gray" onClick={() => setAchs((xs) => [...xs, { id: `a${xs.length + 1}`, name: '', desc: '', code: '' }])}>
            + 도전 과제 추가
          </button>
        </Section>
      </div>

      <aside style={{ position: 'sticky', top: 100 }}>
        <div className="panel">
          <div style={{ fontSize: 12, color: '#8f98a0', marginBottom: 6 }}>상점 미리보기</div>
          {crops.header || existing ? <img src={crops.header ?? existing!.images.header} alt="" /> : <div style={{ aspectRatio: '920/430', background: '#0e141b', display: 'grid', placeItems: 'center', color: '#556772' }}>가로 배너</div>}
          <div style={{ color: '#fff', fontSize: 18, margin: '8px 0 4px' }}>{f.title || '제목'}</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>{f.short || '한 줄 소개'}</div>
          <div style={{ fontSize: 12, color: '#8f98a0', marginBottom: 6 }}>
            {koDate(f.release)} · {f.developer || '제작자'}
          </div>
          <Tags tags={tagList(f.tags)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Price game={preview} />
          </div>
        </div>
        <button className="btn-green" style={{ width: '100%', height: 44, marginTop: 12, fontSize: 17 }} onClick={go}>
          {existing ? '수정 내용 등록' : '등록'}
        </button>
        {!site.registerEndpoint && <div className="notice warn" style={{ marginTop: 12 }}>등록 창구가 아직 연결되지 않아, 등록하면 zip 파일을 내려받습니다. 운영진에게 전해 주세요.</div>}
        {confirmOverwrite && (
          <div className="notice warn" style={{ marginTop: 12 }}>
            <b>{f.id}</b>는 이미 있는 게임입니다. 정말 덮어쓸까요?
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn-green" onClick={go}>
                덮어쓰기
              </button>
              <button className="btn-gray" onClick={() => setConfirmOverwrite(false)}>
                취소
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

/** Tap to add or remove: tags SKEAM games already use, then every default tag by genre. */
function TagPicker({ value, used, onChange }: { value: string[]; used: string[]; onChange: (tags: string[]) => void }) {
  const [all, setAll] = useState(false)
  const chip = (t: string) => {
    const on = value.includes(t)
    return (
      <button key={t} type="button" className={`tag ${on ? 'on' : 'plain'}`} onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}>
        {on ? '✓ ' : '+ '}
        {t}
      </button>
    )
  }
  const others = DEFAULT_TAGS.filter((t) => !TAG_COLUMNS.some((c) => c.tags.includes(t)))
  return (
    <div className="tag-picker-box">
      {value.length > 0 && <div className="tag-picker-sel">고른 태그 {value.length}개 · 4~8개를 추천해요</div>}
      {used.length > 0 && (
        <div className="tag-picker">
          <span className="hint">SKEAM 게임들이 많이 쓰는 태그</span>
          {used.slice(0, 16).map(chip)}
        </div>
      )}
      <button type="button" className="cat-toggle" style={{ marginLeft: 0, fontSize: 13, marginTop: 8 }} onClick={() => setAll(!all)}>
        기본 태그 전체 {all ? '접기 ⌃' : '펼치기 ⌄'}
      </button>
      {all && (
        <div className="tag-groups">
          {TAG_COLUMNS.map((c) => (
            <div key={c.name} className="tag-picker">
              <span className="hint">{c.name}</span>
              {c.tags.map(chip)}
            </div>
          ))}
          <div className="tag-picker">
            <span className="hint">그 밖의 태그</span>
            {others.map(chip)}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h3 className="block-head">{title}</h3>
      {children}
    </section>
  )
}

async function squareIcon(file: File) {
  const url = URL.createObjectURL(file)
  const im = new Image()
  await new Promise((r) => ((im.onload = r), (im.src = url)))
  const s = Math.min(im.naturalWidth, im.naturalHeight)
  const c = document.createElement('canvas')
  c.width = c.height = 128
  c.getContext('2d')!.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, 128, 128)
  URL.revokeObjectURL(url)
  return c.toDataURL('image/png')
}

async function downloadZip(id: string, files: { path: string; data: string }[]) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const f of files) zip.file(`games/${id}/${f.path}`, f.data, { base64: true })
  const blob = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `skeam-${id}.zip`
  a.click()
}

// ---- after pressing 등록 -------------------------------------------------------

interface SubmitState {
  stage: 'sending' | 'building' | 'live' | 'failed' | 'zip' | 'slow'
  id: string
  updated: string
  error?: string
}

function SubmitStatus({ s, setS }: { s: SubmitState; setS: (s: SubmitState | null) => void }) {
  useEffect(() => {
    if (s.stage !== 'building') return
    const started = Date.now()
    const t = setInterval(async () => {
      try {
        const [live, site] = await Promise.all([fetchLiveGames(), fetchLiveSite()])
        if (live.some((g) => g.id === s.id && g.updated === s.updated)) {
          clearInterval(t)
          setS({ ...s, stage: 'live' })
        } else if (site.builtAt > s.updated && site.skipped.includes(s.id)) {
          clearInterval(t)
          setS({ ...s, stage: 'failed', error: `SKEAM이 게임을 싣지 못했습니다: ${(site.problems[s.id] ?? ['알 수 없는 문제']).join(' / ')}` })
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - started > 8 * 60 * 1000) {
        clearInterval(t)
        setS({ ...s, stage: 'slow' })
      }
    }, 10000)
    return () => clearInterval(t)
  }, [s, setS])

  const steps = [
    ['sending', '등록 창구로 보내는 중'],
    ['building', 'SKEAM에 반영하고 사이트를 다시 만드는 중 (보통 2~3분)'],
    ['live', '등록 완료'],
  ] as const
  const idx = steps.findIndex(([k]) => k === s.stage)

  return (
    <div className="panel" style={{ maxWidth: 640 }}>
      {s.stage === 'zip' ? (
        <>
          <h3 style={{ color: '#fff', marginTop: 0 }}>zip 파일을 내려받았습니다</h3>
          <p>
            등록 창구가 아직 연결되지 않았습니다. 받은 <b>skeam-{s.id}.zip</b>을 운영진에게 보내거나, SKEAM 레포에 압축을 풀어 PR로 올려 주세요.
          </p>
        </>
      ) : s.stage === 'failed' ? (
        <>
          <h3 style={{ color: '#fff', marginTop: 0 }}>등록하지 못했습니다</h3>
          <div className="notice err">{s.error}</div>
        </>
      ) : s.stage === 'slow' ? (
        <>
          <h3 style={{ color: '#fff', marginTop: 0 }}>반영이 늦어지고 있어요</h3>
          <p>제출은 됐지만 8분이 지나도 사이트에 보이지 않습니다. 잠시 뒤 상점을 새로 고쳐 보고, 그래도 없으면 운영진에게 알려 주세요.</p>
        </>
      ) : (
        <ul className="progress-list">
          {steps.map(([k, l], i) => (
            <li key={k} className={i < idx || s.stage === 'live' ? 'done' : i === idx ? 'on' : ''}>
              {i < idx || s.stage === 'live' ? '✓' : i === idx ? <span className="spinner" style={{ width: 16, height: 16, margin: 0, borderWidth: 2 }} /> : '○'} {l}
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {s.stage === 'live' && (
          <a className="btn-green" href={`#/app/${s.id}`} onClick={() => location.reload()}>
            내 게임 페이지 보기
          </a>
        )}
        <button className="btn-gray" onClick={() => setS(null)}>
          {s.stage === 'failed' ? '돌아가서 고치기' : '돌아가기'}
        </button>
      </div>
    </div>
  )
}

// ---- patch notes & manual sync ------------------------------------------------

function NewsForm({ games: all, site }: { games: Game[]; site: Site }) {
  const me = useMyName()
  const games = all.filter((g) => isMine(g, me))
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [version, setVersion] = useState('')
  const [body, setBody] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | string>('idle')
  const g = games.find((x) => x.id === id)
  const send = async () => {
    const date = new Date().toISOString().slice(0, 10)
    const md = `---\ntitle: ${q(title)}\ndate: ${date}\n${version ? `version: ${q(version)}\n` : ''}---\n\n${body}\n`
    const file = { path: `news/${date}-${Date.now().toString(36)}.md`, data: btoa(unescape(encodeURIComponent(md))) }
    if (!site.registerEndpoint) {
      await downloadZip(id, [file])
      return setState('done')
    }
    setState('sending')
    try {
      const res = await fetch(site.registerEndpoint, { method: 'POST', body: JSON.stringify({ action: 'news', ...authFields(), id, files: [file] }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
      const j = await res.json()
      setState(j.ok ? 'done' : j.error)
    } catch (e) {
      setState(String(e))
    }
  }
  if (!games.length) return <NotMine name={me} />
  return (
    <div className="panel" style={{ maxWidth: 760 }}>
      <p style={{ marginTop: 0, fontSize: 13 }}>GitHub Release를 쓰는 게임은 Release 설명이 자동으로 패치 노트가 됩니다. 여기서는 직접 쓰고 싶을 때 올리세요.</p>
      <div className="field">
        <label>게임</label>
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">게임을 고르세요</option>
          {games.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
      </div>
      <div className="row2">
        <div className="field">
          <label>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="1.1 업데이트: 새 레시피 5종" />
        </div>
        <div className="field">
          <label>
            버전 <small>선택</small>
          </label>
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder={g?.version || '1.1.0'} />
        </div>
      </div>
      <div className="field">
        <label>내용</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={'- 새 레시피 5종 추가\n- 팬 온도 버그 수정'} />
      </div>
      <button className="btn-green" disabled={!id || !title.trim() || state === 'sending'} onClick={send}>
        {state === 'sending' ? '올리는 중…' : '패치 노트 올리기'}
      </button>
      {state === 'done' && <div className="notice" style={{ marginTop: 12 }}>올렸습니다. 2~3분 뒤 라이브러리와 상점 페이지에 나타납니다.</div>}
      {state !== 'idle' && state !== 'sending' && state !== 'done' && <div className="notice err" style={{ marginTop: 12 }}>{state}</div>}
    </div>
  )
}

function SyncBox({ site, g }: { site: Site; g: Game }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'fail'>('idle')
  if (!site.registerEndpoint) return null
  return (
    <div className="notice" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>
        GitHub Release를 새로 만들었나요? 1시간마다 자동으로 확인하지만, 지금 바로 반영할 수도 있어요. (현재 v{g.version || '—'})
      </span>
      <button
        className="btn-blue"
        disabled={state === 'sending'}
        onClick={async () => {
          setState('sending')
          try {
            const r = await fetch(site.registerEndpoint, { method: 'POST', body: JSON.stringify({ action: 'sync' }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
            setState((await r.json()).ok ? 'done' : 'fail')
          } catch {
            setState('fail')
          }
        }}
      >
        {state === 'done' ? '요청함 · 2~3분 뒤 반영' : state === 'fail' ? '실패, 다시 시도' : '업데이트 알리기'}
      </button>
    </div>
  )
}

// ---- guide ------------------------------------------------------------------

function Guide() {
  const sdkUrl = new URL('skeam-sdk.js', location.href.split('#')[0]).href
  const code = { background: '#0e141b', padding: 12, borderRadius: 3, fontSize: 12, overflowX: 'auto' as const, color: '#c7d5e0' }
  return (
    <div className="about" style={{ maxWidth: 860 }}>
      <h3>등록은 이렇게</h3>
      <ol>
        <li>게임을 GitHub Pages(브라우저 게임)나 GitHub Release(exe)에 올려 둡니다. GitHub가 없으면 zip을 직접 올려도 됩니다.</li>
        <li>"새 게임 등록" 탭에서 정보와 그림을 채우고 등록을 누릅니다.</li>
        <li>2~3분 뒤 상점에 나옵니다. 그다음부터 게임 업데이트는 자기 레포에서 하면 SKEAM에 자동으로 반영됩니다.</li>
      </ol>
      <h3>이미지 규격</h3>
      <ul>
        <li>가로 배너 920×430 (필수), 세로 포스터 600×900, 라이브러리 배경 1920×620, 스크린샷 1920×1080</li>
        <li>크기가 달라도 도우미가 잘라 줍니다.</li>
      </ul>
      <h3>브라우저 게임 주의점</h3>
      <ul>
        <li>
          <b>Godot 4:</b> 웹 내보내기에서 Thread Support를 끄세요. 켜면 GitHub Pages에서 검은 화면만 나옵니다.
        </li>
        <li>
          <b>Unity WebGL:</b> Compression Format을 Disabled로 하거나 Decompression Fallback을 켜세요.
        </li>
      </ul>
      <h3>도전 과제 넣기 (HTML 게임)</h3>
      <p>게임의 index.html에 한 줄을 넣고, 달성 시점에 부르면 됩니다.</p>
      <pre style={code}>{`<script src="${sdkUrl}"></script>

// 달성했을 때
SKEAM.unlock("first_win")`}</pre>
      <p>Godot 웹 빌드에서는:</p>
      <pre style={code}>{`if OS.has_feature("web"):
    JavaScriptBridge.eval("window.SKEAM && SKEAM.unlock('first_win')")`}</pre>
      <p>SDK를 넣으면 게임 안에서 Shift+Tab을 눌러도 SKEAM 오버레이가 열립니다.</p>
      <h3>도전 과제 넣기 (EXE 게임)</h3>
      <p>등록할 때 도전 과제마다 코드(예: KING-7F3A)를 정하고, 게임 안에서 달성하면 그 코드를 화면에 보여 주세요. 플레이어가 라이브러리에 입력하면 달성됩니다.</p>
      <h3>PR 머지만으로 새 exe 내기</h3>
      <p>
        자기 게임 레포에 <code>.github/workflows/skeam-release.yml</code>을 넣으면, <code>build/</code> 폴더가 바뀐 채로 main에 머지될 때마다 zip을 묶어 새 Release를 만듭니다. SKEAM이
        1시간 안에 새 버전을 가져갑니다. 파일 하나가 100MB를 넘으면 git에 못 올리니 Release에 직접 올려 주세요.
      </p>
      <pre style={code}>{`name: SKEAM release
on:
  push:
    branches: [main]
    paths: ['build/**']
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd build && zip -r ../game.zip .
      - run: gh release create "v$(date +%Y.%m.%d-%H%M)" game.zip --title "새 버전" --notes "\${{ github.event.head_commit.message }}"
        env:
          GH_TOKEN: \${{ github.token }}`}</pre>
    </div>
  )
}
