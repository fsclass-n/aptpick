import { Link } from 'react-router-dom'

export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1f4bc9" />
      <path d="M14 46V27l12-9 12 9v19H30V35h-8v11z" fill="#fff" />
      <path d="M38 46V22l12-6v30z" fill="#2dd4bf" />
      <circle cx="46" cy="14" r="4" fill="#2dd4bf" />
    </svg>
  )
}

export default function Logo({ light = false, size = 32 }) {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="aptpick 홈">
      <LogoMark size={size} />
      <span className={`font-display text-[21px] font-extrabold tracking-tight ${light ? 'text-white' : 'text-navy-900'}`}>
        apt<span className="text-brand-600">pick</span>
      </span>
    </Link>
  )
}
