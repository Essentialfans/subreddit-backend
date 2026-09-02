/**
 * MAIN-world hook (manifest world: MAIN). Captures gif IDs from RedGifs
 * fetch/XHR/media even when the address bar stays on /niches/...
 *
 * Only emits the *current* playing / freshly fetched gif — never replays
 * the whole performance timeline (that stuck previous creators).
 */
(() => {
  if (window.__bgBlackGifHook) return
  window.__bgBlackGifHook = true

  /** @type {Map<string, { username?: string|null, urls: string[] }>} */
  const catalog = new Map()
  /** @type {Set<string>} */
  const seenResources = new Set()
  let lastPath = location.pathname
  let activeGifId = null

  const profileUserFromPath = () => {
    const m = location.pathname.match(/^\/users\/([^/?#]+)/i)
    return m ? decodeURIComponent(m[1]).toLowerCase() : null
  }

  const clearAttrs = () => {
    try {
      document.documentElement.removeAttribute('data-bg-gif-id')
      document.documentElement.removeAttribute('data-bg-username')
    } catch (_) {
      /* ignore */
    }
  }

  const emit = (payload, { force = false } = {}) => {
    if (!payload?.gifId && !payload?.username) return
    const gifId = payload.gifId ? String(payload.gifId).toLowerCase() : null
    const profileUser = profileUserFromPath()
    let username = payload.username ? String(payload.username).toLowerCase() : null
    // On a profile page, never keep another creator's name
    if (profileUser) username = profileUser

    if (gifId) {
      if (!force && activeGifId && activeGifId !== gifId) {
        // Ignore background prefetch of other gifs while one is active,
        // unless this emit is from the playing video (force).
        return
      }
      activeGifId = gifId
    }

    try {
      if (gifId) {
        document.documentElement.setAttribute('data-bg-gif-id', gifId)
      }
      if (username) {
        document.documentElement.setAttribute('data-bg-username', username)
      }
    } catch (_) {
      /* ignore */
    }
    window.postMessage({ source: 'blackgif-scraper', gifId, username, t: Date.now() }, '*')
  }

  const resetForNavigation = () => {
    const path = location.pathname
    if (path === lastPath) return
    lastPath = path
    activeGifId = null
    clearAttrs()
    const profileUser = profileUserFromPath()
    if (profileUser) {
      try {
        document.documentElement.setAttribute('data-bg-username', profileUser)
      } catch (_) {
        /* ignore */
      }
      window.postMessage(
        { source: 'blackgif-scraper', gifId: null, username: profileUser, nav: true, t: Date.now() },
        '*',
      )
    } else {
      window.postMessage(
        { source: 'blackgif-scraper', gifId: null, username: null, nav: true, t: Date.now() },
        '*',
      )
    }
  }

  const idFromUrl = (url) => {
    if (!url) return null
    const s = String(url)
    let m = s.match(/\/(?:watch|ifr)\/([A-Za-z0-9]+)/i)
    if (m) return m[1].toLowerCase()
    m = s.match(
      /(?:media|thumbs\d*|files)\.redgifs\.com\/([A-Za-z][A-Za-z0-9]+)(?:-mobile|-poster|-small|-large)?(?:\.(?:mp4|webm|jpg|jpeg|png|webp|gif|m4s))?(?:\?|$)/i,
    )
    if (m) return m[1].toLowerCase()
    m = s.match(/api\.redgifs\.com\/v2\/gifs\/([A-Za-z0-9]+)/i)
    if (m) return m[1].toLowerCase()
    return null
  }

  const rememberGif = (gif) => {
    if (!gif || !gif.id) return
    const id = String(gif.id).toLowerCase()
    const username = (gif.userName || gif.username || '').toLowerCase() || null
    const urls = []
    const urlsObj = gif.urls || {}
    for (const key of Object.keys(urlsObj)) {
      if (typeof urlsObj[key] === 'string') urls.push(urlsObj[key])
    }
    const prev = catalog.get(id) || { username: null, urls: [] }
    catalog.set(id, {
      username: username || prev.username,
      urls: [...new Set([...prev.urls, ...urls])],
    })
  }

  const handleJson = (data) => {
    try {
      if (!data) return
      if (data.gif) {
        rememberGif(data.gif)
        // Single-gif API responses are authoritative for the current view
        const id = String(data.gif.id).toLowerCase()
        const username = (data.gif.userName || data.gif.username || '').toLowerCase() || null
        emit({ gifId: id, username }, { force: true })
      }
      if (Array.isArray(data.gifs)) {
        for (const g of data.gifs) rememberGif(g)
        // Feed payloads: do not emit every gif — wait for play
      }
    } catch (_) {
      /* ignore */
    }
  }

  const noteNewResource = (url) => {
    if (!url || seenResources.has(url)) return
    seenResources.add(url)
    // Cap set size
    if (seenResources.size > 400) {
      const first = seenResources.values().next().value
      seenResources.delete(first)
    }
    // Only update active id from resources when nothing is active yet
    const id = idFromUrl(url)
    if (!id) return
    const entry = catalog.get(id)
    if (!activeGifId) {
      emit({ gifId: id, username: entry?.username || null })
    }
  }

  const wrapFetch = (orig) =>
    function (...args) {
      const p = orig.apply(this, args)
      Promise.resolve(p)
        .then((res) => {
          try {
            resetForNavigation()
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url
            noteNewResource(url)
            if (url && String(url).includes('api.redgifs.com') && res && res.clone) {
              res.clone().json().then(handleJson).catch(() => {})
            }
          } catch (_) {
            /* ignore */
          }
        })
        .catch(() => {})
      return p
    }

  try {
    window.fetch = wrapFetch(window.fetch.bind(window))
  } catch (_) {
    /* ignore */
  }

  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__bgUrl = url
    return open.call(this, method, url, ...rest)
  }
  const sendX = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        resetForNavigation()
        noteNewResource(this.__bgUrl)
        if (String(this.__bgUrl || '').includes('api.redgifs.com') && this.responseText) {
          handleJson(JSON.parse(this.responseText))
        }
      } catch (_) {
        /* ignore */
      }
    })
    return sendX.apply(this, args)
  }

  const matchPlaying = (video) => {
    if (!video) return
    resetForNavigation()
    const candidates = [video.currentSrc, video.src, video.poster].filter(Boolean)
    for (const u of candidates) {
      const id = idFromUrl(u)
      if (id) {
        const entry = catalog.get(id)
        emit({ gifId: id, username: entry?.username || profileUserFromPath() }, { force: true })
        return
      }
    }
    // Match catalog media URLs against currentSrc (blob pages still had CDN fetch)
    for (const [id, entry] of catalog.entries()) {
      for (const u of entry.urls) {
        if (candidates.some((c) => c && u && (c.includes(id) || u.includes(c.slice(-40))))) {
          emit({ gifId: id, username: entry.username || profileUserFromPath() }, { force: true })
          return
        }
      }
    }
  }

  document.addEventListener(
    'play',
    (e) => {
      const v = e.target
      if (!v || v.tagName !== 'VIDEO') return
      matchPlaying(v)
    },
    true,
  )

  document.addEventListener(
    'loadeddata',
    (e) => {
      const v = e.target
      if (!v || v.tagName !== 'VIDEO') return
      matchPlaying(v)
    },
    true,
  )

  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        noteNewResource(entry.name)
      }
    })
    po.observe({ type: 'resource', buffered: false })
  } catch (_) {
    /* ignore */
  }

  // Seed seen set with existing resources so we don't treat them as "new" later
  try {
    for (const e of performance.getEntriesByType('resource')) {
      seenResources.add(e.name)
    }
  } catch (_) {
    /* ignore */
  }

  setInterval(() => {
    resetForNavigation()
    const videos = document.querySelectorAll('video')
    for (const v of videos) {
      if (!v.paused && v.readyState >= 2) matchPlaying(v)
    }
  }, 800)

  // History / SPA navigation
  const wrapHistory = (method) => {
    const orig = history[method]
    return function (...args) {
      const ret = orig.apply(this, args)
      setTimeout(resetForNavigation, 0)
      return ret
    }
  }
  try {
    history.pushState = wrapHistory('pushState')
    history.replaceState = wrapHistory('replaceState')
  } catch (_) {
    /* ignore */
  }
  window.addEventListener('popstate', () => setTimeout(resetForNavigation, 0))

  resetForNavigation()
})()
