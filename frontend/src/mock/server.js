// Netlify 데모(VITE_USE_MOCK=true)용 브라우저 Mock API.
// 응답 원본은 scripts/export_mock.py 가 실제 백엔드(가상 샘플 데이터)에서 기록한 snapshot.json 이며,
// 필터·정렬·페이지네이션·인증·권한(test_admin 읽기 전용) 규칙은 백엔드와 동일하게 모사합니다.
import snapshot from './snapshot.json'
import { recommendMock } from './recommend'
import { PASSWORD_RE, PASSWORD_RULE } from '../utils/config'

const KEY = 'aptpick.mock.v1'
const READ_ONLY_EXEMPT = new Set(['/api/auth/login', '/api/auth/test-login', '/api/auth/admin-key-login', '/api/auth/logout', '/api/ai/recommend', '/api/reports/ask'])
const now = () => new Date().toISOString()
const SEED = () => ({
  users: [
    { id: 1, email: 'user@aptpick.kr', name: '테스트 사용자', role: 'user', provider: 'local', phone: null, is_active: true, password: null, created_at: now(), last_login_at: null },
    { id: 2, email: 'testadmin@aptpick.kr', name: '테스트 관리자', role: 'test_admin', provider: 'local', phone: null, is_active: true, password: null, created_at: now(), last_login_at: null },
  ],
  favorites: [], alerts: [], notifications: [], prefs: {}, searches: [], history: [], inquiries: [], seq: 100,
})
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || SEED() } catch { return SEED() } }
let db = load()
const save = () => localStorage.setItem(KEY, JSON.stringify(db))
const nextId = () => { db.seq += 1; return db.seq }

