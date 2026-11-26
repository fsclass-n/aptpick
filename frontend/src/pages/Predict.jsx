import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Brain, Info, ShieldAlert, Target } from 'lucide-react'
import { BarsChart, COLORS, TrendChart } from '../components/Charts'
import { RegionSelect } from '../components/SearchForm'
import { Async, Badge, Card, DataMeta, Empty, Field, PageHeader, SampleBadge, Skeleton, Stat } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { date, eok, num, pct, won } from '../utils/format'
import { IMG } from '../utils/images'

const FEATURE_LABEL = { area: '전용면적', floor: '층', age: '경과연수', log_households: '세대수', lat: '위도', lng: '경도', d_subway: '지하철 거리', d_school: '학교 거리',
  n_bus: '버스정류장 수', n_mart: '마트 수', n_hospital: '병원 수', n_park: '공원 수', region_index: '지역 시세지수', complex_premium: '단지 프리미엄', t: '시점' }

function Picker({ current }) {
  const navigate = useNavigate()
  const [region, setRegion] = useState(current?.region_code || '11710')
  const list = useApi('/api/apartments', { region })
  const [complexId, setComplexId] = useState(current?.complex_id || '')
  useEffect(() => {
    if (current) { setRegion(current.region_code); setComplexId(current.complex_id) }
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const complex = (list.data || []).find((c) => c.id === Number(complexId))
  return (
    <Card className="p-5">
      <h2 className="h3 mb-3 flex items-center gap-2"><Target size={18} />분석 대상 선택</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="지역"><RegionSelect value={region} onChange={(v) => { setRegion(v); setComplexId('') }} all="지역 선택" /></Field>
        <Field label="단지">
          <select className="input" value={complexId} onChange={(e) => setComplexId(e.target.value)}>
            <option value="">단지 선택</option>{(list.data || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.build_year})</option>)}
          </select>
        </Field>
        <Field label="평형">
          <select className="input" value={current?.complex_id === Number(complexId) ? current.id : ''} onChange={(e) => e.target.value && navigate(`/predict/${e.target.value}`)} disabled={!complex}>
            <option value="">평형 선택</option>{complex?.types.map((t) => <option key={t.id} value={t.id}>{t.type_name} · {t.area}㎡</option>)}
          </select>
        </Field>
      </div>
    </Card>
  )
}

