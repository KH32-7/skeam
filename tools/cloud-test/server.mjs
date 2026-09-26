// Local test bench for SKEAM Cloud (skeam-sdk.js + src/state/cloud.ts).
//
//   :5399  a stand-in for the Apps Script desk (cloud actions kept in memory)
//   :5398  fake web games, all on one origin like <user>.github.io:
//          /solo/  /a/  /b/   a game that saves like Godot (IndexedDB "/userfs",
//                              folder app_userdata/game_<name>) and in localStorage
//          /clear.html          wipes the origin's storage ("a new device")
//          /setup-wide.html     game b remembers a folder covering every game,
//                               and game a has a 2 MB file (the Dragonia bug)
//          /setup-big.html      game b's own folder gets a 3 MB file
//
// How to run: see README.md next to this file.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))

// ---- desk -------------------------------------------------------------------------
const saves = []
const log = []
let tick = 0
const newVer = () => new Date(Date.now() + tick++).toISOString()
const rows = (lower, game) => saves.filter((r) => r.lower === lower && (!game || r.game === game)).sort((a, b) => (a.ver < b.ver ? 1 : -1))
function write(lower, game, data, size) {
  const ver = newVer()
  saves.push({ lower, game, ver, size, data })
  const keep = rows(lower, game).slice(0, 3)
  for (let i = saves.length - 1; i >= 0; i--) if (saves[i].lower === lower && saves[i].game === game && !keep.includes(saves[i])) saves.splice(i, 1)
  return ver
}
function desk(req) {
  const lower = String(req.name || '').toLowerCase()
  switch (req.action) {
    case 'load':
      return { ok: true, data: {}, updated: '' }
    case 'save':
      return { ok: true, updated: new Date().toISOString() }
    case 'cloudGet': {
      const r = req.ver ? rows(lower, req.game).find((x) => x.ver === req.ver) : rows(lower, req.game)[0]
      return r ? { ok: true, ver: r.ver, size: r.size, data: r.data } : { ok: true, ver: '', size: 0, data: '' }
    }
    case 'cloudPut': {
      const latest = rows(lower, req.game)[0]
      if (latest && !req.force && latest.ver !== String(req.base || '')) return { ok: true, conflict: true, ver: latest.ver, size: latest.size }
      return { ok: true, ver: write(lower, req.game, req.data, req.size) }
    }
    case 'cloudList': {
      const games = {}
      for (const r of rows(lower)) (games[r.game] ??= []).push({ ver: r.ver, size: r.size })
      return { ok: true, games }
    }
    case 'cloudRevert': {
      const r = rows(lower, req.game).find((x) => x.ver === req.ver)
      return r ? { ok: true, ver: write(lower, req.game, r.data, r.size) } : { ok: false, error: 'not found' }
    }
    default:
      return { ok: true }
  }
}

http
  .createServer((q, s) => {
    const send = (o) => {
      s.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      s.end(JSON.stringify(o))
    }
    const url = new URL(q.url, 'http://x')
    if (url.pathname === '/_state') return send({ saves: saves.map(({ data, ...r }) => ({ ...r, len: data.length })), log })
    if (url.pathname === '/_reset') {
      saves.length = 0
      log.length = 0
      return send({ ok: true })
    }
    if (url.pathname === '/_force' && q.method === 'POST') {
      let b = ''
      q.on('data', (d) => (b += d))
      q.on('end', () => {
        const r = JSON.parse(b)
        send({ ver: write(r.lower, r.game, r.data, r.size) })
      })
      return
    }
    if (q.method === 'GET') return send({ ok: true, reviews: [], profiles: [] })
    let body = ''
    q.on('data', (d) => (body += d))
    q.on('end', () => {
      const req = JSON.parse(body || '{}')
      log.push({ at: new Date().toISOString(), action: req.action, game: req.game, base: req.base, force: req.force, len: req.data?.length })
      send(desk(req))
    })
  })
  .listen(5399, () => console.log('desk  http://localhost:5399'))

// ---- fake games -----------------------------------------------------------------------
http
  .createServer((q, s) => {
    const url = new URL(q.url, 'http://x')
    const file = /^\/[a-z]+\/$/.test(url.pathname) ? 'game.html' : url.pathname.slice(1)
    const p = path.join(HERE, 'pages', path.basename(file))
    if (!fs.existsSync(p)) {
      s.writeHead(404)
      return s.end('not found')
    }
    s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    s.end(fs.readFileSync(p))
  })
  .listen(5398, () => console.log('games http://localhost:5398/solo/ /a/ /b/'))
