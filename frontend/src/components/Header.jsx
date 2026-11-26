import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Bell, ChevronDown, Eye, LogIn, LogOut, Menu, Search, Shield, User, X } from 'lucide-react'
import Logo from './Logo'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import { connectNotifications } from '../services/realtime'
import { ROLE_LABEL, USE_MOCK } from '../utils/config'
import { datetime } from '../utils/format'
import { PERSONAS } from '../utils/lifestyle'
import { unsplash } from '../utils/images'

export const NAV = [
  { to: '/', label: '홈', end: true },
  { to: '/search', label: '아파트 찾기', children: [
    { to: '/search', label: '매물 통합 검색' }, { to: '/map', label: '지도로 탐색' }, { to: '/search?tab=trades', label: '실거래가 조회' }] },
  { to: '/recommend', label: 'Life Pick', mega: true, children: [{ to: '/recommend', label: '조건 직접 설정' }] },
  { to: '/market', label: '시장 분석', children: [
    { to: '/market', label: '지역별 시장 동향' }, { to: '/predict', label: 'AI 가격 예측' }] },
  { to: '/reports', label: '리포트' },
  { to: '/favorites', label: '관심 매물' },
]

// Life Pick 메가 메뉴: 라이프스타일 페르소나별 AI 추천 바로가기
function MegaMenu() {
  return (
    <div className="invisible absolute top-full left-1/2 z-50 w-[720px] -translate-x-1/2 translate-y-1 rounded-3xl border border-line bg-white p-5 opacity-0 shadow-float transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
      <div className="mb-3 flex items-end justify-between">
        <div><p className="eyebrow">Life Pick</p><p className="font-display text-[17px] font-bold">나의 라이프스타일로 집 찾기</p></div>
        <Link to="/recommend" className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-navy-900">조건 직접 설정<ArrowRight size={14} /></Link>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {PERSONAS.map((p) => (
          <Link key={p.id} to={`/recommend?persona=${p.id}`} className="group/p relative h-24 overflow-hidden rounded-2xl">
            <img src={unsplash(p.img, 360, 200)} alt="" className="h-full w-full object-cover transition duration-500 group-hover/p:scale-105" loading="lazy" />
            <span className="scrim absolute inset-0" />
            <span className="absolute bottom-2 left-3 text-[14px] font-bold text-white">{p.title}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function NavItem({ item }) {
  const location = useLocation()
  const active = item.end ? location.pathname === '/' : (item.children || [item]).some((c) => location.pathname.startsWith(c.to.split('?')[0]))
  const cls = `flex h-[72px] items-center gap-1 px-3 text-[15px] font-semibold tracking-tight transition xl:px-4 ${active ? 'text-navy-900' : 'text-slate-500 hover:text-navy-900'}`
  const text = <span className={`link-line py-1 ${active ? 'active' : ''}`}>{item.label}</span>
  if (!item.children) return <NavLink to={item.to} end={item.end} className={cls}>{text}</NavLink>
  return (
    <div className="group relative">
      <Link to={item.to} className={cls}>
        {item.mega && <span className="mr-0.5 h-1.5 w-1.5 rounded-full bg-brand-500" />}
        {text}<ChevronDown size={14} className="opacity-40 transition group-hover:rotate-180" />
      </Link>
      {item.mega ? <MegaMenu /> : <div className="invisible absolute top-full left-1/2 z-50 w-48 -translate-x-1/2 translate-y-1 rounded-2xl border border-line bg-white p-1.5 opacity-0 shadow-float transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        {item.children.map((c) => (
          <Link key={c.to} to={c.to} className="block rounded-lg px-3 py-2 text-[14px] text-slate-600 hover:bg-slate-50 hover:text-navy-900">{c.label}</Link>
        ))}
      </div>}
    </div>
  )
}

