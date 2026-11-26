// 매물 이미지가 없을 때 사용하는 단지 참고 이미지 (Unsplash 연출 사진 · 실제 단지 사진 아님)
// 이미지 로드 실패 시 단지 id 로 색·층 구성을 결정하는 SVG 일러스트로 대체
import { useState } from 'react'
import { complexImage } from '../utils/images'
const PALETTES = [
  ['#f6e5d9', '#a9522c', '#e1a47f'], ['#e0eadb', '#547449', '#b3caa8'], ['#efe9e0', '#35312e', '#a69c8f'],
  ['#fdf5e6', '#b25b07', '#f2c46d'], ['#f3e8e4', '#8a4224', '#d9a79a'], ['#e6e9ec', '#3b4a5a', '#9aa7b4'],
]

export default function AptVisual({ id = 1, floors = 20, className = '', label = '참고 이미지', photo = true, width = 800 }) {
  const [failed, setFailed] = useState(false)
  if (photo && !failed) {
    return (
      <div className={`relative overflow-hidden bg-sand ${className}`}>
        <img src={complexImage(id, width)} alt="" loading="lazy" onError={() => setFailed(true)}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
        {label && <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur">{label}</span>}
      </div>
    )
  }
  return <Illustration id={id} floors={floors} className={className} label={label} />
}

function Illustration({ id, floors, className, label }) {
  const [bg, main, sub] = PALETTES[id % PALETTES.length]
  const towers = 2 + (id % 3)
  const h = Math.min(1, (floors || 15) / 35)
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(160deg, ${bg}, #fff)` }}>
      <svg viewBox="0 0 320 180" className="h-full w-full" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <circle cx={250 - (id % 5) * 20} cy="40" r="18" fill={sub} opacity=".5" />
        <rect x="0" y="160" width="320" height="20" fill={sub} opacity=".35" />
        {Array.from({ length: towers }).map((_, i) => {
          const w = 56, x = 40 + i * (240 / towers), th = 70 + h * 70 - (i % 2) * 18
          return (
            <g key={i}>
              <rect x={x} y={160 - th} width={w} height={th} rx="4" fill={i % 2 ? sub : main} opacity={i % 2 ? 0.9 : 1} />
              {Array.from({ length: Math.floor(th / 14) }).map((__, r) => (
                <g key={r}>
                  {[0, 1, 2].map((c) => (
                    <rect key={c} x={x + 8 + c * 16} y={160 - th + 8 + r * 14} width="9" height="6" rx="1" fill="#fff" opacity={(r + c + id) % 4 ? 0.75 : 0.35} />
                  ))}
                </g>
              ))}
            </g>
          )
        })}
      </svg>
      {label && <span className="absolute bottom-2 left-2 rounded-md bg-white/85 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">{label}</span>}
    </div>
  )
}
