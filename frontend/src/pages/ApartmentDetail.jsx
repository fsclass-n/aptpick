import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BellPlus, Brain, Building2, CalendarDays, Layers, MapPin, Sparkles, TriangleAlert } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import MapView from '../components/MapView'
import AptVisual from '../components/AptVisual'
import FavoriteButton from '../components/FavoriteButton'
import PropertyCard from '../components/PropertyCard'
import { COLORS, TrendChart } from '../components/Charts'
import { Async, Badge, Card, DataMeta, Empty, Field, Modal, SampleBadge, ScoreBar, Segmented, Skeleton } from '../components/ui'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useApi } from '../hooks/useApi'
import { DEAL_LABEL, DEAL_TYPES, INFRA, READ_ONLY_MESSAGE } from '../utils/config'
import { date, eok, num, ratio, walk, won } from '../utils/format'

function AlertModal({ open, onClose, data, typeId }) {
  const [form, setForm] = useState({ apartment_id: typeId, deal_type: 'sale', condition: 'below', target_price: '' })
  const toast = useToast()
  const qc = useQueryClient()
  const submit = async (e) => {
    e.preventDefault()
    try {
      const res = await api.post('/api/alerts', { complex_id: data.complex.id, ...form, apartment_id: form.apartment_id ? Number(form.apartment_id) : null, target_price: Number(form.target_price) })
      toast(res.triggered ? '알림을 등록했습니다. 현재 호가가 이미 조건을 충족해 알림이 발송되었습니다.' : '가격 알림을 등록했습니다. 조건 충족 시 실시간으로 알려드립니다.')
      qc.invalidateQueries({ queryKey: ['/api/notifications'] })
      qc.invalidateQueries({ queryKey: ['/api/alerts'] })
      onClose()
    } catch (err) { toast(err.message, 'error') }
  }
  return (
    <Modal open={open} onClose={onClose} title="가격 알림 등록">
      <form onSubmit={submit} className="space-y-3">
        <p className="caption">등록 매물(호가)의 최저가가 목표 가격 이하(또는 최고가가 이상)가 되면 알림을 보냅니다.</p>
        <Field label="평형">
          <select className="input" value={form.apartment_id || ''} onChange={(e) => setForm({ ...form, apartment_id: e.target.value })}>
            <option value="">전체 평형</option>{data.types.map((t) => <option key={t.id} value={t.id}>{t.type_name} ({t.area}㎡)</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="거래 유형"><select className="input" value={form.deal_type} onChange={(e) => setForm({ ...form, deal_type: e.target.value })}>{DEAL_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></Field>
          <Field label="조건"><select className="input" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}><option value="below">이하로 내려가면</option><option value="above">이상으로 오르면</option></select></Field>
        </div>
        <Field label="목표 가격 (만원)" hint={form.target_price ? `= ${won(Number(form.target_price))}` : '예: 120000 = 12억'}>
          <input className="input" type="number" min="1" required value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} />
        </Field>
        <button className="btn btn-primary w-full">알림 등록</button>
      </form>
    </Modal>
  )
}

function Opinion({ type, listings }) {
  const est = type?.estimate
  const m = type?.market || {}
  const ask = listings.filter((l) => l.apartment_id === type?.id && l.deal_type === 'sale').map((l) => l.price)
  const lines = []
  if (est) lines.push(`AI 추정 적정 매매가는 ${won(est.price)} (범위 ${won(est.lower)} ~ ${won(est.upper)}, 신뢰도 ${est.confidence})입니다.`)
  if (est && ask.length) {
    const diff = (Math.min(...ask) / est.price - 1) * 100
    lines.push(`현재 최저 호가는 추정가 대비 ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%로 ${diff > 5 ? '다소 높은 편' : diff < -3 ? '낮은 편' : '추정 범위 수준'}입니다.`)
  }
  if (m.last_trade && est) lines.push(`최근 실거래(${date(m.last_trade.deal_date)}, ${m.last_trade.floor}층)는 ${won(m.last_trade.price)}입니다.`)
  if (m.jeonse_ratio) lines.push(`최근 1년 전세가율은 ${ratio(m.jeonse_ratio)}${m.jeonse_ratio > 0.7 ? '로 높아 전세 보증금 반환 위험 점검이 필요합니다.' : '입니다.'}`)
  if (est?.outlook) lines.push(`최근 6개월 지역 추세(월 ${est.outlook.monthly_trend_pct}%)를 단순 연장하면 3개월 후 ${won(est.outlook.lower)} ~ ${won(est.outlook.upper)} 범위로 추정됩니다(참고용).`)
  if (!lines.length) return <p className="caption">분석할 거래 데이터가 부족합니다.</p>
  return <ul className="space-y-1.5 text-[14px] text-slate-700">{lines.map((l) => <li key={l} className="flex gap-2"><Sparkles size={14} className="mt-1 shrink-0 text-mint-500" />{l}</li>)}</ul>
}

export default function ApartmentDetail() {
  const { id } = useParams()
  const [sp, setSp] = useSearchParams()
  const q = useApi(`/api/apartments/${id}`)
  const { user, readOnly } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [alertOpen, setAlertOpen] = useState(false)
  const [txTab, setTxTab] = useState('trade')
  const d = q.data
  const typeId = Number(sp.get('type')) || d?.types[0]?.id
  const type = d?.types.find((t) => t.id === typeId) || d?.types[0]
  const series = useMemo(() => (d && type ? d.series[type.id] || [] : []), [d, type])
  const markers = useMemo(() => (d ? [{ id: d.complex.id, kind: 'apt', lat: d.complex.lat, lng: d.complex.lng, color: '#c2653a', active: true, label: d.complex.name.slice(0, 8) }] : []), [d])
  const openAlert = () => {
    if (!user) return navigate(`/login?next=/apartments/${id}`)
    if (readOnly) return toast(READ_ONLY_MESSAGE, 'error')
    return setAlertOpen(true)
  }

  if (q.isLoading) return <div className="container-x space-y-4 py-8"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>
  return (
    <Async q={q}>
      {() => (
        <>
          <section className="border-b border-slate-200 bg-white">
            <div className="container-x grid gap-6 py-6 md:grid-cols-12 md:py-8">
              <AptVisual id={d.complex.id} floors={d.complex.max_floor} className="h-56 rounded-2xl md:col-span-4 md:h-full md:min-h-64" label="참고 이미지 · 실제 단지 사진 아님" width={1000} />
              <div className="md:col-span-8">
                <div className="flex flex-wrap gap-1.5">
                  {d.complex.source === 'sample' ? <SampleBadge /> : <Badge tone="brand">국토교통부 실거래 단지</Badge>}
                  {!d.complex.geo_precise && <Badge tone="gray">좌표: 시군구 대표 위치(근사)</Badge>}
                </div>
                <h1 className="h1 mt-2">{d.complex.name}</h1>
                <p className="mt-1 flex items-center gap-1 text-slate-500"><MapPin size={15} />{d.complex.address || d.complex.region}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
                  {[[CalendarDays, '준공', `${d.complex.build_year}년 (${d.complex.age}년차)`], [Building2, '세대수', `${num(d.complex.households)}세대`],
                    [Layers, '최고층', `${d.complex.max_floor ?? '-'}층`], [Sparkles, '㎡당 실거래', d.complex.ppm2_12m ? `${num(d.complex.ppm2_12m)}만` : '-']].map(([Icon, l, v]) => (
                    <div key={l} className="rounded-xl bg-slate-50 p-3"><p className="caption flex items-center gap-1"><Icon size={13} />{l}</p><p className="num mt-0.5 font-bold">{v}</p></div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <FavoriteButton complexId={d.complex.id} label />
                  <button className="btn btn-secondary btn-sm" onClick={openAlert}><BellPlus size={16} />가격 알림</button>
                  {type && <Link to={`/predict/${type.id}`} className="btn btn-mint btn-sm"><Brain size={16} />AI 가격 예측 상세</Link>}
                </div>
              </div>
            </div>
          </section>

          <div className="container-x grid gap-6 py-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <DataMeta meta={d.meta} />
              <Card className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="h3">평형별 시세</h2>
                  <Segmented size="sm" value={type?.id} onChange={(v) => setSp({ type: v }, { replace: true })} options={d.types.map((t) => ({ value: t.id, label: `${t.type_name}` }))} />
                </div>
                {type && (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-brand-50 p-3 sm:col-span-1"><p className="caption">AI 추정 적정가</p><p className="num font-display text-[20px] font-extrabold text-brand-700">{type.estimate ? won(type.estimate.price) : '준비 중'}</p>
                      {type.estimate && <p className="caption num">{eok(type.estimate.lower)} ~ {eok(type.estimate.upper)}</p>}</div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="caption">매매 실거래 평균 (1년)</p><p className="num text-[18px] font-bold">{won(type.market.sale_avg)}</p><p className="caption">{type.market.sale_count ?? 0}건</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="caption">전세 실거래 평균</p><p className="num text-[18px] font-bold">{won(type.market.jeonse_avg)}</p><p className="caption">전세가율 {ratio(type.market.jeonse_ratio)}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="caption">월세 평균 (보증금/월)</p><p className="num text-[18px] font-bold">{type.market.monthly_count ? `${eok(type.market.monthly_deposit_avg)} / ${type.market.monthly_rent_avg}` : '-'}</p><p className="caption">{type.market.monthly_count ?? 0}건</p></div>
                  </div>
                )}
                <div className="mt-5">
                  {series.length ? <TrendChart data={series} lines={[{ key: 'avg_price', label: '매매 실거래 평균' }, { key: 'avg_jeonse', label: '전세 실거래 평균', color: COLORS.mint }]}
                    bars={[{ key: 'count', label: '매매 거래(건)' }]} yFormat={(v) => `${(v / 10000).toFixed(1)}억`} formatters={{ avg_price: won, avg_jeonse: won, count: (v) => `${v}건` }} /> : <Empty title="이 평형의 거래 데이터가 없습니다." />}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="h3 mb-3 flex items-center gap-2"><Brain size={18} className="text-mint-500" />AI 분석 의견</h2>
                <Opinion type={type} listings={d.listings} />
                <p className="caption mt-3">※ 데이터 기반 자동 분석이며 투자 권유가 아닙니다. 모델 버전 {type?.estimate?.model_version || '-'} · 기준일 {date(type?.estimate?.data_as_of)}</p>
              </Card>

              <Card className="overflow-x-auto p-5">
                <h2 className="h3 mb-3">동일 단지 평형별 가격 비교</h2>
                <table className="table-base min-w-[560px]">
                  <thead><tr><th>평형</th><th className="text-right">전용</th><th className="text-right">방/욕실</th><th className="text-right">AI 추정가</th><th className="text-right">매매 평균(1년)</th><th className="text-right">전세 평균</th></tr></thead>
                  <tbody>{d.types.map((t) => (
                    <tr key={t.id} className={t.id === type?.id ? 'bg-brand-50/50' : ''}><td className="font-semibold">{t.type_name}</td><td className="num text-right">{t.area}㎡</td><td className="text-right">{t.rooms}/{t.bathrooms}</td>
                      <td className="num text-right font-semibold text-brand-700">{won(t.estimate?.price)}</td><td className="num text-right">{won(t.market.sale_avg)}</td><td className="num text-right">{won(t.market.jeonse_avg)}</td></tr>
                  ))}</tbody>
                </table>
              </Card>

              <Card className="overflow-x-auto p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="h3">최근 실거래 내역</h2>
                  <Segmented size="sm" value={txTab} onChange={setTxTab} options={[{ value: 'trade', label: '매매' }, { value: 'rent', label: '전월세' }]} />
                </div>
                {txTab === 'trade' ? (
                  <table className="table-base min-w-[520px]">
                    <thead><tr><th>계약일</th><th className="text-right">전용</th><th className="text-right">층</th><th className="text-right">거래금액</th><th>비고</th></tr></thead>
                    <tbody>{d.trades.filter((t) => !type || t.apartment_id === type.id).slice(0, 12).map((t) => (
                      <tr key={t.id}><td className="num">{date(t.deal_date)}</td><td className="num text-right">{t.area}㎡</td><td className="num text-right">{t.floor}</td>
                        <td className={`num text-right font-bold ${t.canceled ? 'text-slate-400 line-through' : ''}`}>{won(t.price)}</td>
                        <td>{t.canceled && <Badge>해제</Badge>} {t.dealing_type === '직거래' && <Badge tone="warn">직거래</Badge>}</td></tr>
                    ))}</tbody>
                  </table>
                ) : (
                  <table className="table-base min-w-[520px]">
                    <thead><tr><th>계약일</th><th className="text-right">전용</th><th className="text-right">층</th><th className="text-right">보증금</th><th className="text-right">월세</th><th>구분</th></tr></thead>
                    <tbody>{d.rents.filter((t) => !type || t.apartment_id === type.id).slice(0, 12).map((t) => (
                      <tr key={t.id}><td className="num">{date(t.deal_date)}</td><td className="num text-right">{t.area}㎡</td><td className="num text-right">{t.floor}</td>
                        <td className="num text-right font-bold">{won(t.deposit)}</td><td className="num text-right">{t.monthly_rent ? `${t.monthly_rent}만` : '-'}</td>
                        <td><Badge tone={t.monthly_rent ? 'navy' : 'mint'}>{t.monthly_rent ? '월세' : '전세'}</Badge> <span className="caption">{t.contract_type}</span></td></tr>
                    ))}</tbody>
                  </table>
                )}
                <p className="caption mt-2">출처: {d.complex.source === 'sample' ? 'aptpick 가상 샘플 데이터' : '국토교통부 실거래가 공개시스템'} · 실거래가는 실제 신고된 계약 가격입니다.</p>
              </Card>

              {d.anomalies.length > 0 && (
                <Card className="border-warn/30 p-5">
                  <h2 className="h3 mb-2 flex items-center gap-2"><TriangleAlert size={18} className="text-warn" />이상 거래 의심</h2>
                  <ul className="space-y-1 text-[14px]">{d.anomalies.slice(0, 5).map((a) => (
                    <li key={a.transaction_id}>{date(a.deal_date)} · {a.area}㎡ {a.floor}층 · <b>{won(a.price)}</b> (주변 거래 기준 {won(a.expected_price)} 대비 {a.deviation_pct}%) · {a.reason}</li>
                  ))}</ul>
                  <p className="caption mt-2">이상 거래는 시세 통계와 AI 학습에서 영향이 줄어들도록 처리됩니다.</p>
                </Card>
              )}

              <div>
                <h2 className="h3 mb-3">등록 매물 <span className="caption">(호가 · {d.listings.length}건)</span></h2>
                {d.listings.length ? <div className="grid gap-4 sm:grid-cols-2">{d.listings.map((p) => <PropertyCard key={p.id} item={p} compact />)}</div> : <Card><Empty title="현재 등록된 매물이 없습니다." /></Card>}
              </div>
            </div>

            <aside className="space-y-6 lg:col-span-4">
              <Card className="overflow-hidden">
                <MapView className="h-64" center={[d.complex.lat, d.complex.lng]} zoom={15} markers={markers}
                  infra={d.infrastructure.map((p) => ({ ...p, id: `i${p.id}` }))} />
              </Card>
              <Card className="space-y-3 p-5">
                <h2 className="h3">입지 점수</h2>
                {d.scores.transport === null || d.scores.transport === undefined ? <p className="caption">이 지역은 생활 인프라 데이터가 아직 없습니다.</p> : (
                  <>
                    <ScoreBar label="교통 접근성" value={d.scores.transport} />
                    <ScoreBar label="학군 (학교 접근성)" value={d.scores.school} tone="mint" />
                    <ScoreBar label="생활 인프라" value={d.scores.infra} tone="pick" />
                  </>
                )}
              </Card>
              <Card className="p-5">
                <h2 className="h3 mb-3">주변 생활 인프라</h2>
                <ul className="space-y-2 text-[14px]">
                  {d.infrastructure.slice(0, 14).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: INFRA[p.category]?.color }} />
                        <span className="caption w-12 shrink-0">{INFRA[p.category]?.label}</span><span className="truncate">{p.name}</span></span>
                      <span className="num caption shrink-0">{walk(p.distance_m)}</span>
                    </li>
                  ))}
                  {!d.infrastructure.length && <li className="caption">반경 1.5km 내 등록된 시설 정보가 없습니다.</li>}
                </ul>
              </Card>
              <Card className="p-5">
                <h2 className="h3 mb-3">주변 아파트 비교</h2>
                <ul className="divide-y divide-slate-100">
                  {d.nearby.map((n) => (
                    <li key={n.id}><Link to={`/apartments/${n.id}`} className="flex items-center justify-between py-2 text-[14px] hover:text-brand-600">
                      <span className="min-w-0"><b className="block truncate">{n.name}</b><span className="caption">{n.build_year}년 · {(n.distance_m / 1000).toFixed(1)}km</span></span>
                      <span className="num shrink-0">{n.ppm2 ? `${num(n.ppm2)}만/㎡` : '-'}</span></Link></li>
                  ))}
                </ul>
                <p className="caption mt-2">이 단지 ㎡당 {d.complex.ppm2_12m ? `${num(d.complex.ppm2_12m)}만원` : '-'} (최근 12개월)</p>
              </Card>
              <Card className="p-5 text-[14px]">
                <h2 className="h3 mb-2">거래 유형 안내</h2>
                <p className="text-slate-600"><b>실거래가</b>: 부동산 거래신고에 따라 신고된 실제 계약 가격 · <b>호가</b>: 매도인·중개업체가 등록한 희망 가격 · <b>AI 추정가</b>: 모델이 추정한 통계적 적정가 ({Object.values(DEAL_LABEL).join('·')})</p>
              </Card>
            </aside>
          </div>
          {alertOpen && <AlertModal open onClose={() => setAlertOpen(false)} data={d} typeId={type?.id} />}
        </>
      )}
    </Async>
  )
}
