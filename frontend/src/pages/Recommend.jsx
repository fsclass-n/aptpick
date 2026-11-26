import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Brain, CheckCircle2, Home as HomeIcon, Sparkles, TrendingUp, TriangleAlert } from 'lucide-react'
import { api } from '../api/client'
import AptVisual from '../components/AptVisual'
import FavoriteButton from '../components/FavoriteButton'
import { Badge, Card, DataMeta, Empty, ErrorBox, Field, PageHeader, ScoreBar, Segmented, Skeleton } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../hooks/useApi'
import { DEAL_LABEL, DEAL_TYPES } from '../utils/config'
import { dealPrice, eok, won } from '../utils/format'

const DEFAULT = { region_codes: [], deal_type: 'sale', budget_min: '', budget_max: 150000, monthly_max: '', area_min: 59, area_max: '', rooms_min: '', build_year_min: '',
  transport_weight: 3, school_weight: 3, infra_weight: 3, purpose: 'residence' }
const COMPONENT_LABEL = { budget: '예산 적합도', region: '지역 적합도', transport: '교통 접근성', school: '학군', infra: '생활 인프라', price: '가격 경쟁력', momentum: '시세 흐름', liquidity: '거래 활발도', stability: '가격 안정성' }
const STEPS = ['조건 수집', '매물 필터링', '예산·지역 적합도', '입지·인프라 분석', '가격 경쟁력', '선호 가중치 적용', '추천 점수 산출', '최종 추천']
const num = (v) => (v === '' || v === null ? null : Number(v))

function Weight({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="label flex justify-between"><span>{label}</span><span className="num text-brand-600">{['', '낮음', '조금', '보통', '중요', '매우 중요'][value]}</span></span>
      <input type="range" min="1" max="5" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand-600" />
    </label>
  )
}

