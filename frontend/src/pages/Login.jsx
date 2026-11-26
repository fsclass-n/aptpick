import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, KeyRound, ShieldCheck, UserRound } from 'lucide-react'
import { api, oauthLoginUrl } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Card, Field, Segmented } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { PASSWORD_RE, PASSWORD_RULE, USE_MOCK } from '../utils/config'

const OAUTH = [
  { id: 'kakao', label: '카카오로 시작하기', cls: 'bg-[#FEE500] text-[#191600] hover:brightness-95' },
  { id: 'naver', label: '네이버로 시작하기', cls: 'bg-[#03C75A] text-white hover:brightness-95' },
  { id: 'google', label: 'Google로 시작하기', cls: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' },
]
const ERRORS = { oauth_not_configured: '해당 소셜 로그인은 아직 서버에 설정되지 않았습니다. (OAuth Client ID 등록 필요)', oauth_failed: '소셜 로그인에 실패했습니다. 다시 시도해 주세요.' }

export default function Login() {
  const [params] = useSearchParams()
  const next = params.get('next')?.startsWith('/') ? params.get('next') : '/'
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' })
  const [adminKey, setAdminKey] = useState('')
  const [showAdmin, setShowAdmin] = useState(false)
  const [busy, setBusy] = useState('')
  const { login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const run = async (key, fn) => {
    setBusy(key)
    try {
      const res = await fn()
      login(res)
      toast(`${res.user.name}님, 환영합니다.`)
      navigate(res.user.role !== 'user' && next === '/' ? '/admin' : next, { replace: true })
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy('')
    }
  }
  const submit = (e) => {
    e.preventDefault()
    if (mode === 'signup' && !PASSWORD_RE.test(form.password)) return toast(`비밀번호는 ${PASSWORD_RULE}이어야 합니다.`, 'error')
    return run('form', () => (mode === 'login'
      ? api.post('/api/auth/login', { email: form.email, password: form.password })
      : api.post('/api/auth/signup', { ...form, phone: form.phone || null })))
  }
  const oauth = (provider) => {
    sessionStorage.setItem('aptpick.next', next)
    if (USE_MOCK) return toast('Netlify 데모에서는 소셜 로그인을 사용할 수 없습니다. 테스트 계정으로 체험해 주세요.', 'info')
    window.location.href = oauthLoginUrl(provider)
    return undefined
  }

  return (
    <div className="bg-gradient-to-b from-brand-50 to-slate-50">
      <div className="container-x grid gap-8 py-10 md:py-16 lg:grid-cols-12">
        <div className="hidden lg:col-span-6 lg:flex lg:flex-col lg:justify-center">
          <LogoMark size={56} />
          <h1 className="h1 mt-6 text-[36px]!">데이터로 분석하고,<br />AI로 찾는 나에게 맞는 부동산</h1>
          <p className="mt-4 max-w-md text-slate-600">로그인하면 관심 단지 저장, 가격 알림, AI 맞춤 추천 이력과 개인화 선호 조건을 이용할 수 있습니다.</p>
          <ul className="mt-6 space-y-2 text-[15px] text-slate-600">
            {['국토교통부 실거래가 기반 시장 분석', 'AI 적정가 추정과 예측 범위·모델 성능 공개', '예산·지역·교통·학군 맞춤 추천과 추천 근거'].map((t) => (
              <li key={t} className="flex items-center gap-2"><ShieldCheck size={18} className="text-mint-500" />{t}</li>
            ))}
          </ul>
        </div>
        <Card className="mx-auto w-full max-w-md p-6 md:p-8 lg:col-span-5 lg:col-start-8">
          {params.get('error') && <p className="mb-4 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">{ERRORS[params.get('error')] || '로그인 오류'}</p>}
          <Segmented value={mode} onChange={setMode} options={[{ value: 'login', label: '로그인' }, { value: 'signup', label: '회원가입' }]} />
          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === 'signup' && <Field label="이름"><input className="input" required value={form.name} onChange={set('name')} autoComplete="name" /></Field>}
            <Field label="이메일"><input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></Field>
            <Field label="비밀번호" hint={mode === 'signup' ? PASSWORD_RULE : undefined}>
              <input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </Field>
            {mode === 'signup' && <Field label="휴대폰 (선택)"><input className="input" value={form.phone} onChange={set('phone')} placeholder="010-0000-0000" /></Field>}
            <button className="btn btn-primary w-full" disabled={!!busy}>{busy === 'form' ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}</button>
          </form>
          <div className="my-5 flex items-center gap-3 text-[12px] text-slate-400"><span className="h-px flex-1 bg-slate-200" />간편 로그인<span className="h-px flex-1 bg-slate-200" /></div>
          <div className="space-y-2">
            {OAUTH.map((o) => <button key={o.id} type="button" onClick={() => oauth(o.id)} className={`btn w-full ${o.cls}`}>{o.label}</button>)}
          </div>
          <div className="mt-6 rounded-xl bg-slate-50 p-3">
            <p className="caption mb-2 font-semibold">체험용 계정</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run('user', () => api.post('/api/auth/test-login', { kind: 'user' }))}>
                <UserRound size={15} />테스트 사용자
              </button>
              <button type="button" className="btn btn-sm bg-navy-900 text-white hover:bg-navy-800" disabled={!!busy} onClick={() => run('ta', () => api.post('/api/auth/test-login', { kind: 'test_admin' }))}>
                <Eye size={15} />테스트 관리자
              </button>
            </div>
            <p className="caption mt-2">테스트 관리자는 관리자 메뉴 전체를 조회할 수 있으나 읽기 전용이며 개인정보는 마스킹됩니다.</p>
          </div>
          <button type="button" onClick={() => setShowAdmin((s) => !s)} className="caption mt-4 inline-flex items-center gap-1 hover:text-slate-700"><KeyRound size={13} />실제 관리자 로그인</button>
          {showAdmin && (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); run('admin', () => api.post('/api/auth/admin-key-login', { admin_key: adminKey })) }}>
              <input className="input" type="password" placeholder="관리자 보안 키 (ADMIN_SECRET_KEY)" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} required />
              <button className="btn btn-primary" disabled={!!busy}>확인</button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
