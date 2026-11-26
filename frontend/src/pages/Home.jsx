import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, Bell, Brain, ChartLine, Eye, FileText, Flame, Map, SlidersHorizontal, Sparkles, Target, TrendingUp } from 'lucide-react'
import SearchForm from '../components/SearchForm'
import PropertyCard from '../components/PropertyCard'
import { Badge, DataMeta, Skeleton, Trend } from '../components/ui'
import { useApi, clean } from '../hooks/useApi'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { IMG, unsplash } from '../utils/images'
import { PERSONAS, lifeTags } from '../utils/lifestyle'
import { date, num, ratio, won } from '../utils/format'

const LOOKBOOK = [IMG.skyline, IMG.street, IMG.park, IMG.neon, IMG.living]
const STEPS = [
  { icon: Sparkles, title: '라이프스타일 선택', desc: '신혼·육아·1인·반려동물·시니어·투자 중 나의 생활 방식을 고르면 예산·면적·중요도가 자동으로 채워집니다.' },
  { icon: SlidersHorizontal, title: '9개 지표 점수화', desc: '예산·지역·교통·학군·생활 인프라·가격 경쟁력·시세 흐름·거래 활발도·안정성을 0~100점으로 계산합니다.' },
  { icon: Target, title: '근거와 함께 추천', desc: '추천 점수와 함께 추천 이유·주의 사항·유사 실거래를 보여주고, 점수 근거가 있을 때만 #역세권 #학세권 태그를 붙입니다.' },
]
const TOOLS = [
  { icon: ChartLine, title: '실거래가 통합 검색', to: '/search' },
  { icon: Map, title: '지도 탐색 · 생활 인프라', to: '/map' },
  { icon: TrendingUp, title: '지역 시장 분석', to: '/market' },
  { icon: Brain, title: 'AI 적정가 추정', to: '/predict' },
  { icon: Bell, title: '관심 단지 가격 알림', to: '/favorites' },
  { icon: FileText, title: 'AI 부동산 리포트', to: '/reports' },
]

