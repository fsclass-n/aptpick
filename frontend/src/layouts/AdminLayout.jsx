import { NavLink, Outlet } from 'react-router-dom'
import { Brain, Building, Database, FileText, LayoutDashboard, Moon, ScrollText, Sun, Users } from 'lucide-react'
import { Badge, ReadOnlyNotice } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useDashboardTheme } from '../contexts/ThemeContext'
import { ROLE_LABEL } from '../utils/config'

const MENU = [
  { to: '/admin', label: '대시보드', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: '회원 관리', icon: Users },
  { to: '/admin/properties', label: '매물 관리', icon: Building },
  { to: '/admin/data', label: '데이터 관제', icon: Database },
  { to: '/admin/models', label: 'AI 모델 관제', icon: Brain },
  { to: '/admin/reports', label: 'AI 리포트 관리', icon: FileText },
  { to: '/admin/operations', label: '운영 · 감사 로그', icon: ScrollText },
]

export default function AdminLayout() {
  const { user, readOnly } = useAuth()
  const { dark, toggle } = useDashboardTheme()
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-[calc(100vh-64px)] bg-slate-100 dark:bg-navy-950 dark:text-slate-200">
        <div className="container-x grid gap-6 py-6 lg:grid-cols-12">
          <aside className="lg:col-span-3 xl:col-span-2">
            <div className="card p-3 lg:sticky lg:top-24">
              <div className="mb-2 px-2 py-1">
                <p className="font-display font-bold">관리자 콘솔</p>
                <Badge tone={readOnly ? 'warn' : 'navy'} className="mt-1">{ROLE_LABEL[user.role]}</Badge>
              </div>
              <nav className="scrollbar-none flex gap-1 overflow-x-auto lg:flex-col">
                {MENU.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition ${isActive
                    ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800'}`}>
                    <Icon size={16} />{label}
                  </NavLink>
                ))}
              </nav>
              <button onClick={toggle} className="btn btn-ghost btn-sm mt-2 w-full">{dark ? <Sun size={15} /> : <Moon size={15} />}{dark ? '라이트 테마' : '다크 테마'}</button>
            </div>
          </aside>
          <main className="min-w-0 lg:col-span-9 xl:col-span-10">
            {readOnly && <ReadOnlyNotice />}
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
