/**
 * Injects Track / Download actions on RedGifs pages and syncs via the
 * background service worker → local BlackGif Scraper API.
 */

const PANEL_ID = 'blackgif-scraper-panel'

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

function parsePage() {
  const path = location.pathname.replace(/\/+$/, '')
  const userMatch = path.match(/^\/users\/([^/?#]+)/i)
  if (userMatch) {
    return { kind: 'user', username: decodeURIComponent(userMatch[1]).toLowerCase() }
  }
  const watchMatch = path.match(/^\/watch\/([^/?#]+)/i)
  if (watchMatch) {
    return {
      kind: 'watch',
      gifId: decodeURIComponent(watchMatch[1]).toLowerCase(),
      url: `https://www.redgifs.com/watch/${decodeURIComponent(watchMatch[1])}`,
    }
  }
  // Sometimes SPA uses /ifr/ or share links — try meta/canonical
  const canonical = document.querySelector('link[rel="canonical"]')?.href
  if (canonical) {
    try {
      const u = new URL(canonical)
      const m = u.pathname.match(/^\/watch\/([^/?#]+)/i)
      if (m) {
        return {
          kind: 'watch',
          gifId: m[1].toLowerCase(),
          url: `https://www.redgifs.com/watch/${m[1]}`,
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { kind: 'other' }
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID)
  if (panel) return panel
  panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.innerHTML = `
    <div class="bg-card">
      <div class="bg-brand">BG</div>
      <div class="bg-body">
        <div class="bg-title">BlackGif</div>
        <div class="bg-meta" id="bg-meta">Ready</div>
      </div>
      <button type="button" class="bg-btn" id="bg-action" hidden>Action</button>
      <button type="button" class="bg-close" id="bg-close" title="Hide">×</button>
    </div>
  `
  document.documentElement.appendChild(panel)
  panel.querySelector('#bg-close').addEventListener('click', () => {
    panel.dataset.hidden = '1'
    panel.style.display = 'none'
  })
  return panel
}

function setMeta(text, tone = 'neutral') {
  const meta = document.getElementById('bg-meta')
  if (!meta) return
  meta.textContent = text
  meta.dataset.tone = tone
}

async function refreshPanel() {
  const panel = ensurePanel()
  if (panel.dataset.hidden === '1') return

  const page = parsePage()
  const action = panel.querySelector('#bg-action')
  action.hidden = true
  action.onclick = null

  if (page.kind === 'user') {
    action.hidden = false
    action.textContent = 'Track account'
    setMeta(`@${page.username}`)
    action.onclick = async () => {
      action.disabled = true
      action.textContent = 'Tracking…'
      try {
        const acc = await send('TRACK_ACCOUNT', { username: page.username })
        setMeta(`Tracking @${acc.username}`, 'ok')
        action.textContent = 'Tracked ✓'
      } catch (err) {
        setMeta(err.message, 'err')
        action.textContent = 'Track account'
        action.disabled = false
      }
    }
  } else if (page.kind === 'watch') {
    action.hidden = false
    action.textContent = 'Download'
    setMeta(page.gifId)
    action.onclick = async () => {
      action.disabled = true
      action.textContent = 'Downloading…'
      try {
        const item = await send('DOWNLOAD_URL', { url: page.url })
        setMeta(`${item.status}: ${item.gif_id}`, item.status === 'done' ? 'ok' : 'err')
        action.textContent = item.status === 'done' ? 'Downloaded ✓' : 'Retry'
        action.disabled = item.status === 'done'
      } catch (err) {
        setMeta(err.message, 'err')
        action.textContent = 'Download'
        action.disabled = false
      }
    }
  } else {
    setMeta('Open a profile or watch page')
  }
}

// RedGifs is an SPA — watch URL changes
let lastHref = location.href
const mo = new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href
    const panel = document.getElementById(PANEL_ID)
    if (panel) {
      panel.style.display = ''
      panel.dataset.hidden = '0'
    }
    refreshPanel()
  }
})
mo.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('popstate', refreshPanel)
refreshPanel()
