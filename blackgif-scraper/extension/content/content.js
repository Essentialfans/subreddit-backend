/**
 * Floating Track / Download bar on any RedGifs page.
 * Detects the active gif from the URL, canonical link, or on-page player.
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

function gifIdFromHref(href) {
  if (!href) return null
  try {
    const u = new URL(href, location.origin)
    const m = u.pathname.match(/\/(?:watch|ifr)\/([^/?#]+)/i)
    return m ? decodeURIComponent(m[1]).toLowerCase() : null
  } catch {
    return null
  }
}

function usernameFromHref(href) {
  if (!href) return null
  try {
    const u = new URL(href, location.origin)
    const m = u.pathname.match(/\/users\/([^/?#]+)/i)
    return m ? decodeURIComponent(m[1]).toLowerCase() : null
  } catch {
    return null
  }
}

/** Best-effort: find the gif currently shown in the player / feed. */
function detectContext() {
  const path = location.pathname.replace(/\/+$/, '')

  const userMatch = path.match(/^\/users\/([^/?#]+)/i)
  if (userMatch) {
    return {
      kind: 'user',
      username: decodeURIComponent(userMatch[1]).toLowerCase(),
      gifId: null,
      url: null,
    }
  }

  const watchMatch = path.match(/^\/(?:watch|ifr)\/([^/?#]+)/i)
  if (watchMatch) {
    const gifId = decodeURIComponent(watchMatch[1]).toLowerCase()
    return {
      kind: 'watch',
      gifId,
      url: `https://www.redgifs.com/watch/${gifId}`,
      username: detectUploaderNearPlayer(),
    }
  }

  // Niche / explore / home — find active player gif
  const fromCanonical = gifIdFromHref(document.querySelector('link[rel="canonical"]')?.href)
  const fromOg = gifIdFromHref(document.querySelector('meta[property="og:url"]')?.content)

  let gifId = fromCanonical || fromOg || null
  let username = null

  // Playing / visible video → nearest watch link
  const video =
    document.querySelector('video[src]') ||
    document.querySelector('video source[src]')?.closest('video') ||
    document.querySelector('video')

  if (video) {
    const root =
      video.closest('article, [class*="Gif"], [class*="gif"], [class*="Player"], [class*="player"], li, section, div') ||
      video.parentElement
    const watchA = root?.querySelector?.('a[href*="/watch/"]') || document.querySelector('a[href*="/watch/"]')
    const userA = root?.querySelector?.('a[href*="/users/"]')
    if (!gifId) gifId = gifIdFromHref(watchA?.href)
    username = usernameFromHref(userA?.href)

    // Media CDN URLs often contain the id: .../SomeGifId.mp4
    if (!gifId && video.currentSrc) {
      const m = video.currentSrc.match(/\/([A-Za-z0-9]+)(?:-mobile)?\.(?:mp4|webm)/i)
      if (m) gifId = m[1].toLowerCase()
    }
  }

  // Fallback: first watch link in the main column
  if (!gifId) {
    const first = document.querySelector('main a[href*="/watch/"], a[href*="/watch/"]')
    gifId = gifIdFromHref(first?.href)
  }
  if (!username) username = detectUploaderNearPlayer()

  if (gifId) {
    return {
      kind: 'watch',
      gifId,
      url: `https://www.redgifs.com/watch/${gifId}`,
      username,
    }
  }

  return { kind: 'other', gifId: null, url: null, username: null }
}

function detectUploaderNearPlayer() {
  const candidates = [
    ...document.querySelectorAll('a[href*="/users/"]'),
  ]
  for (const a of candidates.slice(0, 8)) {
    const u = usernameFromHref(a.href)
    if (u && u !== 'login' && u !== 'signup') return u
  }
  return null
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
        <div class="bg-meta" id="bg-meta">Looking for video…</div>
      </div>
      <div class="bg-actions">
        <button type="button" class="bg-btn" id="bg-download" hidden>Download</button>
        <button type="button" class="bg-btn bg-btn-secondary" id="bg-track" hidden>Track</button>
      </div>
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

  const ctx = detectContext()
  const downloadBtn = panel.querySelector('#bg-download')
  const trackBtn = panel.querySelector('#bg-track')

  downloadBtn.hidden = true
  trackBtn.hidden = true
  downloadBtn.onclick = null
  trackBtn.onclick = null
  downloadBtn.disabled = false
  trackBtn.disabled = false

  if (ctx.kind === 'user' && ctx.username) {
    trackBtn.hidden = false
    trackBtn.textContent = 'Track account'
    setMeta(`@${ctx.username}`)
    trackBtn.onclick = async () => {
      trackBtn.disabled = true
      trackBtn.textContent = 'Tracking…'
      try {
        const acc = await send('TRACK_ACCOUNT', { username: ctx.username })
        setMeta(`Tracking @${acc.username}`, 'ok')
        trackBtn.textContent = 'Tracked ✓'
      } catch (err) {
        setMeta(err.message, 'err')
        trackBtn.textContent = 'Track account'
        trackBtn.disabled = false
      }
    }
    return
  }

  if (ctx.gifId && ctx.url) {
    downloadBtn.hidden = false
    downloadBtn.textContent = 'Download'
    setMeta(ctx.username ? `${ctx.gifId} · @${ctx.username}` : ctx.gifId)

    downloadBtn.onclick = async () => {
      downloadBtn.disabled = true
      downloadBtn.textContent = 'Downloading…'
      try {
        const item = await send('DOWNLOAD_URL', { url: ctx.url })
        const ok = item.status === 'done'
        setMeta(`${item.status}: ${item.gif_id}`, ok ? 'ok' : 'err')
        downloadBtn.textContent = ok ? 'In library ✓' : 'Retry'
        downloadBtn.disabled = ok
      } catch (err) {
        setMeta(err.message, 'err')
        downloadBtn.textContent = 'Download'
        downloadBtn.disabled = false
      }
    }

    if (ctx.username) {
      trackBtn.hidden = false
      trackBtn.textContent = 'Track creator'
      trackBtn.onclick = async () => {
        trackBtn.disabled = true
        trackBtn.textContent = 'Tracking…'
        try {
          const acc = await send('TRACK_ACCOUNT', { username: ctx.username })
          setMeta(`Tracking @${acc.username}`, 'ok')
          trackBtn.textContent = 'Tracked ✓'
        } catch (err) {
          setMeta(err.message, 'err')
          trackBtn.textContent = 'Track creator'
          trackBtn.disabled = false
        }
      }
    }
    return
  }

  setMeta('Play a gif, then Download appears')
}

// Respond to popup asking "what's on this page?"
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PAGE_CONTEXT') {
    sendResponse({ ok: true, result: detectContext() })
    return true
  }
  return false
})

let lastHref = location.href
let lastGif = null
const tick = () => {
  const ctx = detectContext()
  const key = `${location.href}|${ctx.gifId || ''}|${ctx.username || ''}`
  if (key !== lastGif || location.href !== lastHref) {
    lastHref = location.href
    lastGif = key
    const panel = document.getElementById(PANEL_ID)
    if (panel) {
      panel.style.display = ''
      panel.dataset.hidden = '0'
    }
    refreshPanel()
  }
}

const mo = new MutationObserver(() => tick())
mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
window.addEventListener('popstate', tick)
setInterval(tick, 1500)
refreshPanel()
