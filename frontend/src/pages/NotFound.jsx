import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="container-x flex flex-col items-center py-24 text-center">
      <Compass size={48} className="text-brand-300" />
      <h1 className="h1 mt-4">페이지를 찾을 수 없습니다</h1>
      <p className="mt-2 text-slate-500">주소가 변경되었거나 삭제된 페이지입니다.</p>
      <Link to="/" className="btn btn-primary mt-6">홈으로</Link>
    </div>
  )
}
