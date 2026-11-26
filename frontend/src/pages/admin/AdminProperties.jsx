import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Async, Badge, Card, Field, Modal, Pagination, Segmented } from '../../components/ui'
import { api } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import useDebounce from '../../hooks/useDebounce'
import { DEAL_LABEL, DEAL_TYPES } from '../../utils/config'
import { dealPrice, won } from '../../utils/format'
import { useAdminAction } from './common'

const STATUS = { pending: ['검수 대기', 'warn'], approved: ['승인', 'pick'], rejected: ['반려', 'gray'] }
const EMPTY = { apartment_id: '', deal_type: 'sale', price: '', monthly_rent: 0, floor: '', direction: '남향', description: '', agency: '', status: 'pending' }

function Editor({ item, onClose }) {
  const [f, setF] = useState(item ? { ...item, apartment_id: item.apartment_id } : EMPTY)
  const [cq, setCq] = useState('')
  const complexes = useApi(!item && cq.length > 0 ? '/api/apartments' : null, { q: useDebounce(cq), limit: 20 })
  const [complexId, setComplexId] = useState('')
  const types = useApi(complexId ? `/api/admin/complexes/${complexId}/types` : null)
  const { run, writeProps } = useAdminAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    const body = { price: Number(f.price), monthly_rent: Number(f.monthly_rent || 0), floor: f.floor ? Number(f.floor) : null, direction: f.direction, description: f.description, agency: f.agency, status: f.status }
    const ok = await run(() => (item ? api.put(`/api/admin/properties/${item.id}`, body) : api.post('/api/admin/properties', { ...body, apartment_id: Number(f.apartment_id), deal_type: f.deal_type })),
      { success: item ? '매물을 수정했습니다.' : '매물을 등록했습니다.', invalidate: ['/api/admin/properties'] })
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={item ? `매물 수정 #${item.id}` : '매물 등록'}>
      <form onSubmit={save} className="space-y-3">
        {item ? <p className="text-[14px]"><b>{item.complex_name}</b> · {item.type_name} · {DEAL_LABEL[item.deal_type]}</p> : (
          <>
            <Field label="단지 검색"><input className="input" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="단지명 입력" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={complexId} onChange={(e) => setComplexId(e.target.value)} required>
                <option value="">단지 선택</option>{(complexes.data || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.region.split(' ').slice(-1)})</option>)}
              </select>
              <select className="input" value={f.apartment_id} onChange={set('apartment_id')} required>
                <option value="">평형 선택</option>{(types.data || []).map((t) => <option key={t.id} value={t.id}>{t.type_name} {t.area}㎡</option>)}
              </select>
            </div>
            <Field label="거래 유형"><select className="input" value={f.deal_type} onChange={set('deal_type')}>{DEAL_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></Field>
          </>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Field label="가격·보증금(만원)" hint={f.price ? won(Number(f.price)) : ''}><input className="input" type="number" min="0" required value={f.price} onChange={set('price')} /></Field>
          <Field label="월세(만원)"><input className="input" type="number" min="0" value={f.monthly_rent} onChange={set('monthly_rent')} /></Field>
          <Field label="층"><input className="input" type="number" value={f.floor ?? ''} onChange={set('floor')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="향"><input className="input" value={f.direction} onChange={set('direction')} /></Field>
          <Field label="중개업소"><input className="input" value={f.agency} onChange={set('agency')} /></Field>
        </div>
        <Field label="설명"><textarea className="input h-20 py-2" value={f.description} onChange={set('description')} /></Field>
        <Field label="검수 상태"><select className="input" value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <button className="btn btn-primary w-full" {...writeProps}>{item ? '수정 저장' : '등록'}</button>
      </form>
    </Modal>
  )
}

export default function AdminProperties() {
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const list = useApi('/api/admin/properties', { status, q: useDebounce(q), page, size: 20 })
  const dups = useApi('/api/admin/properties/duplicates')
  const { run, writeProps } = useAdminAction()
  const setStatusOf = (p, s) => run(() => api.put(`/api/admin/properties/${p.id}`, { status: s }), { success: `매물 #${p.id} ${STATUS[s][0]} 처리`, invalidate: ['/api/admin/properties'] })
  const remove = (p) => window.confirm(`매물 #${p.id} 을(를) 삭제할까요?`) && run(() => api.del(`/api/admin/properties/${p.id}`), { success: '삭제했습니다.', invalidate: ['/api/admin/properties'] })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h2">매물 관리</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setEdit('new')} {...writeProps}><Plus size={15} />매물 등록</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={[{ value: 'pending', label: '검수 대기' }, { value: 'approved', label: '승인' }, { value: 'rejected', label: '반려' }, { value: '', label: '전체' }]} />
        <input className="input max-w-xs" placeholder="단지명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Async q={list}>
        {(d) => (
          <>
            <Card className="overflow-x-auto">
              <table className="table-base min-w-[900px]">
                <thead><tr><th>ID</th><th>단지 · 평형</th><th>유형</th><th className="text-right">호가</th><th className="text-right">AI·시세</th><th>층</th><th>중개업소</th><th>상태</th><th className="text-right">작업</th></tr></thead>
                <tbody>{d.items.map((p) => (
                  <tr key={p.id}>
                    <td className="num">{p.id}</td>
                    <td><Link to={`/apartments/${p.complex_id}`} className="font-semibold hover:text-brand-600">{p.complex_name}</Link><p className="caption">{p.type_name} · {p.area}㎡ {p.source === 'sample' && '· 샘플'}</p></td>
                    <td><Badge tone="brand">{DEAL_LABEL[p.deal_type]}</Badge></td>
                    <td className="num text-right font-bold">{dealPrice(p)}</td>
                    <td className="num text-right text-[13px]">{won(p.ai_price?.price)}</td>
                    <td className="num">{p.floor}</td><td className="text-[13px]">{p.agency}</td>
                    <td><Badge tone={STATUS[p.status][1]}>{STATUS[p.status][0]}</Badge></td>
                    <td className="text-right whitespace-nowrap">
                      {p.status !== 'approved' && <button className="btn btn-ghost h-8 w-8 px-0 text-pick" onClick={() => setStatusOf(p, 'approved')} aria-label="승인" {...writeProps}><Check size={15} /></button>}
                      {p.status !== 'rejected' && <button className="btn btn-ghost h-8 w-8 px-0 text-warn" onClick={() => setStatusOf(p, 'rejected')} aria-label="반려" {...writeProps}><X size={15} /></button>}
                      <button className="btn btn-ghost h-8 w-8 px-0" onClick={() => setEdit(p)} aria-label="수정" {...writeProps}><Pencil size={15} /></button>
                      <button className="btn btn-ghost h-8 w-8 px-0 text-up" onClick={() => remove(p)} aria-label="삭제" {...writeProps}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
            <Pagination page={page} pages={Math.ceil(d.total / 20)} onChange={setPage} />
          </>
        )}
      </Async>
      <Card className="p-5">
        <h3 className="h3 mb-2 flex items-center gap-2"><Copy size={18} />중복 의심 매물</h3>
        <p className="caption mb-3">동일 평형·거래유형·가격·층으로 2건 이상 등록된 매물 그룹</p>
        <Async q={dups}>
          {(d) => d.items.length ? (
            <ul className="space-y-1 text-[14px]">{d.items.map((g, i) => <li key={i}>평형 #{g.apartment_id} · {DEAL_LABEL[g.deal_type]} · {won(g.price)} · {g.floor}층 — {g.count}건 (매물 ID {g.ids.join(', ')})</li>)}</ul>
          ) : <p className="caption">중복 의심 매물이 없습니다.</p>}
        </Async>
      </Card>
      {edit && <Editor item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}