export default function Predict() {
  const { apartmentId } = useParams()
  const [floor, setFloor] = useState('')
  const q = useApi(apartmentId ? `/api/ai/predict/${apartmentId}` : null, { floor })
  const model = useApi('/api/ai/model')
  const d = q.data
  return (
    <>
      <PageHeader eyebrow="AI Price Estimation" image={IMG.keys} title="AI 아파트 가격 예측" desc="과거 실거래 데이터를 학습한 머신러닝 모델이 적정가와 예측 범위를 추정합니다. 결과는 미래 시세를 보장하지 않는 참고용 통계 추정치입니다." />
      <div className="container-x space-y-6 py-6">
        <Picker current={d?.apartment} />
        {!apartmentId && <Card><Empty icon={Brain} title="지역 · 단지 · 평형을 선택하면 AI 추정 결과가 표시됩니다." /></Card>}
        {apartmentId && q.isLoading && <Skeleton className="h-96" />}
        {apartmentId && (
          <Async q={q} loading={null}>
            {() => !d.estimate ? <Card className="p-8 text-center text-slate-500">{d.model?.reason || 'AI 모델이 준비되지 않았습니다.'}</Card> : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link to={`/apartments/${d.apartment.complex_id}?type=${d.apartment.id}`} className="h2 hover:text-brand-600">{d.apartment.complex_name} · {d.apartment.type_name}</Link>
                    <p className="caption mt-1">{d.apartment.region} · 전용 {d.apartment.area}㎡ · {d.apartment.build_year}년 준공 · 최고 {d.apartment.max_floor}층</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.apartment.source === 'sample' && <SampleBadge />}
                    <label className="caption flex items-center gap-2">층 지정
                      <input className="input h-9! w-20" type="number" min="1" max={d.apartment.max_floor || 60} placeholder={String(d.estimate.floor)} value={floor} onChange={(e) => setFloor(e.target.value)} />
                    </label>
                  </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-12">
                  <Card className="relative overflow-hidden bg-gradient-to-br from-brand-700 to-navy-900 p-6 text-white lg:col-span-5">
                    <p className="text-[13px] font-semibold text-brand-200">AI 추정 적정 매매가 · {d.estimate.floor}층 기준</p>
                    <p className="num mt-2 font-display text-[40px] leading-none font-extrabold">{won(d.estimate.price)}</p>
                    <p className="num mt-2 text-[15px] text-brand-100">예측 범위 {won(d.estimate.lower)} ~ {won(d.estimate.upper)} <span className="text-brand-300">(80% 구간)</span></p>
                    <div className="mt-5 h-2 rounded-full bg-white/15">
                      <div className="relative h-2 rounded-full bg-mint-400" style={{ marginLeft: '10%', width: '80%' }}>
                        <span className="absolute -top-1 h-4 w-1 rounded bg-white" style={{ left: `${((d.estimate.price - d.estimate.lower) / Math.max(1, d.estimate.upper - d.estimate.lower)) * 100}%` }} />
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
                      <div className="rounded-xl bg-white/10 p-3"><p className="text-brand-200">신뢰도</p><p className="text-[18px] font-bold">{d.estimate.confidence}</p></div>
                      <div className="rounded-xl bg-white/10 p-3"><p className="text-brand-200">3개월 추세 전망</p><p className="num text-[15px] font-bold">{eok(d.estimate.outlook.lower)} ~ {eok(d.estimate.outlook.upper)}</p></div>
                    </div>
                    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-brand-100">
                      <dt>데이터 기준일</dt><dd className="num text-right">{date(d.estimate.data_as_of)}</dd>
                      <dt>예측 대상 기간</dt><dd className="text-right">{d.estimate.target_period}</dd>
                      <dt>모델 버전</dt><dd className="truncate text-right">{d.estimate.model_version}</dd>
                    </dl>
                  </Card>
                  <div className="grid grid-cols-2 gap-3 lg:col-span-7">
                    {[['3m', '최근 3개월'], ['6m', '최근 6개월'], ['12m', '최근 1년']].map(([k, l]) => (
                      <Stat key={k} label={`${l} 평균 실거래`} value={won(d.history[k]?.avg_price)} trend={d.history[k]?.change_pct ?? undefined} sub={`${d.history[k]?.count ?? 0}건 · 직전 동기간 대비`} />
                    ))}
                    <Stat label="최근 실거래" value={won(d.recent_trades[0]?.price)} sub={d.recent_trades[0] ? `${date(d.recent_trades[0].deal_date)} · ${d.recent_trades[0].floor}층` : '거래 없음'} />
                    <Card className="col-span-2 p-4 text-[13px] text-slate-600">
                      <p className="mb-1 flex items-center gap-1 font-semibold text-slate-800"><ShieldAlert size={15} className="text-warn" />예측의 한계</p>
                      <ul className="list-disc space-y-0.5 pl-4">{(d.model.limitations || []).map((l) => <li key={l}>{l}</li>)}</ul>
                    </Card>
                  </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="p-5">
                    <h3 className="h3 mb-3">층수에 따른 추정가 <span className="caption">(다른 조건 고정)</span></h3>
                    <BarsChart data={d.effects.floor.map((x) => ({ ...x, label: `${x.floor}층` }))} x="label" y="price" label="추정가" format={(v) => `${(v / 10000).toFixed(1)}억`} color={COLORS.brand} />
                  </Card>
                  <Card className="p-5">
                    <h3 className="h3 mb-3">경과연수(준공 연도)에 따른 추정가</h3>
                    <TrendChart data={d.effects.age.map((x) => ({ ...x, period: `${x.age}년차` }))} x="period" xFormat={(v) => v} lines={[{ key: 'price', label: '추정가', color: COLORS.mint }]} yFormat={(v) => `${(v / 10000).toFixed(1)}억`} formatters={{ price: won }} />
                  </Card>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="overflow-x-auto p-5">
                    <h3 className="h3 mb-3">동일 단지 평형별 추정가</h3>
                    <table className="table-base"><thead><tr><th>평형</th><th className="text-right">전용</th><th className="text-right">추정가</th><th className="text-right">㎡당</th></tr></thead>
                      <tbody>{d.by_area.map((a) => <tr key={a.apartment_id} className={a.apartment_id === d.apartment.id ? 'bg-brand-50/60' : ''}><td><Link className="font-semibold hover:text-brand-600" to={`/predict/${a.apartment_id}`}>{a.type_name}</Link></td><td className="num text-right">{a.area}㎡</td><td className="num text-right font-bold">{won(a.price)}</td><td className="num text-right">{num(a.ppm2, 1)}만</td></tr>)}</tbody></table>
                  </Card>
                  <Card className="overflow-x-auto p-5">
                    <h3 className="h3 mb-3">유사 단지 거래 비교 <span className="caption">(같은 지역 · 면적 ±10% · 6개월)</span></h3>
                    <table className="table-base"><thead><tr><th>단지</th><th className="text-right">준공</th><th className="text-right">평균가</th><th className="text-right">거래</th></tr></thead>
                      <tbody>{d.similar.map((s) => <tr key={s.complex_id}><td><Link className="font-semibold hover:text-brand-600" to={`/apartments/${s.complex_id}`}>{s.name}</Link></td><td className="num text-right">{s.build_year}</td><td className="num text-right">{won(s.avg_price)}</td><td className="num text-right">{s.count}</td></tr>)}</tbody></table>
                    {!d.similar.length && <p className="caption">비교 가능한 유사 거래가 없습니다.</p>}
                  </Card>
                </div>
                <DataMeta meta={d.meta} />
                <p className="caption flex items-center gap-1"><Info size={13} />{d.disclaimer}</p>
              </>
            )}
          </Async>
        )}

        <Async q={model}>
          {(m) => !m.ready ? <Card className="p-5 text-slate-500">{m.reason}</Card> : (
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="h3">모델 성능 지표</h2>
                <div className="flex gap-1.5"><Badge tone="brand">{m.version}</Badge><Badge>학습 {num(m.trained_rows)}건</Badge></div>
              </div>
              <p className="caption mb-4">{m.algorithm} · 검증: 시간 기준 holdout {m.metrics.valid_period} ({m.metrics.valid_rows}건) · 데이터 기준일 {date(m.data_as_of)}</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="MAE (평균 절대 오차)" value={won(m.metrics.mae)} sub={`기준선 ${won(m.metrics.baseline?.mae)}`} />
                <Stat label="RMSE" value={won(m.metrics.rmse)} sub={`기준선 ${won(m.metrics.baseline?.rmse)}`} />
                <Stat label="MAPE" value={`${m.metrics.mape}%`} sub={`기준선 ${m.metrics.baseline?.mape}%`} />
                <Stat label="R²" value={m.metrics.r2} />
                <Stat label="80% 구간 포함률" value={pct(m.metrics.interval_coverage * 100, 1).replace('+', '')} sub={`보정 전 ${(m.metrics.interval_coverage_raw * 100).toFixed(1)}% · 배율 ×${m.metrics.interval_scale}`} />
              </div>
              <h3 className="mt-6 mb-2 font-display font-bold">피처 중요도 <span className="caption">(순열 중요도)</span></h3>
              <BarsChart data={m.feature_importance.slice(0, 10).map((f) => ({ name: FEATURE_LABEL[f.feature] || f.feature, v: +(f.importance * 1000).toFixed(2) }))} x="name" y="v" label="중요도(×1000)" layout="vertical" height={300} color={COLORS.mint} />
              <p className="caption mt-2">지표는 가상 샘플 데이터 기준일 수 있으며 실데이터 전환 후 재학습 시 갱신됩니다.</p>
            </Card>
          )}
        </Async>
      </div>
    </>
  )
}
