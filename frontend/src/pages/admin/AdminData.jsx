import { useState } from 'react'
import { Download, RefreshCw, Trash2 } from 'lucide-react'
import { Async, Badge, Card, Field } from '../../components/ui'
import { RegionSelect } from '../../components/SearchForm'
import { api } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { datetime, num } from '../../utils/format'
import { useAdminAction } from './common'

const SRC_TONE = { active: 'pick', needs_key: 'warn', sample: 'gray', planned: 'brand' }
const SRC_LABEL = { active: '연동', needs_key: '인증키 필요', sample: '샘플', planned: '연동 예정' }
const LOG_TONE = { success: 'pick', failed: 'up', skipped: 'warn', running: 'brand' }
const recentMonths = () => Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - i - 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}` })

export default function AdminData() {
  const sources = useApi('/api/admin/data/sources')
  const logs = useApi('/api/admin/data/logs', { limit: 50 }, { refetchInterval: 10_000 })
  const [form, setForm] = useState({ source: 'molit_trade', region_code: '11680', months: [recentMonths()[0]] })
  const { run, writeProps } = useAdminAction()
  const collect = (e) => {
    e.preventDefault()
    run(() => api.post('/api/admin/data/collect', form), { success: (r) => r.message || `수집 결과: ${r.status}`, invalidate: ['/api/admin/data/logs', '/api/admin/data/sources'] })
  }
  return (
    <div className="space-y-6">
      <h1 className="h2">공공데이터 수집 · 데이터 관제</h1>
      <Card className="overflow-x-auto p-5">
        <h3 className="h3 mb-3">데이터 출처 현황</h3>
        <Async q={sources}>
          {(list) => (
            <table className="table-base min-w-[760px]">
              <thead><tr><th>코드</th><th>데이터</th><th>제공기관</th><th>상태</th><th className="text-right">적재 건수</th><th>최근 수집</th></tr></thead>
              <tbody>{list.map((s) => (
                <tr key={s.code}><td className="num text-[13px]">{s.code}</td><td><a href={s.url} target="_blank" rel="noreferrer" className="font-semibold hover:text-brand-600">{s.name}</a><p className="caption">{s.notes}</p></td>
                  <td>{s.provider}</td><td><Badge tone={SRC_TONE[s.status]}>{SRC_LABEL[s.status] || s.status}</Badge></td><td className="num text-right">{num(s.record_count)}</td><td className="num text-[13px]">{datetime(s.last_synced_at)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Async>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="h3 mb-1 flex items-center gap-2"><Download size={18} />국토교통부 실거래 수집</h3>
          <p className="caption mb-3">DATA_GO_KR_API_KEY 설정 시 백그라운드로 수집 → 정규화 → 중복 제거 → 적재 → 통계·AI 재계산. 미설정 시 ‘skipped’ 로 기록됩니다.</p>
          <form onSubmit={collect} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="API"><select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option value="molit_trade">아파트 매매 실거래</option><option value="molit_rent">아파트 전월세 실거래</option></select></Field>
              <Field label="지역 (법정동 5자리)"><RegionSelect value={form.region_code} onChange={(v) => setForm({ ...form, region_code: v })} onlyData={false} all="지역 선택" /></Field>
            </div>
            <Field label="계약년월 (복수 선택)">
              <div className="flex flex-wrap gap-1.5">{recentMonths().map((m) => (
                <button type="button" key={m} onClick={() => setForm((f) => ({ ...f, months: f.months.includes(m) ? f.months.filter((x) => x !== m) : [...f.months, m] }))}
                  className={`chip ${form.months.includes(m) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-navy-800'}`}>{m.slice(0, 4)}.{m.slice(4)}</button>
              ))}</div>
            </Field>
            <button className="btn btn-primary" disabled={!form.months.length || writeProps.disabled} title={writeProps.title}>수집 실행</button>
          </form>
        </Card>
        <Card className="space-y-3 p-5">
          <h3 className="h3">데이터 운영</h3>
          <button className="btn btn-secondary w-full" onClick={() => run(() => api.post('/api/admin/data/refresh-stats'), { success: '지역 통계와 AI 모델을 재계산했습니다.', invalidate: ['/api/admin/dashboard'] })} {...writeProps}><RefreshCw size={16} />지역 통계 · AI 모델 재계산</button>
          <button className="btn w-full border border-up/40 text-up hover:bg-up-soft" {...writeProps}
            onClick={() => window.confirm('가상 샘플 데이터(단지·매물·거래·인프라)를 모두 삭제합니다. 실데이터 수집 후에만 실행하세요. 계속할까요?') && run(() => api.del('/api/admin/data/sample'), { success: (r) => `샘플 단지 ${r.deleted_complexes}곳을 삭제했습니다.`, invalidate: ['/api/admin/dashboard'] })}>
            <Trash2 size={16} />가상 샘플 데이터 일괄 삭제
          </button>
          <p className="caption">샘플 데이터는 source=sample 로 저장되어 실데이터(source=molit)와 분리됩니다.</p>
        </Card>
      </div>
      <Card className="overflow-x-auto p-5">
        <h3 className="h3 mb-3">수집 이력 · 오류 로그</h3>
        <Async q={logs}>
          {(list) => list.length ? (
            <table className="table-base min-w-[860px]">
              <thead><tr><th>시작</th><th>API</th><th>지역</th><th>기간</th><th>상태</th><th className="text-right">수신</th><th className="text-right">적재</th><th className="text-right">중복</th><th className="text-right">무효</th><th>오류</th></tr></thead>
              <tbody>{list.map((l) => (
                <tr key={l.id}><td className="num text-[13px]">{datetime(l.started_at)}</td><td className="text-[13px]">{l.source_code}</td><td className="num">{l.region_code}</td><td className="num">{l.period}</td>
                  <td><Badge tone={LOG_TONE[l.status]}>{l.status}</Badge></td><td className="num text-right">{l.fetched}</td><td className="num text-right">{l.inserted}</td><td className="num text-right">{l.duplicates}</td><td className="num text-right">{l.invalid}</td>
                  <td className="max-w-xs truncate text-[13px] text-up" title={l.error}>{l.error}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="caption">수집 이력이 없습니다.</p>}
        </Async>
      </Card>
    </div>
  )
}
