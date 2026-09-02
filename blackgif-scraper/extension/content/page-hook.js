/**
 * MAIN-world hook (manifest world: MAIN). Captures gif IDs from RedGifs
 * fetch/XHR/media even when the address bar stays on /niches/...
 */
(() => {
  if (window.__bgBlackGifHook) return
  window.__bgBlackGifHook = true

  /** @type {Map<string, { username?: string|null, urls: string[] }>} */
  const catalog = new Map()

  const emit = (payload) => {
    try {
      if (payload.gifId) {
        document.documentElement.setAttribute('data-bg-gif-id', String(payload.gifId).toLowerCase())
      }
      if (payload.username) {
        document.documentElement.setAttribute('data-bg-username', String(payload.username).toLowerCase())
      }
    } catch (_) {
      /* ignore */
    }
    window.postMessage({ source: 'blackgif-scraper', ...payload }, '*')
  }

  // Also watch for hdUrl / sdUrl style paths without suffix filter
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
    emit({ gifId: id, username: username || prev.username })
  }

  const handleJson = (data) => {
    try {
      if (!data) return
      if (data.gif) rememberGif(data.gif)
      if (Array.isArray(data.gifs)) {
        for (const g of data.gifs) rememberGif(g)
      }
    } catch (_) {
      /* ignore */
    }
  }

  const noteUrl = (url) => {
    const id = idFromUrl(url)
    if (!id) return
    const entry = catalog.get(id)
    emit({ gifId: id, username: entry?.username || null })
  }

  const wrapFetch = (orig) =>
    function (...args) {
      const p = orig.apply(this, args)
      Promise.resolve(p)
        .then((res) => {
          try {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url
            noteUrl(url)
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
        noteUrl(this.__bgUrl)
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
    const candidates = [video.currentSrc, video.src, video.poster].filter(Boolean)
    for (const u of candidates) {
      const id = idFromUrl(u)
      if (id) {
        const entry = catalog.get(id)
        emit({ gifId: id, username: entry?.username || null })
        return
      }
    }
    // Match catalog media URLs against currentSrc (blob pages still had CDN fetch)
    for (const [id, entry] of catalog.entries()) {
      for (const u of entry.urls) {
        if (candidates.some((c) => c && u && (c.includes(id) || u.includes(c.slice(-40))))) {
          emit({ gifId: id, username: entry.username || null })
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
      noteUrl(v.currentSrc || v.src)
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

  // Resource timing: CDN hits even when <video> uses MediaSource/blob
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        noteUrl(entry.name)
      }
    })
    po.observe({ type: 'resource', buffered: true })
  } catch (_) {
    /* ignore */
  }

  // Periodically re-scan performance entries + playing video
  setInterval(() => {
    try {
      for (const e of performance.getEntriesByType('resource')) noteUrl(e.name)
    } catch (_) {
      /* ignore */
    }
    const videos = document.querySelectorAll('video')
    for (const v of videos) {
      if (!v.paused && v.readyState >= 2) matchPlaying(v)
    }
  }, 1000)
})()
