// 매물 이미지가 없을 때 사용하는 단지 일러스트 (단지 id 로 색·층 구성 결정 — 실제 사진 아님)
const PALETTES = [
  ['#dce7ff', '#1f4bc9', '#8fb0fa'], ['#ccfbef', '#0d9488', '#5eead4'], ['#e0e7ff', '#3730a3', '#a5b4fc'],
  ['#fef3c7', '#b45309', '#fcd34d'], ['#fce7f3', '#be185d', '#f9a8d4'], ['#e2e8f0', '#1b3160', '#94a3b8'],
]

export default function AptVisual({ id = 1, floors = 20, className = '', label }) {
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
