import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from './ui'

// 비로그인 → /login?next=원래경로, 로그인 후 원래 페이지로 복귀
export default function ProtectedRoute({ children, admin = false }) {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner label="로그인 정보를 확인하는 중…" />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (admin && !isAdmin) return <Navigate to="/" replace />
  return children
}
