import { RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, formatDate, formatViews, type Job, type Stats } from '../api'
import { PageHeader, StatCard } from '../components/StatCard'

const STATUS_COLORS: Record<string, string> = {
  done: '#4f7cff',
  queued: '#a78bfa',
  downloading: '#2dd4bf',
  failed: '#f87171',
  skipped: '#64748b',
  discovered: '#94a3b8',
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const [s, j] = await Promise.all([api.stats(), api.jobs()])
      setStats(s)
      setJobs(j)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [])

  async function syncAll() {
    setBusy(true)
    try {
      await api.syncAll(true)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  const pieData = useMemo(
    () =>
      (stats?.status_breakdown || []).map((s) => ({
        name: s.status,
        value: s.count,
        color: STATUS_COLORS[s.status] || '#64748b',
      })),
    [stats],
  )

  const totalPie = pieData.reduce((a, b) => a + b.value, 0) || 1
  const donePct = Math.round(((stats?.downloaded || 0) / totalPie) * 100)

  const filteredJobs = jobs.filter((j) =>
    !query ? true : (j.message || '').toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div>
      <PageHeader title="Dashboard">
        <div className="pill-input flex min-w-[220px] flex-1 items-center gap-2 px-4 py-2 sm:max-w-xs">
          <Search size={16} className="text-[var(--color-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-muted)]"
          />
        </div>
        <button className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm" onClick={syncAll} disabled={busy}>
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
          Sync all
        </button>
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tracked accounts"
          value={String(stats?.total_accounts ?? '—')}
          delta={stats ? `${stats.active_accounts} active` : undefined}
          accent="blue"
          spark={[2, 3, 3, 4, 5, 5, stats?.total_accounts || 6]}
        />
        <StatCard
          label="Downloaded"
          value={String(stats?.downloaded ?? '—')}
          delta={stats && stats.queued ? `${stats.queued} queued` : '+0'}
          accent="purple"
          spark={(stats?.downloads_last_7_days || []).map((d) => d.count + 1)}
        />
        <StatCard
          label="Media tracked"
          value={String(stats?.total_media ?? '—')}
          delta={stats && stats.failed ? `${stats.failed} failed` : 'healthy'}
          deltaPositive={!stats?.failed}
          accent="teal"
        />
        <StatCard
          label="Views tracked"
          value={stats ? formatViews(stats.total_views_tracked) : '—'}
          accent="blue"
          spark={[4, 6, 5, 8, 7, 10, 12]}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="card animate-fade-up p-5 xl:col-span-2" style={{ animationDelay: '80ms' }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Download analytics</h2>
            <span className="text-xs text-[var(--color-muted)]">Last 7 days</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.downloads_last_7_days || []}>
                <defs>
                  <linearGradient id="dlFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.55} />
                    <stop offset="55%" stopColor="#4f7cff" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#242836" strokeDasharray="4 6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  stroke="#8b92a8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#8b92a8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: '#171a24',
                    border: '1px solid #242836',
                    borderRadius: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#4f7cff"
                  fill="url(#dlFill)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card animate-fade-up p-5" style={{ animationDelay: '120ms' }}>
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg font-semibold">Library mix</h2>
          <div className="relative mx-auto h-48 w-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={58} outerRadius={78} paddingAngle={3}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-[family-name:var(--font-display)] text-3xl font-semibold">{donePct}%</span>
              <span className="text-xs text-[var(--color-muted)]">downloaded</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {pieData.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                  <span className="capitalize text-[var(--color-muted)]">{p.name}</span>
                </div>
                <span>{p.value}</span>
              </div>
            ))}
            {!pieData.length ? (
              <p className="text-sm text-[var(--color-muted)]">No media yet — add accounts to start.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="card animate-fade-up p-5 xl:col-span-2" style={{ animationDelay: '160ms' }}>
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg font-semibold">Recent jobs</h2>
          <div className="space-y-3">
            {filteredJobs.slice(0, 8).map((job) => (
              <div
                key={job.id}
                className="flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-[rgba(11,13,18,0.55)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{job.message || job.kind}</p>
                  <p className="text-xs text-[var(--color-muted)]">{formatDate(job.created_at)}</p>
                </div>
                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    job.status === 'completed'
                      ? 'bg-[rgba(79,124,255,0.15)] text-[var(--color-blue)]'
                      : job.status === 'failed'
                        ? 'bg-red-500/15 text-red-300'
                        : 'bg-[rgba(167,139,250,0.15)] text-[var(--color-purple)]'
                  }`}
                >
                  {job.status}
                </span>
              </div>
            ))}
            {!filteredJobs.length ? (
              <p className="text-sm text-[var(--color-muted)]">No jobs yet.</p>
            ) : null}
          </div>
        </div>

        <div className="card animate-fade-up p-5" style={{ animationDelay: '200ms' }}>
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg font-semibold">Top accounts</h2>
          <div className="space-y-3">
            {(stats?.top_accounts || []).map((a, idx) => (
              <div key={a.username} className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-blue)]/40 to-[var(--color-purple)]/40 text-xs font-semibold">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">@{a.username}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {a.media} media · {formatViews(a.views)} views
                  </p>
                </div>
              </div>
            ))}
            {!stats?.top_accounts?.length ? (
              <p className="text-sm text-[var(--color-muted)]">Track creators to see rankings.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
