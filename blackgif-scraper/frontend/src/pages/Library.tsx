import { ArrowLeft, Download, ExternalLink, FolderOpen, HardDrive, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  formatDate,
  formatViews,
  type CreatorFolder,
  type MediaItem,
} from '../api'
import { PageHeader } from '../components/StatCard'

function usernameFromItem(item: MediaItem): string | null {
  if (item.username) return item.username.toLowerCase()
  if (item.local_path) {
    const m = item.local_path.replace(/\\/g, '/').match(/\/([^/]+)\/[^/]+$/)
    if (m) return m[1].toLowerCase()
  }
  return null
}

function MediaGrid({
  items,
  loading,
  emptyText,
  onRemove,
  showCreator = false,
}: {
  items: MediaItem[]
  loading: boolean
  emptyText: string
  onRemove: (item: MediaItem) => void
  showCreator?: boolean
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const creator = usernameFromItem(item)
          return (
            <article key={item.id} className="card overflow-hidden">
              <div className="relative aspect-video bg-[var(--color-bg)]">
                {item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
                    No preview
                  </div>
                )}
                <div className="absolute left-3 top-3 flex flex-wrap gap-1">
                  {item.status === 'done' ? (
                    <span className="rounded-full bg-[rgba(52,211,153,0.95)] px-2 py-1 text-xs font-semibold text-black backdrop-blur">
                      Downloaded
                    </span>
                  ) : (
                    <span className="rounded-full bg-black/60 px-2 py-1 text-xs capitalize backdrop-blur">
                      {item.status === 'discovered' ? 'not saved' : item.status}
                    </span>
                  )}
                  {item.is_viral ? (
                    <span className="rounded-full bg-[rgba(167,139,250,0.9)] px-2 py-1 text-xs font-medium backdrop-blur">
                      Viral
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2 p-4">
                <h3 className="line-clamp-1 text-sm font-medium">{item.title || item.gif_id}</h3>
                <p className="truncate font-mono text-[10px] text-[var(--color-muted)]" title={item.gif_id}>
                  {item.gif_id}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  {showCreator && creator ? (
                    <>
                      <Link
                        to={`/library/${encodeURIComponent(creator)}`}
                        className="text-[var(--color-blue)] hover:underline"
                      >
                        @{creator}
                      </Link>
                      {' · '}
                    </>
                  ) : null}
                  {formatViews(item.views)} views ·{' '}
                  {formatDate(item.downloaded_at || item.published_at || item.discovered_at)}
                </p>
                {item.error ? <p className="text-xs text-red-300">{item.error}</p> : null}
                <div className="flex gap-2 pt-1">
                  {item.status !== 'done' ? (
                    <span className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]">
                      Not on disk
                    </span>
                  ) : (
                    <a
                      href={`/api/library/${item.id}/file`}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--color-green)]/40 bg-[rgba(52,211,153,0.08)] px-3 py-2 text-xs text-[var(--color-green)] hover:bg-[rgba(52,211,153,0.14)]"
                    >
                      Downloaded · Open
                    </a>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-[var(--color-border)] p-2 hover:bg-white/5"
                  >
                    <ExternalLink size={14} />
                  </a>
                  <button
                    type="button"
                    onClick={() => onRemove(item)}
                    className="rounded-xl border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      {!loading && !items.length ? (
        <p className="mt-6 text-sm text-[var(--color-muted)]">{emptyText}</p>
      ) : null}
      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-muted)]">Loading…</p>
      ) : null}
    </>
  )
}

function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayKeyFromIso(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return dayKeyFromDate(d)
}

function formatDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = dayKeyFromDate(new Date())
  const yestDate = new Date()
  yestDate.setDate(yestDate.getDate() - 1)
  const yest = dayKeyFromDate(yestDate)
  if (key === today) return 'Today'
  if (key === yest) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function DownloadedMedia() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [q, setQ] = useState('')
  const [viralOnly, setViralOnly] = useState(false)
  const [creatorFilter, setCreatorFilter] = useState('')
  /** '' = all, 'today' | 'yesterday' | '7d' | YYYY-MM-DD */
  const [dayFilter, setDayFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const media = await api.library({
        status: 'done',
        viral: viralOnly ? true : undefined,
      })
      setItems(media)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [viralOnly])

  const creators = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      const u = usernameFromItem(item)
      if (u) set.add(u)
    }
    return [...set].sort()
  }, [items])

  const downloadDays = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      const key = dayKeyFromIso(item.downloaded_at || item.discovered_at)
      if (!key) continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, count]) => ({ key, count }))
  }, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const todayStart = startOfLocalDay()
    const yesterdayStart = startOfLocalDay(new Date(Date.now() - 86400000))
    const weekStart = startOfLocalDay(new Date(Date.now() - 6 * 86400000))

    return items.filter((item) => {
      const creator = usernameFromItem(item)
      if (creatorFilter && creator !== creatorFilter) return false

      const when = item.downloaded_at || item.discovered_at
      const whenDate = when ? new Date(when) : null
      if (dayFilter === 'today') {
        if (!whenDate || whenDate < todayStart) return false
      } else if (dayFilter === 'yesterday') {
        if (!whenDate || whenDate < yesterdayStart || whenDate >= todayStart) return false
      } else if (dayFilter === '7d') {
        if (!whenDate || whenDate < weekStart) return false
      } else if (dayFilter) {
        if (dayKeyFromIso(when) !== dayFilter) return false
      }

      if (!needle) return true
      return (
        item.gif_id.toLowerCase().includes(needle) ||
        (item.title || '').toLowerCase().includes(needle) ||
        (creator || '').includes(needle)
      )
    })
  }, [items, q, creatorFilter, dayFilter])

  async function remove(item: MediaItem) {
    if (!confirm(`Remove ${item.gif_id}?`)) return
    await api.deleteMedia(item.id)
    await load()
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link
              to="/library"
              className="rounded-xl border border-[var(--color-border)] p-2 hover:bg-white/5"
              title="All creators"
            >
              <ArrowLeft size={18} />
            </Link>
            <span className="flex items-center gap-2">
              <HardDrive size={22} className="text-[var(--color-green)]" />
              Downloaded media
            </span>
          </span>
        }
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search downloads"
          className="pill-input px-4 py-2 text-sm outline-none"
        />
        <select
          value={dayFilter}
          onChange={(e) => setDayFilter(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm"
          title="Filter by download day"
        >
          <option value="">All days</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="7d">Last 7 days</option>
          {downloadDays.length ? <option disabled>────────</option> : null}
          {downloadDays.map(({ key, count }) => (
            <option key={key} value={key}>
              {formatDayLabel(key)} ({count})
            </option>
          ))}
        </select>
        <select
          value={creatorFilter}
          onChange={(e) => setCreatorFilter(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm"
        >
          <option value="">All creators</option>
          {creators.map((u) => (
            <option key={u} value={u}>
              @{u}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setViralOnly((v) => !v)}
          className={`rounded-xl px-3 py-2 text-xs font-medium ${
            viralOnly
              ? 'bg-[rgba(167,139,250,0.2)] text-[var(--color-purple)] ring-1 ring-[var(--color-purple)]/40'
              : 'border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-white/5'
          }`}
        >
          Viral only
        </button>
      </PageHeader>

      {downloadDays.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDayFilter('')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              dayFilter === ''
                ? 'bg-[var(--color-blue)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-white/5'
            }`}
          >
            All
          </button>
          {downloadDays.slice(0, 14).map(({ key, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDayFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                dayFilter === key
                  ? 'bg-[rgba(52,211,153,0.2)] text-[var(--color-green)] ring-1 ring-[var(--color-green)]/40'
                  : 'border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-white/5'
              }`}
            >
              {formatDayLabel(key)}
              <span className="ml-1 opacity-70">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="card mb-5 flex flex-wrap items-center gap-4 p-4">
        <div>
          <p className="text-xs text-[var(--color-muted)]">On disk</p>
          <p className="text-lg font-semibold">{items.length}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted)]">Showing</p>
          <p className="text-lg font-semibold">{filtered.length}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted)]">Creators</p>
          <p className="text-lg font-semibold">{creators.length}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted)]">Day filter</p>
          <p className="text-sm font-semibold">
            {dayFilter === ''
              ? 'All days'
              : dayFilter === '7d'
                ? 'Last 7 days'
                : dayFilter === 'today'
                  ? 'Today'
                  : dayFilter === 'yesterday'
                    ? 'Yesterday'
                    : formatDayLabel(dayFilter)}
          </p>
        </div>
        <p className="ml-auto max-w-sm text-xs text-[var(--color-muted)]">
          Filter by the day each file was downloaded. Open a file or jump into a creator folder.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <MediaGrid
        items={filtered}
        loading={loading}
        emptyText={
          dayFilter
            ? 'No downloads on this day. Try another day or clear the filter.'
            : 'No downloaded files yet. Use the extension or Save to disk on a post.'
        }
        onRemove={remove}
        showCreator
      />
    </div>
  )
}

