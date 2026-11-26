// 가격 단위: 만원 (국토교통부 실거래가와 동일)
export function won(man) {
  if (man === null || man === undefined || Number.isNaN(man)) return '-'
  const v = Math.round(man)
  const eok = Math.floor(Math.abs(v) / 10000)
  const rest = Math.abs(v) % 10000
  const sign = v < 0 ? '-' : ''
  if (!eok) return `${sign}${rest.toLocaleString()}만`
  return `${sign}${eok}억${rest ? ` ${rest.toLocaleString()}` : ''}`
}
export function eok(man, digits = 1) {
  if (man === null || man === undefined) return '-'
  return man >= 10000 ? `${(man / 10000).toFixed(digits).replace(/\.0+$/, '')}억` : `${Math.round(man).toLocaleString()}만`
}
export function dealPrice(item) {
  if (!item) return '-'
  if (item.deal_type === 'monthly') return `${won(item.price)} / ${item.monthly_rent?.toLocaleString() ?? 0}`
  return won(item.price)
}
export const pct = (v, digits = 2) => (v === null || v === undefined ? '-' : `${v > 0 ? '+' : ''}${Number(v).toFixed(digits)}%`)
export const ratio = (v, digits = 1) => (v === null || v === undefined ? '-' : `${(v * 100).toFixed(digits)}%`)
export const num = (v, digits = 0) => (v === null || v === undefined ? '-' : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits }))
export const area = (m2) => (m2 ? `${Number(m2).toFixed(2).replace(/\.?0+$/, '')}㎡ (${(m2 / 3.3058).toFixed(0)}평)` : '-')
export const trendClass = (v, threshold = 0.05) => (v === null || v === undefined || Math.abs(v) < threshold ? 'text-flat' : v > 0 ? 'text-up' : 'text-down')
export const trendArrow = (v, threshold = 0.05) => (v === null || v === undefined || Math.abs(v) < threshold ? '―' : v > 0 ? '▲' : '▼')
export const date = (s) => (s ? s.slice(0, 10).replaceAll('-', '.') : '-')
export const datetime = (s) => (s ? new Date(s.endsWith('Z') || s.includes('+') ? s : `${s}Z`).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-')
export const period = (p) => (p ? p.replace('-', '.') : '-')
export const walk = (m) => (m === null || m === undefined ? '-' : `${m.toLocaleString()}m · 도보 ${Math.max(1, Math.round(m / 67))}분`)
