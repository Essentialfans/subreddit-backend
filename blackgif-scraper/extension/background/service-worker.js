/**
 * Background service worker — all API traffic goes through here
 * so content scripts avoid page CORS and host permissions apply.
 */

const DEFAULTS = {
  apiBase: 'http://127.0.0.1:8000',
  authToken: '',
  defaultMinViews: 10000,
}

const HEALTH_ALARM = 'blackgif-health'
let lastOnline = false

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS)
  return { ...DEFAULTS, ...stored }
}

function candidateBases(apiBase) {
  const primary = String(apiBase || DEFAULTS.apiBase).replace(/\/$/, '')
  const bases = [primary]
  try {
    const u = new URL(primary)
    if (u.hostname === '127.0.0.1') {
      bases.push(`${u.protocol}//localhost${u.port ? `:${u.port}` : ''}`)
    } else if (u.hostname === 'localhost') {
      bases.push(`${u.protocol}//127.0.0.1${u.port ? `:${u.port}` : ''}`)
    }
  } catch {
    bases.push('http://127.0.0.1:8000', 'http://localhost:8000')
  }
  return [...new Set(bases)]
}

async function api(path, options = {}) {
  const settings = await getSettings()
  const { authToken } = settings
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }

  const bases = candidateBases(settings.apiBase)
  let lastErr = null
  for (const base of bases) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || 4000)
      const res = await fetch(`${base}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        let detail = res.statusText
        try {
          const data = await res.json()
          detail = data.detail || JSON.stringify(data)
        } catch {
          /* ignore */
        }
        throw new Error(typeof detail === 'string' ? detail : 'Request failed')
      }
      // Remember a working base so later calls prefer it
      if (base !== settings.apiBase) {
        await chrome.storage.sync.set({ apiBase: base })
      }
      if (res.status === 204) return null
      return res.json()
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(
    'API not running — in Terminal: cd ~/subreddit-backend/blackgif-scraper && ./install-autostart-mac.sh',
  )
}

function friendlyErr(err) {
  const raw = err?.message || String(err || '')
  if (/failed to fetch|networkerror|abort/i.test(raw)) {
    return 'API not running — cd ~/subreddit-backend/blackgif-scraper && ./install-autostart-mac.sh'
  }
  return raw || 'API unreachable'
}

async function checkHealth() {
  try {
    const result = await api('/api/health', { timeoutMs: 3000 })
    lastOnline = true
    await chrome.storage.local.set({
      lastOnline: true,
      lastHealthAt: Date.now(),
      lastHealthError: null,
    })
    return result
  } catch (err) {
    lastOnline = false
    const msg = friendlyErr(err)
    await chrome.storage.local.set({
      lastOnline: false,
      lastHealthAt: Date.now(),
      lastHealthError: msg,
    })
    throw new Error(msg)
  }
}

async function refreshBadge() {
  try {
    await checkHealth()
    const stats = await api('/api/stats')
    const n = (stats.queued || 0) + (stats.downloaded || 0)
    const text = n > 0 ? String(Math.min(n, 999)) : ''
    await chrome.action.setBadgeText({ text })
    await chrome.action.setBadgeBackgroundColor({ color: '#4f7cff' })
    await chrome.action.setTitle({ title: 'BlackGif Scraper — Online' })
  } catch {
    await chrome.action.setBadgeText({ text: '!' })
    await chrome.action.setBadgeBackgroundColor({ color: '#f87171' })
    await chrome.action.setTitle({
      title: 'BlackGif Offline — run ./install-autostart-mac.sh in blackgif-scraper',
    })
  }
}

function ensureAlarms() {
  chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: 1 })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }))
  return true // async
})

async function handleMessage(message) {
  switch (message.type) {
    case 'GET_SETTINGS':
      return getSettings()

    case 'SAVE_SETTINGS': {
      await chrome.storage.sync.set(message.payload || {})
      await refreshBadge()
      return getSettings()
    }

    case 'HEALTH':
      return checkHealth()

    case 'CONNECTION_STATUS': {
      const local = await chrome.storage.local.get({
        lastOnline: false,
        lastHealthAt: null,
        lastHealthError: null,
      })
      try {
        await checkHealth()
        return { online: true, ...local, lastOnline: true, lastHealthError: null }
      } catch (err) {
        return {
          online: false,
          lastOnline: false,
          lastHealthAt: Date.now(),
          lastHealthError: err?.message || String(err),
          hint: 'Start API: cd blackgif-scraper && ./install-autostart-mac.sh',
        }
      }
    }

    case 'LOOKUP_GIF': {
      const gifId = String(message.gifId || '').trim().toLowerCase()
      if (!gifId) throw new Error('Missing gif id')
      try {
        return await api(`/api/library/gif/${encodeURIComponent(gifId)}`)
      } catch (err) {
        if (String(err.message || '').includes('Not in library') || String(err.message || '').includes('Not Found')) {
          return null
        }
        throw err
      }
    }

    case 'STATS':
      return api('/api/stats')

    case 'TRACK_ACCOUNT': {
      const settings = await getSettings()
      const username = String(message.username || '').trim()
      if (!username) throw new Error('Missing username')
      try {
        const account = await api('/api/accounts', {
          method: 'POST',
          body: JSON.stringify({
            username,
            min_views: message.minViews ?? settings.defaultMinViews,
            enabled: true,
          }),
        })
        try {
          await api(`/api/accounts/${account.id}/sync?download=false`, { method: 'POST' })
        } catch {
          /* sync is best-effort */
        }
        await refreshBadge()
        return account
      } catch (err) {
        if (String(err.message || '').toLowerCase().includes('already')) {
          const accounts = await api('/api/accounts')
          const existing = accounts.find((a) => a.username === username.toLowerCase())
          if (existing) return existing
        }
        throw err
      }
    }

    case 'DOWNLOAD_URL': {
      const url = String(message.url || '').trim()
      if (!url) throw new Error('Missing URL')
      const saveFile = message.saveFile === true
      const item = await api('/api/download', {
        method: 'POST',
        body: JSON.stringify({ url, save_file: saveFile }),
      })
      await refreshBadge()
      return item
    }

    case 'ADD_TO_LIBRARY': {
      const url = String(message.url || '').trim()
      if (!url) throw new Error('Missing URL')
      const item = await api('/api/download', {
        method: 'POST',
        body: JSON.stringify({ url, save_file: false }),
      })
      await refreshBadge()
      return item
    }

    case 'SYNC_ALL': {
      const result = await api('/api/sync', {
        method: 'POST',
        body: JSON.stringify({ download: false }),
      })
      await refreshBadge()
      return result
    }

    case 'ACCOUNTS':
      return api('/api/accounts')

    default:
      throw new Error(`Unknown message: ${message.type}`)
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarms()
  refreshBadge()
})

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms()
  refreshBadge()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEALTH_ALARM) refreshBadge()
})

ensureAlarms()
refreshBadge()
