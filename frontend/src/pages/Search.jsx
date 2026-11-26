import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookmarkPlus, Map, SlidersHorizontal, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import PropertyCard from '../components/PropertyCard'
import { AREA_OPTIONS, PRICE_OPTIONS, RegionSelect, YEAR_OPTIONS } from '../components/SearchForm'
import { Async, Badge, Card, DataMeta, Empty, Field, PageHeader, Pagination, Segmented, Skeleton } from '../components/ui'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { clean, useApi } from '../hooks/useApi'
import { DEAL_TYPES, READ_ONLY_MESSAGE, SORTS } from '../utils/config'
import { date, eok, won } from '../utils/format'

const LISTING_KEYS = ['q', 'region', 'deal_type', 'price_min', 'price_max', 'rent_max', 'area_min', 'area_max', 'build_year_min', 'rooms_min', 'sort', 'page']
const TRADE_KEYS = ['q', 'region', 'price_min', 'price_max', 'area_min', 'area_max', 'date_from', 'date_to', 'page']

function Filters({ f, set, tab }) {
  return (
    <div className="space-y-4">
      <Field label="아파트명 · 지역"><input className="input" value={f.q || ''} onChange={(e) => set({ q: e.target.value })} placeholder="예: 송파, 한빛" /></Field>
      <Field label="지역"><RegionSelect value={f.region} onChange={(v) => set({ region: v })} /></Field>
      {tab === 'listings' && (
        <Field label="거래 유형">
          <div className="grid grid-cols-3 gap-1.5">
            {DEAL_TYPES.map((d) => (
              <button key={d.value} type="button" onClick={() => set({ deal_type: d.value })}
                className={`btn btn-sm ${f.deal_type === d.value ? 'btn-primary' : 'btn-secondary'}`}>{d.label}</button>
            ))}
          </div>
        </Field>
      )}
      <Field label={f.deal_type === 'monthly' && tab === 'listings' ? '보증금 범위' : '가격 범위'}>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={f.price_min || ''} onChange={(e) => set({ price_min: e.target.value })}>
            <option value="">최소</option>{PRICE_OPTIONS.slice(1).map((v) => <option key={v} value={v}>{eok(v)}</option>)}
          </select>
          <select className="input" value={f.price_max || ''} onChange={(e) => set({ price_max: e.target.value })}>
            <option value="">최대</option>{PRICE_OPTIONS.slice(1).map((v) => <option key={v} value={v}>{eok(v)}</option>)}
          </select>
        </div>
      </Field>
      {f.deal_type === 'monthly' && tab === 'listings' && (
        <Field label="월세 최대 (만원)"><input className="input" type="number" min="0" value={f.rent_max || ''} onChange={(e) => set({ rent_max: e.target.value })} /></Field>
      )}
      <Field label="전용면적">
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={f.area_min || ''} onChange={(e) => set({ area_min: e.target.value })}>
            {AREA_OPTIONS.map(([v, l]) => <option key={v} value={v || ''}>{v ? l : '최소'}</option>)}
          </select>
          <select className="input" value={f.area_max || ''} onChange={(e) => set({ area_max: e.target.value })}>
            <option value="">최대</option>{[60, 85, 102, 135].map((v) => <option key={v} value={v}>~{v}㎡</option>)}
          </select>
        </div>
      </Field>
      {tab === 'listings' ? (
        <>
          <Field label="준공 연도">
            <select className="input" value={f.build_year_min || ''} onChange={(e) => set({ build_year_min: e.target.value })}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y || ''}>{y ? `${y}년 이후` : '전체'}</option>)}
            </select>
          </Field>
          <Field label="방 개수">
            <select className="input" value={f.rooms_min || ''} onChange={(e) => set({ rooms_min: e.target.value })}>
              <option value="">전체</option>{[2, 3, 4].map((v) => <option key={v} value={v}>{v}개 이상</option>)}
            </select>
          </Field>
        </>
      ) : (
        <Field label="계약 기간">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="date" value={f.date_from || ''} onChange={(e) => set({ date_from: e.target.value })} />
            <input className="input" type="date" value={f.date_to || ''} onChange={(e) => set({ date_to: e.target.value })} />
          </div>
        </Field>
      )}
    </div>
  )
}

