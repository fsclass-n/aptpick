import { lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import ProtectedRoute from '../components/ProtectedRoute'
import Home from '../pages/Home'
import Login from '../pages/Login'
import NotFound from '../pages/NotFound'
import { useAuth } from '../contexts/AuthContext'

// 차트·지도·관리자 화면은 지연 로딩으로 초기 번들 크기 축소
const Search = lazy(() => import('../pages/Search'))
const MapExplore = lazy(() => import('../pages/MapExplore'))
const Market = lazy(() => import('../pages/Market'))
const Predict = lazy(() => import('../pages/Predict'))
const Recommend = lazy(() => import('../pages/Recommend'))
const ApartmentDetail = lazy(() => import('../pages/ApartmentDetail'))
const Favorites = lazy(() => import('../pages/Favorites'))
const MyPage = lazy(() => import('../pages/MyPage'))
const Reports = lazy(() => import('../pages/Reports'))
const ReportDetail = lazy(() => import('../pages/ReportDetail'))
const OAuthCallback = lazy(() => import('../pages/OAuthCallback'))
const About = lazy(() => import('../pages/About'))
const Policy = lazy(() => import('../pages/Policy'))
const AdminLayout = lazy(() => import('../layouts/AdminLayout'))
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('../pages/admin/AdminUsers'))
const AdminProperties = lazy(() => import('../pages/admin/AdminProperties'))
const AdminData = lazy(() => import('../pages/admin/AdminData'))
const AdminModels = lazy(() => import('../pages/admin/AdminModels'))
const AdminReports = lazy(() => import('../pages/admin/AdminReports'))
const AdminOperations = lazy(() => import('../pages/admin/AdminOperations'))

// 로그인 상태로 /login 접근 시 next(원래 요청 페이지) 로 이동
function GuestOnly({ children }) {
  const { user } = useAuth()
  const { search } = useLocation()
  const next = new URLSearchParams(search).get('next')
  return user ? <Navigate to={next?.startsWith('/') ? next : user.role === 'user' ? '/' : '/admin'} replace /> : children
}

// 모든 페이지는 공통 MainLayout(글로벌 헤더·푸터) 안에서 렌더링, 최초 진입은 메인(/)
export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="oauth/callback" element={<OAuthCallback />} />
        <Route path="search" element={<Search />} />
        <Route path="map" element={<MapExplore />} />
        <Route path="market" element={<Market />} />
        <Route path="predict" element={<Predict />} />
        <Route path="predict/:apartmentId" element={<Predict />} />
        <Route path="recommend" element={<Recommend />} />
        <Route path="apartments/:id" element={<ApartmentDetail />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:id" element={<ReportDetail />} />
        <Route path="favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
        <Route path="mypage" element={<ProtectedRoute><MyPage /></ProtectedRoute>} />
        <Route path="admin" element={<ProtectedRoute admin><AdminLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="properties" element={<AdminProperties />} />
          <Route path="data" element={<AdminData />} />
          <Route path="models" element={<AdminModels />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="operations" element={<AdminOperations />} />
        </Route>
        <Route path="about" element={<About />} />
        <Route path="policy/:kind" element={<Policy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
