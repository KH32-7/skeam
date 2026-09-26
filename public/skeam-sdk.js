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
 * the game's localStorage and IndexedDB (where Godot and Unity web builds keep
 * user:// files and PlayerPrefs) are backed up to their SKEAM account and
 * brought back on any other device. The game needs no code for this.
 *
 * How it stays safe:
 *   1. On load the SDK tells SKEAM what this device has (version it last
 *      synced, whether it changed since) and holds back indexedDB.open until
 *      SKEAM answers, so an engine never reads a save that is about to be
 *      replaced.
 *   2. SKEAM answers "ready" (keep this device's data), or sends the cloud
 *      save. Then the SDK replaces localStorage and IndexedDB and reloads once.
 *   3. After that, every change is sent to SKEAM a few seconds later.
 * Nothing is uploaded before step 2, so an empty new device never overwrites
 * the cloud save.
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

  // ---- cloud saves ------------------------------------------------------------------
  var META = '__skeam_cloud'
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

  function readMeta() {
    try {
      return JSON.parse(ls.getItem(META) || '{}') || {}
    } catch (e) {
      return {}
    }
  }
  function writeMeta(m) {
    try {
      origSet.call(ls, META, JSON.stringify(m))
    } catch (e) {
      /* quota */
    }
  }

  // Hold every indexedDB.open until SKEAM has answered.
  var gateOpen = false
  var queued = []
  function openGate() {
    if (gateOpen) return
    gateOpen = true
    queued.splice(0).forEach(function (f) {
      f()
    })
  }
  // Caches (Unity's asset cache, Emscripten preload cache) aren't saves: never
  // held, backed up or replaced. They can be tens of MB.
  function isCache(name) {
    return /cache/i.test(String(name))
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

  // Notice changes the game makes. The "changed" mark is kept even when not
  // syncing (logged out, or SKEAM unreachable), so the next synced session
  // uploads that progress instead of treating the device as unchanged.
  var markedAt = 0
  function changed() {
    if (restoring) return
    seq++
    if (Date.now() - markedAt > 5000) {
      markedAt = Date.now()
      var m = readMeta()
      m.dirty = true
      m.at = new Date().toISOString()
      writeMeta(m)
    }
    if (state !== 'ready') {
      changedEarly = true
      return
    }
    clearTimeout(timer)
    timer = setTimeout(upload, 3000)
  }
  Storage.prototype.setItem = function (k, v) {
    if (this === ls) {
      if (restoring) return
      if (k !== META) changed()
    }
    return origSet.apply(this, arguments)
  }
  Storage.prototype.removeItem = function (k) {
    if (this === ls) {
      if (restoring) return
      if (k !== META) changed()
    }
    return origRemove.apply(this, arguments)
  }
  Storage.prototype.clear = function () {
    if (this === ls) {
      if (restoring) return
      changed()
      var meta = ls.getItem(META)
      origClear.apply(this, arguments)
      if (meta) origSet.call(ls, META, meta)
      return
    }
    return origClear.apply(this, arguments)
  }
  ;(idb ? ['put', 'add', 'delete', 'clear'] : []).forEach(function (name) {
    var orig = IDBObjectStore.prototype[name]
    IDBObjectStore.prototype[name] = function () {
      var db = ''
      try {
        db = this.transaction.db.name
      } catch (e) {
        /* ignore */
      }
      if (!isCache(db)) changed()
      return orig.apply(this, arguments)
    }
  })

  // ---- reading and writing everything the game stored ----------------------------------
  function lsKeys() {
    var keys = []
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i)
      if (k !== META) keys.push(k)
    }
    return keys
  }

  // Where Godot (/userfs) and Unity/Emscripten (/idbfs) keep user files; checked
  // one by one when the browser can't list databases.
  var KNOWN_DBS = ['/userfs', '/idbfs', '/home/web_user']
  var dbListing = 'none' // how the last listing worked, for SKEAM's diagnostics

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

  function dumpDb(name) {
    return within(new Promise(function (resolve) {
      var req = origOpen.call(idb, name)
      req.onupgradeneeded = function () {
        req.transaction.abort() // it didn't exist; don't create it
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
          return resolve(out)
        }
        var tx = db.transaction(names, 'readonly')
        names.forEach(function (sn) {
          var st = tx.objectStore(sn)
          var s = { name: sn, keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes: [], records: [] }
          ;[].slice.call(st.indexNames).forEach(function (iname) {
            var ix = st.index(iname)
            s.indexes.push({ name: iname, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry })
          })
          st.openCursor().onsuccess = function (e) {
            var c = e.target.result
            if (c) {
              s.records.push([c.primaryKey, c.value])
              c.continue()
            }
          }
          out.stores.push(s)
        })
        tx.oncomplete = function () {
          db.close()
          resolve(out)
        }
        tx.onerror = tx.onabort = function () {
          db.close()
          resolve(null)
        }
      }
    }), 8000, null)
  }

  function snapshot() {
    var data = {}
    lsKeys().forEach(function (k) {
      data[k] = ls.getItem(k)
    })
    return listDbs()
      .then(function (names) {
        return Promise.all(names.map(dumpDb))
      })
      .then(function (dbs) {
        return { v: 1, ls: data, idb: dbs.filter(Boolean) }
      })
  }

  function deleteDb(name) {
    return within(new Promise(function (resolve) {
      var r = idb.deleteDatabase(name)
      r.onsuccess = r.onerror = r.onblocked = function () {
        resolve()
      }
    }), 3000, null)
  }

  function createDb(d) {
    return within(new Promise(function (resolve) {
      var req = origOpen.call(idb, d.name, d.version || 1)
      req.onupgradeneeded = function () {
        var db = req.result
        d.stores.forEach(function (s) {
          var opts = { autoIncrement: !!s.autoIncrement }
          if (s.keyPath !== null && s.keyPath !== undefined && s.keyPath !== '') opts.keyPath = s.keyPath
          var st = db.createObjectStore(s.name, opts)
          s.indexes.forEach(function (ix) {
            st.createIndex(ix.name, ix.keyPath, { unique: ix.unique, multiEntry: ix.multiEntry })
          })
          s.records.forEach(function (kv) {
            if ('keyPath' in opts) st.put(kv[1])
            else st.put(kv[1], kv[0])
          })
        })
      }
      req.onsuccess = function () {
        req.result.close()
        resolve()
      }
      req.onerror = function (e) {
        if (e && e.preventDefault) e.preventDefault()
        resolve()
      }
    }), 8000, null)
  }

  function restore(snap, ver) {
    restoring = true
    state = 'restoring'
    SKEAM.cloud = 'restoring'
    lsKeys().forEach(function (k) {
      origRemove.call(ls, k)
    })
    Object.keys(snap.ls || {}).forEach(function (k) {
      if (k !== META) origSet.call(ls, k, snap.ls[k])
    })
    var dbs = idb ? snap.idb || [] : []
    if (!idb && snap.idb && snap.idb.length) send({ skeam: 'cloud-log', text: '이 브라우저는 게임 창의 IndexedDB를 막아서 localStorage 부분만 불러왔어요' })
    return listDbs()
      .then(function (names) {
        return Promise.all(names.map(deleteDb))
      })
      .then(function () {
        return Promise.all(dbs.map(createDb))
      })
      .then(function () {
        writeMeta({ ver: ver, dirty: false, at: new Date().toISOString() })
        location.reload()
      })
  }

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
    if (uploadNow || changedEarly) upload()
  }

  // ---- talking to SKEAM ---------------------------------------------------------------
  var answered = false
  window.addEventListener('message', function (e) {
    if (e.source !== parent || !e.data || typeof e.data !== 'object') return
    var m = e.data
    if (m.skeam === 'cloud-wait') answered = true
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
      var meta = readMeta()
      meta.ver = m.ver
      savedSeq = m.seq
      markedAt = 0
      if (m.seq === seq) meta.dirty = false
      writeMeta(meta)
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

  var meta = readMeta()
  var hasLs = lsKeys().length > 0
  listDbs().then(function (names) {
    send({
      skeam: 'cloud-hello',
      v: 1,
      ver: meta.ver || '',
      dirty: !!meta.dirty,
      at: meta.at || '',
      hasData: hasLs || names.length > 0,
      env: { idb: !!idb, listing: dbListing, dbs: names, lsKeys: lsKeys().length },
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
  setTimeout(giveUp, 25000)
})()
