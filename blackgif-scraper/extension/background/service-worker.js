/**
 * Background service worker — all API traffic goes through here
 * so content scripts avoid page CORS and host permissions apply.
 */

const DEFAULTS = {
  apiBase: 'http://127.0.0.1:8000',
  authToken: '',
  defaultMinViews: 10000,
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS)
  return { ...DEFAULTS, ...stored }
}

async function api(path, options = {}) {
  const { apiBase, authToken } = await getSettings()
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }
  const res = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
    ...options,
    headers,
  })
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
  if (res.status === 204) return null
  return res.json()
}

async function refreshBadge() {
  try {
    const stats = await api('/api/stats')
    const n = (stats.queued || 0) + (stats.downloaded || 0)
    const text = n > 0 ? String(Math.min(n, 999)) : ''
    await chrome.action.setBadgeText({ text })
    await chrome.action.setBadgeBackgroundColor({ color: '#4f7cff' })
  } catch {
    await chrome.action.setBadgeText({ text: '!' })
    await chrome.action.setBadgeBackgroundColor({ color: '#f87171' })
  }
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
      return api('/api/health')

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
        // Already tracked → return existing row
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
      // Only write a file when the caller explicitly asks (floating Download button)
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
  refreshBadge()
})

chrome.alarms?.create?.('badge-refresh', { periodInMinutes: 2 })
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === 'badge-refresh') refreshBadge()
})

// alarms permission not declared — use interval via setInterval polyfill in SW is flaky;
// badge refreshes on each successful action instead.
refreshBadge()
