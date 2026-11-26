import { Link } from 'react-router-dom'

// 로고 마크: 잉크 바탕 위 지붕 + 클레이 '픽' 포인트 (집을 고르는 핀)
export function LogoMark({ size = 32, light = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill={light ? '#f8f5f0' : '#1a1816'} />
      <path d="M14 47V29.5L32 16l18 13.5V47H39V36H25v11z" fill={light ? '#1a1816' : '#f8f5f0'} />
      <circle cx="47" cy="17" r="6" fill="#c2653a" />
    </svg>
  )
}

export default function Logo({ light = false, size = 30 }) {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="aptpick 홈">
      <LogoMark size={size} light={light} />
      <span className={`font-display text-[21px] font-extrabold tracking-[-0.04em] ${light ? 'text-white' : 'text-navy-900'}`}>
        aptpick<span className="text-brand-500">.</span>
      </span>
    </Link>
  )
}
