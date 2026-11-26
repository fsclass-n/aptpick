import { Brain, ChartLine, Database, LayoutDashboard, Server } from 'lucide-react'
import { Badge, Card, PageHeader } from '../components/ui'
import { LINKS } from '../utils/config'

const TEAM = [
  { name: '박미금', role: '조장 · PM / Frontend / UI·UX', icon: LayoutDashboard, tasks: ['프로젝트 일정·업무 관리, PR 리뷰·최종 병합', 'React(Vite)·Tailwind v4 디자인 시스템', '검색·지도·추천·대시보드 화면 및 반응형 GNB'] },
  { name: '김모란', role: 'AI 모델링 / Machine Learning', icon: Brain, tasks: ['피처 엔지니어링 · 가격 예측 모델', '맞춤 추천 알고리즘 · 유사 거래 분석', '이상치 탐지 · 모델 성능 평가(MAE·RMSE·NDCG)'] },
  { name: '이오리', role: '데이터 분석 / 수집 / AI 리포트', icon: ChartLine, tasks: ['공공데이터(국토교통부 실거래) 수집·전처리', '가격 변동·거래량·전세가율·변동성 분석', 'Gemini 분석 리포트 · 산출물·발표자료 총괄'] },
  { name: '홍기흥', role: 'Backend / Database / Infra', icon: Server, tasks: ['FastAPI REST·WebSocket · JWT 권한', 'TiDB(aptpick) 설계 · 공공데이터·AI API 연동', 'Docker · GitHub Actions · Render · AWS EC2 배포'] },
]
const STACK = ['React 19', 'Vite', 'Tailwind CSS v4', 'React Router', 'Axios', 'TanStack Query', 'Recharts', 'Leaflet / Kakao Map', 'Lucide', 'Python 3.11', 'FastAPI', 'SQLAlchemy', 'Pydantic', 'TiDB Cloud', 'JWT · OAuth 2.0', 'WebSocket', 'pandas · NumPy', 'scikit-learn', 'XGBoost · LightGBM (실험)', 'Google Gemini API', 'Docker', 'GitHub Actions', 'Render · Netlify · AWS EC2']

export default function About() {
  return (
    <>
      <PageHeader eyebrow="About" title="프로젝트 안내" desc="aptpick 은 공공 부동산 데이터와 AI 분석 기술을 결합해 주거 선택과 시장 판단을 돕는 B2C·B2B 부동산 플랫폼입니다." />
      <div className="container-x space-y-8 py-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TEAM.map(({ name, role, icon: Icon, tasks }) => (
            <Card key={name} className="p-5">
              <span className="inline-flex rounded-xl bg-brand-600 p-2.5 text-white"><Icon size={20} /></span>
              <h3 className="h3 mt-3">{name}</h3>
              <p className="caption font-semibold text-brand-700!">{role}</p>
              <ul className="mt-3 space-y-1 text-[14px] text-slate-600">{tasks.map((t) => <li key={t}>· {t}</li>)}</ul>
            </Card>
          ))}
        </div>
        <Card className="p-6">
          <h2 className="h3 mb-3 flex items-center gap-2"><Database size={18} />데이터 파이프라인</h2>
          <p className="text-[14px] text-slate-600">공공데이터 API → 수집 → 원본 저장 → 전처리(단위·코드 정규화, 중복 제거, 결측 처리) → 검증 → TiDB(aptpick) 적재 → 지역 통계 집계 → AI 학습·추론 → 프런트엔드 시각화</p>
          <h2 className="h3 mt-6 mb-3">기술 스택</h2>
          <div className="flex flex-wrap gap-1.5">{STACK.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}</div>
          <h2 className="h3 mt-6 mb-3">배포 환경</h2>
          <ul className="grid gap-2 text-[14px] md:grid-cols-2">
            {[['Netlify Demo (Mock 데이터)', LINKS.demo], ['Render Frontend', LINKS.web], ['Render Backend (Swagger)', LINKS.api], ['AWS EC2 통합 운영', LINKS.aws], ['GitHub Repository', LINKS.github]].map(([l, u]) => (
              <li key={u} className="rounded-xl bg-slate-50 px-3 py-2"><b>{l}</b><br /><a href={u} className="text-brand-600 hover:underline" target="_blank" rel="noreferrer">{u}</a></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
