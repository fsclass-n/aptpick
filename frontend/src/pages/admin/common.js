import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { READ_ONLY_MESSAGE } from '../../utils/config'

/** 관리자 쓰기 작업 실행기 — 테스트 관리자는 프런트에서도 차단(백엔드 403 이 최종 방어선) */
export function useAdminAction() {
  const { readOnly } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const run = async (fn, { success = '처리했습니다.', invalidate = [] } = {}) => {
    if (readOnly) return toast(READ_ONLY_MESSAGE, 'error')
    try {
      const res = await fn()
      toast(typeof success === 'function' ? success(res) : success)
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      return res
    } catch (err) {
      toast(err.message, 'error')
      return null
    }
  }
  return { run, readOnly, writeProps: readOnly ? { disabled: true, title: READ_ONLY_MESSAGE } : {} }
}
