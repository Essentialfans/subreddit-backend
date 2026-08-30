import { Download, ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, formatDate, formatViews, type MediaItem } from '../api'
import { PageHeader } from '../components/StatCard'

export function Library() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setItems(await api.library({ status: status || undefined, q: q || undefined }))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    load()
  }, [status])

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
      <PageHeader title="Library">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search title or ID"
          className="pill-input px-4 py-2 text-sm outline-none"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="done">Downloaded</option>
          <option value="queued">Queued</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
      </PageHeader>

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
                {item.status}
              </span>
            </div>
            <div className="space-y-2 p-4">
              <h3 className="line-clamp-1 text-sm font-medium">{item.title || item.gif_id}</h3>
              <p className="text-xs text-[var(--color-muted)]">
                {item.username ? `@${item.username}` : 'manual'} · {formatViews(item.views)} views ·{' '}
                {formatDate(item.discovered_at)}
              </p>
              {item.error ? <p className="text-xs text-red-300">{item.error}</p> : null}
              <div className="flex gap-2 pt-1">
                {item.status !== 'done' ? (
                  <button
                    onClick={() => download(item)}
                    className="btn-primary flex flex-1 items-center justify-center gap-1 px-3 py-2 text-xs"
                  >
                    <Download size={14} /> Download
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
      {!items.length ? (
        <p className="mt-6 text-sm text-[var(--color-muted)]">Library empty. Sync accounts or paste a URL.</p>
      ) : null}
    </div>
  )
}
