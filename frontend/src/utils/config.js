// Netlify 데모: VITE_USE_MOCK=true → 백엔드 없이 브라우저 Mock 데이터로 동작
export const USE_MOCK = String(import.meta.env.VITE_USE_MOCK ?? 'false') === 'true'
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')
export const WS_URL = (API_BASE ? API_BASE.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`) + '/ws/notifications'
export const MAP_PROVIDER = import.meta.env.VITE_MAP_PROVIDER === 'kakao' && import.meta.env.VITE_KAKAO_MAP_KEY ? 'kakao' : 'osm'
export const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY || ''

export const LINKS = {
  github: 'https://github.com/fsclass-n/aptpick',
  demo: 'https://aptpick.netlify.app',
  web: 'https://aptpick.onrender.com',
  api: 'https://aptpick-api.onrender.com/docs',
  aws: 'https://aptpick.duckdns.org',
  // SNS 채널: 개설 후 주소 입력 (빈 값이면 푸터에 '준비 중' 으로 표시)
  instagram: '',
  youtube: '',
  blog: '',
}

export const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
export const PASSWORD_RULE = '영문 대·소문자, 숫자, 특수문자를 모두 포함해 8자리 이상'
export const ROLE_LABEL = { user: '일반 사용자', admin: '관리자', test_admin: '테스트 관리자' }
export const READ_ONLY_MESSAGE = '테스트 관리자 계정은 읽기 전용입니다.'
export const DEAL_TYPES = [
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
]
export const DEAL_LABEL = { sale: '매매', jeonse: '전세', monthly: '월세' }
export const SORTS = [
  { value: 'recent', label: '최신 등록순' },
  { value: 'price_asc', label: '낮은 가격순' },
  { value: 'price_desc', label: '높은 가격순' },
  { value: 'area_desc', label: '넓은 면적순' },
  { value: 'build_year_desc', label: '최근 준공순' },
]
export const INFRA = {
  subway: { label: '지하철', color: '#7c3aed', icon: 'M' },
  bus: { label: '버스', color: '#0ea5e9', icon: 'B' },
  school: { label: '학교', color: '#f59e0b', icon: '학' },
  hospital: { label: '병원', color: '#ef4444', icon: '병' },
  pharmacy: { label: '약국', color: '#ec4899', icon: '약' },
  mart: { label: '마트', color: '#16a34a', icon: '마' },
  park: { label: '공원', color: '#22c55e', icon: '공' },
  culture: { label: '문화', color: '#6366f1', icon: '문' },
}
