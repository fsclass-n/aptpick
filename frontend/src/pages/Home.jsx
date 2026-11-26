import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, Brain, ChartLine, FileText, Flame, Map, Sparkles, Target, TrendingUp } from 'lucide-react'
import SearchForm from '../components/SearchForm'
import PropertyCard from '../components/PropertyCard'
import { Badge, Card, DataMeta, Skeleton, SectionTitle, Stat, Trend } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { clean } from '../hooks/useApi'
import { date, eok, num, ratio, won } from '../utils/format'

const FEATURES = [
  { icon: ChartLine, title: '실거래가 통합 검색', desc: '국토교통부 실거래 데이터와 등록 매물(호가)을 구분해 한 화면에서 비교합니다.', to: '/search' },
  { icon: Map, title: '지도 기반 탐색', desc: '가격 마커·클러스터와 지하철·학교·병원·마트 등 생활 인프라를 지도에서 확인합니다.', to: '/map' },
  { icon: TrendingUp, title: '지역 시장 분석', desc: '월·분기·연 변동률, 거래량, 전세가율, 변동성과 상승·하락 히트맵을 제공합니다.', to: '/market' },
  { icon: Brain, title: 'AI 적정가 추정', desc: '머신러닝 모델이 추정한 적정가와 예측 범위, 모델 성능 지표를 함께 공개합니다.', to: '/predict' },
  { icon: Target, title: 'AI 맞춤 추천', desc: '예산·지역·교통·학군·실거주/투자 목적을 반영한 추천 점수와 근거를 보여줍니다.', to: '/recommend' },
  { icon: Bell, title: '관심 매물 · 가격 알림', desc: '관심 단지를 저장하고 목표 가격에 도달하면 실시간 알림을 받습니다.', to: '/favorites' },
]

