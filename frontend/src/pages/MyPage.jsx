import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, Bookmark, Clock, History, Settings2, Trash2, UserRound } from 'lucide-react'
import { api } from '../api/client'
import { Async, Badge, Card, Empty, Field, PageHeader, ReadOnlyNotice, Segmented } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { clean, useApi } from '../hooks/useApi'
import { DEAL_LABEL, DEAL_TYPES, ROLE_LABEL } from '../utils/config'
import { datetime, won } from '../utils/format'

const TABS = [
  { value: 'profile', label: '회원 정보', icon: UserRound }, { value: 'prefs', label: '선호 조건', icon: Settings2 },
  { value: 'searches', label: '검색 내역', icon: Bookmark }, { value: 'notifications', label: '알림', icon: Bell }, { value: 'history', label: 'AI 추천 이력', icon: History },
]

function Profile() {
  const { user, setUser, logout, readOnly } = useAuth()
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '' })
  const [confirm, setConfirm] = useState('')
  const toast = useToast()
  const navigate = useNavigate()
  const save = async (e) => {
    e.preventDefault()
    try { setUser(await api.patch('/api/auth/me', { name: form.name, phone: form.phone || null })); toast('회원 정보를 저장했습니다.') } catch (err) { toast(err.message, 'error') }
  }
  const withdraw = async () => {
    if (!window.confirm('탈퇴하면 관심 매물·알림·추천 이력 등 모든 개인 데이터가 삭제됩니다. 진행할까요?')) return
    try { await api.post('/api/auth/me/withdraw', { confirm }); logout(); toast('탈퇴가 완료되었습니다.'); navigate('/') } catch (err) { toast(err.message, 'error') }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="h3 mb-4">기본 정보</h3>
        <form onSubmit={save} className="space-y-3">
          <Field label="이메일"><input className="input" value={user.email} disabled /></Field>
          <div className="flex gap-2"><Badge tone="brand">{ROLE_LABEL[user.role]}</Badge><Badge>{user.provider === 'local' ? '이메일 가입' : `${user.provider} 로그인`}</Badge></div>
          <Field label="이름"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={readOnly} /></Field>
          <Field label="휴대폰"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={readOnly} /></Field>
          <button className="btn btn-primary" disabled={readOnly}>저장</button>
        </form>
      </Card>
      <Card className="p-5">
        <h3 className="h3 mb-2">개인정보 관리 · 회원 탈퇴</h3>
        <p className="caption mb-4">aptpick 은 서비스 제공에 필요한 최소한의 정보(이메일·이름·선택 입력 휴대폰)만 저장하며, 관리자 화면에서도 테스트 관리자에게는 마스킹되어 표시됩니다.</p>
        <Field label={user.provider === 'local' ? '현재 비밀번호' : "확인 문구 '탈퇴' 입력"}>
          <input className="input" type={user.provider === 'local' ? 'password' : 'text'} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button className="btn mt-3 border border-up/40 text-up hover:bg-up-soft" onClick={withdraw} disabled={!confirm || readOnly}>회원 탈퇴</button>
      </Card>
    </div>
  )
}

