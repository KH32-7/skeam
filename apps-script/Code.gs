/**
 * SKEAM registration desk + reviews, running as a Google Apps Script web app.
 *
 * Friends press "등록" on the SKEAM site; the page POSTs here; this script
 * commits the files to the SKEAM GitHub repo (which redeploys the site).
 * Reviews are stored in the "reviews" sheet of the spreadsheet this script
 * is attached to; accounts (nickname + password hash + synced data) in
 * "accounts"; status messages in "profiles".
 *
 * Forgotten password: clear that person's "hash" cell in the accounts sheet.
 * Their next login sets whatever password they type, and their data stays.
 *
 * Script properties (Project Settings → Script properties):
 *   GITHUB_TOKEN  fine-grained token for the SKEAM repo only:
 *                 Contents: read & write, Actions: read & write
 *   REPO          optional, defaults to KH32-7/skeam
 *   BRANCH        optional, defaults to main
 */

var ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/
var PATH_RE = /^(game\.yml|about\.md|(header|capsule|hero|logo)\.(jpg|png)|screenshots\/\d{1,2}\.jpg|achievements\/[\w-]{1,40}\.png|news\/[\w.-]{1,80}\.md)$/
var MAX_TOTAL = 45 * 1024 * 1024
var BAD_WORDS = ['씨발', '시발', '병신', '좆', 'fuck']

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents)
    switch (req.action) {
      case 'signup':
        return json(signup(req))
      case 'login':
        return json(login(req))
      case 'load':
        return json(loadData(req))
      case 'save':
        return json(saveData(req))
      case 'logout':
        return json(logout(req))
      case 'register':
        return json(register(req))
      case 'news':
        assertOwner(req.id, auth(req))
        return json(commitGameFiles(req.id, req.files, [], 'SKEAM: ' + req.id + ' 패치 노트'))
      case 'sync':
        return json(dispatchDeploy())
      case 'review':
        return json(addReview(req))
      case 'status':
        return json(setStatus(req))
      default:
        return json({ ok: false, error: '알 수 없는 요청' })
    }
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) })
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {}
  if (p.action === 'reviews') return json(listReviews(p.game))
  if (p.action === 'profiles') return json(listProfiles())
  return json({ ok: true, service: 'SKEAM' })
}

// ---- registration ------------------------------------------------------------

function register(req) {
  var who = auth(req)
  assertOwner(req.id, who)
  var yml = (req.files || []).filter(function (f) {
    return f.path === 'game.yml'
  })[0]
  if (yml) {
    var dev = ymlDeveloper(Utilities.newBlob(Utilities.base64Decode(yml.data)).getDataAsString('UTF-8'))
    if (dev.toLowerCase() !== who.toLowerCase()) throw new Error('제작자 이름은 로그인한 닉네임(' + who + ')과 같아야 합니다')
  }
  var files = req.files || []
  if (req.exe) {
    var url = uploadExe(req.id, req.exe)
    files = files.map(function (f) {
      if (f.path !== 'game.yml') return f
      var yml = Utilities.newBlob(Utilities.base64Decode(f.data)).getDataAsString('UTF-8')
      yml = yml.replace(/^download(_size)?: .*\n/gm, '')
      var size = Math.max(1, Math.round((req.exe.data.length * 0.75) / 1048576)) + ' MB'
      yml += 'download: ' + JSON.stringify(url) + '\ndownload_size: ' + JSON.stringify(size) + '\n'
      return { path: f.path, data: Utilities.base64Encode(yml, Utilities.Charset.UTF_8) }
    })
  }
  var verb = req.clear && req.clear.length ? '수정' : '등록'
  return commitGameFiles(req.id, files, req.clear || [], 'SKEAM: ' + req.id + ' ' + verb)
}

