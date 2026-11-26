import { Link } from 'react-router-dom'
import { Building2, CalendarDays, Layers, Ruler, Sparkles } from 'lucide-react'
import AptVisual from './AptVisual'
import FavoriteButton from './FavoriteButton'
import { Badge } from './ui'
import { DEAL_LABEL } from '../utils/config'
import { date, dealPrice, won } from '../utils/format'

const DEAL_TONE = { sale: 'brand', jeonse: 'mint', monthly: 'navy' }

export default function PropertyCard({ item, compact = false }) {
  const diff = item.ai_price?.price ? (item.price / item.ai_price.price - 1) * 100 : null
  return (
    <Link to={`/apartments/${item.complex_id}?type=${item.apartment_id}`} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-float">
      <div className="relative">
        {item.images?.[0] ? <img src={item.images[0]} alt={item.complex_name} className="h-40 w-full object-cover" loading="lazy" />
          : <AptVisual id={item.complex_id} floors={item.max_floor} className={compact ? 'h-28' : 'h-40'} label="단지 일러스트" />}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <Badge tone={DEAL_TONE[item.deal_type]}>{DEAL_LABEL[item.deal_type]}</Badge>
          {item.source === 'sample' && <Badge tone="warn">샘플</Badge>}
        </div>
        <FavoriteButton complexId={item.complex_id} propertyId={item.id} className="absolute top-3 right-3" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="caption truncate">{item.region}</p>
        <h3 className="mt-0.5 truncate font-display text-[17px] font-bold text-slate-900 group-hover:text-brand-700">{item.complex_name}</h3>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[12px] font-semibold text-slate-400">호가</span>
          <span className="num font-display text-[22px] font-extrabold text-slate-900">{dealPrice(item)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-slate-500">
          <span className="inline-flex items-center gap-1"><Ruler size={13} />{item.area}㎡ {item.type_name && `(${item.type_name})`}</span>
          <span className="inline-flex items-center gap-1"><Layers size={13} />{item.floor ?? '-'}/{item.max_floor ?? '-'}층</span>
          <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{item.build_year}년</span>
          {!compact && item.households && <span className="inline-flex items-center gap-1"><Building2 size={13} />{item.households.toLocaleString()}세대</span>}
        </div>
        <div className="mt-auto space-y-1.5 border-t border-slate-100 pt-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-slate-500">최근 실거래가</span>
            <span className="num font-semibold text-slate-700">{item.recent_trade ? `${won(item.recent_trade.price)} · ${date(item.recent_trade.deal_date).slice(2)}` : '거래 없음'}</span>
          </div>
          {item.ai_price && (
            <div className="flex justify-between">
              <span className="inline-flex items-center gap-1 text-slate-500"><Sparkles size={13} className="text-mint-500" />{item.deal_type === 'sale' ? 'AI 분석 가격' : '전월세 시세'}</span>
              <span className="num font-semibold text-slate-700">
                {won(item.ai_price.price)}
                {diff !== null && item.deal_type !== 'monthly' && <span className={`ml-1 ${diff > 3 ? 'text-up' : diff < -3 ? 'text-down' : 'text-flat'}`}>({diff > 0 ? '+' : ''}{diff.toFixed(1)}%)</span>}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
