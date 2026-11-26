import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

export default function ToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => { setShow(window.scrollY > 480) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <button onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label="맨 위로"
      className={`fixed right-4 bottom-5 z-[900] flex h-12 w-12 items-center justify-center rounded-full bg-navy-900 text-white shadow-float transition md:right-6 md:bottom-8 ${show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}>
      <ArrowUp size={20} />
    </button>
  )
}
