// node tools/cloud-test/setup.mjs on    add the three test games, point the data at the local desk
// node tools/cloud-test/setup.mjs off   remove them and rebuild the normal data
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..')
const GAMES = ['solo', 'a', 'b']
const on = process.argv[2] !== 'off'

for (const g of GAMES) {
  const dir = path.join(ROOT, 'games', `zz-cloudtest-${g}`)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.join(ROOT, 'public', 'g', `zz-cloudtest-${g}`), { recursive: true, force: true })
  if (!on) continue
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'games', 'celrush', 'header.jpg'), path.join(dir, 'header.jpg'))
  fs.writeFileSync(
    path.join(dir, 'game.yml'),
    `title: "클라우드 시험 ${g}"\ndeveloper: tester\nrelease: 2026-09-27\nprice: 0\nplay_url: http://localhost:5398/${g}/\nshort: "SKEAM 클라우드 시험용"\n`,
  )
}

const runner = path.join(ROOT, 'public', '__cloudtest')
fs.rmSync(runner, { recursive: true, force: true })
if (on) {
  fs.mkdirSync(runner, { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'tools', 'cloud-test', 'run.js'), path.join(runner, 'run.js'))
}

execFileSync('node', [path.join(ROOT, 'scripts', 'build-data.mjs')], {
  stdio: 'ignore',
  env: { ...process.env, SKEAM_REGISTER_ENDPOINT: on ? 'http://localhost:5399/' : '' },
})
console.log(on ? '시험 게임을 넣었어요. README의 순서대로 실행하세요.' : '시험 게임을 뺐어요.')
