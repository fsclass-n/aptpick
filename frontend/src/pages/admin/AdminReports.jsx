import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Trash2 } from 'lucide-react'
import { Async, Badge, Card, Field } from '../../components/ui'
import { RegionSelect } from '../../components/SearchForm'
import { api } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { datetime } from '../../utils/format'
import { useAdminAction } from './common'

export default function AdminReports() {
  const list = useApi('/api/reports', { size: 50 })
  const [form, setForm] = useState({ kind: 'weekly', region_code: '' })
  const [busy, setBusy] = useState(false)
  const { run, writeProps } = useAdminAction()
  const generate = async (e) => {
    e.preventDefault()
    setBusy(true)
    await run(() => api.post('/api/reports/generate', { kind: form.kind, region_code: form.region_code || null }), { success: (r) => `리포트 생성 완료 (${r.generator === 'gemini' ? 'Gemini' : '규칙 기반'})`, invalidate: ['/api/reports'] })
    setBusy(false)
  }
  return (
    <div className="space-y-6">
      <h1 className="h2">AI 리포트 관리</h1>
      <Card className="p-5">
        <form onSubmit={generate} className="grid gap-3 md:grid-cols-4 md:items-end">
          <Field label="리포트 유형">
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {Object.entries(list.data?.kinds || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="대상 지역 (선택)"><RegionSelect value={form.region_code} onChange={(v) => setForm({ ...form, region_code: v })} all="전체 분석 지역" /></Field>
          <button className="btn btn-primary md:col-span-2" disabled={busy || writeProps.disabled} title={writeProps.title}><Sparkles size={16} />{busy ? 'Gemini 분석 중…' : '리포트 생성'}</button>
        </form>
        <p className="caption mt-3">검증된 통계(JSON)만 Gemini 에 전달하고, 생성 결과의 수치를 근거 데이터와 자동 대조합니다. GEMINI_API_KEY 미설정 시 규칙 기반으로 생성됩니다.</p>
      </Card>
      <Card className="overflow-x-auto">
        <Async q={list}>
          {(d) => (
            <table className="table-base min-w-[760px]">
              <thead><tr><th>ID</th><th>제목</th><th>생성기</th><th>수치 검증</th><th>생성</th><th className="text-right">삭제</th></tr></thead>
              <tbody>{d.items.map((r) => (
                <tr key={r.id}><td className="num">{r.id}</td><td><Link to={`/reports/${r.id}`} className="font-semibold hover:text-brand-600">{r.title}</Link></td>
                  <td><Badge tone={r.generator === 'gemini' ? 'mint' : 'gray'}>{r.generator}</Badge></td>
                  <td>{r.verification?.passed ? <Badge tone="pick">통과</Badge> : <Badge tone="warn">미확인 {r.verification?.unverified?.length}</Badge>}</td>
                  <td className="num text-[13px]">{datetime(r.created_at)}</td>
                  <td className="text-right"><button className="btn btn-ghost h-8 w-8 px-0 text-up" aria-label="삭제" {...writeProps}
                    onClick={() => window.confirm('리포트를 삭제할까요?') && run(() => api.del(`/api/reports/${r.id}`), { success: '삭제했습니다.', invalidate: ['/api/reports'] })}><Trash2 size={15} /></button></td></tr>
              ))}</tbody>
            </table>
          )}
        </Async>
      </Card>
    </div>
  )
}
