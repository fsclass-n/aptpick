import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Bot, FileText, MessageSquare, Send, ShieldCheck } from 'lucide-react'
import { api } from '../api/client'
import { RegionSelect } from '../components/SearchForm'
import { Async, Badge, Card, Empty, PageHeader, Pagination, SampleBadge } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../hooks/useApi'
import { date } from '../utils/format'
import { IMG } from '../utils/images'

function Ask() {
  const { user } = useAuth()
  const [question, setQuestion] = useState('')
  const [region, setRegion] = useState('')
  const m = useMutation({ mutationFn: (b) => api.post('/api/reports/ask', b) })
  return (
    <Card className="p-5">
      <h2 className="h3 mb-1 flex items-center gap-2"><MessageSquare size={18} className="text-mint-500" />자연어 부동산 질의응답</h2>
      <p className="caption mb-3">검증된 통계 데이터만 근거로 답변합니다. 데이터에 없는 가격·통계는 생성하지 않습니다.</p>
      {!user ? <Link to="/login?next=/reports" className="btn btn-secondary btn-sm">로그인 후 이용</Link> : (
        <form onSubmit={(e) => { e.preventDefault(); m.mutate({ question, region_code: region || null }) }} className="space-y-2">
          <RegionSelect value={region} onChange={setRegion} all="전체 지역 기준" />
          <div className="flex gap-2">
            <input className="input" placeholder="예: 송파구 최근 시세 흐름은 어떤가요?" value={question} onChange={(e) => setQuestion(e.target.value)} minLength={2} required />
            <button className="btn btn-primary" disabled={m.isPending} aria-label="질문하기"><Send size={16} /></button>
          </div>
        </form>
      )}
      {m.isPending && <p className="caption mt-3">분석 중…</p>}
      {m.isError && <p className="mt-3 text-[14px] text-up">{m.error.message}</p>}
      {m.data && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-[14px] leading-6">
          <p className="mb-2 flex flex-wrap items-center gap-1.5"><Bot size={15} /><Badge tone={m.data.generator === 'gemini' ? 'mint' : 'gray'}>{m.data.generator === 'gemini' ? 'Gemini' : '통계 요약'}</Badge>
            {m.data.verification?.passed ? <Badge tone="pick"><ShieldCheck size={12} />수치 검증 통과</Badge> : <Badge tone="warn">근거 미확인 수치 {m.data.verification?.unverified?.length}건</Badge>}</p>
          <p className="whitespace-pre-line">{m.data.answer}</p>
          <p className="caption mt-2">기준일 {date(m.data.meta?.as_of)}</p>
        </div>
      )}
    </Card>
  )
}

export default function Reports() {
  const [kind, setKind] = useState('')
  const [page, setPage] = useState(1)
  const q = useApi('/api/reports', { kind, page, size: 9 })
  return (
    <>
      <PageHeader eyebrow="AI Report" image={IMG.neon} title="AI 부동산 분석 리포트" desc="검증된 실거래 통계를 Google Gemini 에 전달해 생성한 시장 분석 리포트입니다. Gemini 미연동 시 동일 구조의 규칙 기반 리포트를 제공합니다." />
      <div className="container-x grid gap-6 py-6 lg:grid-cols-12">
        <section className="lg:col-span-8">
          <Async q={q}>
            {(d) => (
              <>
                <div className="scrollbar-none mb-4 flex gap-1.5 overflow-x-auto">
                  {[['', '전체'], ...Object.entries(d.kinds)].map(([k, l]) => (
                    <button key={k} onClick={() => { setKind(k); setPage(1) }} className={`chip shrink-0 px-3! py-1! ${kind === k ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{l}</button>
                  ))}
                </div>
                {d.items.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {d.items.map((r) => (
                      <Link key={r.id} to={`/reports/${r.id}`} className="card p-5 transition hover:shadow-float">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone="brand">{r.kind_label}</Badge>
                          <Badge tone={r.generator === 'gemini' ? 'mint' : 'gray'}>{r.generator === 'gemini' ? `Gemini · ${r.model}` : '규칙 기반'}</Badge>
                          {r.verification?.passed && <Badge tone="pick">수치 검증</Badge>}
                          {r.is_sample && <SampleBadge />}
                        </div>
                        <h3 className="mt-3 font-display text-[18px] font-bold">{r.title}</h3>
                        <p className="caption mt-1.5">{r.summary}</p>
                        <p className="caption mt-3 flex items-center gap-1"><FileText size={13} />데이터 기준일 {date(r.data_as_of)} · 생성 {date(r.created_at)}</p>
                      </Link>
                    ))}
                  </div>
                ) : <Card><Empty title="리포트가 없습니다." /></Card>}
                <Pagination page={page} pages={Math.ceil(d.total / 9)} onChange={setPage} />
              </>
            )}
          </Async>
        </section>
        <aside className="space-y-4 lg:col-span-4">
          <Ask />
          <Card className="p-5 text-[14px]">
            <h3 className="h3 mb-2">리포트 구성</h3>
            <ol className="list-decimal space-y-0.5 pl-5 text-slate-600">{(q.data?.sections || []).map((s) => <li key={s}>{s}</li>)}</ol>
            <p className="caption mt-3">리포트 생성·삭제는 관리자 메뉴에서 수행합니다.</p>
          </Card>
        </aside>
      </div>
    </>
  )
}
