import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from '../components/Header'
import Footer from '../components/Footer'
import ToTop from '../components/ToTop'
import { Spinner } from '../components/ui'

export default function MainLayout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const fullBleed = pathname === '/map'
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<Spinner />}><Outlet /></Suspense>
      </main>
      {!fullBleed && <Footer />}
      <ToTop />
    </div>
  )
}
