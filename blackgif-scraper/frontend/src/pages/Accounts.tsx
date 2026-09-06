import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { api, formatDate, type Account } from '../api'
import { PageHeader } from '../components/StatCard'

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [username, setUsername] = useState('')
  const [minViews, setMinViews] = useState(10000)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setAccounts(await api.accounts())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!username.trim()) return
    setBusy(true)
    try {
      await api.createAccount({ username: username.trim(), min_views: minViews })
      setUsername('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add account')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(acc: Account) {
    await api.updateAccount(acc.id, { enabled: !acc.enabled })
    await load()
  }

  async function updateViews(acc: Account, value: number) {
    await api.updateAccount(acc.id, { min_views: value })
    await load()
  }

  async function remove(acc: Account) {
    if (!confirm(`Stop tracking @${acc.username}?`)) return
    await api.deleteAccount(acc.id)
    await load()
  }

  async function sync(acc: Account) {
    await api.syncAccount(acc.id)
    await load()
  }

  return (
    <div>
      <PageHeader title="Accounts" />

      <form onSubmit={onAdd} className="card mb-5 grid gap-3 p-4 md:grid-cols-[1fr_160px_auto]">
        <input
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--color-blue)]"
          placeholder="RedGifs username or profile URL"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="number"
          min={0}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--color-blue)]"
          value={minViews}
          onChange={(e) => setMinViews(Number(e.target.value))}
          title="Minimum views to highlight as viral (does not auto-download)"
        />
        <button className="btn-primary flex items-center justify-center gap-2 px-5 py-3 text-sm" disabled={busy}>
          <Plus size={16} />
          Track
        </button>
      </form>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="card flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[var(--color-blue)]/30 to-[var(--color-purple)]/30">
                {acc.avatar_url ? (
                  <img src={acc.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold">@{acc.username.slice(0, 2)}</span>
                )}
              </div>
              <div>
                <p className="font-medium">@{acc.username}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {acc.downloaded_count}/{acc.media_count} downloaded · last sync{' '}
                  {formatDate(acc.last_synced_at)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]">
                Min views
                <input
                  type="number"
                  className="w-24 bg-transparent text-sm text-white outline-none"
                  value={acc.min_views}
                  onChange={(e) => updateViews(acc, Number(e.target.value))}
                />
              </label>
              <button
                onClick={() => toggle(acc)}
                className={`rounded-xl px-3 py-2 text-xs font-medium ${
                  acc.enabled
                    ? 'bg-[rgba(52,211,153,0.12)] text-[var(--color-green)]'
                    : 'bg-white/5 text-[var(--color-muted)]'
                }`}
              >
                {acc.enabled ? 'Enabled' : 'Paused'}
              </button>
              <button
                onClick={() => sync(acc)}
                className="flex items-center gap-1 rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-white/5"
              >
                <RefreshCw size={14} /> Sync
              </button>
              <button
                onClick={() => remove(acc)}
                className="rounded-xl border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {!accounts.length ? (
          <p className="text-sm text-[var(--color-muted)]">No accounts yet. Add a RedGifs username above.</p>
        ) : null}
      </div>
    </div>
  )
}