class HttpError extends Error {
  constructor(status, detail, code) { super(detail); this.status = status; this.detail = detail; this.code = code }
}
const fail = (status, detail, code) => { throw new HttpError(status, detail, code) }
const publicUser = ({ password, ...u }) => u
const paginate = (items, page = 1, size = 12) => {
  const p = Number(page) || 1
  const s = Number(size) || 12
  return { items: items.slice((p - 1) * s, p * s), total: items.length, page: p, size: s, pages: Math.max(1, Math.ceil(items.length / s)) }
}
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v))
const haversine = (a, b, c, d) => {
  const r = (x) => (x * Math.PI) / 180
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
const DEFAULT_PREF = { region_codes: [], deal_type: 'sale', budget_min: null, budget_max: null, monthly_max: null, area_min: null, area_max: null, rooms_min: null,
  build_year_min: null, transport_weight: 3, school_weight: 3, infra_weight: 3, purpose: 'residence' }

function userFrom(headers) {
  const auth = headers?.Authorization || headers?.authorization || ''
  const m = String(auth).match(/^Bearer mock-(\d+)$/)
  return m ? db.users.find((u) => u.id === Number(m[1]) && u.is_active) : null
}
const issue = (u) => { u.last_login_at = now(); save(); return { access_token: `mock-${u.id}`, token_type: 'bearer', user: publicUser(u) } }
const need = (user) => user || fail(401, '로그인이 필요합니다.')
const needAdminView = (user) => (['admin', 'test_admin'].includes(need(user).role) ? user : fail(403, '관리자 권한이 필요합니다.'))
const needAdminWrite = (user) => (need(user).role === 'admin' ? user : fail(403, '테스트 관리자 계정은 읽기 전용입니다.'))

function filterProps(q) {
  let items = snapshot.properties
  const like = (s) => s && s.toLowerCase().includes(q.q.trim().toLowerCase())
  if (q.q) items = items.filter((p) => like(p.complex_name) || like(p.region))
  if (q.region) items = items.filter((p) => p.region_code === q.region)
  if (q.deal_type) items = items.filter((p) => p.deal_type === q.deal_type)
  const rng = [['price_min', 'price', 1], ['price_max', 'price', -1], ['area_min', 'area', 1], ['area_max', 'area', -1], ['build_year_min', 'build_year', 1],
    ['build_year_max', 'build_year', -1], ['rooms_min', 'rooms', 1], ['rent_max', 'monthly_rent', -1]]
  rng.forEach(([k, f, dir]) => { if (num(q[k]) !== null) items = items.filter((p) => (dir > 0 ? (p[f] ?? 0) >= num(q[k]) : (p[f] ?? 0) <= num(q[k]))) })
  const sorters = { recent: (a, b) => b.registered_at.localeCompare(a.registered_at), price_asc: (a, b) => a.price - b.price, price_desc: (a, b) => b.price - a.price,
    area_desc: (a, b) => b.area - a.area, area_asc: (a, b) => a.area - b.area, build_year_desc: (a, b) => b.build_year - a.build_year }
  return [...items].sort(sorters[q.sort] || sorters.recent)
}

function complexDetail(id) {
  const d = snapshot.details[id] || fail(404, '단지를 찾을 수 없습니다.')
  return { ...d, listings: snapshot.properties.filter((p) => p.complex_id === Number(id)), meta: snapshot.meta }
}

function predict(id, floor) {
  const p = snapshot.predicts[id] || fail(404, '평형 정보를 찾을 수 없습니다.')
  let estimate = p.estimate
  if (estimate && floor && p.effects?.floor?.length) {
    const near = (f) => p.effects.floor.reduce((a, b) => (Math.abs(b.floor - f) < Math.abs(a.floor - f) ? b : a))
    const ratio = near(Number(floor)).price / near(estimate.floor).price
    estimate = { ...estimate, floor: Number(floor), price: Math.round(estimate.price * ratio / 10) * 10, lower: Math.round(estimate.lower * ratio / 10) * 10, upper: Math.round(estimate.upper * ratio / 10) * 10 }
  }
  return { ...p, estimate, model: snapshot.model, meta: snapshot.meta }
}

function evaluateAlert(a) {
  const prices = snapshot.properties.filter((p) => p.complex_id === a.complex_id && p.deal_type === a.deal_type && (!a.apartment_id || p.apartment_id === a.apartment_id)).map((p) => p.price)
  if (!a.active || !prices.length) return false
  const price = a.condition === 'below' ? Math.min(...prices) : Math.max(...prices)
  const hit = a.condition === 'below' ? price <= a.target_price : price >= a.target_price
  if (!hit || a.last_triggered_price === price) return false
  Object.assign(a, { last_triggered_at: now(), last_triggered_price: price })
  const c = snapshot.details[a.complex_id]?.complex
  db.notifications.unshift({ id: nextId(), user_id: a.user_id, kind: 'price_alert', title: `${c?.name || '관심 단지'} 가격 알림`, read: false, created_at: now(), link: `/apartments/${a.complex_id}`,
    message: `등록 매물 호가 ${price.toLocaleString()}만원 — 설정한 ${a.target_price.toLocaleString()}만원 ${a.condition === 'below' ? '이하' : '이상'} 조건을 충족했습니다.` })
  return true
}

function alertOut(a) {
  const d = snapshot.details[a.complex_id]
  return { ...a, complex_name: d?.complex.name || '', type_name: d?.types.find((t) => t.id === a.apartment_id)?.type_name || '전체 평형' }
}

const routes = []
const on = (method, pattern, handler) => routes.push([method, new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler])

// ---------- 인증
on('GET', '/api/auth/me', ({ user }) => publicUser(need(user)))
on('PATCH', '/api/auth/me', ({ user, body }) => { Object.assign(need(user), body); save(); return publicUser(user) })
on('POST', '/api/auth/test-login', ({ body }) => issue(db.users.find((u) => u.role === (body.kind === 'test_admin' ? 'test_admin' : 'user') && u.id <= 2)))
on('POST', '/api/auth/admin-key-login', () => fail(503, 'Netlify 데모에서는 실제 관리자 로그인을 지원하지 않습니다. 테스트 관리자(읽기 전용)로 체험해 주세요.'))
on('POST', '/api/auth/logout', () => ({ ok: true }))
on('POST', '/api/auth/signup', ({ body }) => {
  if (!PASSWORD_RE.test(body.password || '')) fail(422, `비밀번호는 ${PASSWORD_RULE}이어야 합니다.`)
  const email = String(body.email).toLowerCase()
  if (db.users.some((u) => u.email === email)) fail(409, '이미 가입된 이메일입니다.')
  const u = { id: nextId(), email, name: body.name, phone: body.phone || null, role: 'user', provider: 'local', is_active: true, password: body.password, created_at: now(), last_login_at: null }
  db.users.push(u)
  return issue(u)
})
on('POST', '/api/auth/login', ({ body }) => {
  const u = db.users.find((x) => x.email === String(body.email).toLowerCase())
  if (!u || !u.password || u.password !== body.password) fail(401, '이메일 또는 비밀번호가 올바르지 않습니다.')
  return issue(u)
})
on('POST', '/api/auth/me/withdraw', ({ user }) => {
  if (need(user).id <= 2) fail(400, '테스트 계정과 관리자 계정은 탈퇴할 수 없습니다.')
  db.users = db.users.filter((u) => u.id !== user.id)
  save()
  return { ok: true }
})
on('GET', '/api/auth/oauth/providers', () => ({ google: false, naver: false, kakao: false }))

// ---------- 지역 · 아파트 · 실거래
on('GET', '/api/regions', () => snapshot.regions)
on('GET', '/api/apartments', ({ q }) => snapshot.complexes.filter((c) => (!q.region || c.region_code === q.region) && (!q.q || c.name.includes(q.q))).slice(0, Number(q.limit) || 100))
on('GET', '/api/apartments/suggest', ({ q }) => ({ complexes: snapshot.complexes.filter((c) => c.name.includes(q.q || '')).slice(0, 8).map((c) => ({ id: c.id, name: c.name, region: c.region })),
  regions: snapshot.regions.filter((r) => r.name.includes(q.q || '')).slice(0, 5).map((r) => ({ code: r.code, name: r.name })) }))
on('GET', '/api/apartments/search', ({ q, user }) => {
  if ((q.q || q.region) && user) { db.searches.unshift({ id: nextId(), user_id: user.id, keyword: q.q || '', region_code: q.region || '', deal_type: q.deal_type || '', filters: q, created_at: now() }); save() }
  return { ...paginate(filterProps(q), q.page, q.size), meta: snapshot.meta }
})
on('GET', '/api/transactions/search', ({ q }) => {
  let items = snapshot.transactions
  if (q.q) items = items.filter((t) => t.complex_name.includes(q.q) || t.region.includes(q.q))
  if (q.region) { const name = snapshot.regions.find((r) => r.code === q.region)?.name; items = items.filter((t) => t.region === name) }
  ;[['price_min', 'price', 1], ['price_max', 'price', -1], ['area_min', 'area', 1], ['area_max', 'area', -1]].forEach(([k, f, dir]) => {
    if (num(q[k]) !== null) items = items.filter((t) => (dir > 0 ? t[f] >= num(q[k]) : t[f] <= num(q[k])))
  })
  if (q.date_from) items = items.filter((t) => t.deal_date >= q.date_from)
  if (q.date_to) items = items.filter((t) => t.deal_date <= q.date_to)
  return { ...paginate(items, q.page, q.size || 20), meta: { ...snapshot.meta, note: 'Netlify 데모는 최근 12개월 거래만 포함' } }
})
on('GET', '/api/apartments/map', ({ q }) => ({ meta: snapshot.meta, items: snapshot.map.filter((c) => c.lat >= +q.sw_lat && c.lat <= +q.ne_lat && c.lng >= +q.sw_lng && c.lng <= +q.ne_lng && (!q.deal_type || c.listings[q.deal_type])) }))
on('GET', '/api/infrastructure', ({ q }) => {
  const per = {}
  const items = snapshot.infra.map((p) => ({ ...p, distance_m: Math.round(haversine(+q.lat, +q.lng, p.lat, p.lng)) }))
    .filter((p) => p.distance_m <= (+q.radius || 1500)).sort((a, b) => a.distance_m - b.distance_m)
    .filter((p) => { per[p.category] = (per[p.category] || 0) + 1; return per[p.category] <= 20 })
  return { items }
})
on('GET', '/api/apartments/:id', ({ params }) => complexDetail(params.id))
on('GET', '/api/properties/:id', ({ params }) => snapshot.properties.find((p) => p.id === Number(params.id)) || fail(404, '매물을 찾을 수 없습니다.'))

// ---------- 시장 분석
on('GET', '/api/market/overview', () => snapshot.overview)
on('GET', '/api/market/regions', () => snapshot.market_regions)
on('GET', '/api/market/heatmap', () => snapshot.heatmap)
on('GET', '/api/market/anomalies', () => snapshot.anomalies)
on('GET', '/api/market/recent-transactions', ({ q }) => ({ ...snapshot.recent, items: snapshot.recent.items.slice(0, Number(q.limit) || 20) }))
on('GET', '/api/market/popular-regions', () => snapshot.popular)
on('GET', '/api/market/regions/:code', ({ params }) => snapshot.region_detail[params.code]
  || { region: snapshot.regions.find((r) => r.code === params.code) || fail(404, '지역을 찾을 수 없습니다.'), meta: snapshot.meta, has_data: false })
on('GET', '/api/market/compare', ({ q }) => ({ meta: snapshot.meta, items: String(q.codes || '').split(',').slice(0, 4).map((c) => snapshot.region_detail[c]).filter(Boolean)
  .map((d) => ({ region: d.region, monthly: d.monthly, indicators: d.indicators })) }))

// ---------- AI
on('GET', '/api/ai/model', () => snapshot.model)
on('GET', '/api/ai/predict/:id', ({ params, q }) => predict(params.id, q.floor))
on('POST', '/api/ai/recommend', ({ body, user }) => {
  const res = recommendMock(snapshot, body)
  if (user?.role === 'user') {
    db.history.unshift({ id: nextId(), user_id: user.id, conditions: body, model_version: res.algorithm, created_at: now(),
      results: res.results.map(({ property_id, complex_id, complex_name, score, price, monthly_rent, deal_type, area }) => ({ property_id, complex_id, complex_name, score, price, monthly_rent, deal_type, area })) })
    if (body.save_preference) db.prefs[user.id] = { ...DEFAULT_PREF, ...db.prefs[user.id], ...Object.fromEntries(Object.keys(DEFAULT_PREF).map((k) => [k, body[k] ?? null])) }
    save()
  }
  return res
})
on('GET', '/api/ai/recommendations/history', ({ user }) => db.history.filter((h) => h.user_id === need(user).id).slice(0, 20))

// ---------- 관심 매물 · 알림 · 개인화
on('GET', '/api/favorites', ({ user }) => db.favorites.filter((f) => f.user_id === need(user).id).map((f) => {
  const d = snapshot.details[f.complex_id]
  const prop = f.property_id ? snapshot.properties.find((p) => p.id === f.property_id) : null
  return { ...f, complex_name: d.complex.name, region: d.complex.region, build_year: d.complex.build_year, households: d.complex.households, source: d.complex.source,
    market: d.types.map((t) => ({ type_name: t.type_name, area: t.area, ...t.market })), property: prop && { id: prop.id, deal_type: prop.deal_type, price: prop.price, monthly_rent: prop.monthly_rent, floor: prop.floor, status: prop.status } }
}))
on('POST', '/api/favorites', ({ user, body }) => {
  need(user)
  const pid = body.property_id ?? null
  let f = db.favorites.find((x) => x.user_id === user.id && x.complex_id === body.complex_id && x.property_id === pid)
  if (!f) { f = { id: nextId(), user_id: user.id, complex_id: body.complex_id, property_id: pid, memo: body.memo || '', created_at: now() }; db.favorites.unshift(f); save() }
  return { id: f.id, complex_id: f.complex_id, property_id: f.property_id }
})
on('DELETE', '/api/favorites/:id', ({ user, params }) => { db.favorites = db.favorites.filter((f) => !(f.id === Number(params.id) && f.user_id === need(user).id)); save(); return { ok: true } })
on('GET', '/api/alerts', ({ user }) => db.alerts.filter((a) => a.user_id === need(user).id).map(alertOut))
on('POST', '/api/alerts', ({ user, body }) => {
  const a = { id: nextId(), user_id: need(user).id, active: true, last_triggered_at: null, last_triggered_price: null, created_at: now(), ...body }
  db.alerts.unshift(a)
  const triggered = evaluateAlert(a)
  save()
  return { ...alertOut(a), triggered }
})
on('PATCH', '/api/alerts/:id', ({ user, params, body }) => {
  const a = db.alerts.find((x) => x.id === Number(params.id) && x.user_id === need(user).id) || fail(404, '항목을 찾을 수 없습니다.')
  Object.assign(a, body, { last_triggered_price: null })
  evaluateAlert(a)
  save()
  return alertOut(a)
})
on('DELETE', '/api/alerts/:id', ({ user, params }) => { db.alerts = db.alerts.filter((a) => !(a.id === Number(params.id) && a.user_id === need(user).id)); save(); return { ok: true } })
on('GET', '/api/notifications', ({ user }) => {
  const items = db.notifications.filter((n) => n.user_id === need(user).id || n.user_id === null)
  return { items, unread: items.filter((n) => !n.read && n.user_id === user.id).length }
})
on('POST', '/api/notifications/read-all', ({ user }) => { db.notifications.forEach((n) => { if (n.user_id === need(user).id) n.read = true }); save(); return { ok: true } })
on('GET', '/api/me/preferences', ({ user }) => ({ ...DEFAULT_PREF, ...(db.prefs[need(user).id] || {}), saved_searches: db.prefs[user.id]?.saved_searches || [] }))
on('PUT', '/api/me/preferences', ({ user, body }) => { db.prefs[need(user).id] = { ...db.prefs[user.id], ...body }; save(); return { ...DEFAULT_PREF, ...db.prefs[user.id], saved_searches: db.prefs[user.id].saved_searches || [] } })
on('POST', '/api/me/saved-searches', ({ user, body }) => {
  const p = (db.prefs[need(user).id] ||= {})
  p.saved_searches = [{ name: body.name, query: body.query, saved_at: now() }, ...(p.saved_searches || []).filter((s) => s.name !== body.name)].slice(0, 10)
  save()
  return p.saved_searches
})
on('DELETE', '/api/me/saved-searches/:name', ({ user, params }) => {
  const p = db.prefs[need(user).id] || {}
  p.saved_searches = (p.saved_searches || []).filter((s) => s.name !== decodeURIComponent(params.name))
  save()
  return p.saved_searches
})
on('GET', '/api/me/recent-searches', ({ user }) => db.searches.filter((s) => s.user_id === need(user).id).slice(0, 10)
  .map((s) => ({ ...s, region: snapshot.regions.find((r) => r.code === s.region_code)?.name || '' })))
on('POST', '/api/inquiries', ({ user, body }) => { const i = { id: nextId(), user_id: user?.id ?? null, status: 'open', answer: '', created_at: now(), ...body }; db.inquiries.unshift(i); save(); return { id: i.id, status: i.status } })

// ---------- 리포트
on('GET', '/api/reports', ({ q }) => {
  const items = snapshot.reports.items.filter((r) => !q.kind || r.kind === q.kind)
  return { ...paginate(items, q.page, q.size || 12), kinds: snapshot.reports.kinds, sections: snapshot.reports.sections }
})
on('GET', '/api/reports/:id', ({ params }) => snapshot.report_detail[params.id] || fail(404, '리포트를 찾을 수 없습니다.'))
on('POST', '/api/reports/generate', ({ user }) => needAdminWrite(user))
on('POST', '/api/reports/ask', ({ user, body }) => {
  need(user)
  const k = snapshot.overview.kpi
  const d = snapshot.region_detail[body.region_code]
  const last = d?.monthly?.at(-1)
  const sign = (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`
  const answer = [`Netlify 데모에서는 Gemini 대신 통계 요약으로 답변합니다. ${k.period} 기준 분석 지역 ㎡당 평균가는 ${k.ppm2}만원, 전년 대비 ${sign(k.yoy)}, 전세가율 ${(k.jeonse_ratio * 100).toFixed(1)}% 입니다.`,
    last && `${d.region.name}의 최근 월 ㎡당가는 ${last.ma3}만원(전월 대비 ${sign(last.mom)}), 거래 ${last.volume}건입니다.`, '(가상 샘플 데이터 기준)'].filter(Boolean).join(' ')
  return { answer, generator: 'rule', verification: { passed: true, unverified: [], checked: 0 }, meta: snapshot.meta }
})

// ---------- 관리자 (데모에서는 테스트 관리자만 접근 → 조회 전용, 개인정보 마스킹)
const A = snapshot.admin
on('GET', '/api/admin/dashboard', ({ user }) => (needAdminView(user), A.dashboard))
on('GET', '/api/admin/users', ({ user, q }) => {
  needAdminView(user)
  const items = A.users.items.filter((u) => (!q.q || u.email.includes(q.q) || u.name.includes(q.q)) && (!q.role || u.role === q.role))
  return { ...paginate(items, q.page, q.size || 20), masked: true }
})
on('GET', '/api/admin/properties', ({ user, q }) => {
  needAdminView(user)
  const all = [...A.pending.items, ...A.properties.items.filter((p) => p.status !== 'pending')]
  const items = all.filter((p) => (!q.status || p.status === q.status) && (!q.q || p.complex_name.includes(q.q)))
  return paginate(items, q.page, q.size || 20)
})
on('GET', '/api/admin/properties/duplicates', ({ user }) => (needAdminView(user), A.duplicates))
on('GET', '/api/admin/complexes/:id/types', ({ user, params }) => (needAdminView(user), A.types[params.id] || []))
on('GET', '/api/admin/data/sources', ({ user }) => (needAdminView(user), A.sources))
on('GET', '/api/admin/data/logs', ({ user }) => (needAdminView(user), A.logs))
on('GET', '/api/admin/models', ({ user }) => (needAdminView(user), A.models))
on('GET', '/api/admin/anomalies', ({ user }) => (needAdminView(user), A.anomalies))
on('GET', '/api/admin/audit-logs', ({ user }) => (needAdminView(user), A.audit))
on('GET', '/api/admin/inquiries', ({ user }) => (needAdminView(user), [...db.inquiries.map((i) => ({ ...i, name: `${i.name[0]}*`, email: i.email.replace(/^(.{2}).*@/, '$1***@') })), ...A.inquiries]))

export async function mockAdapter(config) {
  const url = new URL(config.url, 'http://mock.local')
  const method = (config.method || 'get').toUpperCase()
  const path = url.pathname
  const q = { ...Object.fromEntries(url.searchParams), ...(config.params || {}) }
  const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : config.data || {}
  const headers = config.headers?.toJSON ? config.headers.toJSON() : config.headers
  const user = userFrom(headers)
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180))
  let status = 200
  let data
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !READ_ONLY_EXEMPT.has(path) && user?.role === 'test_admin') {
      fail(403, '테스트 관리자 계정은 읽기 전용입니다.', 'READ_ONLY')
    }
    const route = routes.find(([m, re]) => m === method && re.test(path))
    if (!route) fail(404, `데모에서 지원하지 않는 API 입니다: ${method} ${path}`)
    data = route[2]({ q, body, user, params: path.match(route[1]).groups || {} })
    if (method === 'POST' && ['/api/auth/signup', '/api/favorites', '/api/alerts', '/api/inquiries'].includes(path)) status = 201
  } catch (err) {
    if (!(err instanceof HttpError)) throw err
    const error = new Error(err.detail)
    error.response = { status: err.status, data: { detail: err.detail, code: err.code }, config, headers: {} }
    error.config = config
    throw error
  }
  return { data: structuredClone(data), status, statusText: 'OK', headers: {}, config, request: {} }
}
