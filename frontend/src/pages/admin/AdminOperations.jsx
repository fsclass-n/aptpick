import { useState } from 'react'
import { Megaphone, MessageSquare, ScrollText } from 'lucide-react'
import { Async, Badge, Card, Field, Segmented } from '../../components/ui'
import { api } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { datetime } from '../../utils/format'
import { useAdminAction } from './common'

const CAT = { general: '일반', partnership: '제휴', data: '데이터', bug: '오류' }

function Inquiries() {
  const q = useApi('/api/admin/inquiries')
  const [answers, setAnswers] = useState({})
  const { run, writeProps } = useAdminAction()
  return (
    <Async q={q}>
      {(list) => list.length ? (
        <div className="space-y-3">{list.map((i) => (
          <Card key={i.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold"><Badge tone="brand">{CAT[i.category]}</Badge> {i.name} <span className="caption">{i.email}</span></p>
              <span className="flex items-center gap-2"><Badge tone={i.status === 'open' ? 'warn' : 'pick'}>{i.status}</Badge><span className="caption">{datetime(i.created_at)}</span></span>
            </div>
            <p className="mt-2 text-[14px] whitespace-pre-line">{i.message}</p>
            {i.answer ? <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[13px] dark:bg-navy-800">답변: {i.answer}</p> : (
              <div className="mt-2 flex gap-2">
                <input className="input h-9!" placeholder="답변 입력" value={answers[i.id] || ''} onChange={(e) => setAnswers({ ...answers, [i.id]: e.target.value })} disabled={writeProps.disabled} />
                <button className="btn btn-primary btn-sm" {...writeProps} onClick={() => run(() => api.patch(`/api/admin/inquiries/${i.id}`, { status: 'answered', answer: answers[i.id] || '' }), { success: '답변을 등록했습니다.', invalidate: ['/api/admin/inquiries'] })}>답변</button>
              </div>
            )}
          </Card>
        ))}</div>
      ) : <Card className="p-6 text-center text-slate-500">접수된 문의가 없습니다.</Card>}
    </Async>
  )
}

function Audit() {
  const q = useApi('/api/admin/audit-logs', { limit: 200 })
  return (
    <Card className="overflow-x-auto">
      <Async q={q}>
        {(list) => (
          <table className="table-base min-w-[860px]">
            <thead><tr><th>시각</th><th>관리자</th><th>권한</th><th>작업</th><th>대상</th><th>상세</th><th>IP</th></tr></thead>
            <tbody>{list.map((a) => (
              <tr key={a.id}><td className="num text-[13px]">{datetime(a.created_at)}</td><td className="text-[13px]">{a.actor}</td><td><Badge>{a.role}</Badge></td><td className="font-semibold">{a.action}</td>
                <td className="text-[13px]">{a.target}</td><td className="max-w-xs truncate text-[12px] text-slate-500" title={JSON.stringify(a.detail)}>{JSON.stringify(a.detail)}</td><td className="num text-[13px]">{a.ip}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Async>
    </Card>
  )
}

function Broadcast() {
  const [f, setF] = useState({ title: '', message: '', link: '' })
  const { run, writeProps } = useAdminAction()
  return (
    <Card className="max-w-xl p-5">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/api/admin/notifications/broadcast', f), { success: '전체 공지를 발송했습니다. (WebSocket 실시간 전송)' })) setF({ title: '', message: '', link: '' }) }}>
        <Field label="제목"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="내용"><textarea className="input h-24 py-2" required value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        <Field label="링크 (선택)"><input className="input" placeholder="/market" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></Field>
        <button className="btn btn-primary" {...writeProps}><Megaphone size={16} />공지 발송</button>
      </form>
    </Card>
  )
}

export default function AdminOperations() {
  const [tab, setTab] = useState('audit')
  return (
    <div className="space-y-4">
      <h1 className="h2">운영 관리</h1>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'audit', label: <span className="flex items-center gap-1"><ScrollText size={14} />감사 로그</span> },
        { value: 'inquiries', label: <span className="flex items-center gap-1"><MessageSquare size={14} />사용자 문의</span> },
        { value: 'broadcast', label: <span className="flex items-center gap-1"><Megaphone size={14} />알림 관리</span> }]} />
      {tab === 'audit' && <Audit />}
      {tab === 'inquiries' && <Inquiries />}
      {tab === 'broadcast' && <Broadcast />}
    </div>
  )
}
