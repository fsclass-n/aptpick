import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined))

// 경로 + 파라미터를 queryKey 로 사용하는 조회 훅
export function useApi(path, params, options = {}) {
  const p = clean(params)
  return useQuery({ queryKey: [path, p], queryFn: () => api.get(path, p), enabled: !!path, ...options })
}

export function useApiMutation(fn, { invalidate = [], ...options } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    ...options,
    onSuccess: (...args) => {
      invalidate.forEach((key) => qc.invalidateQueries({ queryKey: [key] }))
      options.onSuccess?.(...args)
    },
  })
}

export { clean }
