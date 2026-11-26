import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import AptVisual from './AptVisual'
import FavoriteButton from './FavoriteButton'
import { DEAL_LABEL } from '../utils/config'
import { date, dealPrice, won } from '../utils/format'

// 이미지 중심 상품 카드 (4:3 비주얼 · 최소 정보 · 호가/실거래/AI 가격 구분 표기)
export default function PropertyCard({ item, compact = false, badge, tags = [] }) {
  const diff = item.ai_price?.price ? (item.price / item.ai_price.price - 1) * 100 : null
  return (
    <Link to={`/apartments/${item.complex_id}?type=${item.apartment_id}`} className="group flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sand">
        {item.images?.[0]
          ? <img src={item.images[0]} alt={item.complex_name} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" loading="lazy" />
          : <AptVisual id={item.complex_id} floors={item.max_floor} className="h-full w-full" width={compact ? 600 : 800} />}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="chip bg-white/95 text-navy-900 shadow-sm">{DEAL_LABEL[item.deal_type]}</span>
          {item.source === 'sample' && <span className="chip bg-warn text-white">샘플</span>}
          {badge && <span className="chip bg-navy-900 text-white">{badge}</span>}
        </div>
        <FavoriteButton complexId={item.complex_id} propertyId={item.id} className="absolute top-3 right-3" />
      </div>
      <div className="flex flex-1 flex-col pt-3.5">
        <p className="caption truncate">{item.region}</p>
        <h3 className="mt-0.5 truncate font-display text-[17px] font-bold text-navy-900 underline-offset-4 group-hover:underline">{item.complex_name}</h3>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[12px] font-semibold text-slate-400">호가</span>
          <span className="num font-display text-[20px] font-extrabold tracking-tight text-navy-900">{dealPrice(item)}</span>
          {diff !== null && item.deal_type === 'sale' && (
            <span className={`num text-[13px] font-bold ${diff > 3 ? 'text-up' : diff < -3 ? 'text-down' : 'text-flat'}`}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}%</span>
          )}
        </p>
        <p className="mt-1 text-[13px] text-slate-500">
          {item.area}㎡{item.type_name && ` · ${item.type_name}`} · {item.floor ?? '-'}층 · {item.build_year}년{!compact && item.households ? ` · ${item.households.toLocaleString()}세대` : ''}
        </p>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="chip bg-mint-50 text-mint-600">#{t}</span>)}</div>
        )}
        <div className="mt-3 space-y-1 border-t border-line pt-2.5 text-[12.5px]">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">최근 실거래</span>
            <span className="num truncate font-semibold text-slate-700">{item.recent_trade ? `${won(item.recent_trade.price)} · ${date(item.recent_trade.deal_date).slice(2)}` : '거래 없음'}</span>
          </div>
          {item.ai_price && (
            <div className="flex justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-slate-500"><Sparkles size={12} className="text-brand-500" />{item.deal_type === 'sale' ? 'AI 분석 가격' : '전월세 시세'}</span>
              <span className="num font-semibold text-slate-700">{won(item.ai_price.price)}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