function CreatorFolders({ q }: { q: string }) {
  const [folders, setFolders] = useState<CreatorFolder[]>([])
  const [downloadedTotal, setDownloadedTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([api.libraryFolders(), api.library({ status: 'done' })])
      .then(([foldersRes, done]) => {
        setFolders(foldersRes)
        setDownloadedTotal(done.length)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  const filtered = folders.filter((f) => {
    if (!q.trim()) return true
    const needle = q.trim().toLowerCase()
    return (
      f.username.includes(needle) ||
      (f.display_name || '').toLowerCase().includes(needle)
    )
  })

  if (error) {
    return (
      <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {error}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/library/downloaded')}
        className="card mb-5 flex w-full items-center gap-4 overflow-hidden p-0 text-left transition hover:border-[var(--color-green)]/40 hover:shadow-[0_0_0_1px_rgba(52,211,153,0.2)]"
      >
        <div className="flex h-full items-center justify-center bg-[rgba(52,211,153,0.12)] px-5 py-6">
          <HardDrive className="text-[var(--color-green)]" size={28} />
        </div>
        <div className="min-w-0 flex-1 py-4 pr-4">
          <p className="font-semibold tracking-tight">Downloaded media</p>
          <p className="text-sm text-[var(--color-muted)]">
            Browse everything saved to disk across all creators
          </p>
        </div>
        <div className="shrink-0 px-5 py-4 text-right">
          <p className="text-2xl font-semibold text-[var(--color-green)]">{downloadedTotal}</p>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Saved</p>
        </div>
      </button>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-[var(--color-muted)]">Creator folders</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((folder) => (
          <button
            key={folder.username}
            type="button"
            onClick={() => navigate(`/library/${encodeURIComponent(folder.username)}`)}
            className="card group overflow-hidden text-left transition hover:border-[var(--color-blue)]/50 hover:shadow-[0_0_0_1px_rgba(79,124,255,0.25)]"
          >
            <div className="relative flex items-center gap-4 bg-gradient-to-br from-[var(--color-blue)]/15 via-transparent to-[var(--color-purple)]/10 p-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--color-bg)] ring-1 ring-white/10">
                {folder.avatar_url ? (
                  <img src={folder.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FolderOpen className="text-[var(--color-muted)]" size={28} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold tracking-tight">
                  {folder.display_name || folder.username}
                </p>
                <p className="truncate text-sm text-[var(--color-muted)]">@{folder.username}</p>
                {folder.tracked ? (
                  <span className="mt-1 inline-block rounded-full bg-[rgba(52,211,153,0.12)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-green)]">
                    Tracked
                  </span>
                ) : (
                  <span className="mt-1 inline-block rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted)]">
                    Manual
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-[var(--color-border)] px-4 py-3 text-center">
              <div>
                <p className="text-sm font-semibold">{formatViews(folder.total_views)}</p>
                <p className="text-[10px] text-[var(--color-muted)]">Views</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{folder.viral_count}</p>
                <p className="text-[10px] text-[var(--color-muted)]">Viral</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{folder.downloaded_count}</p>
                <p className="text-[10px] text-[var(--color-muted)]">Saved</p>
              </div>
            </div>
            <p className="border-t border-[var(--color-border)] px-4 py-2 text-[10px] text-[var(--color-muted)]">
              Viral ≥ {formatViews(folder.min_views ?? 10000)} views · first post{' '}
              {formatDate(folder.first_post_at)}
            </p>
          </button>
        ))}
      </div>
      {!filtered.length ? (
        <p className="mt-6 text-sm text-[var(--color-muted)]">
          No creator folders yet. Track accounts or download a gif — each creator gets their own folder.
        </p>
      ) : null}
    </>
  )
}

function CreatorMedia({ username }: { username: string }) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [folder, setFolder] = useState<CreatorFolder | null>(null)
  const [status, setStatus] = useState('')
  const [viralOnly, setViralOnly] = useState(false)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [media, folders] = await Promise.all([
        api.library({
          username,
          status: status || undefined,
          q: q || undefined,
          viral: viralOnly ? true : undefined,
        }),
        api.libraryFolders(),
      ])
      setItems(media)
      setFolder(folders.find((f) => f.username === username) || null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [username, status, viralOnly])

  async function download(item: MediaItem) {
    await api.downloadMedia(item.id)
    await load()
  }

  async function remove(item: MediaItem) {
    if (!confirm(`Remove ${item.gif_id}?`)) return
    await api.deleteMedia(item.id)
    await load()
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link
              to="/library"
              className="rounded-xl border border-[var(--color-border)] p-2 hover:bg-white/5"
              title="All creators"
            >
              <ArrowLeft size={18} />
            </Link>
            <span className="flex items-center gap-3">
              {folder?.avatar_url ? (
                <img
                  src={folder.avatar_url}
                  alt=""
                  className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10"
                />
              ) : null}
              <span>
                <span className="block">@{username}</span>
                {folder?.display_name && folder.display_name !== username ? (
                  <span className="block text-sm font-normal text-[var(--color-muted)]">
                    {folder.display_name}
                  </span>
                ) : null}
              </span>
            </span>
          </span>
        }
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search in this folder"
          className="pill-input px-4 py-2 text-sm outline-none"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="discovered">Not saved yet</option>
          <option value="done">Downloaded</option>
          <option value="failed">Failed</option>
        </select>
        <button
          type="button"
          onClick={() => setViralOnly((v) => !v)}
          className={`rounded-xl px-3 py-2 text-xs font-medium ${
            viralOnly
              ? 'bg-[rgba(167,139,250,0.2)] text-[var(--color-purple)] ring-1 ring-[var(--color-purple)]/40'
              : 'border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-white/5'
          }`}
          title={
            folder?.min_views
              ? `Show posts with ≥ ${folder.min_views} views`
              : 'Show viral posts only'
          }
        >
          Viral only
        </button>
        {folder?.profile_url ? (
          <a
            href={folder.profile_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-[var(--color-border)] p-2 hover:bg-white/5"
            title="Open profile"
          >
            <ExternalLink size={16} />
          </a>
        ) : null}
      </PageHeader>

      {folder ? (
        <div className="card mb-5 grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
          <div>
            <p className="text-xs text-[var(--color-muted)]">Total views</p>
            <p className="text-lg font-semibold">{formatViews(folder.total_views)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Viral (≥{formatViews(folder.min_views ?? 10000)})</p>
            <p className="text-lg font-semibold">{folder.viral_count}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Saved to disk</p>
            <p className="text-lg font-semibold">{folder.downloaded_count}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">First post</p>
            <p className="text-lg font-semibold">{formatDate(folder.first_post_at)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Folder</p>
            <p className="truncate text-sm font-medium text-[var(--color-muted)]" title={folder.folder_path}>
              …/{folder.username}/
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="card overflow-hidden">
            <div className="relative aspect-video bg-[var(--color-bg)]">
              {item.thumbnail_url ? (
                <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
                  No preview
                </div>
              )}
              <div className="absolute left-3 top-3 flex flex-wrap gap-1">
                {item.status === 'done' ? (
                  <span className="rounded-full bg-[rgba(52,211,153,0.95)] px-2 py-1 text-xs font-semibold text-black backdrop-blur">
                    Downloaded
                  </span>
                ) : (
                  <span className="rounded-full bg-black/60 px-2 py-1 text-xs capitalize backdrop-blur">
                    {item.status === 'discovered' ? 'not saved' : item.status}
                  </span>
                )}
                {item.is_viral ? (
                  <span className="rounded-full bg-[rgba(167,139,250,0.9)] px-2 py-1 text-xs font-medium backdrop-blur">
                    Viral
                  </span>
                ) : null}
              </div>
            </div>
            <div className="space-y-2 p-4">
              <h3 className="line-clamp-1 text-sm font-medium">{item.title || item.gif_id}</h3>
              <p className="text-xs text-[var(--color-muted)]">
                {formatViews(item.views)} views · {formatDate(item.published_at || item.discovered_at)}
              </p>
              {item.error ? <p className="text-xs text-red-300">{item.error}</p> : null}
              <div className="flex gap-2 pt-1">
                {item.status !== 'done' ? (
                  <button
                    type="button"
                    onClick={() => download(item)}
                    className="btn-primary flex flex-1 items-center justify-center gap-1 px-3 py-2 text-xs"
                  >
                    <Download size={14} /> Save to disk
                  </button>
                ) : (
                  <a
                    href={`/api/library/${item.id}/file`}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--color-green)]/40 bg-[rgba(52,211,153,0.08)] px-3 py-2 text-xs text-[var(--color-green)] hover:bg-[rgba(52,211,153,0.14)]"
                  >
                    Downloaded · Open
                  </a>
                )}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-[var(--color-border)] p-2 hover:bg-white/5"
                >
                  <ExternalLink size={14} />
                </a>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  className="rounded-xl border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!loading && !items.length ? (
        <p className="mt-6 text-sm text-[var(--color-muted)]">No posts in this folder yet.</p>
      ) : null}
      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-muted)]">Loading folder…</p>
      ) : null}
    </div>
  )
}

export function Library() {
  const { username } = useParams<{ username?: string }>()
  const location = useLocation()
  const [q, setQ] = useState('')

  if (location.pathname === '/library/downloaded' || username === 'downloaded') {
    return <DownloadedMedia />
  }

  if (username) {
    return <CreatorMedia username={decodeURIComponent(username)} />
  }

  return (
    <div>
      <PageHeader title="Library">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search creators"
          className="pill-input px-4 py-2 text-sm outline-none"
        />
        <Link
          to="/library/downloaded"
          className="flex items-center gap-2 rounded-xl border border-[var(--color-green)]/35 bg-[rgba(52,211,153,0.08)] px-3 py-2 text-xs font-medium text-[var(--color-green)] hover:bg-[rgba(52,211,153,0.14)]"
        >
          <HardDrive size={14} />
          Downloaded
        </Link>
      </PageHeader>
      <p className="mb-5 text-sm text-[var(--color-muted)]">
        Creators are kept separate. Sync only catalogs posts and marks viral ones (from your min views).
        Nothing saves to disk until you press <strong>Save to disk</strong>.
      </p>
      <CreatorFolders q={q} />
    </div>
  )
}
