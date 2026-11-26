import { useState } from 'react'
import { Modal, Field } from './ui'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

const CATS = { general: '일반 문의', partnership: '제휴 문의', data: '데이터 오류 신고', bug: '서비스 오류' }

export default function InquiryModal({ category, onClose }) {
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [cat, setCat] = useState(category || 'general')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/api/inquiries', { name: form.name || user?.name, email: form.email || user?.email, category: cat, message: form.message })
      toast('문의가 접수되었습니다. 답변은 알림으로 안내해 드립니다.')
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={!!category} onClose={onClose} title="고객센터 · 제휴 문의">
      <form onSubmit={submit} className="space-y-3">
        <Field label="문의 유형">
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="이름"><input className="input" required={!user} value={form.name} placeholder={user?.name} onChange={set('name')} /></Field>
          <Field label="이메일"><input className="input" type="email" required={!user} value={form.email} placeholder={user?.email} onChange={set('email')} /></Field>
        </div>
        <Field label="내용"><textarea className="input h-32 py-2" required minLength={5} value={form.message} onChange={set('message')} /></Field>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? '접수 중…' : '문의 접수'}</button>
      </form>
    </Modal>
  )
}
