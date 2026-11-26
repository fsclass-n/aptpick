import { Activity, Brain, Building, Database, FileText, Heart, Search, Server, Users } from 'lucide-react'
import { BarsChart, TrendChart } from '../../components/Charts'
import { Async, Badge, Card, Stat } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { date, num, ratio, won } from '../../utils/format'

const Dot = ({ ok }) => <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-pick' : 'bg-slate-300'}`} />

export default function AdminDashboard() {
  const q = useApi('/api/admin/dashboard', null, { refetchInterval: 30_000 })
  return (
    <Async q={q}>
      {(d) => (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h1 className="h2">통합 관제 대시보드</h1><p className="caption">데이터 기준일 {date(d.data_quality.as_of)} · 30초마다 자동 갱신 {d.masked && '· 개인정보 마스킹 적용'}</p></div>
            {d.data_quality.sample_rows > 0 && <Badge tone="warn">가상 샘플 데이터 {num(d.data_quality.sample_rows)}건 운영 중</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="회원" value={num(d.counts.users)} sub={`활성 ${num(d.counts.active_users)}`} icon={Users} />
            <Stat label="등록 매물" value={num(d.counts.properties)} sub={`검수 대기 ${d.counts.pending}`} icon={Building} tone="mint" />
            <Stat label="매매 실거래" value={num(d.counts.transactions)} sub={`전월세 ${num(d.counts.rentals)}`} icon={Database} tone="navy" />
            <Stat label="AI 리포트" value={num(d.counts.reports)} sub={`추천 ${num(d.counts.recommendations)} · 예측 ${num(d.counts.predictions)}`} icon={FileText} tone="warn" />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="p-5">
              <h3 className="h3 mb-3 flex items-center gap-2"><Database size={18} />데이터 품질</h3>
              <dl className="grid grid-cols-2 gap-y-2 text-[14px]">
                <dt className="text-slate-500">수집 성공률</dt><dd className="num text-right font-semibold">{d.data_quality.collection_success_rate ?? '-'}%</dd>
                <dt className="text-slate-500">수집 실행 / API 오류</dt><dd className="num text-right font-semibold">{d.data_quality.collection_runs} / {d.data_quality.api_errors}</dd>
                <dt className="text-slate-500">결측률 (층 · 준공)</dt><dd className="num text-right font-semibold">{d.data_quality.missing_rate.floor}% · {d.data_quality.missing_rate.build_year}%</dd>
                <dt className="text-slate-500">수집 중복률</dt><dd className="num text-right font-semibold">{d.data_quality.duplicate_rate}%</dd>
                <dt className="text-slate-500">중복 의심 매물</dt><dd className="num text-right font-semibold">{d.data_quality.duplicate_listing_groups}그룹</dd>
                <dt className="text-slate-500">해제 거래</dt><dd className="num text-right font-semibold">{d.data_quality.canceled_trades}</dd>
                <dt className="text-slate-500">실데이터 / 샘플</dt><dd className="num text-right font-semibold">{num(d.data_quality.real_rows)} / {num(d.data_quality.sample_rows)}</dd>
              </dl>
            </Card>
            <Card className="p-5">
              <h3 className="h3 mb-3 flex items-center gap-2"><Brain size={18} />AI 모델</h3>
              {d.model.ready ? (
                <>
                  <p className="caption mb-2 truncate">{d.model.version}</p>
                  <div className="grid grid-cols-2 gap-2 text-[14px]">
                    {[['MAE', won(d.model.metrics.mae)], ['RMSE', won(d.model.metrics.rmse)], ['MAPE', `${d.model.metrics.mape}%`], ['R²', d.model.metrics.r2]].map(([l, v]) => (
                      <div key={l} className="rounded-xl bg-slate-50 p-2.5 dark:bg-navy-800"><p className="caption">{l}</p><p className="num font-bold">{v}</p></div>
                    ))}
                  </div>
                  <p className="caption mt-2">학습 {num(d.model.trained_rows)}건 · 검증 {d.model.metrics.valid_period}</p>
                </>
              ) : <p className="caption">{d.model.reason}</p>}
            </Card>
            <Card className="p-5">
              <h3 className="h3 mb-3 flex items-center gap-2"><Server size={18} />시스템 상태</h3>
              <ul className="space-y-2 text-[14px]">
                <li className="flex justify-between"><span>DB</span><span className="num">{d.system.db} · {d.system.database}</span></li>
                <li className="flex justify-between"><span>환경 · 버전</span><span className="num">{d.system.env} · v{d.system.version} {d.system.commit}</span></li>
                <li className="flex justify-between"><span>AI 추론 API</span><span><Dot ok={d.system.model_ready} /> {d.system.model_ready ? '정상' : '준비 중'}</span></li>
                <li className="flex justify-between"><span>공공데이터 API 키</span><span><Dot ok={d.system.data_go_kr} /> {d.system.data_go_kr ? '설정됨' : '미설정'}</span></li>
                <li className="flex justify-between"><span>Gemini API</span><span><Dot ok={d.system.gemini} /> {d.system.gemini ? '설정됨' : '미설정 (규칙 기반)'}</span></li>
                <li className="flex justify-between"><span>Kakao REST</span><span><Dot ok={d.system.kakao_rest} /> {d.system.kakao_rest ? '설정됨' : '미설정'}</span></li>
                <li className="flex justify-between"><span>WebSocket 접속</span><span className="num">{d.system.ws_connections}</span></li>
              </ul>
            </Card>
          </div>
          <div className="grid gap-6 xl:grid-cols-12">
            <Card className="p-5 xl:col-span-7">
              <h3 className="h3 mb-3 flex items-center gap-2"><Activity size={18} />시장 지표 (최근 12개월)</h3>
              <TrendChart data={d.market.series} lines={[{ key: 'ma3', label: '㎡당가(3개월 이동평균)' }]} bars={[{ key: 'volume', label: '거래량' }]} yFormat={(v) => num(v)} height={260} />
              <p className="caption mt-2">평균가 {won(d.market.kpi?.avg_price)} · 전세가율 {ratio(d.market.kpi?.jeonse_ratio)} · 전년 대비 {d.market.kpi?.yoy}%</p>
            </Card>
            <Card className="p-5 xl:col-span-5">
              <h3 className="h3 mb-3">지역별 전년 대비 상승·하락률</h3>
              <BarsChart data={d.market.regions.map((r) => ({ name: r.name.split(' ').slice(-1)[0], yoy: r.yoy }))} x="name" y="yoy" label="전년 대비(%)" signed layout="vertical" height={300} format={(v) => `${v?.toFixed?.(1)}%`} />
            </Card>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h3 className="h3 mb-3 flex items-center gap-2"><Search size={18} />사용자 검색 트렌드 (30일)</h3>
              {d.search_trend.length ? (
                <ul className="divide-y divide-slate-100 text-[14px] dark:divide-navy-800">{d.search_trend.map((s, i) => (
                  <li key={i} className="flex justify-between py-2"><span>{s.keyword || '(키워드 없음)'} <span className="caption">{s.region}</span></span><span className="num font-semibold">{s.count}</span></li>
                ))}</ul>
              ) : <p className="caption">최근 검색 기록이 없습니다.</p>}
            </Card>
            <Card className="p-5">
              <h3 className="h3 mb-3 flex items-center gap-2"><Heart size={18} />AI 추천 · 사용자 활동</h3>
              <div className="grid grid-cols-2 gap-3 text-[14px]">
                {[['누적 추천', d.recommend_stats.total], ['최근 30일 추천', d.recommend_stats.last_30d], ['관심 매물', d.counts.favorites], ['활성 가격 알림', d.counts.alerts], ['미답변 문의', d.counts.inquiries_open], ['생활 인프라 POI', d.counts.infrastructure]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-slate-50 p-3 dark:bg-navy-800"><p className="caption">{l}</p><p className="num text-[18px] font-bold">{num(v)}</p></div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </Async>
  )
}
