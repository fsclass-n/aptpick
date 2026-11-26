import axios from 'axios'
import { API_BASE } from '../utils/config'

const TOKEN_KEY = 'aptpick.token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY))

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const http = axios.create({ baseURL: API_BASE, timeout: 60000, headers: { 'Content-Type': 'application/json' } })

// Netlify 데모: 실제 HTTP 대신 브라우저 Mock 서버로 요청 전달 (지연 로딩 → 운영 번들에는 포함되지 않음)
// import.meta.env 를 직접 비교해야 빌드 시 상수 치환 → 운영 빌드에서 Mock 청크가 제거됨
if (import.meta.env.VITE_USE_MOCK === 'true') {
  http.defaults.adapter = async (config) => {
    const { mockAdapter } = await import('../mock/server.js')
    return mockAdapter(config)
  }
}

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function detailMessage(data, status) {
  const detail = data?.detail
  if (Array.isArray(detail)) return detail[0]?.msg || '입력값을 확인해 주세요.'
  return detail || (status >= 500 ? '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' : '요청을 처리하지 못했습니다.')
}

http.interceptors.response.use(
  (res) => res,
  (error) => {
    const res = error.response
    if (!res) {
      throw new ApiError(0, '서버에 연결할 수 없습니다. (Render 무료 플랜은 첫 요청 시 최대 1분 정도 기동 시간이 걸릴 수 있습니다)')
    }
    if (res.status === 401 && getToken()) {
      setToken(null)
      window.dispatchEvent(new Event('aptpick:logout'))
    }
    throw new ApiError(res.status, detailMessage(res.data, res.status), res.data?.code)
  },
)

const unwrap = (p) => p.then((r) => r.data)
export const api = {
  get: (url, params) => unwrap(http.get(url, { params })),
  post: (url, body = {}) => unwrap(http.post(url, body)),
  put: (url, body = {}) => unwrap(http.put(url, body)),
  patch: (url, body = {}) => unwrap(http.patch(url, body)),
  del: (url) => unwrap(http.delete(url)),
}
export const oauthLoginUrl = (provider) => `${API_BASE}/api/auth/oauth/${provider}/login`
