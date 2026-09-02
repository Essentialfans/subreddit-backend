function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (!response?.ok) {
        reject(new Error(response?.error || 'Request failed'))
        return
      }
      resolve(response.result)
    })
  })
}

const els = {
  status: document.getElementById('status'),
  pageLabel: document.getElementById('page-label'),
  saveFile: document.getElementById('btn-save-file'),
  add: document.getElementById('btn-add'),
  track: document.getElementById('btn-track'),
  pasteUrl: document.getElementById('paste-url'),
  pasteDl: document.getElementById('btn-paste-dl'),
  accounts: document.getElementById('stat-accounts'),
  downloaded: document.getElementById('stat-downloaded'),
  queued: document.getElementById('stat-queued'),
  sync: document.getElementById('btn-sync'),
  refresh: document.getElementById('btn-refresh'),
  save: document.getElementById('btn-save'),
  apiBase: document.getElementById('api-base'),
  authToken: document.getElementById('auth-token'),
  minViews: document.getElementById('min-views'),
  toast: document.getElementById('toast'),
  offlineHelp: document.getElementById('offline-help'),
}

let pageCtx = null

function toast(msg) {
  els.toast.hidden = false
  els.toast.textContent = msg
  setTimeout(() => {
    els.toast.hidden = true
  }, 2500)
}