function commitGameFiles(id, files, clear, message) {
  if (!ID_RE.test(id || '')) throw new Error('게임 주소 이름이 올바르지 않습니다')
  if (!files || !files.length) throw new Error('보낼 파일이 없습니다')
  var total = 0
  files.forEach(function (f) {
    if (!PATH_RE.test(f.path)) throw new Error('허용되지 않는 파일 이름: ' + f.path)
    total += f.data.length * 0.75
  })
  if (total > MAX_TOTAL) throw new Error('파일이 너무 큽니다 (최대 45MB)')

  var repo = prop('REPO', 'KH32-7/skeam')
  var branch = prop('BRANCH', 'main')
  var head = gh('GET', '/repos/' + repo + '/git/ref/heads/' + branch).object.sha
  var baseTree = gh('GET', '/repos/' + repo + '/git/commits/' + head).tree.sha
  var tree = files.map(function (f) {
    var blob = gh('POST', '/repos/' + repo + '/git/blobs', { content: f.data, encoding: 'base64' })
    return { path: 'games/' + id + '/' + f.path, mode: '100644', type: 'blob', sha: blob.sha }
  })
  if (clear.length) {
    var writing = {}
    tree.forEach(function (t) {
      writing[t.path] = true
    })
    var all = gh('GET', '/repos/' + repo + '/git/trees/' + baseTree + '?recursive=1').tree
    all.forEach(function (t) {
      var inGame = t.type === 'blob' && t.path.indexOf('games/' + id + '/') === 0
      var cleared = clear.some(function (c) {
        return t.path.indexOf('games/' + id + '/' + c) === 0
      })
      if (inGame && cleared && !writing[t.path]) tree.push({ path: t.path, mode: '100644', type: 'blob', sha: null })
    })
  }
  var newTree = gh('POST', '/repos/' + repo + '/git/trees', { base_tree: baseTree, tree: tree })
  var commit = gh('POST', '/repos/' + repo + '/git/commits', { message: message, tree: newTree.sha, parents: [head] })
  gh('PATCH', '/repos/' + repo + '/git/refs/heads/' + branch, { sha: commit.sha })
  return { ok: true, commit: commit.sha }
}

/** EXE zips go to a Release on the SKEAM repo itself (files up to 2 GB). */
function uploadExe(id, exe) {
  var repo = prop('REPO', 'KH32-7/skeam')
  var tag = id + '-v' + String(exe.version || '1.0.0').replace(/[^\w.-]/g, '')
  var rel
  var res = ghRaw('GET', 'https://api.github.com/repos/' + repo + '/releases/tags/' + encodeURIComponent(tag))
  if (res.getResponseCode() === 200) rel = JSON.parse(res.getContentText())
  else rel = gh('POST', '/repos/' + repo + '/releases', { tag_name: tag, target_commitish: prop('BRANCH', 'main'), name: id + ' ' + exe.version, body: 'SKEAM 등록 도우미가 올린 파일' })
  var name = exe.name || id + '.zip'
  ;(rel.assets || []).forEach(function (a) {
    if (a.name === name) gh('DELETE', '/repos/' + repo + '/releases/assets/' + a.id)
  })
  var blob = Utilities.newBlob(Utilities.base64Decode(exe.data), 'application/zip', name)
  var up = ghRaw('POST', 'https://uploads.github.com/repos/' + repo + '/releases/' + rel.id + '/assets?name=' + encodeURIComponent(name), blob, 'application/zip')
  if (up.getResponseCode() >= 300) throw new Error('파일 업로드 실패: ' + up.getContentText().slice(0, 200))
  return JSON.parse(up.getContentText()).browser_download_url
}

function dispatchDeploy() {
  gh('POST', '/repos/' + prop('REPO', 'KH32-7/skeam') + '/actions/workflows/deploy.yml/dispatches', { ref: prop('BRANCH', 'main') })
  return { ok: true }
}

// ---- reviews -----------------------------------------------------------------

function reviewSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName('reviews')
  if (!sh) {
    sh = ss.insertSheet('reviews')
    sh.appendRow(['time', 'game', 'name', 'recommend', 'text', 'playtime'])
    sh.setFrozenRows(1)
  }
  return sh
}

function addReview(req) {
  if (!ID_RE.test(req.game || '')) throw new Error('게임이 올바르지 않습니다')
  var name = String(req.name || '익명').slice(0, 20)
  var text = String(req.text || '').slice(0, 1000)
  var lower = (name + ' ' + text).toLowerCase()
  if (
    BAD_WORDS.some(function (w) {
      return lower.indexOf(w) >= 0
    })
  )
    throw new Error('사용할 수 없는 단어가 들어 있습니다')
  reviewSheet().appendRow([new Date().toISOString(), req.game, name, req.recommend ? 1 : 0, text, Number(req.playtime) || 0])
  return { ok: true }
}

function listReviews(game) {
  var rows = reviewSheet().getDataRange().getValues().slice(1)
  var out = rows
    .filter(function (r) {
      return !game || r[1] === game
    })
    .map(function (r) {
      return { time: r[0], game: r[1], name: r[2], recommend: r[3] === 1 || r[3] === true, text: r[4], playtime: r[5] }
    })
    .reverse()
  return { ok: true, reviews: out }
}

