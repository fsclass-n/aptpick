import { Heart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useApi } from '../hooks/useApi'
import { READ_ONLY_MESSAGE } from '../utils/config'

export default function FavoriteButton({ complexId, propertyId = null, className = '', label = false }) {
  const { user, readOnly } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const favs = useApi(user && !readOnly ? '/api/favorites' : null)
  const fav = (favs.data || []).find((f) => f.complex_id === complexId && (f.property?.id ?? null) === propertyId)
  const toggle = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) return navigate(`/login?next=${encodeURIComponent(location.pathname)}`)
    if (readOnly) return toast(READ_ONLY_MESSAGE, 'error')
    try {
      if (fav) await api.del(`/api/favorites/${fav.id}`)
      else await api.post('/api/favorites', { complex_id: complexId, property_id: propertyId })
      toast(fav ? '관심 매물에서 삭제했습니다.' : '관심 매물에 저장했습니다.')
      qc.invalidateQueries({ queryKey: ['/api/favorites'] })
    } catch (err) {
      toast(err.message, 'error')
    }
    return undefined
  }
  return (
    <button onClick={toggle} aria-pressed={!!fav} aria-label={fav ? '관심 매물 해제' : '관심 매물 저장'}
      className={`inline-flex items-center gap-1.5 ${label ? 'btn btn-secondary btn-sm' : 'flex h-9 w-9 justify-center rounded-full bg-white/90 shadow-sm hover:bg-white'} ${className}`}>
      <Heart size={17} className={fav ? 'fill-up text-up' : 'text-slate-500'} />
      {label && (fav ? '관심 단지' : '관심 등록')}
    </button>
  )
}
