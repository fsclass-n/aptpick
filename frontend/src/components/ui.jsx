import { useEffect } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Database, Inbox, Loader2, X } from 'lucide-react'
import { date, pct, trendArrow, trendClass } from '../utils/format'

export function Spinner({ label = '불러오는 중…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-12 text-[14px] text-slate-500 ${className}`}>
      <Loader2 size={18} className="animate-spin text-brand-500" /> {label}
    </div>
  )
}

export function Skeleton({ className = 'h-24' }) {
  return <div className={`skeleton ${className}`} />
}

export function Empty({ title = '데이터가 없습니다.', children, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <Icon size={36} className="text-slate-300" />
      <p className="font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      {children && <div className="caption max-w-md">{children}</div>}
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-100 bg-red-50/60 px-4 py-10 text-center dark:border-red-900/40 dark:bg-red-950/20">
      <AlertTriangle className="text-up" />
      <p className="text-[14px] text-slate-700 dark:text-slate-300">{error?.message || '데이터를 불러오지 못했습니다.'}</p>
      {onRetry && <button className="btn btn-secondary btn-sm" onClick={onRetry}>다시 시도</button>}
    </div>
  )
}

/** useQuery 결과를 로딩/에러/데이터 상태로 렌더링 */
export function Async({ q, children, loading, empty }) {
  if (q.isPending) return loading !== undefined ? loading : <Spinner />
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />
  if (empty && empty(q.data)) return <Empty />
  return children(q.data)
}

export function Card({ className = '', children, ...rest }) {
  return <div className={`card ${className}`} {...rest}>{children}</div>
}

export function SectionTitle({ eyebrow, title, desc, action, className = '' }) {
  return (
    <div className={`mb-5 flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="h2">{title}</h2>
        {desc && <p className="caption mt-1">{desc}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ eyebrow, title, desc, children }) {
  return (
    <div className="border-b border-slate-200 bg-white dark:border-navy-800 dark:bg-navy-900">
      <div className="container-x py-8 md:py-10">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="h1">{title}</h1>
            {desc && <p className="mt-2 max-w-3xl text-[15px] text-slate-500 dark:text-slate-400">{desc}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

const TONES = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
  mint: 'bg-mint-50 text-mint-600 dark:bg-mint-600/20 dark:text-mint-300',
  up: 'bg-up-soft text-up', down: 'bg-down-soft text-down',
  pick: 'bg-pick-soft text-pick', warn: 'bg-warn-soft text-warn',
  gray: 'bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300',
  navy: 'bg-navy-800 text-white',
}
export function Badge({ tone = 'gray', children, className = '' }) {
  return <span className={`chip ${TONES[tone]} ${className}`}>{children}</span>
}

export function Trend({ value, digits = 2, className = '' }) {
  return <span className={`num font-semibold ${trendClass(value)} ${className}`}>{trendArrow(value)} {pct(value, digits).replace('+', '')}</span>
}

export function Stat({ label, value, sub, trend, icon: Icon, tone = 'brand' }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between">
        <p className="caption font-semibold">{label}</p>
        {Icon && <span className={`rounded-lg p-1.5 ${TONES[tone]}`}><Icon size={16} /></span>}
      </div>
      <p className="num mt-2 font-display text-[22px] font-extrabold text-slate-900 md:text-[26px] dark:text-white">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-[13px]">
        {trend !== undefined && <Trend value={trend} />}
        {sub && <span className="caption">{sub}</span>}
      </div>
    </Card>
  )
}

/** 데이터 기준일·출처 표시 (가상 샘플 데이터는 경고 배지) */
export function DataMeta({ meta, className = '' }) {
  if (!meta) return null
  return (
    <div className={`flex flex-wrap items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400 ${className}`}>
      <Database size={14} />
      <span>데이터 기준일 <b className="num text-slate-700 dark:text-slate-200">{date(meta.as_of)}</b></span>
      <span className="text-slate-300">|</span>
      <span>출처: {(meta.sources || []).map((s) => s.label).join(', ') || '-'}</span>
      {meta.is_sample && <SampleBadge />}
    </div>
  )
}

export function SampleBadge({ className = '' }) {
  return <Badge tone="warn" className={className}>가상 샘플 데이터 · 실제 시세 아님</Badge>
}

export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-navy-800" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-lg font-semibold transition ${size === 'sm' ? 'px-2.5 py-1 text-[13px]' : 'px-3.5 py-1.5 text-[14px]'} ${value === o.value
            ? 'bg-white text-brand-700 shadow-sm dark:bg-navy-600 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null
  const start = Math.max(1, Math.min(page - 2, pages - 4))
  const list = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i)
  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-[14px] font-semibold'
  return (
    <nav className="mt-8 flex items-center justify-center gap-1" aria-label="페이지">
      <button className={`${btn} btn-ghost`} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="이전"><ChevronLeft size={16} /></button>
      {list.map((p) => (
        <button key={p} onClick={() => onChange(p)} aria-current={p === page}
          className={`${btn} ${p === page ? 'bg-brand-600 text-white' : 'btn-ghost'}`}>{p}</button>
      ))}
      <button className={`${btn} btn-ghost`} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="다음"><ChevronRight size={16} /></button>
    </nav>
  )
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-navy-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className={`card max-h-[90vh] w-full ${width} animate-fade-up overflow-y-auto rounded-b-none p-6 sm:rounded-2xl`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="h3">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ScoreBar({ label, value, tone = 'brand' }) {
  const color = { brand: 'bg-brand-500', mint: 'bg-mint-500', pick: 'bg-pick', warn: 'bg-warn' }[tone]
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="num font-semibold text-slate-700 dark:text-slate-200">{value === null || value === undefined ? '데이터 없음' : Math.round(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
      </div>
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="caption mt-1 block">{hint}</span>}
    </label>
  )
}

export function ReadOnlyNotice() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] font-semibold text-warn">
      <AlertTriangle size={16} /> 테스트 관리자 계정은 읽기 전용입니다. 생성·수정·삭제 버튼이 비활성화됩니다.
    </div>
  )
}