function setOnline(online, errMsg) {
  els.status.textContent = online ? 'Online' : 'Offline'
  els.status.classList.toggle('online', online)
  els.status.classList.toggle('offline', !online)
  els.sync.disabled = !online
  if (els.offlineHelp) {
    els.offlineHelp.hidden = online
    if (!online && errMsg) {
      els.offlineHelp.innerHTML =
        `Offline: ${escapeHtml(errMsg)}<br/>On your Mac run <code>cd blackgif-scraper && ./install-autostart-mac.sh</code> then Refresh.`
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseWatchInput(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  const watch = text.match(/\/(?:watch|ifr)\/([A-Za-z0-9]+)/i)
  if (watch) {
    const gifId = watch[1].toLowerCase()
    return { gifId, url: `https://www.redgifs.com/watch/${gifId}` }
  }
  const cdn = text.match(
    /(?:media|thumbs\d*|files)\.redgifs\.com\/([A-Za-z][A-Za-z0-9]+)(?:-mobile|-poster|-small|-large)?\./i,
  )
  if (cdn) {
    const gifId = cdn[1].toLowerCase()
    return { gifId, url: `https://www.redgifs.com/watch/${gifId}` }
  }
  if (/^[A-Za-z0-9]{4,80}$/.test(text)) {
    const gifId = text.toLowerCase()
    return { gifId, url: `https://www.redgifs.com/watch/${gifId}` }
  }
  return null
}

function resetActionButtons() {
  els.saveFile.disabled = true
  els.add.disabled = true
  els.track.disabled = true
  els.saveFile.textContent = 'Download'
  els.add.textContent = 'Add to library'
  els.track.textContent = 'Track creator'
}

function markDownloadedUi(username, gifId) {
  els.saveFile.disabled = true
  els.saveFile.textContent = 'Downloaded'
  els.add.disabled = true
  els.add.textContent = 'Downloaded'
  els.pageLabel.textContent = username
    ? `Downloaded · @${username}`
    : `Downloaded · ${gifId}`
}

function enableGifActions(ctx) {
  els.pageLabel.textContent = ctx.username
    ? `Gif ${ctx.gifId} · @${ctx.username}`
    : `Gif ${ctx.gifId}`
  if (ctx.username) {
    els.track.disabled = false
    els.track.textContent = 'Track creator'
  }
  send('LOOKUP_GIF', { gifId: ctx.gifId })
    .then((item) => {
      if (item?.status === 'done') {
        markDownloadedUi(ctx.username, ctx.gifId)
      } else {
        els.saveFile.disabled = false
        els.saveFile.textContent = 'Download'
        els.add.disabled = false
        els.add.textContent = 'Add to library'
      }
    })
    .catch(() => {
      els.saveFile.disabled = false
      els.saveFile.textContent = 'Download'
      els.add.disabled = false
      els.add.textContent = 'Add to library'
    })
}

function applyPageContext(ctx) {
  pageCtx = ctx || null
  resetActionButtons()

  if (!pageCtx) {
    els.pageLabel.textContent = 'Open RedGifs to download or track'
    return
  }

  if (pageCtx.kind === 'user' && pageCtx.username) {
    els.pageLabel.textContent = `Profile @${pageCtx.username}`
    els.track.disabled = false
    els.track.textContent = 'Track account'
    return
  }

  if (pageCtx.gifId && pageCtx.url) {
    enableGifActions(pageCtx)
    return
  }

  if (pageCtx.username) {
    els.pageLabel.textContent = `@${pageCtx.username} playing — wait for gif id, or paste URL below`
    els.track.disabled = false
    els.track.textContent = 'Track creator'
    return
  }

  els.pageLabel.textContent = 'Play a gif, wait a second, reopen — or paste watch URL'
}

async function loadSettings() {
  const s = await send('GET_SETTINGS')
  els.apiBase.value = s.apiBase
  els.authToken.value = s.authToken || ''
  els.minViews.value = s.defaultMinViews
}

async function refreshStats() {
  try {
    const status = await send('CONNECTION_STATUS')
    if (!status.online) throw new Error(status.lastHealthError || status.hint || 'API offline')
    setOnline(true)
    const stats = await send('STATS')
    els.accounts.textContent = String(stats.total_accounts ?? 0)
    els.downloaded.textContent = String(stats.downloaded ?? 0)
    els.queued.textContent = String(stats.queued ?? 0)
  } catch (err) {
    setOnline(false, err.message)
    els.accounts.textContent = '—'
    els.downloaded.textContent = '—'
    els.queued.textContent = '—'
    console.warn(err)
  }
}

/** Fallback DOM scan when content script message fails */
function fallbackDetectFn() {
  const path = location.pathname.replace(/\/+$/, '')
  const user = path.match(/^\/users\/([^/?#]+)/i)
  if (user) {
    return { kind: 'user', username: decodeURIComponent(user[1]).toLowerCase(), gifId: null, url: null }
  }

  const idFrom = (text) => {
    if (!text) return null
    let m = String(text).match(/\/(?:watch|ifr)\/([A-Za-z0-9]+)/i)
    if (m) return m[1].toLowerCase()
    m = String(text).match(
      /(?:media|thumbs\d*|files)\.redgifs\.com\/([A-Za-z][A-Za-z0-9]+)(?:-mobile|-poster|-small|-large)?\./i,
    )
    if (m) return m[1].toLowerCase()
    m = String(text).match(/api\.redgifs\.com\/v2\/gifs\/([A-Za-z0-9]+)/i)
    return m ? m[1].toLowerCase() : null
  }

  const userFromHref = (href) => {
    if (!href) return null
    try {
      const u = new URL(href, location.origin)
      const m = u.pathname.match(/\/users\/([^/?#]+)/i)
      const name = m ? decodeURIComponent(m[1]).toLowerCase() : null
      if (!name || ['login', 'signup', 'explore', 'niches', 'upload'].includes(name)) return null
      return name
    } catch {
      return null
    }
  }

  let gifId =
    idFrom(path.match(/^\/(?:watch|ifr)\/([^/?#]+)/i)?.[0]) ||
    idFrom(document.querySelector('link[rel="canonical"]')?.href) ||
    idFrom(document.querySelector('meta[property="og:url"]')?.content) ||
    idFrom(document.querySelector('meta[property="og:video"]')?.content) ||
    idFrom(document.querySelector('meta[property="og:image"]')?.content)

  const videos = [...document.querySelectorAll('video')]
  const playing =
    videos.find((v) => !v.paused && v.readyState >= 2) ||
    videos.find((v) => {
      const r = v.getBoundingClientRect()
      return r.width > 120 && r.height > 120 && r.top < innerHeight && r.bottom > 0
    }) ||
    videos[0]
  if (playing) {
    for (const u of [playing.currentSrc, playing.src, playing.poster]) {
      gifId = gifId || idFrom(u)
    }
    // Walk up for watch links near the player
    let node = playing
    for (let i = 0; i < 10 && node && !gifId; i++) {
      const a = node.querySelector?.('a[href*="/watch/"]')
      gifId = gifId || idFrom(a?.href)
      node = node.parentElement
    }
  }
  if (!gifId) {
    for (const v of videos) {
      for (const u of [v.currentSrc, v.src, v.poster]) {
        gifId = gifId || idFrom(u)
        if (gifId) break
      }
      if (gifId) break
    }
  }
  // Prefer newest media CDN hits (playing feed item)
  try {
    const resources = performance.getEntriesByType('resource').slice(-80).reverse()
    for (const e of resources) {
      gifId = gifId || idFrom(e.name)
      if (gifId) break
    }
  } catch {
    /* ignore */
  }

  let username = null
  if (playing) {
    let node = playing
    for (let i = 0; i < 12 && node && !username; i++) {
      const a = node.querySelector?.('a[href*="/users/"]')
      username = userFromHref(a?.href)
      node = node.parentElement
    }
  }
  if (!username) {
    const links = [...document.querySelectorAll('a[href*="/users/"]')]
    let best = null
    let bestDist = Infinity
    const cx = innerWidth / 2
    const cy = innerHeight / 2
    for (const a of links) {
      const u = userFromHref(a.href)
      if (!u) continue
      const r = a.getBoundingClientRect()
      if (r.width === 0) continue
      const dist = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy)
      if (dist < bestDist) {
        bestDist = dist
        best = u
      }
    }
    username = best
  }

  if (gifId) {
    return { kind: 'watch', gifId, url: `https://www.redgifs.com/watch/${gifId}`, username }
  }
  if (username) return { kind: 'feed', gifId: null, url: null, username }
  return { kind: 'other', gifId: null, url: null, username: null }
}

async function loadPageContext() {
  applyPageContext(null)
  els.pageLabel.textContent = 'Detecting page…'

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return

  const onRedgifs = /https?:\/\/(www\.)?redgifs\.com\//i.test(tab.url)
  if (!onRedgifs) {
    els.pageLabel.textContent = 'Not on RedGifs — open a gif there'
    return
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'PAGE_CONTEXT' })
    if (!response?.ok) throw new Error('No page context')
    applyPageContext(response.result)
    // If content script has username but no gif yet, still try a fresh DOM scan
    if (response.result?.gifId) return
  } catch {
    // Content script may not be injected yet
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fallbackDetectFn,
    })
    // Prefer richer of the two contexts
    if (result?.gifId || result?.username) {
      applyPageContext({
        ...(pageCtx || {}),
        ...result,
        gifId: result.gifId || pageCtx?.gifId || null,
        url: result.url || pageCtx?.url || null,
        username: result.username || pageCtx?.username || null,
      })
    }
  } catch (err) {
    if (!pageCtx?.username && !pageCtx?.gifId) {
      els.pageLabel.textContent = 'Refresh the RedGifs tab, then reopen this popup'
    }
    console.warn(err)
  }
}

els.saveFile.addEventListener('click', async () => {
  if (!pageCtx?.url) return
  els.saveFile.disabled = true
  els.saveFile.textContent = 'Downloading…'
  try {
    const item = await send('DOWNLOAD_URL', { url: pageCtx.url, saveFile: true })
    if (item.status === 'done') {
      toast(`Downloaded ${item.gif_id}`)
      markDownloadedUi(pageCtx.username, item.gif_id)
    } else {
      toast(item.status || 'Download failed')
      els.saveFile.textContent = 'Download'
      els.saveFile.disabled = false
    }
    await refreshStats()
  } catch (err) {
    toast(err.message)
    els.saveFile.textContent = 'Download'
    els.saveFile.disabled = false
  }
})

els.add.addEventListener('click', async () => {
  if (!pageCtx?.url) return
  els.add.disabled = true
  els.add.textContent = 'Adding…'
  try {
    const item = await send('ADD_TO_LIBRARY', { url: pageCtx.url })
    if (item.status === 'done') {
      toast(`Already downloaded ${item.gif_id}`)
      markDownloadedUi(pageCtx.username, item.gif_id)
    } else {
      toast(`Added ${item.gif_id} (preview only)`)
      els.add.textContent = 'In library ✓'
      els.saveFile.disabled = false
      els.saveFile.textContent = 'Download'
    }
    await refreshStats()
  } catch (err) {
    toast(err.message)
    els.add.textContent = 'Add to library'
    els.add.disabled = false
  }
})

els.track.addEventListener('click', async () => {
  const username = pageCtx?.username
  if (!username) return
  els.track.disabled = true
  els.track.textContent = 'Tracking…'
  try {
    const acc = await send('TRACK_ACCOUNT', { username })
    toast(`Tracking @${acc.username}`)
    els.track.textContent = 'Tracked ✓'
    await refreshStats()
  } catch (err) {
    toast(err.message)
    els.track.textContent = 'Track creator'
    els.track.disabled = false
  }
})

els.pasteDl.addEventListener('click', async () => {
  const parsed = parseWatchInput(els.pasteUrl.value)
  if (!parsed) {
    toast('Paste a watch URL or gif id')
    return
  }
  els.pasteDl.disabled = true
  els.pasteDl.textContent = '…'
  try {
    const item = await send('DOWNLOAD_URL', { url: parsed.url, saveFile: true })
    toast(item.status === 'done' ? `Downloaded ${item.gif_id}` : item.status)
    pageCtx = { ...(pageCtx || {}), kind: 'watch', ...parsed }
    applyPageContext(pageCtx)
    await refreshStats()
  } catch (err) {
    toast(err.message)
  } finally {
    els.pasteDl.disabled = false
    els.pasteDl.textContent = 'Download'
  }
})

els.pasteUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    els.pasteDl.click()
  }
})

els.save.addEventListener('click', async () => {
  try {
    await send('SAVE_SETTINGS', {
      payload: {
        apiBase: els.apiBase.value.trim() || 'http://127.0.0.1:8000',
        authToken: els.authToken.value.trim(),
        defaultMinViews: Number(els.minViews.value) || 10000,
      },
    })
    toast('Settings saved')
    await refreshStats()
  } catch (err) {
    toast(err.message)
  }
})

els.sync.addEventListener('click', async () => {
  els.sync.disabled = true
  els.sync.textContent = 'Syncing…'
  try {
    const result = await send('SYNC_ALL')
    toast(result?.message || 'Sync started')
    setTimeout(refreshStats, 1500)
  } catch (err) {
    toast(err.message)
  } finally {
    els.sync.textContent = 'Sync all'
    els.sync.disabled = false
  }
})

els.refresh.addEventListener('click', async () => {
  await refreshStats()
  await loadPageContext()
})

await loadSettings()
await refreshStats()
await loadPageContext()
