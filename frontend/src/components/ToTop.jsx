import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

// 우측 하단 원형 'To the Top' 플로팅 버튼 (테두리 링으로 스크롤 진행률 표시)
const R = 22
const C = 2 * Math.PI * R

export default function ToTop() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? window.scrollY / max : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const show = progress > 0.08
  return (
    <button onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label="맨 위로 이동"
      className={`group fixed right-4 bottom-5 z-[900] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white text-navy-900 shadow-float transition duration-300 hover:bg-navy-900 hover:text-white md:right-8 md:bottom-8 ${show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={R} fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="2" />
        <circle cx="26" cy="26" r={R} fill="none" stroke="#c2653a" strokeWidth="2" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
      <ArrowUp size={19} className="transition group-hover:-translate-y-0.5" />
    </button>
  )
}
