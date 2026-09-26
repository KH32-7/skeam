/*
 * SKEAM SDK: lets an HTML game talk to the SKEAM player it runs inside.
 *
 *   <script src="https://kh32-7.github.io/skeam/skeam-sdk.js"></script>   (in <head>)
 *   SKEAM.unlock('first_win')   // achievement unlocked
 *   SKEAM.inSkeam               // true when running inside SKEAM
 *
 * Outside SKEAM every call is a harmless no-op, so the same build still
 * works on its own GitHub Pages address.
 *
 * Cloud saves (like Steam Auto-Cloud): when the player is logged in to SKEAM,
 * the game's save data in localStorage and IndexedDB (where Godot and Unity web
 * builds keep user:// files and PlayerPrefs) is backed up to their SKEAM account
 * and brought back on any other device. The game needs no code for this.
 *
 * Several games often live on one origin (every game of a GitHub user shares
 * https://<user>.github.io, and so do their Godot builds' "/userfs" database).
 * So the SDK only ever touches this game's own data:
 *   - localStorage: the keys this game has written (never SKEAM's own).
 *   - IndexedDB with file-path keys (Godot, Unity): the folder that holds the
 *     files this game has written, e.g. /userfs/godot/app_userdata/<project>.
 *     Never a folder shared by every game (/userfs, /idbfs, app_userdata...),
 *     never two Godot projects merged. Other folders are left alone.
 *   - Other IndexedDB databases: only ones this game has written to.
 *   - Any single item over 1 MB is left out (and reported) so the rest syncs.
 * These are remembered per game, in the "__skeam_cloud:<game path>" localStorage
 * key (e.g. "__skeam_cloud:/RocketIntern/"). One key for the whole origin made
 * games on the same origin overwrite each other's sync state, so switching games
 * restored an old cloud copy. What another game on this origin has claimed (its
 * keys and folders) is never backed up, deleted or replaced by this one.
 *
 * How it stays safe:
 *   1. On load the SDK tells SKEAM what this device has and holds back
 *      indexedDB.open until SKEAM answers, so an engine never reads a save
 *      that is about to be replaced.
 *   2. SKEAM answers "ready" (keep this device's data), or sends the cloud
 *      save. Then the SDK writes it over this game's data and reloads once.
 *   3. After that, every change is sent to SKEAM a few seconds later.
 * Nothing is uploaded before step 2, so an empty new device never overwrites
 * the cloud save. Nothing is deleted outside this game's own data.
 */
