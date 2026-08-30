import { useEffect, useState, type FormEvent } from 'react'
import { api, getAuthToken, setAuthToken, type AppSettings } from '../api'
import { PageHeader } from '../components/StatCard'

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [token, setToken] = useState(getAuthToken() || '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .settings()
      .then(setSettings)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    try {
      const next = await api.updateSettings({
        sync_interval_minutes: settings.sync_interval_minutes,
        default_min_views: settings.default_min_views,
        max_concurrent_downloads: settings.max_concurrent_downloads,
      })
      setSettings(next)
      setAuthToken(token.trim() || null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  if (!settings) {
    return <p className="text-[var(--color-muted)]">{error || 'Loading…'}</p>
  }

  return (
    <div>
      <PageHeader title="Settings" />
      <form onSubmit={onSave} className="card mx-auto max-w-xl space-y-4 p-6">
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--color-muted)]">Sync interval (minutes)</span>
          <input
            type="number"
            min={5}
            max={1440}
            value={settings.sync_interval_minutes}
            onChange={(e) =>
              setSettings({ ...settings, sync_interval_minutes: Number(e.target.value) })
            }
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 outline-none"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--color-muted)]">Default viral threshold (min views)</span>
          <input
            type="number"
            min={0}
            value={settings.default_min_views}
            onChange={(e) =>
              setSettings({ ...settings, default_min_views: Number(e.target.value) })
            }
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 outline-none"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--color-muted)]">Max concurrent downloads</span>
          <input
            type="number"
            min={1}
            max={8}
            value={settings.max_concurrent_downloads}
            onChange={(e) =>
              setSettings({ ...settings, max_concurrent_downloads: Number(e.target.value) })
            }
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 outline-none"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--color-muted)]">Download directory</span>
          <input
            value={settings.download_dir}
            readOnly
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-[var(--color-muted)] outline-none"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--color-muted)]">Deploy auth token (optional)</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token if AUTH_TOKEN is set on server"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 outline-none"
          />
        </label>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {saved ? <p className="text-sm text-[var(--color-green)]">Saved</p> : null}

        <button className="btn-primary px-5 py-3 text-sm">Save settings</button>
      </form>
    </div>
  )
}
