/**
 * Floating Track / Download bar + robust page detection for niches/feeds.
 * MAIN-world network hooks live in page-hook.js (world: MAIN).
 */

const PANEL_ID = 'blackgif-scraper-panel'

/** Latest context from DOM + network hooks — never sticky across navigations */
let liveCtx = { kind: 'other', gifId: null, url: null, username: null }
let lastPathname = location.pathname

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
  // Niches / feeds put the active id in ?gif=
  try {
    const u = new URL(String(text), location.origin)
    const q = u.searchParams.get('gif')
    if (q && /^[A-Za-z0-9]{4,80}$/.test(q)) return q.toLowerCase()
  } catch {
    /* ignore */
  }
  const cdn = String(text).match(
    /(?:media|thumbs\d*|files)\.redgifs\.com\/([A-Za-z][A-Za-z0-9]+)(?:-mobile|-poster|-small|-large)?(?:\.(?:mp4|webm|jpg|jpeg|png|webp|gif|m4s))?(?:\?|$)/i,
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

function profileUsernameFromPath() {
  const m = location.pathname.replace(/\/+$/, '').match(/^\/users\/([^/?#]+)/i)
  return m ? decodeURIComponent(m[1]).toLowerCase() : null
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

function gifIdFromVideo(video) {
  if (!video) return null
  for (const u of [video.currentSrc, video.src, video.poster]) {
    const id = gifIdFromText(u)
    if (id) return id
  }
  for (const s of video.querySelectorAll('source')) {
    const id = gifIdFromText(s.src)
    if (id) return id
  }
  return watchLinkNear(video)
}

/**
 * Prefer on-screen player + URL. Hooked attrs are a hint only when they
 * match the player or when nothing else is available yet.
 */
function detectFromDom() {
  const path = location.pathname.replace(/\/+$/, '')
  const profileUsername = profileUsernameFromPath()
  const hookedGif = document.documentElement.getAttribute('data-bg-gif-id')
  const hookedUser = document.documentElement.getAttribute('data-bg-username')

  const watchMatch = path.match(/^\/(?:watch|ifr)\/([^/?#]+)/i)
  const watchGifId = watchMatch ? decodeURIComponent(watchMatch[1]).toLowerCase() : null
  let queryGifId = null
  try {
    const q = new URLSearchParams(location.search).get('gif')
    if (q && /^[A-Za-z0-9]{4,80}$/.test(q)) queryGifId = q.toLowerCase()
  } catch {
    /* ignore */
  }

  const video = findPlayingVideo()
  const videoGifId = gifIdFromVideo(video)

  // Priority: URL watch id → playing video → ?gif= → hooked
  let gifId = watchGifId || videoGifId || queryGifId || null
  if (!gifId && hookedGif) {
    if (video || watchGifId || queryGifId) gifId = hookedGif.toLowerCase()
    else if (!profileUsername) gifId = hookedGif.toLowerCase()
  }

  // Username: profile URL always wins on /users/...
  let username = profileUsername || null
  if (!username && video) username = usernameNear(video)
  if (!username && hookedUser) username = hookedUser.toLowerCase()
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

  // Meta tags only on dedicated watch pages
  if (!gifId && watchGifId) {
    gifId =
      gifIdFromText(document.querySelector('link[rel="canonical"]')?.href) ||
      gifIdFromText(document.querySelector('meta[property="og:url"]')?.content) ||
      watchGifId
  }

  if (gifId) {
    return {
      kind: 'watch',
      gifId,
      url: `https://www.redgifs.com/watch/${gifId}`,
      username,
    }
  }

  if (profileUsername) {
    return {
      kind: 'user',
      username: profileUsername,
      gifId: null,
      url: null,
    }
  }

  if (username) {
    return { kind: 'feed', gifId: null, url: null, username }
  }

  return { kind: 'other', gifId: null, url: null, username: null }
}

function resetCtxForPath() {
  if (location.pathname === lastPathname) return false
  lastPathname = location.pathname
  liveCtx = {
    kind: 'other',
    gifId: null,
    url: null,
    username: profileUsernameFromPath(),
  }
  return true
}

function applyDetected(next) {
  if (!next) return liveCtx
  // Full replace from DOM — do not keep previous gif/user across pages
  liveCtx = {
    kind: next.kind || 'other',
    gifId: next.gifId || null,
    url: next.gifId ? `https://www.redgifs.com/watch/${next.gifId}` : null,
    username: next.username || null,
  }
  return liveCtx
}

function detectContext() {
  resetCtxForPath()
  return applyDetected(detectFromDom())
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.source !== 'blackgif-scraper') return

  resetCtxForPath()

  // Explicit navigation reset from page-hook
  if (data.nav) {
    liveCtx = {
      kind: data.username ? 'user' : 'other',
      gifId: null,
      url: null,
      username: data.username ? String(data.username).toLowerCase() : null,
    }
    refreshPanel()
    return
  }

  const gifId = data.gifId ? String(data.gifId).toLowerCase() : null
  const profileUsername = profileUsernameFromPath()
  let username = data.username ? String(data.username).toLowerCase() : null
  if (profileUsername) username = profileUsername

  // Ignore username-only updates for a different creator while on a profile
  if (!gifId && username && profileUsername && username !== profileUsername) return

  if (gifId) {
    liveCtx = {
      kind: 'watch',
      gifId,
      url: `https://www.redgifs.com/watch/${gifId}`,
      username: username || liveCtx.username || profileUsername,
    }
  } else if (username) {
    liveCtx = {
      ...liveCtx,
      username,
      kind: liveCtx.gifId ? liveCtx.kind : 'user',
    }
  }
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

/** Avoid racing LOOKUP for an old gif after context switches */
let panelLookupToken = 0

async function refreshPanel() {
  const panel = ensurePanel()
  if (panel.dataset.hidden === '1') return

  const ctx = detectContext()
  const downloadBtn = panel.querySelector('#bg-download')
  const trackBtn = panel.querySelector('#bg-track')
  const token = ++panelLookupToken

  downloadBtn.hidden = false
  trackBtn.hidden = !ctx.username
  downloadBtn.onclick = null
  trackBtn.onclick = null
  downloadBtn.disabled = false
  trackBtn.disabled = false
  downloadBtn.textContent = 'Download'

  if (ctx.username) {
    trackBtn.textContent = 'Track'
    trackBtn.onclick = async () => {
      trackBtn.disabled = true
      trackBtn.textContent = '…'
      try {
        const acc = await send('TRACK_ACCOUNT', { username: ctx.username })
        if (token !== panelLookupToken) return
        setMeta(`Tracking @${acc.username}`, 'ok')
        trackBtn.textContent = 'Tracked ✓'
      } catch (err) {
        if (token !== panelLookupToken) return
        setMeta(err.message, 'err')
        trackBtn.textContent = 'Track'
        trackBtn.disabled = false
      }
    }
  }

  const wireDownload = (url, gifId) => {
    if (token !== panelLookupToken) return
    downloadBtn.disabled = false
    downloadBtn.textContent = 'Download'
    downloadBtn.onclick = async () => {
      downloadBtn.disabled = true
      downloadBtn.textContent = '…'
      try {
        const saved = await send('DOWNLOAD_URL', { url, saveFile: true })
        if (token !== panelLookupToken) return
        const ok = saved.status === 'done'
        setMeta(ok ? `Downloaded: ${saved.gif_id}` : `${saved.status}: ${saved.gif_id}`, ok ? 'ok' : 'err')
        downloadBtn.textContent = ok ? 'Downloaded' : 'Retry'
        downloadBtn.disabled = ok
      } catch (err) {
        if (token !== panelLookupToken) return
        setMeta(err.message, 'err')
        downloadBtn.textContent = 'Download'
        downloadBtn.disabled = false
      }
    }
  }

  if (ctx.gifId && ctx.url) {
    setMeta(ctx.username ? `${ctx.gifId} · @${ctx.username}` : ctx.gifId)
    send('LOOKUP_GIF', { gifId: ctx.gifId })
      .then((item) => {
        if (token !== panelLookupToken) return
        if (item && item.status === 'done') {
          downloadBtn.textContent = 'Downloaded'
          downloadBtn.disabled = true
          setMeta(
            ctx.username ? `Downloaded · @${ctx.username}` : 'Already downloaded',
            'ok',
          )
          return
        }
        wireDownload(ctx.url, ctx.gifId)
      })
      .catch(() => wireDownload(ctx.url, ctx.gifId))
    return
  }

  downloadBtn.textContent = 'Download'
  downloadBtn.disabled = false
  downloadBtn.onclick = async () => {
    downloadBtn.disabled = true
    downloadBtn.textContent = '…'
    const fresh = detectContext()
    if (fresh.gifId && fresh.url) {
      wireDownload(fresh.url, fresh.gifId)
      downloadBtn.click()
      return
    }
    downloadBtn.textContent = 'Download'
    downloadBtn.disabled = false
    setMeta(
      ctx.username
        ? `@${ctx.username} — play the gif, then Download`
        : 'Play the gif on screen, then Download',
      'err',
    )
  }

  if (ctx.username) {
    setMeta(`@${ctx.username} — play gif, then Download`)
    return
  }

  setMeta('Play a gif — Download saves what’s on screen')
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
  const navigated = resetCtxForPath()
  const ctx = detectContext()
  const key = `${location.href}|${ctx.gifId || ''}|${ctx.username || ''}`
  if (navigated || key !== lastKey) {
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
mo.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-bg-gif-id', 'data-bg-username', 'src', 'href', 'poster'],
})
window.addEventListener('popstate', () => {
  lastPathname = ''
  tick()
})
setInterval(tick, 400)
refreshPanel()
