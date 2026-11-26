import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Async, Badge, Card, Stat } from '../../components/ui'
import { api } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { date, datetime, num, won } from '../../utils/format'
import { useAdminAction } from './common'

export default function AdminModels() {
  const q = useApi('/api/admin/models')
  const anomalies = useApi('/api/admin/anomalies')
  const { run, writeProps } = useAdminAction()
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h2">AI 모델 관제</h1>
        <button className="btn btn-primary btn-sm" {...writeProps} onClick={() => run(() => api.post('/api/admin/models/retrain'), { success: (r) => `재학습 완료: ${r.version || r.reason}`, invalidate: ['/api/admin/models'] })}><RefreshCw size={15} />가격 모델 재학습</button>
      </div>
      <Async q={q}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="추론 API" value={d.inference_ready ? '정상' : '준비 중'} sub={d.active.version} />
              <Stat label="MAE" value={won(d.active.metrics?.mae)} sub={`기준선 ${won(d.active.metrics?.baseline?.mae)}`} />
              <Stat label="RMSE" value={won(d.active.metrics?.rmse)} />
              <Stat label="MAPE · R²" value={`${d.active.metrics?.mape}%`} sub={`R² ${d.active.metrics?.r2}`} />
              <Stat label="예측 로그" value={num(d.predictions_logged)} sub="price_predictions" />
            </div>
            <Card className="overflow-x-auto p-5">
              <h3 className="h3 mb-3">모델 버전 · 업데이트 이력</h3>
              <table className="table-base min-w-[860px]">
                <thead><tr><th>버전</th><th>알고리즘</th><th className="text-right">학습</th><th className="text-right">MAE</th><th className="text-right">RMSE</th><th className="text-right">MAPE</th><th className="text-right">R²</th><th>기준일</th><th>생성</th></tr></thead>
                <tbody>{d.versions.map((v) => (
                  <tr key={v.id}><td className="text-[13px] font-semibold">{v.version} {v.active && <Badge tone="pick">active</Badge>}</td><td className="text-[13px]">{v.algorithm}</td>
                    <td className="num text-right">{num(v.trained_rows)}</td><td className="num text-right">{num(v.metrics.mae)}</td><td className="num text-right">{num(v.metrics.rmse)}</td>
                    <td className="num text-right">{v.metrics.mape}%</td><td className="num text-right">{v.metrics.r2}</td><td className="num">{date(v.data_as_of)}</td><td className="num text-[13px]">{datetime(v.created_at)}</td></tr>
                ))}</tbody>
              </table>
              <p className="caption mt-2">추천 모델: recommend-weighted-v1 (가중치 기반) — 오프라인 평가(Precision@K·Recall@K·NDCG@K)는 docs/산출물/AI_모델_설계서_및_성능_평가서.md 참고</p>
            </Card>
          </>
        )}
      </Async>
      <Card className="overflow-x-auto p-5">
        <h3 className="h3 mb-3">가격 이상치 탐지 결과</h3>
        <Async q={anomalies}>
          {(d) => (
            <table className="table-base min-w-[760px]">
              <thead><tr><th>계약일</th><th>단지</th><th className="text-right">전용·층</th><th className="text-right">거래가</th><th className="text-right">기대가</th><th className="text-right">편차</th><th className="text-right">z</th><th>사유</th></tr></thead>
              <tbody>{d.transactions.slice(0, 30).map((t) => (
                <tr key={t.transaction_id}><td className="num">{t.deal_date}</td><td><Link className="font-semibold hover:text-brand-600" to={`/apartments/${t.complex_id}`}>{t.complex_name}</Link></td>
                  <td className="num text-right">{t.area}㎡ · {t.floor}층</td><td className="num text-right font-bold">{won(t.price)}</td><td className="num text-right">{won(t.expected_price)}</td>
                  <td className={`num text-right ${t.deviation_pct < 0 ? 'text-down' : 'text-up'}`}>{t.deviation_pct}%</td><td className="num text-right">{t.z_score}</td><td className="text-[13px]">{t.reason}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Async>
      </Card>
    </div>
  )
}
