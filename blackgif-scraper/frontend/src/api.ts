const TOKEN_KEY = 'blackgif_auth_token'

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY)
  else localStorage.setItem(TOKEN_KEY, token)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...init, headers })
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
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export type Account = {
  id: number
  username: string
  display_name: string | null
  enabled: boolean
  min_views: number
  avatar_url: string | null
  last_synced_at: string | null
  created_at: string
  media_count: number
  downloaded_count: number
}

export type MediaItem = {
  id: number
  gif_id: string
  account_id: number | null
  username: string | null
  title: string | null
  url: string
  thumbnail_url: string | null
  views: number
  duration: number | null
  status: string
  is_viral: boolean
  viral_threshold: number | null
  local_path: string | null
  error: string | null
  published_at: string | null
  discovered_at: string
  downloaded_at: string | null
}

export type CreatorFolder = {
  username: string
  display_name: string | null
  account_id: number | null
  avatar_url: string | null
  profile_url: string
  folder_path: string
  tracked: boolean
  media_count: number
  downloaded_count: number
  viral_count: number
  total_views: number
  first_post_at: string | null
  last_synced_at: string | null
  min_views: number | null
}

export type Job = {
  id: number
  kind: string
  status: string
  message: string | null
  account_id: number | null
  created_at: string
  finished_at: string | null
  items_found: number
  items_downloaded: number
  items_failed: number
}

export type Stats = {
  total_accounts: number
  active_accounts: number
  total_media: number
  downloaded: number
  queued: number
  failed: number
  total_views_tracked: number
  downloads_last_7_days: { date: string; count: number }[]
  top_accounts: { username: string; media: number; views: number }[]
  status_breakdown: { status: string; count: number }[]
}

export type AppSettings = {
  sync_interval_minutes: number
  default_min_views: number
  max_concurrent_downloads: number
  download_dir: string
}

export const api = {
  health: () => request<{ status: string }>('/api/health'),
  stats: () => request<Stats>('/api/stats'),
  accounts: () => request<Account[]>('/api/accounts'),
  createAccount: (body: { username: string; min_views: number; enabled?: boolean }) =>
    request<Account>('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
  updateAccount: (id: number, body: Partial<{ min_views: number; enabled: boolean }>) =>
    request<Account>(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAccount: (id: number) => request<void>(`/api/accounts/${id}`, { method: 'DELETE' }),
  syncAccount: (id: number) =>
    request<{ ok: boolean }>(`/api/accounts/${id}/sync`, { method: 'POST' }),
  library: (params?: {
    status?: string
    q?: string
    account_id?: number
    username?: string
    viral?: boolean
  }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.q) qs.set('q', params.q)
    if (params?.account_id) qs.set('account_id', String(params.account_id))
    if (params?.username) qs.set('username', params.username)
    if (params?.viral === true) qs.set('viral', 'true')
    if (params?.viral === false) qs.set('viral', 'false')
    const s = qs.toString()
    return request<MediaItem[]>(`/api/library${s ? `?${s}` : ''}`)
  },
  libraryFolders: () => request<CreatorFolder[]>('/api/library/folders'),
  reconcileDownloads: () =>
    request<{ checked: number; newly_marked: number }>('/api/library/reconcile', {
      method: 'POST',
    }),
  getGif: (gifId: string) => request<MediaItem>(`/api/library/gif/${encodeURIComponent(gifId)}`),
  downloadUrl: (url: string, saveFile = true) =>
    request<MediaItem>('/api/download', {
      method: 'POST',
      body: JSON.stringify({ url, save_file: saveFile }),
    }),
  addToLibrary: (url: string) =>
    request<MediaItem>('/api/download', {
      method: 'POST',
      body: JSON.stringify({ url, save_file: false }),
    }),
  downloadMedia: (id: number) =>
    request<MediaItem>(`/api/library/${id}/download`, { method: 'POST' }),
  deleteMedia: (id: number) => request<void>(`/api/library/${id}`, { method: 'DELETE' }),
  syncAll: (download = false) =>
    request<{ ok: boolean }>('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ download }),
    }),
  jobs: () => request<Job[]>('/api/jobs'),
  settings: () => request<AppSettings>('/api/settings'),
  updateSettings: (body: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
}

export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
