import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getToken, setToken } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!getToken())
  const qc = useQueryClient()

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    qc.clear()
  }, [qc])

  useEffect(() => {
    if (getToken()) {
      api.get('/api/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false))
    }
    const onLogout = () => setUser(null)
    window.addEventListener('aptpick:logout', onLogout)
    return () => window.removeEventListener('aptpick:logout', onLogout)
  }, [])

  const login = useCallback((res) => {
    setToken(res.access_token)
    setUser(res.user)
    qc.invalidateQueries()
  }, [qc])

  const value = useMemo(() => ({
    user, loading, login, logout, setUser,
    isAdmin: user?.role === 'admin' || user?.role === 'test_admin',
    readOnly: user?.role === 'test_admin',
  }), [user, loading, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
