import { useParams } from 'react-router-dom'
import { Card, PageHeader } from '../components/ui'
import { useApi } from '../hooks/useApi'

const DATA_SOURCES = [
  ['국토교통부', '아파트 매매 실거래가 자료 (공공데이터포털 OpenAPI 15126469)', 'https://www.data.go.kr/data/15126469/openapi.do'],
  ['국토교통부', '아파트 전월세 실거래가 자료 (공공데이터포털 OpenAPI 15126474)', 'https://www.data.go.kr/data/15126474/openapi.do'],
  ['행정안전부', '행정표준코드 — 법정동코드 (시군구 5자리)', 'https://www.code.go.kr'],
  ['한국부동산원', '부동산통계정보 R-ONE (가격지수 비교 검증 · 연동 예정)', 'https://www.reb.or.kr/r-one/'],
  ['Kakao', 'Kakao Maps · Local API (지도 · 주소→좌표)', 'https://developers.kakao.com'],
  ['OpenStreetMap', '지도 타일 (© OpenStreetMap contributors)', 'https://www.openstreetmap.org/copyright'],
  ['Google', 'Gemini API (검증된 통계 기반 리포트 생성)', 'https://ai.google.dev'],
]
const DOCS = {
  terms: { title: '이용약관', body: [
    ['제1조 (목적)', '본 약관은 aptpick(이하 “서비스”)이 제공하는 부동산 정보 검색·분석·추천 서비스의 이용 조건과 절차를 규정합니다.'],
    ['제2조 (정보의 성격)', '서비스가 제공하는 실거래가는 국토교통부 공개 자료를, 매물 가격은 등록자가 입력한 호가를 기반으로 합니다. AI 추정가·추천 점수·리포트는 통계적 참고 정보이며 투자 수익이나 미래 가격을 보장하지 않습니다.'],
    ['제3조 (데모 데이터)', '데모 환경(Netlify 등)과 공공데이터 인증키가 없는 환경에서는 “가상 샘플 데이터”가 표시되며, 실제 시세가 아님을 화면에 표시합니다.'],
    ['제4조 (이용자의 의무)', '이용자는 서비스 정보를 무단 수집·재배포하거나 시스템에 과도한 부하를 주는 행위를 해서는 안 됩니다.'],
  ] },
  privacy: { title: '개인정보처리방침', body: [
    ['수집 항목', '이메일, 이름, (선택) 휴대폰 번호, 소셜 로그인 식별 정보, 서비스 이용 기록(검색·관심 매물·알림·추천 이력)'],
    ['이용 목적', '회원 식별, 관심 매물·가격 알림·맞춤 추천 등 개인화 기능 제공, 고객 문의 응대'],
    ['보관 및 파기', '회원 탈퇴 시 계정과 개인화 데이터를 즉시 삭제합니다. 관리자 감사 로그는 보안 목적으로 별도 보관됩니다.'],
    ['보호 조치', '비밀번호는 PBKDF2-SHA256 해시로 저장하며, 테스트 관리자에게는 개인정보가 마스킹되어 표시됩니다. 전송 구간은 HTTPS 로 암호화합니다.'],
  ] },
  data: { title: '데이터 출처 및 API 제공기관', body: [] },
}

export default function Policy() {
  const { kind } = useParams()
  const doc = DOCS[kind] || DOCS.terms
  const meta = useApi(kind === 'data' ? '/api/market/overview' : null)
  return (
    <>
      <PageHeader eyebrow="Policy" title={doc.title} />
      <div className="container-x max-w-4xl! py-8">
        <Card className="space-y-6 p-6 md:p-8 text-[15px] leading-7 text-slate-700">
          {doc.body.map(([h, p]) => <section key={h}><h2 className="h3 mb-1">{h}</h2><p>{p}</p></section>)}
          {kind === 'data' && (
            <>
              <p>현재 서비스에 표시되는 실거래 데이터 출처: <b>{(meta.data?.meta?.sources || []).map((s) => s.label).join(', ') || '-'}</b> (기준일 {meta.data?.meta?.as_of || '-'})</p>
              <table className="table-base"><thead><tr><th>제공기관</th><th>데이터 / API</th></tr></thead>
                <tbody>{DATA_SOURCES.map(([o, d, u]) => <tr key={d}><td className="font-semibold whitespace-nowrap">{o}</td><td><a className="text-brand-700 hover:underline" href={u} target="_blank" rel="noreferrer">{d}</a></td></tr>)}</tbody></table>
              <p className="caption">외부 데이터는 각 기관의 이용약관·호출 제한·이용허락범위를 준수하여 사용합니다. 실거래가는 신고 기준이며 해제(취소)된 거래는 통계에서 제외합니다.</p>
            </>
          )}
        </Card>
      </div>
    </>
  )
}
