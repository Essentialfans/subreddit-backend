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
  download: document.getElementById('btn-download'),
  track: document.getElementById('btn-track'),
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
}

let pageCtx = null

function toast(msg) {
  els.toast.hidden = false
  els.toast.textContent = msg
  setTimeout(() => {
    els.toast.hidden = true
  }, 2500)
}

function setOnline(online) {
  els.status.textContent = online ? 'Online' : 'Offline'
  els.status.classList.toggle('online', online)
  els.status.classList.toggle('offline', !online)
  els.sync.disabled = !online
}

async function loadSettings() {
  const s = await send('GET_SETTINGS')
  els.apiBase.value = s.apiBase
  els.authToken.value = s.authToken || ''
  els.minViews.value = s.defaultMinViews
}

async function refreshStats() {
  try {
    await send('HEALTH')
    setOnline(true)
    const stats = await send('STATS')
    els.accounts.textContent = String(stats.total_accounts ?? 0)
    els.downloaded.textContent = String(stats.downloaded ?? 0)
    els.queued.textContent = String(stats.queued ?? 0)
  } catch (err) {
    setOnline(false)
    els.accounts.textContent = '—'
    els.downloaded.textContent = '—'
    els.queued.textContent = '—'
    console.warn(err)
  }
}

async function loadPageContext() {
  pageCtx = null
  els.download.disabled = true
  els.track.disabled = true
  els.download.textContent = 'Add to library'
  els.track.textContent = 'Track creator'
  els.pageLabel.textContent = 'Open RedGifs to download or track'

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
    pageCtx = response.result
  } catch {
    // Content script may not be injected yet — try scripting
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const path = location.pathname.replace(/\/+$/, '')
          const user = path.match(/^\/users\/([^/?#]+)/i)
          if (user) return { kind: 'user', username: decodeURIComponent(user[1]).toLowerCase() }
          const watch = path.match(/^\/(?:watch|ifr)\/([^/?#]+)/i)
          if (watch) {
            const gifId = decodeURIComponent(watch[1]).toLowerCase()
            return { kind: 'watch', gifId, url: `https://www.redgifs.com/watch/${gifId}` }
          }
          const a = document.querySelector('a[href*="/watch/"]')
          const href = a?.href || document.querySelector('link[rel="canonical"]')?.href
          const m = href && href.match(/\/watch\/([^/?#]+)/i)
          if (m) {
            const gifId = decodeURIComponent(m[1]).toLowerCase()
            return { kind: 'watch', gifId, url: `https://www.redgifs.com/watch/${gifId}` }
          }
          return { kind: 'other' }
        },
      })
      pageCtx = result
    } catch (err) {
      els.pageLabel.textContent = 'Refresh the RedGifs tab, then reopen this popup'
      console.warn(err)
      return
    }
  }

  if (pageCtx?.kind === 'user' && pageCtx.username) {
    els.pageLabel.textContent = `Profile @${pageCtx.username}`
    els.track.disabled = false
    els.track.textContent = 'Track account'
    return
  }

  if (pageCtx?.gifId && pageCtx.url) {
    els.pageLabel.textContent = pageCtx.username
      ? `Gif ${pageCtx.gifId} · @${pageCtx.username}`
      : `Gif ${pageCtx.gifId}`
    els.download.disabled = false
    if (pageCtx.username) {
      els.track.disabled = false
      els.track.textContent = 'Track creator'
    }
    return
  }

  els.pageLabel.textContent = 'Play / open a gif, then reopen popup'
}

els.download.addEventListener('click', async () => {
  if (!pageCtx?.url) return
  els.download.disabled = true
  els.download.textContent = 'Downloading…'
  try {
    const item = await send('DOWNLOAD_URL', { url: pageCtx.url })
    toast(item.status === 'done' ? `Saved ${item.gif_id}` : item.status)
    els.download.textContent = item.status === 'done' ? 'In library ✓' : 'Add to library'
    await refreshStats()
  } catch (err) {
    toast(err.message)
    els.download.textContent = 'Add to library'
    els.download.disabled = false
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
