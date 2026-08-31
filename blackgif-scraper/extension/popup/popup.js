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

function toast(msg) {
  els.toast.hidden = false
  els.toast.textContent = msg
  setTimeout(() => {
    els.toast.hidden = true
  }, 2200)
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

async function refresh() {
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
    await refresh()
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
    setTimeout(refresh, 1500)
  } catch (err) {
    toast(err.message)
  } finally {
    els.sync.textContent = 'Sync all'
    els.sync.disabled = false
  }
})

els.refresh.addEventListener('click', refresh)

await loadSettings()
await refresh()