function Section({ eyebrow, title, desc, action, children, className = '' }) {
  return (
    <section className={`container-x section-y ${className}`}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          <h2 className="h2 md:text-[32px]!">{title}</h2>
          {desc && <p className="mt-2 text-[15px] leading-7 text-slate-500">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const More = ({ to, children }) => (
  <Link to={to} className="group inline-flex items-center gap-1.5 text-[14px] font-semibold text-navy-900">
    <span className="link-line">{children}</span><ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
  </Link>
)

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const ov = useApi('/api/market/overview')
  const recent = useApi('/api/market/recent-transactions', { limit: 6 })
  const popular = useApi('/api/market/popular-regions')
  const reports = useApi('/api/reports', { size: 3 })
  const picks = useQuery({
    queryKey: ['home-picks'],
    queryFn: () => api.post('/api/ai/recommend', { deal_type: 'sale', budget_max: 150000, purpose: 'residence', top_k: 4 }),
  })
  const k = ov.data?.kpi
  const go = (f) => navigate(`/search?${new URLSearchParams(clean(f))}`)
  const regions = ov.data?.regions || []

  return (
    <>
      {/* ---------- Hero: 풀블리드 비주얼 + 통합 검색 ---------- */}
      <section className="relative isolate overflow-hidden bg-navy-950">
        <img src={unsplash(IMG.hero, 2000)} alt="" className="animate-ken absolute inset-0 -z-10 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-navy-950/70 via-navy-950/40 to-navy-950/90" />
        <div className="container-x pt-16 pb-10 md:pt-28 md:pb-14">
          <p className="animate-fade-up text-[12px] font-bold tracking-[0.22em] text-brand-300 uppercase">AI Life Matching · 공공 실거래 데이터</p>
          <h1 className="display animate-fade-up mt-4 max-w-3xl text-white!" style={{ animationDelay: '80ms' }}>
            살고 싶은 하루에서,<br /><span className="text-brand-300">집</span>을 고르다.
          </h1>
          <p className="animate-fade-up mt-5 max-w-xl text-[15px] leading-7 text-white/75 md:text-[17px]" style={{ animationDelay: '160ms' }}>
            평수와 가격만으로는 알 수 없는 것들 — 출근길, 아이의 학교, 강아지 산책로. aptpick 은 실거래 데이터와 AI 로 나의 생활 방식에 맞는 집을 찾아드립니다.
          </p>
          <div className="animate-fade-up mt-9 max-w-5xl" style={{ animationDelay: '240ms' }}><SearchForm onSubmit={go} /></div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-[13px] text-white/60"><Flame size={14} />인기 지역</span>
            {(popular.data?.items || []).slice(0, 7).map((r) => (
              <button key={r.code} onClick={() => go({ region: r.code, deal_type: 'sale' })} className="chip border border-white/20 bg-white/5 px-3! py-1! text-white/90 backdrop-blur transition hover:bg-white hover:text-navy-900">{r.name.split(' ').slice(-1)[0]}</button>
            ))}
          </div>
          <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 backdrop-blur-md md:grid-cols-4">
            {[
              ['평균 거래가 · 최근 3개월', k && won(k.avg_price)],
              ['3.3㎡ 평균가', k && `${num(k.pyeong_price)}만`, k?.yoy],
              [`월 거래량${k ? ` · ${k.period}` : ''}`, k && `${num(k.volume)}건`, k?.volume_yoy],
              ['매매가 대비 전세가율', k && ratio(k.jeonse_ratio)],
            ].map(([label, value, trend]) => (
              <div key={label} className="bg-navy-950/40 px-5 py-4">
                <p className="text-[12px] text-white/55">{label}</p>
                <p className="num mt-1 font-display text-[20px] font-extrabold text-white md:text-[24px]">{value || '—'}</p>
                {trend !== undefined && <Trend value={trend} className="text-[12px]" />}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-white/55 [&_b]:text-white/80">
            <DataMeta meta={ov.data?.meta} className="text-white/55!" />
            <span className="text-[11px]">배경: 서울 야경 참고 이미지 (Unsplash)</span>
          </div>
        </div>
      </section>

      {/* ---------- Life Pick: 라이프스타일 페르소나 (차별화 핵심) ---------- */}
      <Section eyebrow="Life Pick · 라이프스타일 매칭" title="어떤 하루를 살고 싶나요?"
        desc="생활 방식을 고르면 AI 가 예산·면적·교통·학군·생활 인프라 중요도를 맞춰 추천합니다. 조건은 언제든 직접 바꿀 수 있어요."
        action={<More to="/recommend">조건 직접 설정</More>}>
        <div className="scrollbar-none -mx-5 flex snap-x gap-4 overflow-x-auto px-5 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:grid-cols-6">
          {PERSONAS.map(({ id, title, tagline, icon: Icon, img, focus }, i) => (
            <Link key={id} to={`/recommend?persona=${id}`}
              className="group relative aspect-[3/4] w-[62%] shrink-0 snap-start overflow-hidden rounded-3xl bg-sand sm:w-[40%] md:w-auto">
              <img src={unsplash(img, 600, 800)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <span className="scrim absolute inset-0" />
              <span className="num absolute top-4 left-4 text-[12px] font-bold text-white/80">0{i + 1}</span>
              <span className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-navy-900 transition group-hover:bg-brand-500 group-hover:text-white"><Icon size={17} /></span>
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="font-display text-[19px] font-bold text-white">{title}</p>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-white/80">{tagline}</p>
                <div className="mt-2.5 flex flex-wrap gap-1">{focus.map((f) => <span key={f} className="chip bg-white/15 text-white backdrop-blur">#{f}</span>)}</div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* ---------- AI Pick ---------- */}
      <div className="bg-white">
        <Section eyebrow="AI Pick" title="이번 주 AI 추천 매물" desc="기본 조건(실거주 · 예산 15억 이하) 기준 상위 매물입니다. 라이프 태그는 추천 구성 점수 80점 이상일 때만 표시됩니다."
          action={<Link to="/recommend" className="btn btn-accent btn-sm"><Sparkles size={15} />내 조건으로 추천받기</Link>}>
          <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
            {picks.data ? picks.data.results.map((r) => (
              <PropertyCard key={r.property_id} compact badge={`추천 ${Math.round(r.score)}점`} tags={lifeTags(r.components).slice(0, 3)}
                item={{ ...r, id: r.property_id, max_floor: null, recent_trade: r.similar_trades?.[0], ai_price: r.fair_price ? { price: r.fair_price } : null }} />
            )) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />)}
          </div>
          {picks.data?.meta && <DataMeta meta={picks.data.meta} className="mt-8" />}
        </Section>
      </div>

      {/* ---------- Neighborhood Lookbook ---------- */}
      <Section eyebrow="Neighborhood Lookbook" title="동네를 먼저 보고, 집을 고르세요"
        desc="분석 대상 지역의 평당가와 전년 대비 변동률을 한눈에. 지역을 누르면 상세 시장 분석으로 이동합니다."
        action={<More to="/market">전체 지역 분석</More>}>
        <div className="grid auto-rows-[180px] gap-4 md:grid-cols-4 md:auto-rows-[220px]">
          {regions.length ? regions.slice(0, 5).map((r, i) => (
            <Link key={r.code} to={`/market?region=${r.code}`}
              className={`group relative overflow-hidden rounded-3xl bg-sand ${i === 0 ? 'md:col-span-2 md:row-span-2' : ''}`}>
              <img src={unsplash(LOOKBOOK[i], i === 0 ? 1200 : 700)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <span className="scrim absolute inset-0" />
              <span className="absolute top-3 right-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/85 backdrop-blur">참고 이미지</span>
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                <div>
                  <p className={`font-display font-bold text-white ${i === 0 ? 'text-[28px]' : 'text-[19px]'}`}>{r.name.split(' ').slice(-1)[0]}</p>
                  <p className="text-[13px] text-white/75">{r.name}</p>
                </div>
                <div className="text-right">
                  <p className="num font-display text-[18px] font-extrabold text-white">{num(r.pyeong_price)}만<span className="text-[12px] font-medium text-white/70">/평</span></p>
                  <span className="rounded-full bg-white/90 px-2 py-0.5 text-[12px]"><Trend value={r.yoy} /></span>
                </div>
              </div>
            </Link>
          )) : Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className={`h-full ${i === 0 ? 'md:col-span-2 md:row-span-2' : ''}`} />)}
        </div>
      </Section>

      {/* ---------- How Life Pick works ---------- */}
      <section className="bg-navy-900 text-white">
        <div className="container-x section-y grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-[12px] font-bold tracking-[0.18em] text-brand-300 uppercase">Why aptpick</p>
            <h2 className="h2 mt-3 text-white! md:text-[34px]!">가격 순위가 아니라,<br />생활 적합도 순위.</h2>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-white/65">
              단순 상승률·최저가 정렬은 내 생활과 맞지 않는 집을 위로 올립니다. Life Pick 은 생활 방식별 가중치를 적용하고, 상승률은 상한을 둔 일부 가중치로만 반영합니다.
            </p>
            <div className="mt-8 overflow-hidden rounded-3xl">
              <img src={unsplash(IMG.living, 900, 560)} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover" />
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <ol className="space-y-4">
              {STEPS.map(({ icon: Icon, title, desc }, i) => (
                <li key={title} className="flex gap-5 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                  <span className="num font-display text-[34px] leading-none font-extrabold text-brand-400">0{i + 1}</span>
                  <div>
                    <p className="flex items-center gap-2 font-display text-[19px] font-bold"><Icon size={18} className="text-brand-300" />{title}</p>
                    <p className="mt-1.5 text-[14px] leading-6 text-white/65">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TOOLS.map(({ icon: Icon, title, to }) => (
                <Link key={to} to={to} className="group flex items-center justify-between gap-2 rounded-2xl border border-white/10 px-4 py-3 text-[13.5px] font-semibold text-white/85 transition hover:border-white hover:bg-white hover:text-navy-900">
                  <span className="flex items-center gap-2"><Icon size={16} />{title}</span><ArrowUpRight size={14} className="opacity-50" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Market & Recent trades ---------- */}
      <Section eyebrow="Market Snapshot" title="지금, 시장은" desc="분석 대상 지역 실거래 기준 (3개월 이동평균) — 실거래는 계약 완료 가격, 매물은 호가입니다."
        action={<More to="/market">시장 분석 보기</More>}>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="mb-2 flex items-center justify-between border-b-2 border-navy-900 pb-2">
              <h3 className="h3">주요 지역 평균 매매가</h3><span className="caption">평당가 · 전년 대비</span>
            </div>
            <div className="divide-y divide-line">
              {regions.slice(0, 8).map((r, i) => (
                <Link key={r.code} to={`/market?region=${r.code}`} className="group flex items-center justify-between py-3">
                  <span className="flex items-center gap-4"><span className="num w-5 text-[13px] font-bold text-slate-400">{i + 1}</span><span className="font-semibold text-slate-800 group-hover:underline">{r.name}</span></span>
                  <span className="flex items-center gap-5">
                    <span className="num text-[15px] font-bold">{num(r.pyeong_price)}만<span className="caption">/평</span></span>
                    <Trend value={r.yoy} className="w-20 text-right text-[13px]" />
                  </span>
                </Link>
              ))}
              {ov.isLoading && <Skeleton className="h-64" />}
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="mb-2 flex items-center justify-between border-b-2 border-navy-900 pb-2">
              <h3 className="h3">최근 수집 실거래</h3><Link to="/search?tab=trades" className="caption font-semibold hover:text-navy-900">전체보기</Link>
            </div>
            <ul className="divide-y divide-line">
              {(recent.data?.items || []).map((t) => (
                <li key={t.id}>
                  <Link to={`/apartments/${t.complex_id}`} className="group flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-slate-800 group-hover:underline">{t.complex_name}</p>
                      <p className="caption">{t.region.split(' ').slice(-1)} · {t.area}㎡ · {t.floor}층 · {date(t.deal_date)}</p>
                    </div>
                    <span className="shrink-0 text-right"><span className="caption mr-1">실거래</span><span className="num font-display font-bold text-navy-900">{won(t.price)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ---------- Reports ---------- */}
      <div className="bg-white">
        <Section eyebrow="AI Report" title="데이터로 읽는 부동산 리포트" action={<More to="/reports">리포트 전체</More>}>
          <div className="grid gap-6 md:grid-cols-3">
            {(reports.data?.items || []).map((r, i) => (
              <Link key={r.id} to={`/reports/${r.id}`} className="group">
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-sand">
                  <img src={unsplash([IMG.skyline, IMG.street, IMG.neon][i % 3], 700, 440)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  <div className="absolute top-3 left-3 flex gap-1.5"><span className="chip bg-white/95 text-navy-900">{r.kind_label}</span><Badge tone={r.generator === 'gemini' ? 'mint' : 'gray'}>{r.generator === 'gemini' ? 'Gemini' : '규칙 기반'}</Badge></div>
                </div>
                <h3 className="mt-4 line-clamp-2 font-display text-[18px] font-bold group-hover:underline">{r.title}</h3>
                <p className="caption mt-1.5 line-clamp-2">{r.summary}</p>
                <p className="caption mt-2 flex items-center gap-1"><FileText size={13} />데이터 기준일 {date(r.data_as_of)}</p>
              </Link>
            ))}
            {reports.isPending && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="aspect-[16/10]" />)}
          </div>
        </Section>
      </div>

      {/* ---------- CTA ---------- */}
      <section className="container-x pt-14 md:pt-20">
        <div className="relative isolate overflow-hidden rounded-[32px] bg-navy-900 px-6 py-12 md:px-14 md:py-16">
          <img src={unsplash(IMG.keys, 1600, 700)} alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950/90 via-navy-950/60 to-transparent" />
          <p className="text-[12px] font-bold tracking-[0.18em] text-brand-300 uppercase">Start your pick</p>
          <h2 className="h2 mt-3 max-w-lg text-white! md:text-[34px]!">관심 단지를 저장하고<br />목표가에 오면 알려드릴게요.</h2>
          <div className="mt-8 flex flex-wrap gap-2">
            {user ? <Link to="/favorites" className="btn bg-white text-navy-900 hover:bg-brand-50"><Bell size={16} />관심 매물 관리</Link>
              : <Link to="/login" className="btn bg-white text-navy-900 hover:bg-brand-50">로그인 / 회원가입</Link>}
            {!user && <Link to="/login" className="btn border border-white/40 text-white hover:bg-white/10"><Eye size={16} />테스트 계정으로 체험</Link>}
          </div>
        </div>
      </section>
    </>
  )
}
