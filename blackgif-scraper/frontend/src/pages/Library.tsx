import { ArrowLeft, Download, ExternalLink, FolderOpen, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  formatDate,
  formatViews,
  type CreatorFolder,
  type MediaItem,
} from '../api'
import { PageHeader } from '../components/StatCard'

function CreatorFolders({ q }: { q: string }) {
  const [folders, setFolders] = useState<CreatorFolder[]>([])
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .libraryFolders()
      .then(setFolders)
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
                <p className="text-sm font-semibold">
                  {folder.downloaded_count}/{folder.media_count}
                </p>
                <p className="text-[10px] text-[var(--color-muted)]">Saved</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{formatDate(folder.first_post_at)}</p>
                <p className="text-[10px] text-[var(--color-muted)]">First post</p>
              </div>
            </div>
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
  }, [username, status])

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
          <option value="done">Saved to disk</option>
          <option value="failed">Failed</option>
        </select>
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
        <div className="card mb-5 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--color-muted)]">Total views</p>
            <p className="text-lg font-semibold">{formatViews(folder.total_views)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Downloaded</p>
            <p className="text-lg font-semibold">
              {folder.downloaded_count}/{folder.media_count}
            </p>
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
              <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs capitalize backdrop-blur">
                {item.status === 'done' ? 'saved' : item.status === 'discovered' ? 'preview' : item.status}
              </span>
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
                    onClick={() => download(item)}
                    className="btn-primary flex flex-1 items-center justify-center gap-1 px-3 py-2 text-xs"
                  >
                    <Download size={14} /> Save to disk
                  </button>
                ) : (
                  <a
                    href={`/api/library/${item.id}/file`}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-white/5"
                  >
                    Open file
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
  const [q, setQ] = useState('')

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
      </PageHeader>
      <p className="mb-5 text-sm text-[var(--color-muted)]">
        Creators are kept separate. Sync catalogs posts — open a folder and use <strong>Save to disk</strong> only on
        the ones you want.
      </p>
      <CreatorFolders q={q} />
    </div>
  )
}
