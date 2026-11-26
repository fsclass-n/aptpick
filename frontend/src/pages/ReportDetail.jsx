import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, TriangleAlert } from 'lucide-react'
import Markdown from '../components/Markdown'
import { Async, Badge, Card, DataMeta, SampleBadge } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { datetime } from '../utils/format'

export default function ReportDetail() {
  const { id } = useParams()
  const q = useApi(`/api/reports/${id}`)
  return (
    <div className="container-x max-w-4xl! py-8">
      <Link to="/reports" className="btn btn-ghost btn-sm mb-4"><ArrowLeft size={16} />리포트 목록</Link>
      <Async q={q}>
        {(r) => (
          <Card className="p-6 md:p-10">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="brand">{r.kind_label}</Badge>
              <Badge tone={r.generator === 'gemini' ? 'mint' : 'gray'}>{r.generator === 'gemini' ? `Google Gemini · ${r.model}` : '규칙 기반 (Gemini 미연동)'}</Badge>
              {r.is_sample && <SampleBadge />}
            </div>
            <h1 className="h1 mt-3">{r.title}</h1>
            <p className="caption mt-2">생성 {datetime(r.created_at)}</p>
            <DataMeta meta={r.context?.meta} className="mt-2" />
            <div className={`mt-4 flex items-start gap-2 rounded-xl px-4 py-3 text-[13px] ${r.verification?.passed ? 'bg-pick-soft text-pick' : 'bg-warn-soft text-warn'}`}>
              {r.verification?.passed ? <ShieldCheck size={16} className="mt-0.5 shrink-0" /> : <TriangleAlert size={16} className="mt-0.5 shrink-0" />}
              <span>{r.verification?.passed ? `본문 수치 ${r.verification.checked}개를 근거 통계와 대조해 모두 확인했습니다.` : `근거 통계에서 확인되지 않은 수치가 있습니다: ${r.verification?.unverified?.join(', ')} — 해당 수치는 참고하지 마세요.`}</span>
            </div>
            <Markdown className="mt-6">{r.content}</Markdown>
            <p className="caption mt-8 border-t border-slate-100 pt-4">본 리포트는 검증된 통계 데이터를 근거로 자동 생성되었으며 투자 권유가 아닙니다. 데이터에 없는 외부 요인(금리·정책·공급)은 반영되지 않았습니다.</p>
          </Card>
        )}
      </Async>
    </div>
  )
}
