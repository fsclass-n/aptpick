import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Building2, List, Map as MapIcon, X } from 'lucide-react'
import MapView from '../components/MapView'
import { RegionSelect } from '../components/SearchForm'
import { Badge, Segmented, Spinner } from '../components/ui'
import FavoriteButton from '../components/FavoriteButton'
import { useApi } from '../hooks/useApi'
import useDebounce from '../hooks/useDebounce'
import { DEAL_LABEL, DEAL_TYPES, INFRA } from '../utils/config'
import { eok, num, won } from '../utils/format'

const CLUSTER_ZOOM = 12
const tierColor = (ppm2) => (!ppm2 ? '#94a3b8' : ppm2 < 800 ? '#0d9488' : ppm2 < 1300 ? '#3563e3' : ppm2 < 2000 ? '#1a3da3' : '#6d28d9')
const LEGEND = [['~800', '#0d9488'], ['~1,300', '#3563e3'], ['~2,000', '#1a3da3'], ['2,000~', '#6d28d9']]

export default function MapExplore() {
  const [sp, setSp] = useSearchParams()
  const regions = useApi('/api/regions')
  const [bounds, setBounds] = useState(null)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('map')
  const [layers, setLayers] = useState({ subway: true, school: true, mart: false, hospital: false, park: false, bus: false })
  const [focus, setFocus] = useState(null)
  const dealType = sp.get('deal_type') || ''
  const b = useDebounce(bounds, 300)
  const startRegion = (regions.data || []).find((r) => r.code === sp.get('region'))
  const start = startRegion ? [startRegion.lat, startRegion.lng] : [37.5145, 127.1059]
  const startCode = startRegion?.code
  useEffect(() => { if (startCode) setFocus({ center: start, zoom: 14 }) }, [startCode]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = useApi(b ? '/api/apartments/map' : null, b && { sw_lat: b.sw[0], sw_lng: b.sw[1], ne_lat: b.ne[0], ne_lng: b.ne[1], deal_type: dealType }, { placeholderData: (p) => p })
  const infraOn = Object.entries(layers).filter(([, v]) => v).map(([k]) => k)
  const infraQ = useApi(b && b.zoom >= 14 && infraOn.length ? '/api/infrastructure' : null, b && { lat: b.center[0].toFixed(3), lng: b.center[1].toFixed(3), radius: 2500 })
  const items = q.data?.items || []

  const markers = useMemo(() => {
    if (!b) return []
    if (b.zoom <= CLUSTER_ZOOM) {
      const groups = {}
      items.forEach((c) => { (groups[c.region] ||= []).push(c) })
      return Object.entries(groups).map(([region, list]) => {
        const priced = list.filter((c) => c.recent)
        const avg = priced.length ? priced.reduce((s, c) => s + c.recent.ppm2, 0) / priced.length : null
        return { id: region, kind: 'cluster', lat: list.reduce((s, c) => s + c.lat, 0) / list.length, lng: list.reduce((s, c) => s + c.lng, 0) / list.length,
          label: region.split(' ').slice(-1)[0], sub: `${list.length}개 단지${avg ? ` · 평 ${num(avg * 3.3058)}만` : ''}` }
      })
    }
    return items.map((c) => ({ id: c.id, kind: 'apt', lat: c.lat, lng: c.lng, color: tierColor(c.recent?.ppm2), active: c.id === selected,
      label: c.recent ? eok(c.recent.price) : c.name.slice(0, 6), sub: c.recent ? `${Math.round(c.recent.area)}㎡` : '거래 없음' }))
  }, [items, b, selected])
  const infra = useMemo(() => (infraQ.data?.items || []).filter((p) => layers[p.category]), [infraQ.data, layers])
  const current = items.find((c) => c.id === selected)
  const onBounds = useCallback((v) => setBounds(v), [])
  const pick = (c) => { setSelected(c.id); setFocus({ center: [c.lat, c.lng], zoom: Math.max(15, b?.zoom || 15) }); setView('map') }

  return (
    <div className="flex h-[calc(100dvh-64px)] flex-col lg:flex-row">
      <aside className={`flex min-h-0 flex-col border-r border-slate-200 bg-white lg:w-[380px] ${view === 'list' ? 'flex-1' : 'hidden lg:flex'}`}>
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex gap-2">
            <RegionSelect className="input h-10!" value={sp.get('region') || ''} all="지역 이동" onChange={(code) => {
              const r = (regions.data || []).find((x) => x.code === code)
              setSp({ ...Object.fromEntries(sp), region: code })
              if (r) setFocus({ center: [r.lat, r.lng], zoom: 14 })
            }} />
            <select className="input h-10! w-28" value={dealType} onChange={(e) => setSp({ ...Object.fromEntries(sp), deal_type: e.target.value })} aria-label="거래 유형">
              <option value="">전체</option>{DEAL_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label} 매물</option>)}
            </select>
          </div>
          <p className="caption">지도 영역 내 단지 <b className="num text-slate-700">{items.length}</b>곳 {b && b.zoom <= CLUSTER_ZOOM && '· 확대하면 단지별 가격이 표시됩니다'}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {q.isLoading && <Spinner />}
          {items.map((c) => (
            <button key={c.id} onClick={() => pick(c)} className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${c.id === selected ? 'bg-brand-50' : ''}`}>
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: tierColor(c.recent?.ppm2) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-800">{c.name}</span>
                <span className="caption block">{c.region} · {c.build_year}년 · {c.households?.toLocaleString()}세대</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(c.listings).map(([dt, v]) => <Badge key={dt} tone={dt === 'sale' ? 'brand' : 'mint'}>{DEAL_LABEL[dt]} {v.count} · {eok(v.min_price)}~</Badge>)}
                </span>
              </span>
              <span className="num shrink-0 text-right text-[13px]">
                <b className="block text-[15px] text-slate-900">{c.recent ? eok(c.recent.price) : '-'}</b>
                <span className="caption">실거래 평균</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className={`relative min-h-0 flex-1 ${view === 'map' ? '' : 'hidden lg:block'}`}>
        <MapView className="h-full w-full" center={start} zoom={14} markers={markers} infra={infra} focus={focus}
          onBoundsChange={onBounds} onMarkerClick={(id) => setSelected(id)} />
        <div className="absolute top-3 right-3 z-[600] flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-1.5">
          {Object.entries(INFRA).filter(([k]) => k in layers).map(([k, v]) => (
            <button key={k} onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
              className={`chip border shadow-sm ${layers[k] ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-600'}`} style={layers[k] ? { background: v.color } : undefined}>
              {v.label}
            </button>
          ))}
        </div>
        {b && b.zoom < 14 && infraOn.length > 0 && <p className="absolute top-12 right-3 z-[600] rounded-md bg-white/90 px-2 py-1 text-[11px] text-slate-500 shadow-sm">생활 인프라는 더 확대하면 표시됩니다</p>}
        <div className="absolute bottom-6 left-3 z-[600] rounded-xl bg-white/95 px-3 py-2 text-[11px] shadow-sm">
          <p className="mb-1 font-semibold text-slate-600">㎡당 실거래가 (만원)</p>
          <div className="flex gap-2">{LEGEND.map(([l, c]) => <span key={l} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>)}</div>
        </div>
        {current && (
          <div className="absolute inset-x-3 bottom-20 z-[700] mx-auto max-w-md animate-fade-up rounded-2xl bg-white p-4 shadow-float lg:bottom-6 lg:left-auto lg:right-3 lg:mx-0 lg:w-[360px]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="caption">{current.region}</p>
                <h3 className="truncate font-display text-[18px] font-bold">{current.name}</h3>
                <p className="caption"><Building2 size={12} className="mr-1 inline" />{current.build_year}년 준공 · {current.households?.toLocaleString()}세대 {current.source === 'sample' && '· 샘플'}</p>
              </div>
              <div className="flex gap-1">
                <FavoriteButton complexId={current.id} />
                <button className="btn btn-ghost h-9 w-9 px-0" onClick={() => setSelected(null)} aria-label="닫기"><X size={16} /></button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded-xl bg-slate-50 p-2.5"><p className="caption">최근 1년 실거래 평균</p><p className="num font-bold">{current.recent ? `${won(current.recent.price)} (${Math.round(current.recent.area)}㎡)` : '-'}</p></div>
              <div className="rounded-xl bg-slate-50 p-2.5"><p className="caption">등록 매물</p><p className="num font-bold">{current.listing_count}건</p></div>
            </div>
            <Link to={`/apartments/${current.id}`} className="btn btn-primary mt-3 w-full">단지 상세 · AI 분석 보기<ArrowRight size={16} /></Link>
          </div>
        )}
        {!current && !q.isLoading && b && !items.length && (
          <div className="absolute inset-x-0 top-16 z-[600] mx-auto w-fit rounded-xl bg-white px-4 py-2 text-[13px] text-slate-500 shadow">이 영역에는 등록된 단지 데이터가 없습니다.</div>
        )}
      </div>

      <div className="fixed bottom-5 left-1/2 z-[800] -translate-x-1/2 lg:hidden">
        <Segmented value={view} onChange={setView} options={[{ value: 'map', label: <span className="flex items-center gap-1"><MapIcon size={14} />지도</span> }, { value: 'list', label: <span className="flex items-center gap-1"><List size={14} />목록</span> }]} />
      </div>
    </div>
  )
}
