import { Download } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api, formatViews, type MediaItem } from '../api'
import { PageHeader } from '../components/StatCard'

export function DownloadPage() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MediaItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const item = await api.downloadUrl(url.trim())
      setResult(item)
      setUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Download" />

      <div className="card mx-auto max-w-2xl p-6">
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Paste a RedGifs watch URL to save the file immediately. To browse without saving, track the account and use
          Library instead.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.redgifs.com/watch/…"
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--color-blue)]"
            required
          />
          <button className="btn-primary flex items-center justify-center gap-2 px-5 py-3 text-sm" disabled={busy}>
            <Download size={16} />
            {busy ? 'Downloading…' : 'Download'}
          </button>
        </form>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--color-border)]">
            {result.thumbnail_url ? (
              <img src={result.thumbnail_url} alt="" className="aspect-video w-full object-cover" />
            ) : null}
            <div className="space-y-1 p-4">
              <p className="font-medium">{result.title || result.gif_id}</p>
              <p className="text-sm text-[var(--color-muted)]">
                {formatViews(result.views)} views · status: {result.status}
              </p>
              {result.local_path ? (
                <a className="text-sm text-[var(--color-blue)]" href={`/api/library/${result.id}/file`}>
                  Open downloaded file
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
