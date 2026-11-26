import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui'

export default function OAuthCallback() {
  const { login } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token')
    if (!token) { navigate('/login?error=oauth_failed', { replace: true }); return }
    setToken(token)
    api.get('/api/auth/me')
      .then((user) => {
        login({ access_token: token, user })
        navigate(sessionStorage.getItem('aptpick.next') || '/', { replace: true })
        sessionStorage.removeItem('aptpick.next')
      })
      .catch(() => navigate('/login?error=oauth_failed', { replace: true }))
  }, [login, navigate])
  return <Spinner label="소셜 로그인 처리 중…" />
}