function Preferences() {
  const q = useApi('/api/me/preferences')
  const regions = useApi('/api/regions')
  const [f, setF] = useState(null)
  const toast = useToast()
  const qc = useQueryClient()
  useEffect(() => { if (q.data) setF(q.data) }, [q.data])
  if (!f) return <Async q={q}>{() => null}</Async>
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value === '' ? null : e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value })
  const save = async (e) => {
    e.preventDefault()
    const { saved_searches: _, ...body } = f
    try { await api.put('/api/me/preferences', body); toast('선호 조건을 저장했습니다. AI 추천에 자동 적용됩니다.'); qc.invalidateQueries({ queryKey: ['/api/me/preferences'] }) } catch (err) { toast(err.message, 'error') }
  }
  return (
    <Card className="p-5">
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="목적"><select className="input" value={f.purpose} onChange={set('purpose')}><option value="residence">실거주</option><option value="investment">투자</option></select></Field>
        <Field label="거래 유형"><select className="input" value={f.deal_type} onChange={set('deal_type')}>{DEAL_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></Field>
        <Field label="희망 지역" hint="Ctrl/⌘ 클릭으로 여러 지역 선택">
          <select multiple className="input h-32! py-1" value={f.region_codes} onChange={(e) => setF({ ...f, region_codes: [...e.target.selectedOptions].map((o) => o.value).slice(0, 10) })}>
            {(regions.data || []).filter((r) => r.complexes).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="최소 예산(만원)"><input className="input" type="number" value={f.budget_min ?? ''} onChange={set('budget_min')} /></Field>
          <Field label="최대 예산(만원)"><input className="input" type="number" value={f.budget_max ?? ''} onChange={set('budget_max')} /></Field>
          <Field label="최소 면적(㎡)"><input className="input" type="number" value={f.area_min ?? ''} onChange={set('area_min')} /></Field>
          <Field label="최소 방 개수"><input className="input" type="number" value={f.rooms_min ?? ''} onChange={set('rooms_min')} /></Field>
        </div>
        {['transport_weight', 'school_weight', 'infra_weight'].map((k, i) => (
          <Field key={k} label={`${['교통', '학군', '생활 인프라'][i]} 중요도: ${f[k]}`}><input type="range" min="1" max="5" value={f[k]} onChange={set(k)} className="w-full accent-brand-600" /></Field>
        ))}
        <div className="md:col-span-2"><button className="btn btn-primary">선호 조건 저장</button> <Link to="/recommend" className="btn btn-secondary">이 조건으로 추천받기</Link></div>
      </form>
    </Card>
  )
}

function Searches() {
  const pref = useApi('/api/me/preferences')
  const recent = useApi('/api/me/recent-searches')
  const qc = useQueryClient()
  const remove = async (name) => { await api.del(`/api/me/saved-searches/${encodeURIComponent(name)}`); qc.invalidateQueries({ queryKey: ['/api/me/preferences'] }) }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="h3 mb-3 flex items-center gap-2"><Bookmark size={18} />저장한 검색 조건</h3>
        <Async q={pref}>
          {(p) => p.saved_searches?.length ? (
            <ul className="divide-y divide-slate-100">{p.saved_searches.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-2 py-2.5">
                <Link to={`/search?${new URLSearchParams(clean(s.query))}`} className="min-w-0 hover:text-brand-600"><b>{s.name}</b><p className="caption truncate">{Object.entries(s.query).map(([k, v]) => `${k}=${v}`).join(' · ')}</p></Link>
                <button className="btn btn-ghost h-8 w-8 px-0 text-up" onClick={() => remove(s.name)} aria-label="삭제"><Trash2 size={15} /></button>
              </li>
            ))}</ul>
          ) : <Empty title="저장한 검색 조건이 없습니다.">검색 화면의 ‘검색 조건 저장’을 이용하세요.</Empty>}
        </Async>
      </Card>
      <Card className="p-5">
        <h3 className="h3 mb-3 flex items-center gap-2"><Clock size={18} />최근 검색 내역</h3>
        <Async q={recent}>
          {(list) => list.length ? (
            <ul className="divide-y divide-slate-100">{list.map((s) => (
              <li key={s.id} className="py-2.5"><Link to={`/search?${new URLSearchParams(clean({ q: s.keyword, region: s.region_code, deal_type: s.deal_type }))}`} className="hover:text-brand-600">
                <b>{s.keyword || s.region || '전체'}</b> {s.deal_type && <Badge>{DEAL_LABEL[s.deal_type]}</Badge>}<p className="caption">{datetime(s.created_at)}</p></Link></li>
            ))}</ul>
          ) : <Empty title="최근 검색 내역이 없습니다." />}
        </Async>
      </Card>
    </div>
  )
}

function Notifications() {
  const q = useApi('/api/notifications')
  return (
    <Card className="p-5">
      <Async q={q}>
        {(d) => d.items.length ? (
          <ul className="divide-y divide-slate-100">{d.items.map((n) => (
            <li key={n.id} className="py-3"><Link to={n.link || '#'} className="hover:text-brand-600"><b>{n.broadcast && '[공지] '}{n.title}</b><p className="text-[14px] text-slate-600">{n.message}</p><p className="caption">{datetime(n.created_at)}</p></Link></li>
          ))}</ul>
        ) : <Empty title="알림이 없습니다." />}
      </Async>
    </Card>
  )
}

function RecoHistory() {
  const q = useApi('/api/ai/recommendations/history')
  return (
    <Async q={q}>
      {(list) => list.length ? (
        <div className="space-y-3">{list.map((h) => (
          <Card key={h.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{h.conditions.purpose === 'investment' ? '투자' : '실거주'} · {DEAL_LABEL[h.conditions.deal_type]} · 예산 {won(h.conditions.budget_max)} 이하</p>
              <span className="caption">{datetime(h.created_at)} · {h.model_version}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">{h.results.slice(0, 5).map((r) => (
              <Link key={r.property_id} to={`/apartments/${r.complex_id}`} className="chip bg-slate-100 text-slate-700 hover:bg-brand-50">{r.complex_name} · {Math.round(r.score)}점</Link>
            ))}</div>
          </Card>
        ))}</div>
      ) : <Card><Empty title="AI 추천 이력이 없습니다."><Link to="/recommend" className="font-semibold text-brand-600">맞춤 추천 받기</Link></Empty></Card>}
    </Async>
  )
}

export default function MyPage() {
  const { readOnly } = useAuth()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'profile'
  const content = { profile: <Profile />, prefs: <Preferences />, searches: <Searches />, notifications: <Notifications />, history: <RecoHistory /> }
  return (
    <>
      <PageHeader eyebrow="My Page" title="마이페이지" desc="회원 정보, 개인화 선호 조건, 검색·알림·AI 추천 이력을 관리합니다." />
      <div className="container-x py-6">
        {readOnly && <ReadOnlyNotice />}
        <div className="scrollbar-none mb-5 overflow-x-auto">
          <Segmented value={tab} onChange={(v) => setSp({ tab: v })} options={TABS.map((t) => ({ value: t.value, label: <span className="flex items-center gap-1.5 whitespace-nowrap"><t.icon size={14} />{t.label}</span> }))} />
        </div>
        {readOnly && tab !== 'profile' ? <Card><Empty title="테스트 관리자 계정은 개인화 데이터를 사용하지 않습니다." /></Card> : content[tab]}
      </div>
    </>
  )
}
