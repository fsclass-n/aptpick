// Life Pick — 라이프스타일 페르소나 → AI 추천 조건 프리셋 (가중치 1~5, 가격 만원, 면적 전용㎡)
// 추천 엔진(backend/app/services/recommendation.py · mock/recommend.js) 은 그대로 사용하고 입력 조건만 미리 채웁니다.
import { Baby, Briefcase, Heart, PawPrint, Sunrise, TrendingUp } from 'lucide-react'

export const PERSONAS = [
  { id: 'newlywed', title: '신혼부부', tagline: '출퇴근은 가볍게, 첫 집은 합리적으로', icon: Heart, img: '1522673607200-164d1b6ce486',
    focus: ['교통', '가성비', '생활편의'],
    cond: { purpose: 'residence', deal_type: 'sale', budget_max: 90000, area_min: 59, area_max: 85, rooms_min: 2, transport_weight: 5, school_weight: 2, infra_weight: 4 } },
  { id: 'family', title: '아이 키우는 가족', tagline: '학교와 공원이 가까운 넉넉한 집', icon: Baby, img: '1511895426328-dc8714191300',
    focus: ['학군', '넓은 평형', '생활편의'],
    cond: { purpose: 'residence', deal_type: 'sale', budget_max: 150000, area_min: 84, area_max: '', rooms_min: 3, transport_weight: 3, school_weight: 5, infra_weight: 4 } },
  { id: 'single', title: '1인 직장인', tagline: '역세권 전세로 시작하는 나만의 공간', icon: Briefcase, img: '1499951360447-b19be8fe80f5',
    focus: ['역세권', '전세', '소형'],
    cond: { purpose: 'residence', deal_type: 'jeonse', budget_max: 45000, area_min: '', area_max: 60, rooms_min: '', transport_weight: 5, school_weight: 1, infra_weight: 4 } },
  { id: 'pet', title: '반려동물과 함께', label: '반려동물 가구', tagline: '산책로와 생활 인프라가 가까운 동네', icon: PawPrint, img: '1543466835-00a7907e9de1',
    focus: ['공원·인프라', '중형', '저층 선호'],
    cond: { purpose: 'residence', deal_type: 'sale', budget_max: 120000, area_min: 59, area_max: '', rooms_min: 2, transport_weight: 2, school_weight: 1, infra_weight: 5 } },
  { id: 'senior', title: '여유로운 시니어', tagline: '병원·마트가 가까운 조용하고 안정된 단지', icon: Sunrise, img: '1519331379826-f10be5486c6f',
    focus: ['의료·편의', '안정성', '중소형'],
    cond: { purpose: 'residence', deal_type: 'sale', budget_max: 100000, area_min: 59, area_max: 102, rooms_min: 2, transport_weight: 3, school_weight: 1, infra_weight: 5 } },
  { id: 'investor', title: '가치 투자자', tagline: '적정가 대비 저평가·거래 활발 단지', icon: TrendingUp, img: '1554224155-6726b3ff858f',
    focus: ['가격 경쟁력', '거래량', '안정성'],
    cond: { purpose: 'investment', deal_type: 'sale', budget_max: 200000, area_min: '', area_max: '', rooms_min: '', transport_weight: 3, school_weight: 2, infra_weight: 2 } },
]
export const personaById = (id) => PERSONAS.find((p) => p.id === id)

// 추천 구성 점수(0~100)로 도출하는 라이프 태그 — 점수 근거가 있는 경우에만 표시
const TAGS = [
  ['transport', 80, '역세권'], ['school', 80, '학세권'], ['infra', 80, '슬세권'],
  ['price', 80, '가성비'], ['stability', 80, '시세 안정'], ['liquidity', 80, '거래 활발'],
]
export const lifeTags = (components = {}) => TAGS.filter(([k, min]) => (components[k] ?? 0) >= min).map(([, , label]) => label)
