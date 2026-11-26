import { useState } from 'react'
import { Async, Badge, Card, Pagination } from '../../components/ui'
import { api } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import useDebounce from '../../hooks/useDebounce'
import { ROLE_LABEL } from '../../utils/config'
import { datetime } from '../../utils/format'
import { useAdminAction } from './common'

export default function AdminUsers() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounce(q)
  const list = useApi('/api/admin/users', { q: dq, role, page, size: 20 })
  const { run, writeProps } = useAdminAction()
  const update = (u, body) => run(() => api.patch(`/api/admin/users/${u.id}`, body), { success: '회원 정보를 변경했습니다.', invalidate: ['/api/admin/users'] })
  return (
    <div className="space-y-4">
      <h1 className="h2">회원 관리</h1>
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="이메일·이름 검색" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <select className="input w-40" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">전체 권한</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <Async q={list}>
        {(d) => (
          <>
            <Card className="overflow-x-auto">
              <table className="table-base min-w-[860px]">
                <thead><tr><th>ID</th><th>이메일</th><th>이름</th><th>휴대폰</th><th>가입</th><th>최근 로그인</th><th>권한</th><th>상태</th></tr></thead>
                <tbody>{d.items.map((u) => (
                  <tr key={u.id}>
                    <td className="num">{u.id}</td><td>{u.email} <Badge>{u.provider}</Badge></td><td>{u.name}</td><td className="num">{u.phone || '-'}</td>
                    <td className="num text-[13px]">{datetime(u.created_at)}</td><td className="num text-[13px]">{datetime(u.last_login_at)}</td>
                    <td><select className="input h-9! w-32 text-[13px]!" value={u.role} onChange={(e) => update(u, { role: e.target.value })} {...writeProps}>
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td><button className={`chip ${u.is_active ? 'bg-pick-soft text-pick' : 'bg-slate-100 text-slate-500'}`} onClick={() => update(u, { is_active: !u.is_active })} {...writeProps}>{u.is_active ? '활성' : '비활성'}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
            <p className="caption">총 {d.total}명 {d.masked && '· 테스트 관리자 화면: 이메일·이름·휴대폰 마스킹'}</p>
            <Pagination page={page} pages={Math.ceil(d.total / 20)} onChange={setPage} />
          </>
        )}
      </Async>
    </div>
  )
}