function ResultCard({ r, rank }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-12">
        <div className="relative md:col-span-3">
          <AptVisual id={r.complex_id} className="h-36 md:h-full" />
          <span className="absolute top-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 font-display font-extrabold text-white">{rank}</span>
        </div>
        <div className="p-5 md:col-span-9">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5"><Badge tone="brand">{DEAL_LABEL[r.deal_type]}</Badge>{r.source === 'sample' && <Badge tone="warn">샘플</Badge>}</div>
              <Link to={`/apartments/${r.complex_id}?type=${r.apartment_id}`} className="mt-1 block truncate font-display text-[19px] font-bold hover:text-brand-600">{r.complex_name}</Link>
              <p className="caption">{r.region} · {r.type_name} {r.area}㎡ · 방 {r.rooms} · {r.floor}층 · {r.build_year}년</p>
            </div>
            <div className="text-right">
              <p className="caption">추천 점수</p>
              <p className="num font-display text-[30px] leading-none font-extrabold text-pick">{Math.round(r.score)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span><span className="caption mr-1">호가</span><b className="num text-[18px]">{dealPrice(r)}</b></span>
            {r.fair_price && <span className="caption">{r.deal_type === 'sale' ? 'AI 추정 적정가' : '최근 전세 시세'} <b className="num text-slate-700">{won(r.fair_price)}</b></span>}
            <FavoriteButton complexId={r.complex_id} propertyId={r.property_id} className="ml-auto" />
          </div>
          <div className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-3">
            {Object.entries(r.components).filter(([k]) => k !== 'momentum' || r.components.momentum !== null).slice(0, 9).map(([k, v]) => (
              <ScoreBar key={k} label={COMPONENT_LABEL[k]} value={v} tone={k === 'price' ? 'mint' : k === 'budget' || k === 'region' ? 'brand' : 'pick'} />
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-pick-soft p-3 text-[13px]">
              <p className="mb-1 flex items-center gap-1 font-semibold text-pick"><CheckCircle2 size={14} />추천 이유</p>
              <ul className="space-y-0.5 text-slate-700">{r.reasons.map((x) => <li key={x}>· {x}</li>)}</ul>
            </div>
            <div className="rounded-xl bg-warn-soft p-3 text-[13px]">
              <p className="mb-1 flex items-center gap-1 font-semibold text-warn"><TriangleAlert size={14} />주의 사항</p>
              <ul className="space-y-0.5 text-slate-700">{r.cautions.length ? r.cautions.map((x) => <li key={x}>· {x}</li>) : <li>특이 사항 없음</li>}</ul>
            </div>
          </div>
          {r.similar_trades?.length > 0 && (
            <p className="caption mt-3">유사 거래(동일 평형 최근 실거래): {r.similar_trades.map((t) => `${eok(t.price)}(${t.deal_date.slice(2, 7)}, ${t.floor}층)`).join(' · ')}</p>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function Recommend() {
  const { user } = useAuth()
  const pref = useApi(user?.role === 'user' ? '/api/me/preferences' : null)
  const regions = useApi('/api/regions')
  const [f, setF] = useState(DEFAULT)
  const [save, setSave] = useState(false)
  const m = useMutation({ mutationFn: (body) => api.post('/api/ai/recommend', body) })
  useEffect(() => {
    if (pref.data) setF((s) => ({ ...s, ...Object.fromEntries(Object.entries(pref.data).filter(([k, v]) => k in DEFAULT && v !== null)) }))
  }, [pref.data])
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }))
  const toggleRegion = (code) => setF((s) => ({ ...s, region_codes: s.region_codes.includes(code) ? s.region_codes.filter((c) => c !== code) : [...s.region_codes, code].slice(0, 5) }))
  const submit = (e) => {
    e?.preventDefault()
    m.mutate({ ...f, budget_min: num(f.budget_min), budget_max: num(f.budget_max), monthly_max: num(f.monthly_max), area_min: num(f.area_min), area_max: num(f.area_max),
      rooms_min: num(f.rooms_min), build_year_min: num(f.build_year_min), top_k: 10, save_preference: save })
  }
  const withData = (regions.data || []).filter((r) => r.complexes > 0)

  return (
    <>
      <PageHeader eyebrow="AI Recommendation" title="AI 맞춤형 매물 추천" desc="예산·지역·면적과 교통·학군·생활 인프라 중요도, 실거주/투자 목적을 반영해 매물별 추천 점수와 근거를 제공합니다." />
      <div className="container-x grid gap-6 py-6 lg:grid-cols-12">
        <form onSubmit={submit} className="lg:col-span-4">
          <Card className="space-y-4 p-5 lg:sticky lg:top-24">
            <div className="flex items-center justify-between"><h2 className="h3">내 조건</h2>{pref.data && <Badge tone="mint">저장된 선호 조건 적용</Badge>}</div>
            <Field label="목적">
              <Segmented value={f.purpose} onChange={set('purpose')} options={[{ value: 'residence', label: <span className="flex items-center gap-1"><HomeIcon size={14} />실거주</span> }, { value: 'investment', label: <span className="flex items-center gap-1"><TrendingUp size={14} />투자</span> }]} />
            </Field>
            <Field label="거래 유형">
              <div className="grid grid-cols-3 gap-1.5">{DEAL_TYPES.map((d) => <button type="button" key={d.value} onClick={() => set('deal_type')(d.value)} className={`btn btn-sm ${f.deal_type === d.value ? 'btn-primary' : 'btn-secondary'}`}>{d.label}</button>)}</div>
            </Field>
            <Field label={`희망 지역 (최대 5곳 · ${f.region_codes.length ? `${f.region_codes.length}곳 선택` : '전체'})`}>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {withData.map((r) => (
                  <button type="button" key={r.code} onClick={() => toggleRegion(r.code)}
                    className={`chip ${f.region_codes.includes(r.code) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{r.sigungu}</button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={`최소 ${f.deal_type === 'sale' ? '예산' : '보증금'} (만원)`}><input className="input" type="number" min="0" value={f.budget_min ?? ''} onChange={set('budget_min')} /></Field>
              <Field label={`최대 ${f.deal_type === 'sale' ? '예산' : '보증금'} (만원)`} hint={f.budget_max ? won(Number(f.budget_max)) : ''}><input className="input" type="number" min="0" value={f.budget_max ?? ''} onChange={set('budget_max')} /></Field>
            </div>
            {f.deal_type === 'monthly' && <Field label="최대 월세 (만원)"><input className="input" type="number" min="0" value={f.monthly_max ?? ''} onChange={set('monthly_max')} /></Field>}
            <div className="grid grid-cols-3 gap-2">
              <Field label="최소 ㎡"><input className="input" type="number" min="0" value={f.area_min ?? ''} onChange={set('area_min')} /></Field>
              <Field label="최대 ㎡"><input className="input" type="number" min="0" value={f.area_max ?? ''} onChange={set('area_max')} /></Field>
              <Field label="최소 방"><input className="input" type="number" min="0" max="6" value={f.rooms_min ?? ''} onChange={set('rooms_min')} /></Field>
            </div>
            <Field label="준공 연도 (이후)"><input className="input" type="number" min="1970" max="2030" placeholder="예: 2005" value={f.build_year_min ?? ''} onChange={set('build_year_min')} /></Field>
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <Weight label="교통 접근성" value={f.transport_weight} onChange={set('transport_weight')} />
              <Weight label="학군 선호" value={f.school_weight} onChange={set('school_weight')} />
              <Weight label="생활 편의시설" value={f.infra_weight} onChange={set('infra_weight')} />
            </div>
            {user?.role === 'user' && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-brand-600" />이 조건을 내 선호 조건으로 저장</label>}
            <button className="btn btn-primary w-full" disabled={m.isPending}><Sparkles size={16} />{m.isPending ? '분석 중…' : 'AI 추천 받기'}</button>
          </Card>
        </form>
        <section className="space-y-4 lg:col-span-8">
          {!m.data && !m.isPending && !m.isError && (
            <Card className="p-6">
              <h2 className="h3 mb-4 flex items-center gap-2"><Brain size={18} className="text-brand-600" />추천 알고리즘</h2>
              <ol className="grid gap-2 sm:grid-cols-2">
                {STEPS.map((s, i) => <li key={s} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[14px]"><span className="num flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-[13px] font-bold text-white">{i + 1}</span>{s}</li>)}
              </ol>
              <p className="caption mt-4">실거주는 교통·학군·인프라와 가격 경쟁력을, 투자는 가격 경쟁력·거래 활발도·안정성을 더 중시합니다. 상승률은 상한을 둔 일부 가중치로만 반영해 단순 상승률 순위가 되지 않도록 설계했습니다.</p>
              <button className="btn btn-mint mt-4" onClick={submit}>기본 조건으로 바로 추천받기</button>
            </Card>
          )}
          {m.isPending && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-60" />)}
          {m.isError && <ErrorBox error={m.error} onRetry={submit} />}
          {m.data && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15px]">후보 <b className="num">{m.data.candidates}</b>건 중 상위 <b className="num">{m.data.results.length}</b>건 · <Badge tone={m.data.purpose === 'residence' ? 'mint' : 'brand'}>{m.data.purpose === 'residence' ? '실거주' : '투자'} 가중치</Badge></p>
                <DataMeta meta={m.data.meta} />
              </div>
              {m.data.results.length ? m.data.results.map((r, i) => <ResultCard key={r.property_id} r={r} rank={i + 1} />)
                : <Card><Empty title="조건에 맞는 매물이 없습니다.">예산을 늘리거나 지역·면적 조건을 완화해 보세요.</Empty></Card>}
              <p className="caption">{m.data.notice} · 알고리즘 {m.data.algorithm}</p>
            </>
          )}
        </section>
      </div>
    </>
  )
}
