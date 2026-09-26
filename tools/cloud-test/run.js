// SKEAM Cloud scenarios, run inside the local SKEAM page (http://localhost:5310).
//   const t = await import('/__cloudtest/run.js')
//   t.prepare()            // logs in a fake account and owns the test games (reloads the page)
//   await t.runAll()       // then run this after the reload
// Each scenario prints PASS/FAIL with what it saw.

const DESK = 'http://localhost:5399/'
const GAMES = 'http://localhost:5398/'
const NAME = 'cloudtest'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function prepare() {
  const s = JSON.parse(localStorage.getItem('skeam:v1') || '{}')
  s.profile = { name: NAME, avatar: 1 }
  s.session = { name: NAME, token: 'test', lastSync: '' }
  s.owned = { ...(s.owned || {}) }
  for (const g of ['solo', 'a', 'b']) s.owned[`zz-cloudtest-${g}`] = { purchasedAt: Date.now(), paid: 0, playtime: 0, lastPlayed: 0 }
  localStorage.setItem('skeam:v1', JSON.stringify(s))
  location.hash = '#/library'
  location.reload()
}

/** Loads one of the helper pages on the games' origin and waits for it to finish. */
function page(file) {
  return new Promise((resolve) => {
    const f = document.createElement('iframe')
    f.style.display = 'none'
    const done = (e) => {
      if (e.data && e.data.testPage) finish()
    }
    const finish = () => {
      window.removeEventListener('message', done)
      f.remove()
      resolve()
    }
    window.addEventListener('message', done)
    f.src = GAMES + file
    document.body.appendChild(f)
    setTimeout(finish, 8000)
  })
}

function ask(test) {
  return new Promise((resolve) => {
    const f = document.querySelector('.player iframe')
    if (!f) return resolve(null)
    const h = (e) => {
      if (e.data && e.data.testState !== undefined) {
        window.removeEventListener('message', h)
        resolve(e.data)
      }
    }
    window.addEventListener('message', h)
    f.contentWindow.postMessage({ test }, '*')
    setTimeout(() => resolve(null), 4000)
  })
}

async function play(g) {
  location.hash = '#/library'
  await sleep(400)
  location.hash = `#/play/zz-cloudtest-${g}`
  // Wait until the game has answered SKEAM and is running (or restored and reloaded).
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    const r = await ask('state')
    if (r && r.cloud === 'ready' && r.testState && r.testState.file !== null) return r
  }
  return ask('state')
}

async function leave() {
  const b = [...document.querySelectorAll('.edge button')].find((x) => x.textContent.includes('나가기'))
  b && b.click()
  for (let i = 0; i < 30 && location.hash.includes('/play/'); i++) await sleep(300)
  await sleep(800)
}

async function add(n) {
  let r
  for (let i = 0; i < n; i++) r = await ask('add')
  return r
}

function cloudLog() {
  return [...document.querySelectorAll('.op')].find((x) => x.textContent.includes('클라우드 기록'))?.innerText ?? ''
}

async function cloudSnapshot(game) {
  const r = await fetch(DESK, { method: 'POST', body: JSON.stringify({ action: 'cloudGet', name: NAME, game: `zz-cloudtest-${game}` }) }).then((x) => x.json())
  if (!r.data) return null
  const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0))
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
  return JSON.parse(text)
}
const files = (snap) => (snap?.idb ?? []).flatMap((d) => d.stores.flatMap((s) => s.records.map((r) => String(r[0]))))

const results = []
function check(name, ok, seen) {
  results.push({ name, ok, seen })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`, seen)
}

export async function runAll() {
  results.length = 0
  await fetch(DESK + '_reset')

  // 1. A new device gets the save back.
  await page('clear.html')
  await play('solo')
  await add(3)
  await sleep(500)
  await leave()
  await page('clear.html')
  let r = await play('solo')
  check('새 기기에서 세이브 복원 (localStorage + IndexedDB)', r?.testState?.coins === 3 && r?.testState?.file === 'level=3', r?.testState)

  // 2. Switching between two games on one origin never rolls either back (PR #6).
  await page('clear.html')
  await play('a')
  await add(2)
  await sleep(500)
  await leave()
  await play('a')
  await add(1)
  location.hash = '#/library' // leave without the exit upload: this device now has unsynced progress
  await sleep(800)
  await play('b')
  await add(1)
  await sleep(500)
  await leave()
  r = await play('a')
  check('같은 주소의 다른 게임을 하고 와도 되돌아가지 않음', r?.testState?.coins === 3, r?.testState)
  await leave()

  // 3. An old record covering every game (the DRAGONIA : RE bug) doesn't pull other games' files in.
  // (Empty cloud, so this device's data is what gets uploaded.)
  await fetch(DESK + '_reset')
  await page('setup-wide.html')
  await play('b')
  await add(1)
  await sleep(500)
  await leave()
  let snap = await cloudSnapshot('b')
  let f = files(snap)
  check(
    '넓게 배운 옛 기록이 있어도 이 게임 폴더만 올라감',
    !!snap && f.includes('/userfs/godot/app_userdata/game_b/save.dat') && !f.some((k) => k.includes('game_a')) && Object.keys(snap.ls).join() === 'coins_b',
    { files: f, ls: Object.keys(snap?.ls ?? {}) },
  )

  // 4. One huge item is left out; the rest still syncs.
  await page('setup-big.html')
  await play('b')
  await add(1)
  await sleep(4500)
  document.querySelector('.overlay-fab button')?.click()
  await sleep(300)
  const log = cloudLog()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await leave()
  snap = await cloudSnapshot('b')
  f = files(snap)
  check(
    '1MB가 넘는 항목은 빼고 나머지는 저장',
    !!snap && !f.some((k) => k.endsWith('replay.bin')) && f.includes('/userfs/godot/app_userdata/game_b/save.dat') && log.includes('뺀 항목'),
    { files: f, log: log.split('\n').slice(-3) },
  )

  // 5. The conflict dialog can stay open longer than the game's 25 s wait.
  await play('b')
  const before = (await ask('state'))?.testState?.coins
  const cloudCopy = await fetch(DESK, { method: 'POST', body: JSON.stringify({ action: 'cloudGet', name: NAME, game: 'zz-cloudtest-b' }) }).then((x) => x.json())
  await fetch(DESK + '_force', { method: 'POST', body: JSON.stringify({ lower: NAME, game: 'zz-cloudtest-b', data: cloudCopy.data, size: cloudCopy.size }) })
  await add(1) // this device moves on and leaves before uploading
  location.hash = '#/library'
  await sleep(800)
  location.hash = '#/play/zz-cloudtest-b'
  let dialog = null
  for (let i = 0; i < 30 && !dialog; i++) {
    await sleep(500)
    dialog = document.querySelector('[role=dialog]')
  }
  await sleep(32000)
  ;[...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.includes('클라우드 저장 불러오기'))?.click()
  r = null
  for (let i = 0; i < 30; i++) {
    await sleep(500)
    r = await ask('state')
    if (r && r.cloud === 'ready') break
  }
  check('충돌 창에서 30초 넘게 고민해도 클라우드 저장을 불러옴', !!dialog && r?.cloud === 'ready' && r?.testState?.coins === before, { dialog: !!dialog, before, after: r?.testState })
  await leave()

  await page('clear.html')
  const failed = results.filter((x) => !x.ok).length
  console.log(failed ? `${failed}개 실패` : '모두 통과')
  return results
}