function useOutside(ref, onOutside) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, onOutside])
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const qc = useQueryClient()
  const toast = useToast()
  const q = useApi('/api/notifications', null, { refetchInterval: USE_MOCK ? false : 60_000 })
  useOutside(ref, () => setOpen(false))
  useEffect(() => connectNotifications((msg) => {
    if (msg.type === 'notification') {
      toast(`${msg.title} — ${msg.message}`, 'info')
      qc.invalidateQueries({ queryKey: ['/api/notifications'] })
    }
    if (msg.type === 'data_updated') qc.invalidateQueries()
  }), [qc, toast])
  const unread = q.data?.unread || 0
  const readAll = async () => {
    await api.post('/api/notifications/read-all').catch(() => {})
    qc.invalidateQueries({ queryKey: ['/api/notifications'] })
  }
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost relative h-10 w-10 px-0" onClick={() => setOpen((o) => !o)} aria-label={`알림 ${unread}건`}>
        <Bell size={19} />
        {unread > 0 && <span className="num absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-up px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-float">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-display font-bold">알림</p>
            {unread > 0 && <button className="text-[13px] font-semibold text-brand-600" onClick={readAll}>모두 읽음</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(q.data?.items || []).length === 0 && <p className="caption px-4 py-8 text-center">새 알림이 없습니다. 관심 단지에 가격 알림을 설정해 보세요.</p>}
            {(q.data?.items || []).slice(0, 15).map((n) => (
              <Link key={n.id} to={n.link || '/mypage?tab=alerts'} onClick={() => setOpen(false)} className={`block border-b border-slate-50 px-4 py-3 hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50/50'}`}>
                <p className="text-[14px] font-semibold text-slate-800">{n.broadcast && <span className="mr-1 text-mint-600">[공지]</span>}{n.title}</p>
                <p className="mt-0.5 text-[13px] text-slate-500">{n.message}</p>
                <p className="caption mt-1">{datetime(n.created_at)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileMenu() {
  const { user, logout, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  useOutside(ref, () => setOpen(false))
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 rounded-xl py-1.5 pr-2 pl-1.5 hover:bg-slate-100" onClick={() => setOpen((o) => !o)}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-[13px] font-bold text-white">{user.name.slice(0, 1)}</span>
        <span className="hidden max-w-24 truncate text-[14px] font-semibold text-slate-700 lg:block">{user.name}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-float">
          <div className="px-3 py-2">
            <p className="text-[14px] font-semibold">{user.name}</p>
            <p className="caption truncate">{user.email} · {ROLE_LABEL[user.role]}</p>
          </div>
          <Link to="/mypage" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] hover:bg-slate-50"><User size={16} />마이페이지</Link>
          {isAdmin && <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] hover:bg-slate-50"><Shield size={16} />관리자 대시보드</Link>}
          <button onClick={() => { logout(); setOpen(false); navigate('/') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] text-up hover:bg-red-50"><LogOut size={16} />로그아웃</button>
        </div>
      )}
    </div>
  )
}

function MobileDrawer({ open, onClose }) {
  const { user, logout, isAdmin } = useAuth()
  const location = useLocation()
  useEffect(() => { onClose() }, [location.pathname, location.search, onClose])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])
  return (
    <div className={`fixed inset-0 z-[1200] lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-navy-950/50 transition ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside className={`absolute top-0 right-0 flex h-full w-[86%] max-w-sm flex-col bg-white shadow-float transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
          <Logo />
          <button className="btn btn-ghost h-10 w-10 px-0" onClick={onClose} aria-label="메뉴 닫기"><X size={20} /></button>
        </div>
        <div className="border-b border-slate-100 p-4">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 font-bold text-white">{user.name.slice(0, 1)}</span>
              <div className="min-w-0"><p className="font-semibold">{user.name}</p><p className="caption truncate">{ROLE_LABEL[user.role]}</p></div>
            </div>
          ) : <Link to="/login" className="btn btn-primary w-full"><LogIn size={16} />로그인 / 회원가입</Link>}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV.map((item) => (
            <div key={item.label} className="mb-1">
              <NavLink to={item.to} end className="block rounded-xl px-3 py-3 text-[16px] font-semibold text-slate-800 hover:bg-slate-50">{item.label}</NavLink>
              {item.children?.slice(1).map((c) => (
                <Link key={c.to} to={c.to} className="block rounded-lg py-2 pr-3 pl-7 text-[14px] text-slate-500 hover:bg-slate-50">· {c.label}</Link>
              ))}
            </div>
          ))}
          <div className="mt-2 rounded-2xl bg-slate-50 p-3">
            <p className="eyebrow mb-2">Life Pick</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PERSONAS.map((p) => <Link key={p.id} to={`/recommend?persona=${p.id}`} className="rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-slate-700">{p.title}</Link>)}
            </div>
          </div>
          {user && <Link to="/mypage" className="block rounded-xl px-3 py-3 text-[16px] font-semibold text-slate-800 hover:bg-slate-50">마이페이지</Link>}
          {isAdmin && <Link to="/admin" className="block rounded-xl px-3 py-3 text-[16px] font-semibold text-brand-700 hover:bg-brand-50">관리자 대시보드</Link>}
        </nav>
        {user && <button onClick={logout} className="m-4 btn btn-secondary"><LogOut size={16} />로그아웃</button>}
      </aside>
    </div>
  )
}