function Trades({ params, setPage }) {
  const q = useApi('/api/transactions/search', params, { placeholderData: (p) => p })
  return (
    <Async q={q} loading={<Skeleton className="h-96" />}>
      {(d) => (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] text-slate-600">실거래 <b className="num text-slate-900">{d.total.toLocaleString()}</b>건 <span className="caption">· 계약일 최신순 · 해제 거래 제외</span></p>
            <DataMeta meta={d.meta} />
          </div>
          <Card className="overflow-x-auto">
            <table className="table-base min-w-[720px]">
              <thead><tr><th>계약일</th><th>단지</th><th>지역</th><th className="text-right">전용면적</th><th className="text-right">층</th><th className="text-right">거래금액</th><th>구분</th></tr></thead>
              <tbody>
                {d.items.map((t) => (
                  <tr key={t.id}>
                    <td className="num">{date(t.deal_date)}</td>
                    <td><Link className="font-semibold text-brand-700 hover:underline" to={`/apartments/${t.complex_id}`}>{t.complex_name}</Link></td>
                    <td className="text-slate-500">{t.region}</td>
                    <td className="num text-right">{t.area}㎡</td>
                    <td className="num text-right">{t.floor ?? '-'}</td>
                    <td className="num text-right font-bold">{won(t.price)}</td>
                    <td>{t.dealing_type === '직거래' ? <Badge tone="warn">직거래</Badge> : <Badge>중개</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.items.length && <Empty title="조건에 맞는 실거래가 없습니다." />}
          </Card>
          <Pagination page={d.page} pages={d.pages} onChange={setPage} />
        </>
      )}
    </Async>
  )
}

export default function Search() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') === 'trades' ? 'trades' : 'listings'
  const f = Object.fromEntries(sp.entries())
  if (!f.deal_type) f.deal_type = 'sale'
  const [mobileFilter, setMobileFilter] = useState(false)
  const { user, readOnly } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const params = useMemo(() => clean(Object.fromEntries((tab === 'listings' ? LISTING_KEYS : TRADE_KEYS).map((k) => [k, f[k]]))), [sp.toString(), tab]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useApi(tab === 'listings' ? '/api/apartments/search' : null, params, { placeholderData: (p) => p })

  const set = (patch) => setSp(clean({ ...f, ...patch, page: patch.page ?? '' }), { replace: true })
  const reset = () => setSp(clean({ tab: tab === 'trades' ? 'trades' : '', deal_type: 'sale' }))
  const saveSearch = async () => {
    if (!user) return navigate(`/login?next=${encodeURIComponent('/search?' + sp.toString())}`)
    if (readOnly) return toast(READ_ONLY_MESSAGE, 'error')
    const name = window.prompt('저장할 검색 조건 이름', [f.q, f.region && '지역', f.deal_type].filter(Boolean).join(' ') || '내 검색')
    if (!name) return undefined
    await api.post('/api/me/saved-searches', { name, query: params }).then(() => toast('검색 조건을 저장했습니다. 마이페이지에서 다시 불러올 수 있습니다.')).catch((e) => toast(e.message, 'error'))
    qc.invalidateQueries({ queryKey: ['/api/me/preferences'] })
    return undefined
  }

  return (
    <>
      <PageHeader eyebrow="Search" title="아파트 찾기" desc="등록 매물(호가)과 국토교통부 실거래가(계약 완료 가격)를 구분해 검색합니다.">
        <div className="flex flex-wrap gap-2">
          <Segmented value={tab} onChange={(v) => setSp(clean({ ...f, tab: v === 'trades' ? 'trades' : '', page: '' }))}
            options={[{ value: 'listings', label: '매물 (호가)' }, { value: 'trades', label: '실거래가' }]} />
          <Link to={`/map?${new URLSearchParams(clean({ region: f.region, deal_type: f.deal_type }))}`} className="btn btn-secondary"><Map size={16} />지도로 보기</Link>
        </div>
      </PageHeader>
      <div className="container-x grid gap-6 py-6 lg:grid-cols-12">
        <aside className={`lg:col-span-3 ${mobileFilter ? 'fixed inset-0 z-[1100] overflow-y-auto bg-white p-5' : 'hidden lg:block'}`}>
          <Card className="p-5 lg:sticky lg:top-24">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="h3 flex items-center gap-2"><SlidersHorizontal size={18} />검색 필터</h3>
              <div className="flex gap-1">
                <button className="btn btn-ghost btn-sm" onClick={reset}>초기화</button>
                <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setMobileFilter(false)} aria-label="닫기"><X size={16} /></button>
              </div>
            </div>
            <Filters f={f} set={set} tab={tab} />
            <button className="btn btn-secondary mt-5 w-full" onClick={saveSearch}><BookmarkPlus size={16} />검색 조건 저장</button>
            <button className="btn btn-primary mt-2 w-full lg:hidden" onClick={() => setMobileFilter(false)}>결과 보기</button>
          </Card>
        </aside>
        <section className="lg:col-span-9">
          <button className="btn btn-secondary mb-4 w-full lg:hidden" onClick={() => setMobileFilter(true)}><SlidersHorizontal size={16} />필터 열기</button>
          {tab === 'trades' ? <Trades params={params} setPage={(p) => set({ page: p })} /> : (
            <Async q={list} loading={<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-80" />)}</div>}>
              {(d) => (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[14px] text-slate-600">등록 매물 <b className="num text-slate-900">{d.total.toLocaleString()}</b>건</p>
                      <DataMeta meta={d.meta} className="mt-1" />
                    </div>
                    <select className="input h-10! w-auto" value={f.sort || 'recent'} onChange={(e) => set({ sort: e.target.value })} aria-label="정렬">
                      {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <p className="caption mb-4 rounded-xl bg-brand-50 px-3 py-2 text-brand-800!">
                    카드의 큰 가격은 중개업체·판매자가 등록한 <b>호가</b>이며, ‘최근 실거래가’는 국토교통부 신고 기준 실제 계약 가격입니다. AI 분석 가격은 통계적 추정치입니다.
                  </p>
                  {d.items.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{d.items.map((p) => <PropertyCard key={p.id} item={p} />)}</div>
                  ) : <Empty title="조건에 맞는 매물이 없습니다.">가격·면적 조건을 넓히거나 다른 지역을 선택해 보세요.</Empty>}
                  <Pagination page={d.page} pages={d.pages} onChange={(p) => { set({ page: p }); window.scrollTo({ top: 0 }) }} />
                </>
              )}
            </Async>
          )}
        </section>
      </div>
    </>
  )
}
