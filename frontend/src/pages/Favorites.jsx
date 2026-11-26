import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { BellRing, Heart, Trash2 } from 'lucide-react'
import AptVisual from '../components/AptVisual'
import { Async, Badge, Card, Empty, PageHeader, ReadOnlyNotice } from '../components/ui'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useApi } from '../hooks/useApi'
import { DEAL_LABEL } from '../utils/config'
import { date, dealPrice, ratio, won } from '../utils/format'
import { IMG } from '../utils/images'

export default function Favorites() {
  const { readOnly } = useAuth()
  const favs = useApi(readOnly ? null : '/api/favorites')
  const alerts = useApi(readOnly ? null : '/api/alerts')
  const qc = useQueryClient()
  const toast = useToast()
  const remove = async (path, key) => {
    await api.del(path).then(() => toast('삭제했습니다.')).catch((e) => toast(e.message, 'error'))
    qc.invalidateQueries({ queryKey: [key] })
  }
  const toggleAlert = async (a) => {
    await api.patch(`/api/alerts/${a.id}`, { active: !a.active }).catch((e) => toast(e.message, 'error'))
    qc.invalidateQueries({ queryKey: ['/api/alerts'] })
  }
  return (
    <>
      <PageHeader eyebrow="My Picks" image={IMG.bedroom} title="관심 매물" desc="저장한 관심 단지·매물의 최근 시세와 가격 알림을 한 곳에서 관리합니다." />
      <div className="container-x grid gap-6 py-6 lg:grid-cols-12">
        <section className="lg:col-span-8">
          {readOnly && <ReadOnlyNotice />}
          <h2 className="h3 mb-3 flex items-center gap-2"><Heart size={18} className="text-up" />관심 단지 · 매물</h2>
          {readOnly ? <Card><Empty title="테스트 관리자 계정은 관심 매물을 저장하지 않습니다." /></Card> : (
            <Async q={favs}>
              {(list) => list.length ? (
                <div className="space-y-3">
                  {list.map((f) => (
                    <Card key={f.id} className="flex flex-col gap-4 p-4 sm:flex-row">
                      <AptVisual id={f.complex_id} className="h-28 shrink-0 rounded-xl sm:w-40" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/apartments/${f.complex_id}`} className="block truncate font-display text-[18px] font-bold hover:text-brand-600">{f.complex_name}</Link>
                            <p className="caption">{f.region} · {f.build_year}년 · {f.households?.toLocaleString()}세대 {f.source === 'sample' && '· 샘플'}</p>
                          </div>
                          <button className="btn btn-ghost btn-sm text-up" onClick={() => remove(`/api/favorites/${f.id}`, '/api/favorites')} aria-label="삭제"><Trash2 size={16} /></button>
                        </div>
                        {f.property && <p className="mt-1 text-[14px]"><Badge tone="brand">{DEAL_LABEL[f.property.deal_type]}</Badge> 저장한 매물 호가 <b className="num">{dealPrice(f.property)}</b> · {f.property.floor}층</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {f.market.map((m) => (
                            <span key={m.type_name} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px]">
                              <b>{m.type_name}</b> 매매 {won(m.sale_avg)} · 전세 {won(m.jeonse_avg)} · 전세가율 {ratio(m.jeonse_ratio)}
                            </span>
                          ))}
                        </div>
                        {f.memo && <p className="caption mt-2">메모: {f.memo}</p>}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : <Card><Empty icon={Heart} title="아직 저장한 관심 매물이 없습니다."><Link to="/search" className="font-semibold text-brand-600">매물 검색하러 가기</Link></Empty></Card>}
            </Async>
          )}
        </section>
        <aside className="lg:col-span-4">
          <h2 className="h3 mb-3 flex items-center gap-2"><BellRing size={18} className="text-brand-600" />가격 알림</h2>
          <Card className="p-4">
            {readOnly ? <p className="caption">읽기 전용 계정입니다.</p> : (
              <Async q={alerts}>
                {(list) => list.length ? (
                  <ul className="divide-y divide-slate-100">
                    {list.map((a) => (
                      <li key={a.id} className="py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/apartments/${a.complex_id}`} className="block truncate font-semibold hover:text-brand-600">{a.complex_name}</Link>
                            <p className="caption">{a.type_name} · {DEAL_LABEL[a.deal_type]} · {won(a.target_price)} {a.condition === 'below' ? '이하' : '이상'}</p>
                            {a.last_triggered_at && <p className="caption text-pick!">최근 알림 {date(a.last_triggered_at)} · {won(a.last_triggered_price)}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button onClick={() => toggleAlert(a)} className={`chip ${a.active ? 'bg-pick-soft text-pick' : 'bg-slate-100 text-slate-500'}`}>{a.active ? 'ON' : 'OFF'}</button>
                            <button className="btn btn-ghost h-8 w-8 px-0 text-up" onClick={() => remove(`/api/alerts/${a.id}`, '/api/alerts')} aria-label="삭제"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <Empty title="등록된 가격 알림이 없습니다.">단지 상세 화면에서 ‘가격 알림’으로 목표 가격을 설정하세요.</Empty>}
              </Async>
            )}
          </Card>
        </aside>
      </div>
    </>
  )
}
