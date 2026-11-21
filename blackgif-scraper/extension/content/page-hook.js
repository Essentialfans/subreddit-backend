/**
 * MAIN-world hook (manifest world: MAIN). Captures gif IDs from RedGifs
 * fetch/XHR/media even when the address bar stays on /niches/...
 *
 * Only binds the *currently playing* video — never trust a stale ?gif=
 * query or background API prefetch of other clips.
 */
(() => {
  if (window.__bgBlackGifHook) return
  window.__bgBlackGifHook = true

  /** @type {Map<string, { username?: string|null, urls: string[] }>} */
  const catalog = new Map()
  /** @type {Set<string>} */
  const seenResources = new Set()
  /** @type {{ url: string, id: string, t: number }[]} */
  const recentMedia = []
  let lastPath = location.pathname + location.search
  let activeGifId = null
  let playGeneration = 0

  const profileUserFromPath = () => {
    const m = location.pathname.match(/^\/users\/([^/?#]+)/i)
    return m ? decodeURIComponent(m[1]).toLowerCase() : null
  }

  const clearAttrs = () => {
    try {
      document.documentElement.removeAttribute('data-bg-gif-id')
      document.documentElement.removeAttribute('data-bg-username')
      document.documentElement.removeAttribute('data-bg-gif-source')
    } catch (_) {
      /* ignore */
    }
  }

  const emit = (payload, { force = false, source = 'hook' } = {}) => {
    if (!payload?.gifId && !payload?.username) return
    const gifId = payload.gifId ? String(payload.gifId).toLowerCase() : null
    const profileUser = profileUserFromPath()
    let username = payload.username ? String(payload.username).toLowerCase() : null
    if (profileUser) username = profileUser

    if (gifId) {
      if (!force && activeGifId && activeGifId !== gifId) return
      activeGifId = gifId
    }

    try {
      if (gifId) {
        document.documentElement.setAttribute('data-bg-gif-id', gifId)
        document.documentElement.setAttribute('data-bg-gif-source', source)
      }
      if (username) {
        document.documentElement.setAttribute('data-bg-username', username)
      }
    } catch (_) {
      /* ignore */
    }
    window.postMessage(
      { source: 'blackgif-scraper', gifId, username, gifSource: source, t: Date.now() },
      '*',
    )
  }

  const resetForNavigation = () => {
    const key = location.pathname + location.search
    if (key === lastPath) return
    lastPath = key
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
    if (s.startsWith('blob:')) return null
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

  const playingVideo = () => {
    const videos = [...document.querySelectorAll('video')]
    return videos.find((v) => !v.paused && v.readyState >= 2) || null
  }

  const handleJson = (data) => {
    try {
      if (!data) return
      if (data.gif) {
        rememberGif(data.gif)
        const id = String(data.gif.id).toLowerCase()
        const username = (data.gif.userName || data.gif.username || '').toLowerCase() || null
        // Do NOT force-bind feed/detail prefetch — only /watch/ pages or matching player
        const onWatch = /^\/(?:watch|ifr)\//i.test(location.pathname)
        const video = playingVideo()
        const fromVideo = video
          ? idFromUrl(video.currentSrc || video.src || video.poster)
          : null
        if (onWatch || (fromVideo && fromVideo === id)) {
          emit({ gifId: id, username }, { force: true, source: 'api' })
        }
      }
      if (Array.isArray(data.gifs)) {
        for (const g of data.gifs) rememberGif(g)
      }
    } catch (_) {
      /* ignore */
    }
  }

  const noteNewResource = (url) => {
    if (!url) return
    const id = idFromUrl(url)
    if (id) {
      recentMedia.push({ url: String(url), id, t: Date.now() })
      if (recentMedia.length > 80) recentMedia.splice(0, recentMedia.length - 80)
    }
    if (seenResources.has(url)) return
    seenResources.add(url)
    if (seenResources.size > 400) {
      const first = seenResources.values().next().value
      seenResources.delete(first)
    }
    if (!id) return
    const entry = catalog.get(id)
    // Never steal active player binding from background CDN prefetch
    if (!activeGifId && !playingVideo()) {
      emit({ gifId: id, username: entry?.username || null }, { source: 'cdn' })
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

  const idNearVideo = (video) => {
    if (!video) return null
    let node = video
    for (let i = 0; i < 8 && node; i++) {
      const a = node.querySelector?.('a[href*="/watch/"]')
      const id = idFromUrl(a?.href)
      if (id) return id
      const html = node.getAttribute?.('data-id') || node.getAttribute?.('data-gif-id')
      if (html && /^[A-Za-z0-9]{4,80}$/.test(html)) return html.toLowerCase()
      node = node.parentElement
    }
    return null
  }

  const matchPlaying = (video) => {
    if (!video) return
    // New play always wins over stale ?gif= / previous clip
    activeGifId = null
    const gen = ++playGeneration
    const candidates = [video.currentSrc, video.src, video.poster].filter(Boolean)

    const bind = (id, username, source) => {
      if (gen !== playGeneration) return
      const entry = catalog.get(id)
      emit(
        { gifId: id, username: username || entry?.username || profileUserFromPath() },
        { force: true, source },
      )
    }

    for (const u of candidates) {
      const id = idFromUrl(u)
      if (id) {
        bind(id, null, 'video')
        return
      }
    }

    const near = idNearVideo(video)
    if (near) {
      bind(near, null, 'dom')
      return
    }

    // Blob player: use newest CDN hits from the last couple seconds
    const now = Date.now()
    const fresh = [...recentMedia].reverse().filter((e) => now - e.t < 8000)
    for (const e of fresh) {
      bind(e.id, null, 'recent-cdn')
      return
    }

    // Catalog URL overlap (weak)
    for (const [id, entry] of catalog.entries()) {
      for (const u of entry.urls) {
        if (candidates.some((c) => c && u && (c.includes(id) || u.includes(String(c).slice(-40))))) {
          bind(id, entry.username, 'catalog')
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
      if (!v.paused) matchPlaying(v)
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

  try {
    for (const e of performance.getEntriesByType('resource')) {
      seenResources.add(e.name)
      const id = idFromUrl(e.name)
      if (id) recentMedia.push({ url: e.name, id, t: Date.now() - 60000 })
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
  }, 700)

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
