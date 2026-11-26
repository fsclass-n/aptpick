// backend/app/services/recommendation.py 와 같은 가중치 규칙 (변경 시 함께 수정)
// 입력과 무관한 구성요소(교통·학군·인프라·가격 경쟁력·시세 흐름·거래 활발도·안정성)는 스냅샷 값을 사용하고
// 입력에 따라 달라지는 예산·지역 적합도와 가중 합계만 다시 계산합니다.
export const BASE_WEIGHTS = {
  residence: { budget: 0.2, region: 0.15, transport: 0.15, school: 0.1, infra: 0.12, price: 0.18, momentum: 0, liquidity: 0.05, stability: 0.05 },
  investment: { budget: 0.15, region: 0.1, transport: 0.08, school: 0.04, infra: 0.04, price: 0.24, momentum: 0.12, liquidity: 0.13, stability: 0.1 },
}
const LABEL = { budget: '예산 적합도', region: '지역 적합도', transport: '교통 접근성', school: '학군', infra: '생활 인프라', price: '가격 경쟁력', momentum: '시세 흐름', liquidity: '거래 활발도', stability: '가격 안정성' }

function budgetScore(cost, lo, hi) {
  if (hi && cost > hi) return Math.max(0, 55 - (cost / hi - 1) * 600)
  if (lo && cost < lo) return Math.max(40, 80 - (1 - cost / lo) * 100)
  if (hi) {
    const l = lo || 0
    const mid = (l + hi) / 2
    const half = Math.max(1, (hi - l) / 2)
    return 85 + 15 * (1 - Math.min(1, Math.abs(cost - mid) / half))
  }
  return 80
}

export function recommendMock(snapshot, cond) {
  const dealType = cond.deal_type || 'sale'
  const purpose = BASE_WEIGHTS[cond.purpose] ? cond.purpose : 'residence'
  const base = snapshot.reco[dealType]
  const regions = (cond.region_codes || []).filter(Boolean)
  const sidoOf = Object.fromEntries(snapshot.regions.map((r) => [r.code, r.sido]))
  const sidos = new Set(regions.map((r) => sidoOf[r]))
  const weights = { ...BASE_WEIGHTS[purpose] }
  weights.transport *= (cond.transport_weight || 3) / 3
  weights.school *= (cond.school_weight || 3) / 3
  weights.infra *= (cond.infra_weight || 3) / 3
  const results = []
  for (const r of base.results) {
    if (cond.area_min && r.area < cond.area_min) continue
    if (cond.area_max && r.area > cond.area_max) continue
    if (cond.rooms_min && (r.rooms || 0) < cond.rooms_min) continue
    if (cond.build_year_min && (r.build_year || 0) < cond.build_year_min) continue
    if (cond.budget_max && r.price > cond.budget_max * 1.05) continue
    if (cond.monthly_max && dealType === 'monthly' && r.monthly_rent > cond.monthly_max * 1.05) continue
    if (regions.length && !regions.includes(r.region_code) && !sidos.has(sidoOf[r.region_code])) continue
    const cost = r.price + (dealType === 'monthly' ? (r.monthly_rent * 12) / 0.05 : 0)
    const comp = { ...r.components, budget: budgetScore(dealType === 'monthly' ? cost : r.price, cond.budget_min, cond.budget_max), region: !regions.length || regions.includes(r.region_code) ? 100 : 55 }
    const used = Object.entries(weights).filter(([k, w]) => w > 0 && comp[k] !== null && comp[k] !== undefined)
    const total = used.reduce((s, [k, w]) => s + comp[k] * w, 0) / used.reduce((s, [, w]) => s + w, 0)
    const cautions = r.cautions.filter((c) => !c.includes('최대 예산'))
    if (cond.budget_max && r.price > cond.budget_max) cautions.unshift(`희망 최대 예산을 ${((r.price / cond.budget_max - 1) * 100).toFixed(1)}% 초과합니다.`)
    const unset = new Set([...(regions.length ? [] : ['region']), ...(cond.budget_max || cond.budget_min ? [] : ['budget'])])
    const ranked = used.filter(([k]) => !unset.has(k)).sort((a, b) => comp[b[0]] * b[1] - comp[a[0]] * a[1]).slice(0, 3)
    results.push({ ...r, score: Math.round(total * 10) / 10, components: Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, v === null ? null : Math.round(v * 10) / 10])),
      reasons: ranked.map(([k]) => `${LABEL[k]} ${Math.round(comp[k])}점${k === 'price' && r.fair_price ? ` · 기준 시세 대비 ${((cost / r.fair_price - 1) * 100).toFixed(1)}%` : ''}`), cautions })
  }
  results.sort((a, b) => b.score - a.score)
  const per = {}
  const top = []
  for (const r of results) {
    if ((per[r.complex_id] || 0) < 2) { top.push(r); per[r.complex_id] = (per[r.complex_id] || 0) + 1 }
    if (top.length === (cond.top_k || 10)) break
  }
  return { ...base, purpose, deal_type: dealType, weights, candidates: results.length, results: top }
}
