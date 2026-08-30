import type { ReactNode } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

type Props = {
  label: string
  value: string
  delta?: string
  deltaPositive?: boolean
  accent?: 'blue' | 'purple' | 'teal'
  spark?: number[]
}

const accents = {
  blue: { stroke: '#4f7cff', fill: 'url(#sparkBlue)' },
  purple: { stroke: '#a78bfa', fill: 'url(#sparkPurple)' },
  teal: { stroke: '#2dd4bf', fill: 'url(#sparkTeal)' },
}

export function StatCard({
  label,
  value,
  delta,
  deltaPositive = true,
  accent = 'blue',
  spark = [3, 5, 4, 7, 6, 9, 8],
}: Props) {
  const data = spark.map((v, i) => ({ i, v }))
  const a = accents[accent]

  return (
    <div className="card animate-fade-up flex min-h-[118px] flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">{label}</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {value}
          </p>
        </div>
        {delta ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              deltaPositive ? 'bg-[rgba(52,211,153,0.12)] text-[var(--color-green)]' : 'bg-[rgba(248,113,113,0.12)] text-red-400'
            }`}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div className="mt-2 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="sparkBlue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f7cff" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#4f7cff" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="sparkPurple" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="sparkTeal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={a.stroke} fill={a.fill} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        {title}
      </h1>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}
