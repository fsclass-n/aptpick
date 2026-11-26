import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Clock, Headset, Mail } from 'lucide-react'
import Logo from './Logo'
import InquiryModal from './InquiryModal'
import { LINKS } from '../utils/config'
import { PERSONAS } from '../utils/lifestyle'

const COLS = [
  { title: '서비스', links: [['아파트 찾기', '/search'], ['지도 탐색', '/map'], ['시장 분석', '/market'], ['AI 가격 예측', '/predict'], ['부동산 리포트', '/reports']] },
  { title: 'Life Pick', links: [...PERSONAS.map((p) => [p.title, `/recommend?persona=${p.id}`]), ['조건 직접 설정', '/recommend']] },
  { title: '정책 · 데이터', links: [['이용약관', '/policy/terms'], ['개인정보처리방침', '/policy/privacy', true], ['데이터 출처 및 API 제공기관', '/policy/data'], ['프로젝트 안내 · 팀 정보', '/about']] },
]

// 브랜드 아이콘 (lucide 에 브랜드 로고가 없어 단순 SVG 패스 사용)
const SNS = [
  { key: 'instagram', label: 'Instagram', path: 'M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm4.9-7.9a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2ZM12 3.6c2.7 0 3 0 4.1.1 2.8.1 4.1 1.4 4.2 4.2.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c-.1 2.8-1.4 4.1-4.2 4.2-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-2.8-.1-4.1-1.4-4.2-4.2-.1-1.1-.1-1.4-.1-4.1s0-3 .1-4.1C3.8 5.1 5.1 3.8 7.9 3.7c1.1-.1 1.4-.1 4.1-.1Z' },
  { key: 'youtube', label: 'YouTube', path: 'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z' },
  { key: 'blog', label: 'Blog', path: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3.5 4v8h2.2v-4.4l2.8 4.4h2V8h-2.2v4.4L10.5 8h-2Z' },
  { key: 'github', label: 'GitHub', path: 'M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 4.9.4.3.7 1 .7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z' },
]

export default function Footer() {
  const [inquiry, setInquiry] = useState(null)
  return (
    <footer className="mt-24 bg-navy-900 text-slate-300">
      <div className="container-x py-14">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo light />
            <p className="mt-5 max-w-sm font-display text-[22px] leading-snug font-bold tracking-tight text-white">
              숫자는 데이터로,<br />생활은 라이프스타일로.
            </p>
            <p className="mt-3 max-w-sm text-[14px] leading-6 text-slate-400">
              국토교통부 실거래가 등 공공데이터와 AI 분석으로 나의 생활 방식에 맞는 집을 고르도록 돕습니다.
            </p>
            <div className="mt-6 flex gap-2">
              {SNS.map((s) => {
                const href = LINKS[s.key]
                const icon = <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d={s.path} /></svg>
                return href ? (
                  <a key={s.key} href={href} target="_blank" rel="noreferrer" aria-label={s.label}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-navy-600 text-slate-200 transition hover:border-white hover:bg-white hover:text-navy-900">{icon}</a>
                ) : (
                  <span key={s.key} title={`${s.label} 채널 준비 중`} aria-label={`${s.label} 채널 준비 중`}
                    className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full border border-navy-700 text-navy-600">{icon}</span>
                )
              })}
            </div>
          </div>
          {COLS.map((col) => (
            <div key={col.title} className="lg:col-span-2">
              <p className="mb-4 text-[12px] font-bold tracking-[0.16em] text-slate-500 uppercase">{col.title}</p>
              <ul className="space-y-2.5 text-[14px]">
                {col.links.map(([label, to, strong]) => <li key={to}><Link to={to} className={`hover:text-white ${strong ? 'font-bold text-white' : ''}`}>{label}</Link></li>)}
              </ul>
            </div>
          ))}
          <div className="lg:col-span-2">
            <p className="mb-4 text-[12px] font-bold tracking-[0.16em] text-slate-500 uppercase">고객센터</p>
            <p className="font-display text-[20px] font-bold text-white">1:1 온라인 문의</p>
            <ul className="mt-3 space-y-2 text-[13px] text-slate-400">
              <li className="flex items-center gap-1.5"><Clock size={13} />평일 10:00 – 18:00 (주말·공휴일 휴무)</li>
              <li className="flex items-center gap-1.5"><Mail size={13} />support@aptpick.kr</li>
            </ul>
            <div className="mt-4 flex flex-col gap-2">
              <button onClick={() => setInquiry('general')} className="btn btn-sm justify-between border border-navy-600 text-slate-200 hover:border-white hover:text-white"><span className="flex items-center gap-1.5"><Headset size={14} />문의하기</span><ArrowUpRight size={14} /></button>
              <button onClick={() => setInquiry('partnership')} className="btn btn-sm justify-between border border-navy-600 text-slate-200 hover:border-white hover:text-white">중개업체 · 기업 제휴<ArrowUpRight size={14} /></button>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-navy-700">
        <div className="container-x space-y-2 py-6 text-[12px] leading-5 text-slate-500">
          <p>
            실거래가는 실제 계약된 거래 정보이며, 매물 가격은 판매자·중개업체가 등록한 호가입니다. AI 추정가·추천 점수·리포트는 참고용 통계 정보로 투자 수익을 보장하지 않습니다.
            단지 사진은 분위기 연출용 참고 이미지(Photos: <a href="https://unsplash.com" target="_blank" rel="noreferrer" className="underline hover:text-slate-300">Unsplash</a>)이며 실제 단지 사진이 아닙니다.
          </p>
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <p>팀 aptpick · 박미금(PM·Frontend) · 김모란(AI) · 이오리(Data) · 홍기흥(Backend·Infra) · <a href={LINKS.github} target="_blank" rel="noreferrer" className="hover:text-slate-300">GitHub</a></p>
            <p>© 2026 aptpick. All rights reserved.</p>
          </div>
        </div>
      </div>
      <InquiryModal category={inquiry} onClose={() => setInquiry(null)} />
    </footer>
  )
}