// 상단 유틸리티 바 (데스크톱 · sticky 헤더 바깥에서 자연 스크롤)
export function UtilityBar() {
  const { user } = useAuth()
  return (
    <div className="hidden border-b border-line/70 bg-ivory lg:block">
      <div className="container-x flex h-9 items-center justify-between text-[12px] text-slate-500">
        <p><span className="font-semibold text-navy-900">공공 실거래 데이터 × AI 라이프 매칭</span> · 나의 생활 방식에 맞는 집을 고르는 가장 쉬운 방법</p>
        <div className="flex items-center gap-4">
          <Link to="/about" className="hover:text-navy-900">서비스 소개</Link>
          <Link to="/policy/data" className="hover:text-navy-900">데이터 출처</Link>
          {user ? <span>{user.name}님 · {ROLE_LABEL[user.role]}</span>
            : <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-navy-900 hover:text-brand-600"><Eye size={13} />테스트 관리자 체험</Link>}
        </div>
      </div>
    </div>
  )
}

export default function Header() {
  const { user, isAdmin } = useAuth()
  const [drawer, setDrawer] = useState(false)
  const closeDrawer = useCallback(() => setDrawer(false), [])
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => { setScrolled(window.scrollY > 8) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className={`sticky top-0 z-[1000] border-b bg-ivory/90 backdrop-blur-md transition ${scrolled ? 'border-line' : 'border-transparent'}`}>
      {USE_MOCK && (
        <div className="bg-navy-900 px-4 py-1.5 text-center text-[12px] text-slate-300">
          Netlify 데모 — 브라우저 Mock 데이터(가상 샘플)로 동작합니다. 실서비스: <a className="font-semibold text-brand-300 underline" href="https://aptpick.onrender.com">aptpick.onrender.com</a>
        </div>
      )}
      <div className="container-x flex h-[72px] items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center lg:flex" aria-label="주 메뉴">
          {NAV.map((item) => <NavItem key={item.label} item={item} />)}
        </nav>
        <div className="flex items-center gap-1">
          <Link to="/search" className="btn btn-ghost h-10 w-10 px-0" aria-label="검색"><Search size={19} /></Link>
          {user && <Notifications />}
          {isAdmin && (
            <Link to="/admin" className={`btn btn-sm hidden md:inline-flex ${location.pathname.startsWith('/admin') ? 'bg-navy-900 text-white' : 'btn-secondary'}`}>
              <Shield size={15} />관리자
            </Link>
          )}
          {user ? <div className="hidden lg:block"><ProfileMenu /></div> : (
            <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} className="btn btn-primary btn-sm hidden sm:inline-flex"><LogIn size={15} />로그인</Link>
          )}
          <button className="btn btn-ghost h-10 w-10 px-0 lg:hidden" onClick={() => setDrawer(true)} aria-label="메뉴 열기"><Menu size={22} /></button>
        </div>
      </div>
      <MobileDrawer open={drawer} onClose={closeDrawer} />
    </header>
  )
}
