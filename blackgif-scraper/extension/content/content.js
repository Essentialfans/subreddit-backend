/**
 * Floating Track / Download bar + robust page detection for niches/feeds.
 * MAIN-world network hooks live in page-hook.js (world: MAIN).
 */

const PANEL_ID = 'blackgif-scraper-panel'

/** Latest context from DOM + network hooks */
let liveCtx = { kind: 'other', gifId: null, url: null, username: null }

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

function gifIdFromText(text) {
  if (!text) return null
  const watch = String(text).match(/\/(?:watch|ifr)\/([A-Za-z0-9]+)/i)
  if (watch) return watch[1].toLowerCase()
  const cdn = String(text).match(
    /(?:media|thumbs\d*|files)\.redgifs\.com\/([A-Za-z][A-Za-z0-9]+)(?:-mobile|-poster|-small|-large)?\.(?:mp4|webm|jpg|jpeg|png|webp|gif|m4s)/i,
  )
  if (cdn) return cdn[1].toLowerCase()
  const api = String(text).match(/api\.redgifs\.com\/v2\/gifs\/([A-Za-z0-9]+)/i)
  if (api) return api[1].toLowerCase()
  return null
}

function usernameFromHref(href) {
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

function collectMediaUrls() {
  const urls = []
  for (const v of document.querySelectorAll('video')) {
    if (v.currentSrc) urls.push(v.currentSrc)
    if (v.src) urls.push(v.src)
    if (v.poster) urls.push(v.poster)
    for (const s of v.querySelectorAll('source')) {
      if (s.src) urls.push(s.src)
    }
  }
  for (const img of document.querySelectorAll('img[src*="redgifs"]')) {
    urls.push(img.currentSrc || img.src)
  }
  for (const el of document.querySelectorAll('[style*="redgifs"]')) {
    const m = String(el.getAttribute('style') || '').match(/url\(["']?([^"')]+)/)
    if (m) urls.push(m[1])
  }
  try {
    for (const e of performance.getEntriesByType('resource')) {
      if (/redgifs\.com/i.test(e.name)) urls.push(e.name)
    }
  } catch {
    /* ignore */
  }
  return urls
}

function findPlayingVideo() {
  const videos = [...document.querySelectorAll('video')]
  const playing = videos.find((v) => !v.paused && v.readyState >= 2)
  if (playing) return playing
  let best = null
  let bestArea = 0
  for (const v of videos) {
    const r = v.getBoundingClientRect()
    const area = Math.max(0, r.width) * Math.max(0, r.height)
    if (area > bestArea && r.bottom > 0 && r.top < innerHeight) {
      best = v
      bestArea = area
    }
  }
  return best
}

function usernameNear(el) {
  if (!el) return null
  let node = el
  for (let i = 0; i < 10 && node; i++) {
    const a = node.querySelector?.('a[href*="/users/"]')
    const u = usernameFromHref(a?.href)
    if (u) return u
    // Also check siblings / previous links often used for creator name
    const prev = node.previousElementSibling?.querySelector?.('a[href*="/users/"]')
    const u2 = usernameFromHref(prev?.href)
    if (u2) return u2
    node = node.parentElement
  }
  return null
}

function watchLinkNear(el) {
  if (!el) return null
  let node = el
  for (let i = 0; i < 10 && node; i++) {
    const a = node.querySelector?.('a[href*="/watch/"]')
    const id = gifIdFromText(a?.href)
    if (id) return id
    node = node.parentElement
  }
  return null
}

function detectFromDom() {
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
  let gifId = watchMatch ? decodeURIComponent(watchMatch[1]).toLowerCase() : null
  let username = null

  gifId =
    gifId ||
    gifIdFromText(document.querySelector('link[rel="canonical"]')?.href) ||
    gifIdFromText(document.querySelector('meta[property="og:url"]')?.content)

  const video = findPlayingVideo()
  if (video) {
    username = usernameNear(video)
    gifId = gifId || watchLinkNear(video)
    for (const u of [video.currentSrc, video.src, video.poster]) {
      const id = gifIdFromText(u)
      if (id) {
        gifId = gifId || id
        break
      }
    }
  }

  if (!gifId) {
    for (const u of collectMediaUrls()) {
      const id = gifIdFromText(u)
      if (id) {
        gifId = id
        break
      }
    }
  }

  if (!username) {
    const links = [...document.querySelectorAll('a[href*="/users/"]')]
    let best = null
    let bestDist = Infinity
    const cx = innerWidth / 2
    const cy = innerHeight / 2
    for (const a of links) {
      const u = usernameFromHref(a.href)
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
    return {
      kind: 'watch',
      gifId,
      url: `https://www.redgifs.com/watch/${gifId}`,
      username,
    }
  }

  if (username) {
    return { kind: 'feed', gifId: null, url: null, username }
  }

  return { kind: 'other', gifId: null, url: null, username: null }
}

function mergeCtx(next) {
  if (!next) return liveCtx
  // Prefer newest gifId from network when DOM still stale
  liveCtx = {
    kind: next.kind || liveCtx.kind,
    gifId: next.gifId || liveCtx.gifId,
    url: next.url || (next.gifId ? `https://www.redgifs.com/watch/${next.gifId}` : liveCtx.url),
    username: next.username || liveCtx.username,
  }
  return liveCtx
}

function detectContext() {
  return mergeCtx(detectFromDom())
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.source !== 'blackgif-scraper') return
  const gifId = data.gifId ? String(data.gifId).toLowerCase() : null
  const username = data.username ? String(data.username).toLowerCase() : null
  if (!gifId && !username) return
  mergeCtx({
    kind: gifId ? 'watch' : liveCtx.kind,
    gifId: gifId || liveCtx.gifId,
    url: gifId ? `https://www.redgifs.com/watch/${gifId}` : liveCtx.url,
    username: username || liveCtx.username,
  })
  refreshPanel()
})

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

  if (ctx.username) {
    trackBtn.hidden = false
    trackBtn.textContent = 'Track'
    trackBtn.onclick = async () => {
      trackBtn.disabled = true
      trackBtn.textContent = '…'
      try {
        const acc = await send('TRACK_ACCOUNT', { username: ctx.username })
        setMeta(`Tracking @${acc.username}`, 'ok')
        trackBtn.textContent = 'Tracked ✓'
      } catch (err) {
        setMeta(err.message, 'err')
        trackBtn.textContent = 'Track'
        trackBtn.disabled = false
      }
    }
  }

  if (ctx.gifId && ctx.url) {
    downloadBtn.hidden = false
    downloadBtn.textContent = 'Download'
    setMeta(ctx.username ? `${ctx.gifId} · @${ctx.username}` : ctx.gifId)
    downloadBtn.onclick = async () => {
      downloadBtn.disabled = true
      downloadBtn.textContent = '…'
      try {
        const item = await send('DOWNLOAD_URL', { url: ctx.url })
        const ok = item.status === 'done'
        setMeta(`${item.status}: ${item.gif_id}`, ok ? 'ok' : 'err')
        downloadBtn.textContent = ok ? 'Saved ✓' : 'Retry'
        downloadBtn.disabled = ok
      } catch (err) {
        setMeta(err.message, 'err')
        downloadBtn.textContent = 'Download'
        downloadBtn.disabled = false
      }
    }
    return
  }

  if (ctx.username) {
    setMeta(`@${ctx.username} — open watch tab or paste URL in popup`)
    return
  }

  setMeta('Play a gif (or paste URL in popup)')
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PAGE_CONTEXT') {
    sendResponse({ ok: true, result: detectContext() })
    return true
  }
  return false
})

let lastKey = ''
const tick = () => {
  const ctx = detectContext()
  const key = `${location.href}|${ctx.gifId || ''}|${ctx.username || ''}`
  if (key !== lastKey) {
    lastKey = key
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
setInterval(tick, 600)
refreshPanel()