export default function Home() {
  const navigate = useNavigate()
  const ov = useApi('/api/market/overview')
  const recent = useApi('/api/market/recent-transactions', { limit: 8 })
  const popular = useApi('/api/market/popular-regions')
  const reports = useApi('/api/reports', { size: 3 })
  const picks = useQuery({
    queryKey: ['home-picks'],
    queryFn: () => api.post('/api/ai/recommend', { deal_type: 'sale', budget_max: 150000, purpose: 'residence', top_k: 4 }),
  })
  const k = ov.data?.kpi
  const go = (f) => navigate(`/search?${new URLSearchParams(clean(f))}`)

  return (
    <>
      <section className="relative overflow-hidden bg-navy-900">
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(60% 80% at 80% 10%, #1f4bc9 0%, transparent 60%), radial-gradient(40% 60% at 10% 90%, #0d9488 0%, transparent 60%)' }} />
        <div className="container-x relative py-14 md:py-20">
          <Badge tone="mint" className="mb-4">공공 실거래 데이터 × AI 분석</Badge>
          <h1 className="font-display text-[30px] leading-tight font-extrabold text-white md:text-[44px]">
            데이터로 분석하고,<br className="sm:hidden" /> <span className="text-mint-300">AI로 찾는</span> 나에게 맞는 부동산
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] text-slate-300 md:text-[17px]">실거래가·시장 동향·AI 적정가·맞춤 추천을 하나의 플랫폼에서. 실거래가와 매물 호가를 명확히 구분해 보여드립니다.</p>
          <div className="mt-8 max-w-5xl"><SearchForm onSubmit={go} /></div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-[13px] text-slate-400"><Flame size={14} />인기 지역</span>
            {(popular.data?.items || []).slice(0, 7).map((r) => (
              <button key={r.code} onClick={() => go({ region: r.code, deal_type: 'sale' })} className="chip bg-white/10 text-slate-100 hover:bg-white/20">{r.name.split(' ').slice(-1)[0]}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="container-x section-y">
        <SectionTitle eyebrow="Market Snapshot" title="부동산 시장 동향" desc="분석 대상 지역 실거래 기준 (3개월 이동평균)"
          action={<Link to="/market" className="btn btn-secondary btn-sm">시장 분석 보기<ArrowRight size={15} /></Link>} />
        <DataMeta meta={ov.data?.meta} className="mb-4" />
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          {k ? (
            <>
              <Stat label="평균 거래가 (최근 3개월)" value={won(k.avg_price)} sub="만원" icon={ChartLine} />
              <Stat label="3.3㎡(평)당 평균가" value={`${num(k.pyeong_price)}만`} trend={k.yoy} sub="전년 동월 대비" icon={TrendingUp} tone="up" />
              <Stat label={`월 거래량 (${k.period})`} value={`${num(k.volume)}건`} trend={k.volume_yoy} sub="전년 대비" icon={Flame} tone="mint" />
              <Stat label="매매가 대비 전세가율" value={ratio(k.jeonse_ratio)} sub={`전월 대비 ${k.mom > 0 ? '+' : ''}${k.mom?.toFixed(2)}%`} icon={Target} tone="warn" />
            </>
          ) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <Card className="p-5 lg:col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="h3">주요 지역 평균 매매가격</h3>
              <span className="caption">평당가 · 전년 대비</span>
            </div>
            <div className="divide-y divide-slate-100">
              {(ov.data?.regions || []).slice(0, 8).map((r) => (
                <Link key={r.code} to={`/market?region=${r.code}`} className="flex items-center justify-between py-2.5 hover:bg-slate-50">
                  <span className="font-semibold text-slate-700">{r.name}</span>
                  <span className="flex items-center gap-4">
                    <span className="num text-[15px] font-bold">{num(r.pyeong_price)}만<span className="caption">/평</span></span>
                    <Trend value={r.yoy} className="w-20 text-right text-[13px]" />
                  </span>
                </Link>
              ))}
              {ov.isLoading && <Skeleton className="h-64" />}
            </div>
          </Card>
          <Card className="p-5 lg:col-span-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="h3">최근 수집 실거래</h3>
              <Link to="/search?tab=trades" className="caption font-semibold text-brand-600">전체보기</Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {(recent.data?.items || []).map((t) => (
                <li key={t.id}>
                  <Link to={`/apartments/${t.complex_id}`} className="flex items-center justify-between py-2.5 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-slate-700">{t.complex_name}</p>
                      <p className="caption">{t.region.split(' ').slice(-1)} · {t.area}㎡ · {t.floor}층 · {date(t.deal_date)}</p>
                    </div>
                    <span className="num shrink-0 font-display font-bold text-slate-900">{won(t.price)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-x section-y">
          <SectionTitle eyebrow="AI Pick" title="AI 추천 매물 미리보기" desc="예산 15억 이하 · 실거주 목적 기본 조건 — 내 조건으로 다시 추천받아 보세요."
            action={<Link to="/recommend" className="btn btn-mint btn-sm"><Sparkles size={15} />맞춤 추천 받기</Link>} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {picks.data ? picks.data.results.map((r) => (
              <div key={r.property_id} className="relative">
                <span className="absolute top-3 right-14 z-10 chip bg-pick text-white">추천 {Math.round(r.score)}점</span>
                <PropertyCard compact item={{ ...r, id: r.property_id, max_floor: null, recent_trade: r.similar_trades?.[0], ai_price: r.fair_price ? { price: r.fair_price } : null }} />
              </div>
            )) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-80" />)}
          </div>
        </div>
      </section>

      <section className="container-x section-y">
        <SectionTitle eyebrow="AI Report" title="부동산 시장 분석 리포트" action={<Link to="/reports" className="btn btn-secondary btn-sm">리포트 전체<ArrowRight size={15} /></Link>} />
        <div className="grid gap-4 md:grid-cols-3">
          {(reports.data?.items || []).map((r) => (
            <Link key={r.id} to={`/reports/${r.id}`} className="card p-5 transition hover:shadow-float">
              <div className="flex gap-1.5"><Badge tone="brand">{r.kind_label}</Badge><Badge tone={r.generator === 'gemini' ? 'mint' : 'gray'}>{r.generator === 'gemini' ? 'Gemini' : '규칙 기반'}</Badge></div>
              <h3 className="mt-3 line-clamp-2 font-display text-[17px] font-bold">{r.title}</h3>
              <p className="caption mt-2 line-clamp-2">{r.summary}</p>
              <p className="caption mt-3 flex items-center gap-1"><FileText size={13} />기준일 {date(r.data_as_of)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="container-x section-y">
          <SectionTitle eyebrow="Features" title="aptpick 주요 기능" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc, to }) => (
              <Link key={title} to={to} className="group rounded-2xl border border-slate-200 p-5 transition hover:border-brand-300 hover:bg-brand-50/40">
                <span className="inline-flex rounded-xl bg-brand-600 p-2.5 text-white"><Icon size={20} /></span>
                <h3 className="mt-4 font-display text-[18px] font-bold group-hover:text-brand-700">{title}</h3>
                <p className="mt-1.5 text-[14px] text-slate-500">{desc}</p>
              </Link>
            ))}
          </div>
          <p className="caption mt-6">※ 평균가 {eok(k?.avg_price)} 등 모든 수치는 데이터 기준일과 출처를 함께 표시하며, 가상 샘플 데이터 환경에서는 실제 시세가 아닙니다.</p>
        </div>
      </section>
    </>
  )
}