// ---- profile status messages ---------------------------------------------------

function profileSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName('profiles')
  if (!sh) {
    sh = ss.insertSheet('profiles')
    sh.appendRow(['name', 'status', 'time', 'role'])
    sh.setFrozenRows(1)
  }
  return sh
}

/** One row per nickname (case-insensitive); saving again overwrites it. */
function setStatus(req) {
  var name = auth(req)
  var text = String(req.text || '').trim().slice(0, 100)
  var role = String(req.role || '').trim().slice(0, 30)
  var lower = (text + ' ' + role).toLowerCase()
  if (
    BAD_WORDS.some(function (w) {
      return lower.indexOf(w) >= 0
    })
  )
    throw new Error('사용할 수 없는 단어가 들어 있습니다')
  var sh = profileSheet()
  var rows = sh.getDataRange().getValues()
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === name.toLowerCase()) {
      sh.getRange(i + 1, 1, 1, 4).setValues([[name, text, new Date().toISOString(), role]])
      return { ok: true }
    }
  }
  sh.appendRow([name, text, new Date().toISOString(), role])
  return { ok: true }
}

function listProfiles() {
  var out = {}
  profileSheet()
    .getDataRange()
    .getValues()
    .slice(1)
    .forEach(function (r) {
      if (r[0]) out[String(r[0]).toLowerCase()] = { name: String(r[0]), status: String(r[1] || ''), role: String(r[3] || '') }
    })
  return { ok: true, profiles: out }
}

// ---- accounts ------------------------------------------------------------------
// Columns: name | lower | salt | hash | tokens (JSON list) | data (JSON) | updated

var ACC = { name: 1, lower: 2, salt: 3, hash: 4, tokens: 5, data: 6, updated: 7 }

function accountSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName('accounts')
  if (!sh) {
    sh = ss.insertSheet('accounts')
    sh.appendRow(['name', 'lower', 'salt', 'hash', 'tokens', 'data', 'updated'])
    sh.setFrozenRows(1)
  }
  return sh
}

function findAccount(name) {
  var lower = String(name || '').trim().toLowerCase()
  if (!lower) return null
  var sh = accountSheet()
  var rows = sh.getDataRange().getValues()
  for (var i = 1; i < rows.length; i++) if (String(rows[i][ACC.lower - 1]) === lower) return { sh: sh, row: i + 1, v: rows[i] }
  return null
}

function hashPw(salt, pw) {
  var h = salt + ':' + pw
  for (var i = 0; i < 300; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8))
  return h
}

function newToken() {
  return Utilities.getUuid() + Utilities.getUuid()
}

function tokensOf(acc) {
  try {
    return JSON.parse(acc.v[ACC.tokens - 1] || '[]')
  } catch (e) {
    return []
  }
}

function addToken(acc, token) {
  var list = tokensOf(acc)
  list.unshift(token)
  acc.sh.getRange(acc.row, ACC.tokens).setValue(JSON.stringify(list.slice(0, 10)))
}

function checkPwLength(pw) {
  if (String(pw || '').length < 4) throw new Error('비밀번호는 4자 이상이어야 합니다')
}

/** Too many wrong passwords for one nickname: wait 10 minutes. */
function guard(name, failed) {
  var cache = CacheService.getScriptCache()
  var key = 'fail:' + String(name).toLowerCase()
  var n = Number(cache.get(key) || 0)
  if (failed === undefined) {
    if (n >= 8) throw new Error('비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요')
    return
  }
  if (failed) cache.put(key, String(n + 1), 600)
  else cache.remove(key)
}

