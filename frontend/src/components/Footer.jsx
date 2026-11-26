import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GitBranch, Mail } from 'lucide-react'
import Logo from './Logo'
import InquiryModal from './InquiryModal'
import { LINKS } from '../utils/config'

const COLS = [
  { title: '서비스 안내', links: [['아파트 찾기', '/search'], ['지도 탐색', '/map'], ['시장 분석', '/market'], ['AI 가격 예측', '/predict'], ['AI 맞춤 추천', '/recommend'], ['부동산 리포트', '/reports']] },
  { title: '정책 · 데이터', links: [['이용약관', '/policy/terms'], ['개인정보처리방침', '/policy/privacy'], ['데이터 출처 및 API 제공기관', '/policy/data'], ['프로젝트 안내 · 팀 정보', '/about']] },
]

export default function Footer() {
  const [inquiry, setInquiry] = useState(null)
  return (
    <footer className="mt-16 bg-navy-900 text-slate-300">
      <div className="container-x grid gap-10 py-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo light />
          <p className="mt-4 max-w-sm text-[14px] leading-6 text-slate-400">
            데이터로 분석하고, AI로 찾는 나에게 맞는 부동산. 국토교통부 실거래가 등 공공데이터와 AI 분석으로 주거 선택과 시장 판단을 돕습니다.
          </p>
          <p className="mt-3 text-[12px] leading-5 text-slate-500">
            실거래가는 실제 계약된 거래 정보이며, 매물 가격은 판매자·중개업체가 등록한 호가입니다. AI 추정가와 리포트는 참고용 통계 정보로 투자 수익을 보장하지 않습니다.
          </p>
        </div>
        {COLS.map((col) => (
          <div key={col.title} className="md:col-span-2">
            <p className="mb-3 font-display text-[14px] font-bold text-white">{col.title}</p>
            <ul className="space-y-2 text-[14px]">
              {col.links.map(([label, to]) => <li key={to}><Link to={to} className="hover:text-white">{label}</Link></li>)}
            </ul>
          </div>
        ))}
        <div className="md:col-span-3">
          <p className="mb-3 font-display text-[14px] font-bold text-white">고객센터 · 제휴 문의</p>
          <ul className="space-y-2 text-[14px]">
            <li><button onClick={() => setInquiry('general')} className="hover:text-white">고객센터 문의하기</button></li>
            <li><button onClick={() => setInquiry('partnership')} className="hover:text-white">중개업체 · 기업 제휴 문의</button></li>
            <li className="flex items-center gap-1.5"><Mail size={14} />support@aptpick.kr</li>
            <li><a href={LINKS.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-white"><GitBranch size={14} />GitHub Repository</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-navy-700">
        <div className="container-x flex flex-col gap-2 py-5 text-[12px] text-slate-500 md:flex-row md:items-center md:justify-between">
          <p>© 2026 aptpick. All rights reserved.</p>
          <p>팀 aptpick · 박미금(PM·Frontend) · 김모란(AI) · 이오리(Data) · 홍기흥(Backend·Infra)</p>
        </div>
      </div>
      <InquiryModal category={inquiry} onClose={() => setInquiry(null)} />
    </footer>
  )
}
