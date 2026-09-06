import {
  Download,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/accounts', icon: Users, label: 'Accounts' },
  { to: '/library', icon: FolderOpen, label: 'Library' },
  { to: '/download', icon: Download, label: 'Download' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[72px] flex-col items-center gap-3 border-r border-[var(--color-border)] bg-[rgba(12,14,20,0.92)] px-2 py-5 backdrop-blur-xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-blue)] to-[var(--color-purple)] font-[family-name:var(--font-display)] text-sm font-bold shadow-[0_8px_24px_rgba(79,124,255,0.35)]">
          BG
        </div>
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={label}
            className={({ isActive }) =>
              [
                'flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-[var(--color-blue)] text-white shadow-[0_8px_20px_rgba(79,124,255,0.4)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-white',
              ].join(' ')
            }
          >
            <Icon size={20} strokeWidth={1.8} />
          </NavLink>
        ))}
      </aside>

      <main className="flex-1 overflow-x-hidden px-5 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  )
}