function signup(req) {
  var name = String(req.name || '').trim()
  if (!/^[^\s<>"'`]{1,20}$/.test(name)) throw new Error('닉네임은 공백 없이 1~20자로 써 주세요')
  checkPwLength(req.password)
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    if (findAccount(name)) throw new Error('이미 쓰고 있는 닉네임이에요. 본인이라면 로그인해 주세요')
    var salt = Utilities.getUuid()
    var token = newToken()
    var at = new Date().toISOString()
    accountSheet().appendRow([name, name.toLowerCase(), salt, hashPw(salt, req.password), JSON.stringify([token]), JSON.stringify(req.data || {}), at])
    return { ok: true, name: name, token: token, updated: at }
  } finally {
    lock.releaseLock()
  }
}

function login(req) {
  var acc = findAccount(req.name)
  if (!acc) throw new Error('없는 닉네임이에요')
  guard(req.name)
  checkPwLength(req.password)
  var salt = String(acc.v[ACC.salt - 1] || '')
  var hash = String(acc.v[ACC.hash - 1] || '')
  if (!hash) {
    // An admin cleared the hash: this login sets the new password.
    salt = Utilities.getUuid()
    acc.sh.getRange(acc.row, ACC.salt, 1, 2).setValues([[salt, hashPw(salt, req.password)]])
  } else if (hashPw(salt, req.password) !== hash) {
    guard(req.name, true)
    throw new Error('비밀번호가 틀렸어요')
  }
  guard(req.name, false)
  var token = newToken()
  addToken(acc, token)
  return { ok: true, name: String(acc.v[ACC.name - 1]), token: token, data: parseData(acc), updated: String(acc.v[ACC.updated - 1] || '') }
}

function parseData(acc) {
  try {
    return JSON.parse(acc.v[ACC.data - 1] || '{}')
  } catch (e) {
    return {}
  }
}

/** Returns the account's display name if name + token match, else throws. */
function auth(req) {
  var acc = findAccount(req.name)
  if (!acc || !req.token || tokensOf(acc).indexOf(req.token) < 0) throw new Error('로그인이 필요해요. 다시 로그인해 주세요')
  return String(acc.v[ACC.name - 1])
}

function loadData(req) {
  auth(req)
  var acc = findAccount(req.name)
  return { ok: true, data: parseData(acc), updated: String(acc.v[ACC.updated - 1] || '') }
}

function saveData(req) {
  auth(req)
  var text = JSON.stringify(req.data || {})
  if (text.length > 45000) throw new Error('저장할 데이터가 너무 큽니다')
  var acc = findAccount(req.name)
  var at = new Date().toISOString()
  acc.sh.getRange(acc.row, ACC.data, 1, 2).setValues([[text, at]])
  return { ok: true, updated: at }
}

function logout(req) {
  var acc = findAccount(req.name)
  if (!acc) return { ok: true }
  acc.sh.getRange(acc.row, ACC.tokens).setValue(
    JSON.stringify(
      tokensOf(acc).filter(function (t) {
        return t !== req.token
      }),
    ),
  )
  return { ok: true }
}

// ---- ownership -------------------------------------------------------------------

function ymlDeveloper(text) {
  var m = String(text).match(/^developer:\s*(.+)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

/** A game that already exists may only be changed by the account named as its developer. */
function assertOwner(id, who) {
  if (!ID_RE.test(id || '')) throw new Error('게임 주소 이름이 올바르지 않습니다')
  var res = ghRaw('GET', 'https://api.github.com/repos/' + prop('REPO', 'KH32-7/skeam') + '/contents/games/' + id + '/game.yml?ref=' + prop('BRANCH', 'main'))
  if (res.getResponseCode() === 404) return // a new game
  if (res.getResponseCode() >= 300) throw new Error('GitHub ' + res.getResponseCode())
  var content = JSON.parse(res.getContentText()).content.replace(/\n/g, '')
  var dev = ymlDeveloper(Utilities.newBlob(Utilities.base64Decode(content)).getDataAsString('UTF-8'))
  if (dev.toLowerCase() !== who.toLowerCase()) throw new Error('이 게임은 ' + dev + '만 수정할 수 있어요')
}

// ---- helpers -----------------------------------------------------------------

function prop(k, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(k)
  if (!v && fallback === undefined) throw new Error('스크립트 속성 ' + k + '가 설정되지 않았습니다')
  return v || fallback
}

function ghRaw(method, url, payload, contentType) {
  var opt = {
    method: method.toLowerCase(),
    headers: { Authorization: 'Bearer ' + prop('GITHUB_TOKEN'), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    muteHttpExceptions: true,
  }
  if (payload !== undefined) {
    if (contentType) {
      opt.contentType = contentType
      opt.payload = payload
    } else {
      opt.contentType = 'application/json'
      opt.payload = JSON.stringify(payload)
    }
  }
  return UrlFetchApp.fetch(url, opt)
}

function gh(method, path, payload) {
  var res = ghRaw(method, 'https://api.github.com' + path, payload)
  var code = res.getResponseCode()
  if (code >= 300) throw new Error('GitHub ' + code + ': ' + res.getContentText().slice(0, 200))
  var text = res.getContentText()
  return text ? JSON.parse(text) : {}
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