(function () {
  if (window.SKEAM) return
  var parent = window.parent !== window ? window.parent : null
  function send(msg) {
    if (parent) parent.postMessage(msg, '*')
  }

  var SKEAM = {
    inSkeam: !!parent,
    unlock: function (id) {
      send({ skeam: 'unlock', id: String(id) })
    },
    openOverlay: function () {
      send({ skeam: 'overlay' })
    },
    /** 'off' | 'waiting' | 'ready' | 'restoring' */
    cloud: 'off',
  }
  window.SKEAM = SKEAM

  // Shift+Tab inside the game opens the SKEAM overlay, like Steam.
  window.addEventListener(
    'keydown',
    function (e) {
      if (parent && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        send({ skeam: 'overlay' })
      }
    },
    true,
  )

  if (!parent) return
  // Some browsers (Safari in a frame from another site, strict privacy settings)
  // block or limit storage here. Tell SKEAM why instead of failing silently.
  var ls = null
  var idb = null
  try {
    ls = window.localStorage
    ls.getItem('__skeam_probe')
  } catch (e) {
    ls = null
  }
  try {
    idb = window.indexedDB || null
  } catch (e) {
    idb = null
  }
  if (!ls) {
    send({ skeam: 'cloud-unavailable', reason: 'localStorage' })
    return
  }

  // ---- state -----------------------------------------------------------------------
  var META_PREFIX = '__skeam_cloud'
  var GAME_PATH = (function () {
    var p = location.pathname
    return p.slice(0, p.lastIndexOf('/') + 1) || '/'
  })()
  var META = META_PREFIX + ':' + GAME_PATH
  var origGet = Storage.prototype.getItem
  var origSet = Storage.prototype.setItem
  var origRemove = Storage.prototype.removeItem
  var origClear = Storage.prototype.clear
  var origOpen = idb ? IDBFactory.prototype.open : null

  var state = 'waiting' // until SKEAM answers
  var restoring = false
  var seq = 0 // bumps on every change the game makes
  var savedSeq = 0 // seq of the last snapshot SKEAM stored
  var changedEarly = false
  var timer = 0
  var markedAt = 0

  function readMeta() {
    try {
      var m = JSON.parse(origGet.call(ls, META) || '{}') || {}
      if (!Array.isArray(m.keys)) m.keys = []
      if (!m.roots || typeof m.roots !== 'object') m.roots = {}
      if (!Array.isArray(m.dbs)) m.dbs = []
      return m
    } catch (e) {
      return { keys: [], roots: {}, dbs: [] }
    }
  }
  function writeMeta(m) {
    try {
      origSet.call(ls, META, JSON.stringify(m))
    } catch (e) {
      /* quota */
    }
  }
  var meta = readMeta()
  if (meta.kv !== 3) {
    meta.keys = []
    meta.kv = 3
    writeMeta(meta)
  }
  function saveMeta(patch) {
    for (var k in patch) meta[k] = patch[k]
    writeMeta(meta)
  }

  /** What the other games on this origin have claimed: {keys: {key: true}, roots: {db: [folder]}}. */
  function others() {
    var out = { keys: {}, roots: {} }
    try {
      for (var i = 0; i < ls.length; i++) {
        var name = ls.key(i)
        if (!name || name === META || name.indexOf(META_PREFIX + ':') !== 0) continue
        var m = JSON.parse(origGet.call(ls, name) || '{}') || {}
        // Keys remembered by older SDKs include ones a game only read; they
        // can't prove ownership, so they don't count until that game runs again.
        if (m.kv === 3)
          (Array.isArray(m.keys) ? m.keys : []).forEach(function (k) {
            out.keys[k] = true
          })
        // A folder that covers shared storage isn't one game's; ignoring it keeps
        // an old, too-wide record from hiding this game's own files.
        var r = m.roots && typeof m.roots === 'object' ? m.roots : {}
        Object.keys(r).forEach(function (db) {
          if (!tooWide(r[db])) (out.roots[db] = out.roots[db] || []).push(r[db])
        })
      }
    } catch (e) {
      /* ignore */
    }
    return out
  }
  var OTHERS = null
  function otherOwns(o, db, key) {
    if (!o) return false
    return (o.roots[db] || []).some(function (r) {
      return inScope(key, r)
    })
  }

  // Anything with "cache" in its name is a cache (Unity's asset cache, Godot's
  // shader_cache), not a save: never held, backed up or replaced. Can be large.
  function isCache(name) {
    return /cache/i.test(String(name))
  }
  function ownKey(k) {
    return typeof k === 'string' && k.indexOf(META_PREFIX) !== 0 && k.indexOf('skeam:') !== 0
  }

  // ---- which localStorage keys are this game's ----------------------------------------
  function track(k) {
    if (!ownKey(k) || meta.keys.indexOf(k) >= 0) return
    meta.keys.push(k)
    writeMeta(meta)
  }

  // ---- which IndexedDB folder is this game's ------------------------------------------
  function dirname(p) {
    var i = p.lastIndexOf('/')
    return i > 0 ? p.slice(0, i) : '/'
  }
  function commonDir(a, b) {
    if (!a) return b
    var x = a.split('/')
    var y = b.split('/')
    var out = []
    for (var i = 0; i < x.length && i < y.length && x[i] === y[i]; i++) out.push(x[i])
    return out.join('/') || '/'
  }
  function isPathKey(k) {
    return typeof k === 'string' && k.charAt(0) === '/'
  }
  /** Emscripten stores a file as {timestamp, mode, contents}; folders have no contents. */
  function isFileEntry(v) {
    return v && typeof v === 'object' && v.contents !== undefined
  }
  function inScope(key, root) {
    return key === root || key.indexOf(root + '/') === 0
  }
  function ancestorOf(key, root) {
    return root.indexOf(key + '/') === 0
  }
  // Godot keeps a game's user:// in /userfs/godot/app_userdata/<project name>.
  // Several Godot games on one origin share /userfs, and an engine sometimes
  // rewrites another project's unchanged files when it syncs, so a folder is
  // learned per project and two projects' folders are never merged into one.
  var GODOT_USER = /^(\/userfs\/godot\/app_userdata\/[^\/]+)(\/|$)/
  function godotProject(path) {
    var m = String(path).match(GODOT_USER)
    return m ? m[1] : ''
  }
  function titleIs(folder) {
    var name = folder.slice(folder.lastIndexOf('/') + 1).toLowerCase()
    var t = (document.title || '').trim().toLowerCase()
    return !!t && (t === name || t.indexOf(name) >= 0)
  }
  /** A remembered folder that holds several games' data (from before this rule) is forgotten and learned again. */
  // Mount points and engine folders shared by every game on an origin: Godot's
  // /userfs and its app_userdata, Unity/Emscripten's /idbfs and /home/web_user.
  // A game's own folder is always at least one level below these.
  var SHARED_DIRS = ['/userfs/godot', '/userfs/godot/app_userdata', '/home/web_user']
  function tooWide(root) {
    var depth = String(root).split('/').filter(Boolean).length
    return depth < 2 || SHARED_DIRS.indexOf(root) >= 0
  }
  Object.keys(meta.roots).forEach(function (db) {
    if (tooWide(meta.roots[db])) {
      delete meta.roots[db]
      writeMeta(meta)
    }
  })
  OTHERS = others()

  function learnRoot(dbName, key, value) {
    if (!isPathKey(key) || !isFileEntry(value) || isCache(key)) return
    if (otherOwns(OTHERS, dbName, key)) return
    var cur = meta.roots[dbName] || ''
    var proj = godotProject(key)
    var r
    if (proj) {
      var curProj = godotProject(cur + '/')
      if (curProj && curProj !== proj) {
        // Another project's folder: only switch if it's clearly this page's game.
        if (!titleIs(proj) || titleIs(curProj)) return
        r = proj
      } else r = curProj ? commonDir(cur, dirname(key)) : proj
      if (!godotProject(r + '/')) r = proj
    } else r = commonDir(cur, dirname(key))
    if (tooWide(r) || r === cur) return
    meta.roots[dbName] = r
    writeMeta(meta)
  }

  // ---- hold indexedDB.open until SKEAM has answered -------------------------------------
  var gateOpen = false
  var queued = []
  function openGate() {
    if (gateOpen) return
    gateOpen = true
    queued.splice(0).forEach(function (f) {
      f()
    })
  }
  if (idb) {
    IDBFactory.prototype.open = function (name) {
      if (gateOpen || this !== idb || isCache(name)) return origOpen.apply(this, arguments)
      var args = arguments
      var fake = deferredRequest()
      queued.push(function () {
        fake._bind(origOpen.apply(idb, args))
      })
      return fake
    }
  }

  /** Looks like an IDBOpenDBRequest; forwards everything once the real one exists. */
  function deferredRequest() {
    var real = null
    var listeners = { success: [], error: [], upgradeneeded: [], blocked: [] }
    var fake = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
      addEventListener: function (type, fn) {
        if (listeners[type]) listeners[type].push(fn)
      },
      removeEventListener: function (type, fn) {
        if (listeners[type]) listeners[type] = listeners[type].filter(function (f) { return f !== fn })
      },
      _bind: function (r) {
        real = r
        Object.keys(listeners).forEach(function (type) {
          r.addEventListener(type, function (ev) {
            if (typeof fake['on' + type] === 'function') fake['on' + type].call(fake, ev)
            listeners[type].forEach(function (fn) {
              fn.call(fake, ev)
            })
          })
        })
      },
    }
    ;['result', 'error', 'readyState', 'transaction', 'source'].forEach(function (k) {
      Object.defineProperty(fake, k, {
        get: function () {
          return real ? real[k] : k === 'readyState' ? 'pending' : null
        },
      })
    })
    return fake
  }

  /** Resolves with `fallback` if `p` hasn't settled in `ms` (some IndexedDB calls never answer in Safari frames). */
  function within(p, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false
      var t = setTimeout(function () {
        if (!done) {
          done = true
          resolve(fallback)
        }
      }, ms)
      p.then(
        function (v) {
          if (!done) {
            done = true
            clearTimeout(t)
            resolve(v)
          }
        },
        function () {
          if (!done) {
            done = true
            clearTimeout(t)
            resolve(fallback)
          }
        },
      )
    })
  }

  // ---- notice changes the game makes ---------------------------------------------------
  // The "changed" mark is kept even when not syncing (logged out, SKEAM
  // unreachable), so the next synced session uploads that progress.
  function changed() {
    if (restoring) return
    seq++
    if (Date.now() - markedAt > 5000) {
      markedAt = Date.now()
      saveMeta({ dirty: true, at: new Date().toISOString() })
    }
    if (state !== 'ready') {
      changedEarly = true
      return
    }
    clearTimeout(timer)
    timer = setTimeout(upload, 3000)
  }

  Storage.prototype.setItem = function (k) {
    if (this === ls) {
      if (restoring) return
      if (ownKey(k)) {
        track(k)
        changed()
      }
    }
    return origSet.apply(this, arguments)
  }
  Storage.prototype.removeItem = function (k) {
    if (this === ls) {
      if (restoring) return
      if (ownKey(k)) changed()
    }
    return origRemove.apply(this, arguments)
  }
  Storage.prototype.clear = function () {
    if (this === ls) {
      if (restoring) return
      // A game clearing "its" storage on a shared origin would wipe everyone's;
      // only its own keys go.
      changed()
      meta.keys.forEach(function (k) {
        origRemove.call(ls, k)
      })
      return
    }
    return origClear.apply(this, arguments)
  }
  if (idb) {
    ;['put', 'add'].forEach(function (name) {
      var orig = IDBObjectStore.prototype[name]
      IDBObjectStore.prototype[name] = function (value, key) {
        var db = ''
        try {
          db = this.transaction.db.name
        } catch (e) {
          /* ignore */
        }
        if (!isCache(db) && !restoring) {
          learnRoot(db, key, value)
          if (!isPathKey(key) && db && meta.dbs.indexOf(db) < 0) {
            meta.dbs.push(db)
            writeMeta(meta)
          }
          if (!isPathKey(key) || !isCache(key)) changed()
        }
        return orig.apply(this, arguments)
      }
    })
    ;['delete', 'clear'].forEach(function (name) {
      var orig = IDBObjectStore.prototype[name]
      IDBObjectStore.prototype[name] = function () {
        var db = ''
        try {
          db = this.transaction.db.name
        } catch (e) {
          /* ignore */
        }
        if (!isCache(db) && !restoring) changed()
        return orig.apply(this, arguments)
      }
    })
  }

  // ---- reading this game's data -------------------------------------------------------
  function ownLsKeys() {
    return meta.keys.filter(function (k) {
      return origGet.call(ls, k) !== null
    })
  }

  // Where Godot (/userfs) and Unity/Emscripten (/idbfs) keep user files; checked
  // one by one when the browser can't list databases.
  var KNOWN_DBS = ['/userfs', '/idbfs', '/home/web_user']
  var dbListing = 'none'

  function exists(name) {
    return within(
      new Promise(function (resolve) {
        var req = origOpen.call(idb, name)
        req.onupgradeneeded = function () {
          req.transaction.abort() // didn't exist; don't create it
        }
        req.onsuccess = function () {
          req.result.close()
          resolve(true)
        }
        req.onerror = function (e) {
          if (e && e.preventDefault) e.preventDefault()
          resolve(false)
        }
      }),
      1500,
      false,
    )
  }

  function probeDbs() {
    return Promise.all(KNOWN_DBS.map(exists)).then(function (found) {
      dbListing = 'probe'
      return KNOWN_DBS.filter(function (n, i) {
        return found[i]
      })
    })
  }

  function listDbs() {
    if (!idb) return Promise.resolve([])
    if (!idb.databases) return probeDbs()
    return within(idb.databases(), 1500, null).then(function (list) {
      if (!list) return probeDbs()
      dbListing = 'list'
      return list
        .map(function (d) {
          return d.name
        })
        .filter(function (n) {
          return n && !isCache(n)
        })
    })
  }

  /**
   * This game's part of one database, or null. A database whose keys are file
   * paths but whose folder we don't know yet (the game hasn't written a file in
   * it since the SDK arrived) is skipped: it may hold other games' files.
   */
  function dumpDb(name) {
    var root = meta.roots[name] || ''
    var o = others()
    return within(
      new Promise(function (resolve) {
        var req = origOpen.call(idb, name)
        req.onupgradeneeded = function () {
          req.transaction.abort()
        }
        req.onerror = function (e) {
          if (e && e.preventDefault) e.preventDefault()
          resolve(null)
        }
        req.onsuccess = function () {
          var db = req.result
          var out = { name: name, version: db.version, stores: [] }
          var names = [].slice.call(db.objectStoreNames)
          if (!names.length) {
            db.close()
            return resolve(null)
          }
          var pathKeys = false
          var ownDb = meta.dbs.indexOf(name) >= 0
          var tx = db.transaction(names, 'readonly')
          names.forEach(function (sn) {
            var st = tx.objectStore(sn)
            var s = { name: sn, keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes: [], scope: root || null, records: [] }
            ;[].slice.call(st.indexNames).forEach(function (iname) {
              var ix = st.index(iname)
              s.indexes.push({ name: iname, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry })
            })
            st.openCursor().onsuccess = function (e) {
              var c = e.target.result
              if (!c) return
              var k = c.primaryKey
              if (isPathKey(k)) {
                pathKeys = true
                if (root && !isCache(k) && !otherOwns(o, name, k) && (inScope(k, root) || ancestorOf(k, root)) && fits(name + ' ' + k, c.value)) s.records.push([k, c.value])
              } else if (ownDb && fits(name + ' ' + String(k), c.value)) s.records.push([k, c.value])
              c.continue()
            }
            out.stores.push(s)
          })
          tx.oncomplete = function () {
            db.close()
            // Path-keyed without a known folder, or another game's plain database: not ours.
            resolve((pathKeys && !root) || (!pathKeys && !ownDb) ? null : out)
          }
          tx.onerror = tx.onabort = function () {
            db.close()
            resolve(null)
          }
        }
      }),
      8000,
      null,
    )
  }

  // Anything bigger than this is almost never a save (replays, recordings,
  // screenshots, downloaded content). Left out so the rest still syncs.
  var ITEM_LIMIT = 1024 * 1024
  var skipped = []
  function approxSize(v) {
    if (v == null) return 0
    if (typeof v === 'string') return v.length
    if (v instanceof ArrayBuffer) return v.byteLength
    if (ArrayBuffer.isView(v)) return v.byteLength
    if (typeof Blob !== 'undefined' && v instanceof Blob) return v.size
    if (typeof v === 'object') {
      var n = 0
      for (var k in v) n += k.length + approxSize(v[k])
      return n
    }
    return 8
  }
  function fits(name, v) {
    var n = approxSize(v)
    if (n <= ITEM_LIMIT) return true
    skipped.push({ name: name, size: n })
    return false
  }

  function snapshot() {
    skipped = []
    var data = {}
    ownLsKeys().forEach(function (k) {
      var v = origGet.call(ls, k)
      if (fits('localStorage "' + k + '"', v)) data[k] = v
    })
    return listDbs()
      .then(function (names) {
        return Promise.all(names.map(dumpDb))
      })
      .then(function (dbs) {
        return { v: 2, ls: data, idb: dbs.filter(Boolean), skipped: skipped }
      })
  }

  // ---- writing a cloud save over this game's data -------------------------------------
  /** Opens an existing database, or resolves null if there is none (without creating it). */
  function openDb(name) {
    return within(
      new Promise(function (resolve) {
        var req = origOpen.call(idb, name)
        req.onsuccess = function () {
          resolve(req.result)
        }
        req.onerror = function (e) {
          if (e && e.preventDefault) e.preventDefault()
          resolve(null)
        }
        req.onupgradeneeded = function () {
          req.transaction.abort()
        }
      }),
      8000,
      null,
    )
  }

  /** Opens `d.name`, creating it or its missing stores as the snapshot describes. */
  function prepareDb(d) {
    function create(version, stores) {
      return within(
        new Promise(function (resolve) {
          var req = origOpen.call(idb, d.name, version)
          req.onupgradeneeded = function () {
            var db = req.result
            stores.forEach(function (s) {
              var st
              if (db.objectStoreNames.contains(s.name)) st = req.transaction.objectStore(s.name)
              else {
                var opts = { autoIncrement: !!s.autoIncrement }
                if (s.keyPath !== null && s.keyPath !== undefined && s.keyPath !== '') opts.keyPath = s.keyPath
                st = db.createObjectStore(s.name, opts)
              }
              s.indexes.forEach(function (ix) {
                if (!st.indexNames.contains(ix.name)) st.createIndex(ix.name, ix.keyPath, { unique: ix.unique, multiEntry: ix.multiEntry })
              })
            })
          }
          req.onsuccess = function () {
            resolve(req.result)
          }
          req.onerror = function (e) {
            if (e && e.preventDefault) e.preventDefault()
            resolve(null)
          }
        }),
        8000,
        null,
      )
    }
    return openDb(d.name).then(function (db) {
      if (!db) return create(d.version || 1, d.stores)
      var missing = d.stores.filter(function (s) {
        return !db.objectStoreNames.contains(s.name)
      })
      if (!missing.length) return db
      var v = db.version + 1
      db.close()
      return create(v, missing)
    })
  }

  /** Replaces this game's records: deletes what's in its folder, then writes the snapshot's. */
  function restoreDb(d, o) {
    return prepareDb(d).then(function (db) {
      if (!db) return 0
      return within(
        new Promise(function (resolve) {
          var names = d.stores.map(function (s) {
            return s.name
          })
          var tx = db.transaction(names, 'readwrite')
          d.stores.forEach(function (s) {
            var st = tx.objectStore(s.name)
            var inline = s.keyPath !== null && s.keyPath !== undefined && s.keyPath !== ''
            var putAll = function () {
              s.records.forEach(function (kv) {
                if (isPathKey(kv[0]) && otherOwns(o, d.name, kv[0])) return
                if (inline) st.put(kv[1])
                else st.put(kv[1], kv[0])
              })
            }
            // No folder, or one saved before folders were per game (too wide): only write, never delete.
            if (!s.scope || tooWide(s.scope)) return putAll()
            // Delete this game's old files first (not its parent folders, not other games').
            st.openCursor().onsuccess = function (e) {
              var c = e.target.result
              if (c) {
                if (isPathKey(c.primaryKey) && inScope(c.primaryKey, s.scope) && !otherOwns(o, d.name, c.primaryKey)) c.delete()
                c.continue()
              } else putAll()
            }
          })
          tx.oncomplete = function () {
            db.close()
            resolve(true)
          }
          tx.onerror = tx.onabort = function () {
            db.close()
            resolve(false)
          }
        }),
        15000,
        false,
      )
    })
  }

  /** How many files an Emscripten engine will see (it lists them through the "timestamp" index). */
  function visibleFiles(d) {
    return openDb(d.name).then(function (db) {
      if (!db) return -1
      return within(
        new Promise(function (resolve) {
          var names = [].slice.call(db.objectStoreNames)
          if (!names.length) {
            db.close()
            return resolve(0)
          }
          var st = db.transaction(names[0], 'readonly').objectStore(names[0])
          var src = st.indexNames.contains('timestamp') ? st.index('timestamp') : st
          var r = src.count()
          r.onsuccess = function () {
            db.close()
            resolve(r.result)
          }
          r.onerror = function () {
            db.close()
            resolve(-1)
          }
        }),
        5000,
        -1,
      )
    })
  }

  function restore(snap, ver) {
    restoring = true
    state = 'restoring'
    SKEAM.cloud = 'restoring'
    // localStorage: only this game's keys, never one another game on this origin claims
    // (cloud copies saved before per-game sync state can hold other games' keys and files).
    var o = others()
    var incoming = {}
    Object.keys(snap.ls || {}).forEach(function (k) {
      if (ownKey(k) && !o.keys[k]) incoming[k] = snap.ls[k]
    })
    meta.keys.forEach(function (k) {
      if (!(k in incoming)) origRemove.call(ls, k)
    })
    Object.keys(incoming).forEach(function (k) {
      try {
        origSet.call(ls, k, incoming[k])
      } catch (e) {
        /* quota */
      }
      if (meta.keys.indexOf(k) < 0) meta.keys.push(k)
    })
    var dbs = idb ? snap.idb || [] : []
    if (!idb && snap.idb && snap.idb.length) send({ skeam: 'cloud-log', text: '이 브라우저는 게임 창의 IndexedDB를 막아서 localStorage 부분만 불러왔어요' })
    var report = { ls: Object.keys(incoming).length, files: 0, dbs: [] }
    return dbs
      .reduce(function (p, d) {
        return p.then(function () {
          return restoreDb(d, o)
            .then(function (ok) {
              var sent = 0
              d.stores.forEach(function (s) {
                sent += s.records.length
                // A scope that holds another game's folder is too wide to be this game's.
                var wide = (o.roots[d.name] || []).some(function (r) {
                  return inScope(r, s.scope)
                })
                if (s.scope && !wide && !tooWide(s.scope)) meta.roots[d.name] = s.scope
              })
              report.files += sent
              return visibleFiles(d).then(function (n) {
                report.dbs.push({ name: d.name, ok: !!ok, written: sent, visible: n })
              })
            })
        })
      }, Promise.resolve())
      .then(function () {
        saveMeta({ ver: ver, dirty: false, at: new Date().toISOString(), restored: report })
        location.reload()
      })
  }

  // ---- uploading ---------------------------------------------------------------------
  var sending = false
  function upload() {
    if (state !== 'ready' || sending) return
    sending = true
    var at = seq
    snapshot().then(
      function (data) {
        sending = false
        send({ skeam: 'cloud-snapshot', seq: at, data: data })
      },
      function () {
        sending = false
      },
    )
  }

  function ready(uploadNow) {
    state = 'ready'
    SKEAM.cloud = 'ready'
    openGate()
    // Give the game a few seconds to read its keys first, so they're known to be its own.
    if (uploadNow || changedEarly) {
      clearTimeout(timer)
      timer = setTimeout(upload, 5000)
    }
  }

  // ---- talking to SKEAM ---------------------------------------------------------------
  var answered = false
  window.addEventListener('message', function (e) {
    if (e.source !== parent || !e.data || typeof e.data !== 'object') return
    var m = e.data
    if (m.skeam === 'cloud-wait') {
      // SKEAM is still deciding (e.g. the player is reading the conflict dialog).
      answered = true
      clearTimeout(giveUpTimer)
      giveUpTimer = setTimeout(giveUp, 25000)
    }
    else if (m.skeam === 'cloud-off') {
      answered = true
      state = 'off'
      SKEAM.cloud = 'off'
      openGate()
    } else if (m.skeam === 'cloud-ready') {
      answered = true
      if (state === 'waiting') ready(!!m.upload)
    } else if (m.skeam === 'cloud-restore') {
      answered = true
      if (state === 'waiting' && m.data) restore(m.data, m.ver)
    } else if (m.skeam === 'cloud-saved') {
      savedSeq = m.seq
      markedAt = 0
      var patch = { ver: m.ver }
      if (m.seq === seq) patch.dirty = false
      saveMeta(patch)
      if (m.seq !== seq) {
        clearTimeout(timer)
        timer = setTimeout(upload, 3000)
      }
    } else if (m.skeam === 'cloud-flush') {
      if (state === 'ready' && seq !== savedSeq) {
        clearTimeout(timer)
        upload()
      } else send({ skeam: 'cloud-clean' })
    }
  })

  var restored = meta.restored
  if (restored) saveMeta({ restored: null })
  listDbs().then(function (names) {
    var own = ownLsKeys()
    send({
      skeam: 'cloud-hello',
      v: 2,
      ver: meta.ver || '',
      dirty: !!meta.dirty,
      at: meta.at || '',
      // Any save database counts, even if it might be another game's on this
      // origin: better to ask than to overwrite a save silently.
      hasData: own.length > 0 || names.length > 0,
      env: { idb: !!idb, listing: dbListing, dbs: names, roots: meta.roots, lsKeys: own.length },
      restored: restored || null,
    })
    // An old SKEAM, or a page that isn't SKEAM, never answers: don't hold the game.
    setTimeout(function () {
      if (!answered) giveUp()
    }, 1500)
  })
  SKEAM.cloud = 'waiting'
  // Never hold the game longer than 25 seconds, even if SKEAM's server is slow.
  function giveUp() {
    if (state !== 'waiting') return
    state = 'off'
    SKEAM.cloud = 'off'
    openGate()
    send({ skeam: 'cloud-gaveup' })
  }
  var giveUpTimer = setTimeout(giveUp, 25000)
})()
