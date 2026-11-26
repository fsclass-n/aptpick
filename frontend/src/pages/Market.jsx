import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, ArrowRight, Building2, Flame, Gauge, Moon, Percent, Scale, Sun, TrendingUp } from 'lucide-react'
import { BarsChart, COLORS, Heatmap, TrendChart } from '../components/Charts'
import { RegionSelect } from '../components/SearchForm'
import { Async, Badge, Card, DataMeta, PageHeader, Segmented, Skeleton, Stat, Trend } from '../components/ui'
import { useDashboardTheme } from '../contexts/ThemeContext'
import { useApi } from '../hooks/useApi'
import { num, pct, period, ratio, won } from '../utils/format'

const short = (name) => name.split(' ').slice(-1)[0]

function RegionDetail({ code }) {
  const q = useApi(code ? `/api/market/regions/${code}` : null)
  const [metric, setMetric] = useState('ppm2')
  return (
    <Async q={q} loading={<Skeleton className="h-96" />}>
      {(d) => !d.has_data ? <Card className="p-8 text-center text-slate-500">{d.region.name}은(는) 아직 수집된 실거래 데이터가 없습니다.</Card> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="변동성 (월간 표준편차)" value={`${d.indicators.volatility ?? '-'}%`} sub={`연환산 ${d.indicators.volatility_annual ?? '-'}%`} icon={Activity} tone="warn" />
            <Stat label="거래량-가격변동 상관" value={d.indicators.volume_price_corr ?? '-'} sub="피어슨 상관계수" icon={Scale} />
            <Stat label="최근 12개월 거래" value={`${num(d.indicators.volume_12m)}건`} sub={`전월세 ${num(d.indicators.rent_volume_12m)}건`} icon={Flame} tone="mint" />
            <Stat label="매물 / 월평균 거래" value={`${d.indicators.listing_to_volume ?? '-'}배`} sub={`등록 매물 ${d.indicators.listings}건`} icon={Gauge} tone="up" />
          </div>
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="h3">{d.region.name} 월별 가격 추이</h3>
              <Segmented size="sm" value={metric} onChange={setMetric} options={[{ value: 'ppm2', label: '㎡당가' }, { value: 'price', label: '평균 거래가' }, { value: 'jeonse', label: '전세가율' }]} />
            </div>
            {metric === 'ppm2' && <TrendChart data={d.monthly} lines={[{ key: 'ma3', label: '㎡당가 (3개월 이동평균)' }, { key: 'ppm2', label: '월별 ㎡당가', color: COLORS.flat, width: 1.5, dashed: true }]}
              bars={[{ key: 'volume', label: '거래량(건)' }]} yFormat={(v) => num(v)} formatters={{ ma3: (v) => `${num(v, 1)}만원`, ppm2: (v) => `${num(v, 1)}만원`, volume: (v) => `${v}건` }} />}
            {metric === 'price' && <TrendChart data={d.monthly} lines={[{ key: 'avg_price', label: '평균 매매가' }, { key: 'median_price', label: '중위 매매가', color: COLORS.mint }, { key: 'avg_jeonse', label: '평균 전세가', color: COLORS.amber }]}
              yFormat={(v) => `${(v / 10000).toFixed(0)}억`} formatters={{ avg_price: won, median_price: won, avg_jeonse: won }} />}
            {metric === 'jeonse' && <TrendChart data={d.monthly.map((m) => ({ ...m, jr: m.jeonse_ratio && +(m.jeonse_ratio * 100).toFixed(1) }))} lines={[{ key: 'jr', label: '전세가율(%)', color: COLORS.mint }]}
              bars={[{ key: 'rent_volume', label: '전월세 거래(건)', color: COLORS.mint }]} yFormat={(v) => `${v}%`} formatters={{ jr: (v) => `${v}%`, rent_volume: (v) => `${v}건` }} />}
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="h3 mb-3">분기별 가격 변동률</h3>
              <BarsChart data={d.quarterly.filter((x) => x.qoq !== null)} x="period" y="qoq" label="전분기 대비(%)" signed format={(v) => `${v?.toFixed?.(1)}%`} />
            </Card>
            <Card className="p-5">
              <h3 className="h3 mb-3">평형별 가격 분포 <span className="caption">(최근 12개월)</span></h3>
              <BarsChart data={d.area_distribution} x="label" y="avg_price" label="평균 거래가" format={(v) => `${(v / 10000).toFixed(1)}억`} color={COLORS.navy} />
              <div className="caption mt-2 flex flex-wrap gap-3">{d.area_distribution.map((a) => <span key={a.label}>{a.label} {a.count}건 · ㎡당 {num(a.ppm2)}만</span>)}</div>
            </Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <Card className="overflow-x-auto p-5 lg:col-span-5">
              <h3 className="h3 mb-3">연도별 변동</h3>
              <table className="table-base">
                <thead><tr><th>연도</th><th className="text-right">㎡당가</th><th className="text-right">거래</th><th className="text-right">변동</th></tr></thead>
                <tbody>{d.yearly.map((y) => <tr key={y.year}><td>{y.year}</td><td className="num text-right">{num(y.ppm2, 1)}만</td><td className="num text-right">{y.volume}</td><td className="text-right"><Trend value={y.change} /></td></tr>)}</tbody>
              </table>
              <p className="caption mt-3">공급·수요 지표: 세대수 {num(d.indicators.households)} · 단지 {d.indicators.complex_count}곳 · 전월세/매매 거래비 {d.indicators.rent_to_sale_ratio} · 월세 비중 {d.indicators.monthly_rent_share ?? '-'}% · 갱신계약 {d.indicators.renewal_share ?? '-'}%</p>
            </Card>
            <Card className="p-5 lg:col-span-7">
              <h3 className="h3 mb-3">㎡당가 상위 단지 <span className="caption">(최근 12개월 실거래)</span></h3>
              <ul className="divide-y divide-slate-100 dark:divide-navy-800">
                {d.top_complexes.slice(0, 7).map((c, i) => (
                  <li key={c.complex_id}>
                    <Link to={`/apartments/${c.complex_id}`} className="flex items-center justify-between py-2 hover:text-brand-600">
                      <span className="flex items-center gap-2"><span className="num w-5 text-slate-400">{i + 1}</span><b>{c.name}</b><span className="caption">{c.build_year}년</span></span>
                      <span className="num">{num(c.ppm2, 1)}만/㎡ <span className="caption">· {c.volume}건</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </Async>
  )
}

function Compare({ regions }) {
  const [codes, setCodes] = useState(() => regions.slice(0, 3).map((r) => r.code))
  const q = useApi(codes.length ? '/api/market/compare' : null, { codes: codes.join(',') })
  const data = useMemo(() => {
    const byPeriod = {}
    ;(q.data?.items || []).forEach((it) => it.monthly.forEach((m) => { (byPeriod[m.period] ||= { period: m.period })[it.region.code] = m.ma3 }))
    return Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period))
  }, [q.data])
  const colors = [COLORS.brand, COLORS.mint, COLORS.amber, COLORS.violet]
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="h3">지역 간 가격 비교</h3>
        <div className="flex flex-wrap gap-1.5">
          {regions.map((r) => (
            <button key={r.code} onClick={() => setCodes((c) => (c.includes(r.code) ? c.filter((x) => x !== r.code) : [...c, r.code].slice(-4)))}
              className={`chip ${codes.includes(r.code) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300'}`}>{short(r.name)}</button>
          ))}
        </div>
      </div>
      <TrendChart data={data} lines={(q.data?.items || []).map((it, i) => ({ key: it.region.code, label: short(it.region.name), color: colors[i] }))} yFormat={(v) => num(v)}
        formatters={Object.fromEntries(codes.map((c) => [c, (v) => `${num(v, 1)}만원/㎡`]))} />
    </Card>
  )
}

export default function Market() {
  const { dark, toggle } = useDashboardTheme()
  const [sp, setSp] = useSearchParams()
  const ov = useApi('/api/market/overview')
  const heat = useApi('/api/market/heatmap', { months: 12 })
  const anomalies = useApi('/api/market/anomalies')
  const regions = ov.data?.regions || []
  const code = sp.get('region') || regions[0]?.code
  const k = ov.data?.kpi
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-navy-950 dark:text-slate-200">
        <PageHeader eyebrow="Market Analysis" title="부동산 시장 분석" desc="실거래 데이터 기반 지역별 가격·거래량·전세가율·변동성 분석. 모든 통계는 데이터 기준일과 출처를 함께 표시합니다.">
          <div className="flex gap-2">
            <Link to="/predict" className="btn btn-mint btn-sm"><TrendingUp size={15} />AI 가격 예측</Link>
            <button className="btn btn-secondary btn-sm" onClick={toggle} aria-label="다크 테마 전환">{dark ? <Sun size={15} /> : <Moon size={15} />}{dark ? '라이트' : '다크'}</button>
          </div>
        </PageHeader>
        <div className="container-x space-y-6 py-6">
          <DataMeta meta={ov.data?.meta} />
          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-5">
            {k ? (
              <>
                <Stat label="㎡당 평균가 (3개월 이동평균)" value={`${num(k.ppm2, 1)}만`} trend={k.mom} sub="전월 대비" icon={TrendingUp} />
                <Stat label="연간 가격 상승률" value={pct(k.yoy)} sub="전년 동월 대비" icon={Activity} tone={k.yoy > 0 ? 'up' : 'down'} />
                <Stat label="평균 거래가" value={won(k.avg_price)} sub="최근 3개월" icon={Building2} tone="navy" />
                <Stat label={`월 거래량 · ${period(k.period)}`} value={`${num(k.volume)}건`} trend={k.volume_yoy} sub="전년 대비" icon={Flame} tone="mint" />
                <Stat label="전세가율" value={ratio(k.jeonse_ratio)} sub="전세 ㎡당가 / 매매 ㎡당가" icon={Percent} tone="warn" />
              </>
            ) : Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
          <Card className="p-5">
            <h3 className="h3 mb-3">분석 대상 지역 전체 월별 가격·거래량 추이</h3>
            <Async q={ov}>{(d) => <TrendChart data={d.series} lines={[{ key: 'ma3', label: '㎡당가 (3개월 이동평균)' }]} bars={[{ key: 'volume', label: '거래량(건)' }]} yFormat={(v) => num(v)}
              formatters={{ ma3: (v) => `${num(v, 1)}만원`, volume: (v) => `${v}건` }} />}</Async>
          </Card>
          <div className="grid gap-6 lg:grid-cols-12">
            <Card className="overflow-x-auto p-5 lg:col-span-7">
              <h3 className="h3 mb-3">지역별 시장 지표</h3>
              <table className="table-base min-w-[620px]">
                <thead><tr><th>지역</th><th className="text-right">평당가</th><th className="text-right">전월</th><th className="text-right">전년</th><th className="text-right">거래(3개월)</th><th className="text-right">전세가율</th></tr></thead>
                <tbody>
                  {regions.map((r) => (
                    <tr key={r.code} onClick={() => setSp({ region: r.code })} className={`cursor-pointer ${r.code === code ? 'bg-brand-50/60 dark:bg-brand-900/30' : ''}`}>
                      <td className="font-semibold">{r.name}</td><td className="num text-right">{num(r.pyeong_price)}만</td>
                      <td className="text-right"><Trend value={r.mom} /></td><td className="text-right"><Trend value={r.yoy} /></td>
                      <td className="num text-right">{r.volume_3m}</td><td className="num text-right">{ratio(r.jeonse_ratio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="p-5 lg:col-span-5">
              <h3 className="h3 mb-3">지역별 연간 상승·하락률</h3>
              <BarsChart data={[...regions].sort((a, b) => (b.yoy ?? 0) - (a.yoy ?? 0)).map((r) => ({ name: short(r.name), yoy: r.yoy }))} x="name" y="yoy" label="전년 대비(%)" signed layout="vertical" height={Math.max(280, regions.length * 26)} format={(v) => `${v?.toFixed?.(1)}%`} />
            </Card>
          </div>
          <Card className="p-5">
            <h3 className="h3 mb-3">지역별 상승·하락 히트맵 <span className="caption">(최근 12개월, 행 클릭 시 상세)</span></h3>
            <Async q={heat}>{(d) => <Heatmap periods={d.periods} rows={d.rows} onSelect={(c) => setSp({ region: c })} />}</Async>
          </Card>
          {regions.length > 0 && <Compare regions={regions} />}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <h2 className="h2">지역 상세 분석</h2>
            <RegionSelect value={code} onChange={(c) => setSp({ region: c })} className="input w-60" all="지역 선택" />
          </div>
          <RegionDetail code={code} />
          <Card className="p-5">
            <h3 className="h3 mb-1">단기 급등·급락 지역 및 이상 거래</h3>
            <p className="caption mb-3">{anomalies.data?.method?.region} · 거래: {anomalies.data?.method?.transaction}</p>
            <div className="grid gap-6 lg:grid-cols-2">
              <ul className="space-y-2">
                {(anomalies.data?.surges || []).slice(0, 8).map((s, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[14px] dark:bg-navy-800">
                    <span><Badge tone={s.kind === '급등' ? 'up' : 'down'}>{s.kind}</Badge> <b className="ml-1">{s.region}</b> <span className="caption">{period(s.period)}</span></span>
                    <Trend value={s.mom} />
                  </li>
                ))}
                {!anomalies.data?.surges?.length && <li className="caption">최근 6개월 급변 지역이 없습니다.</li>}
              </ul>
              <ul className="space-y-2">
                {(anomalies.data?.transactions || []).slice(0, 6).map((t) => (
                  <li key={t.transaction_id}>
                    <Link to={`/apartments/${t.complex_id}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[14px] hover:bg-slate-100 dark:bg-navy-800">
                      <span className="min-w-0 truncate"><Badge tone="warn">이상 거래</Badge> <b className="ml-1">{t.complex_name}</b> <span className="caption">{t.area}㎡ · {t.deal_date}</span></span>
                      <span className="num shrink-0">{won(t.price)} <span className="text-down">({t.deviation_pct}%)</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link to="/reports" className="btn btn-secondary btn-sm mt-4">AI 분석 리포트 보기<ArrowRight size={15} /></Link>
          </Card>
        </div>
      </div>
    </div>
  )
}
