import { useState } from 'react'
import { Search } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { DEAL_TYPES } from '../utils/config'

export const PRICE_OPTIONS = [0, 10000, 20000, 30000, 50000, 70000, 100000, 150000, 200000, 300000, 500000]
export const AREA_OPTIONS = [[0, '전체'], [40, '40㎡~'], [59, '59㎡~'], [84, '84㎡~'], [102, '102㎡~'], [135, '135㎡~']]
export const YEAR_OPTIONS = [0, 2020, 2015, 2010, 2005, 2000, 1990]
const eokLabel = (v) => (v >= 10000 ? `${v / 10000}억` : `${v / 1000}천만`)

export function RegionSelect({ value, onChange, className = 'input', all = '전체 지역', onlyData = true }) {
  const regions = useApi('/api/regions')
  const groups = {}
  ;(regions.data || []).filter((r) => !onlyData || r.complexes > 0).forEach((r) => { (groups[r.sido] ||= []).push(r) })
  return (
    <select className={className} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label="지역">
      <option value="">{all}</option>
      {Object.entries(groups).map(([sido, list]) => (
        <optgroup key={sido} label={sido}>{list.map((r) => <option key={r.code} value={r.code}>{r.sigungu}</option>)}</optgroup>
      ))}
    </select>
  )
}

/** 지역 · 아파트명 · 거래유형 · 가격 · 면적 · 준공연도 통합 검색 폼 */
export default function SearchForm({ initial = {}, onSubmit, variant = 'hero' }) {
  const [f, setF] = useState({ q: '', region: '', deal_type: 'sale', price_min: '', price_max: '', area_min: '', build_year_min: '', ...initial })
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }))
  const hero = variant === 'hero'
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(f) }} className={hero ? 'rounded-3xl bg-white p-4 shadow-float md:p-5' : ''}>
      <div className="mb-3 flex gap-1.5">
        {DEAL_TYPES.map((d) => (
          <button type="button" key={d.value} onClick={() => set('deal_type')(d.value)}
            className={`chip px-3.5! py-1.5! text-[14px]! ${f.deal_type === d.value ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{d.label}</button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-12">
        <div className="relative md:col-span-5">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="아파트명 · 지역명 (예: 송파, 한빛마을)" value={f.q} onChange={set('q')} aria-label="아파트명 또는 지역" />
        </div>
        <div className="md:col-span-3"><RegionSelect value={f.region} onChange={set('region')} /></div>
        <div className="grid grid-cols-2 gap-2 md:col-span-4">
          <select className="input" value={f.price_min} onChange={set('price_min')} aria-label="최소 가격">
            <option value="">최소 가격</option>
            {PRICE_OPTIONS.slice(1).map((v) => <option key={v} value={v}>{eokLabel(v)} 이상</option>)}
          </select>
          <select className="input" value={f.price_max} onChange={set('price_max')} aria-label="최대 가격">
            <option value="">최대 가격</option>
            {PRICE_OPTIONS.slice(1).map((v) => <option key={v} value={v}>{eokLabel(v)} 이하</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 md:col-span-8">
          <select className="input" value={f.area_min} onChange={set('area_min')} aria-label="면적">
            {AREA_OPTIONS.map(([v, l]) => <option key={v} value={v || ''}>{v ? `전용 ${l}` : '면적 전체'}</option>)}
          </select>
          <select className="input" value={f.build_year_min} onChange={set('build_year_min')} aria-label="준공 연도">
            {YEAR_OPTIONS.map((y) => <option key={y} value={y || ''}>{y ? `${y}년 이후 준공` : '준공 연도 전체'}</option>)}
          </select>
        </div>
        <button className="btn btn-accent md:col-span-4"><Search size={18} />매물 검색</button>
      </div>
    </form>
  )
}
