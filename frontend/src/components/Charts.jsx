import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { pct } from '../utils/format'

export const COLORS = { brand: '#c2653a', mint: '#6a8f5d', navy: '#35312e', up: '#d92d4a', down: '#2f62d8', flat: '#a69c8f', amber: '#d9a03f', violet: '#7a6cb0' }
const SERIES = [COLORS.brand, COLORS.mint, COLORS.amber, COLORS.violet, COLORS.up]
const axis = { tick: { fontSize: 12, fill: 'currentColor' }, tickLine: false, axisLine: false }

function Tip({ active, payload, label, formatters = {} }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] shadow-float dark:border-navy-700 dark:bg-navy-900">
      <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="num flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b>{(formatters[p.dataKey] || ((v) => v?.toLocaleString?.() ?? v))(p.value)}</b>
        </p>
      ))}
    </div>
  )
}

/** 선(가격) + 막대(거래량, 보조축) 복합 차트 */
const periodTick = (v) => String(v).slice(2).replace('-', '.')

export function TrendChart({ data, x = 'period', lines = [], bars = [], height = 300, yFormat, y2Format, formatters, xFormat = periodTick }) {
  return (
    <div className="text-slate-400" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: bars.length ? 0 : 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey={x} {...axis} minTickGap={24} tickFormatter={xFormat} />
          <YAxis yAxisId="l" {...axis} width={62} tickFormatter={yFormat} domain={['auto', 'auto']} />
          {bars.length > 0 && <YAxis yAxisId="r" orientation="right" {...axis} width={44} tickFormatter={y2Format} />}
          <Tooltip content={<Tip formatters={formatters} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          {bars.map((b, i) => <Bar key={b.key} yAxisId="r" dataKey={b.key} name={b.label} fill={b.color || COLORS.flat} fillOpacity={0.35} radius={[4, 4, 0, 0]} barSize={i ? 6 : 10} />)}
          {lines.map((l, i) => (
            <Line key={l.key} yAxisId="l" type="monotone" dataKey={l.key} name={l.label} stroke={l.color || SERIES[i]} strokeWidth={l.width || 2.5}
              strokeDasharray={l.dashed ? '5 4' : undefined} dot={false} activeDot={{ r: 4 }} connectNulls />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** 막대 차트 (값 부호에 따라 상승/하락 색상 선택 가능) */
export function BarsChart({ data, x, y, label, height = 280, color = COLORS.brand, signed = false, layout = 'horizontal', format }) {
  const vertical = layout === 'vertical'
  return (
    <div className="text-slate-400" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, left: vertical ? 8 : 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} horizontal={!vertical} vertical={vertical} />
          {vertical ? (
            <>
              <XAxis type="number" {...axis} tickFormatter={format} />
              <YAxis type="category" dataKey={x} {...axis} width={96} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey={x} {...axis} interval={0} angle={data.length > 8 ? -30 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 56 : 30} />
              <YAxis {...axis} width={56} tickFormatter={format} />
            </>
          )}
          <Tooltip content={<Tip formatters={{ [y]: format || ((v) => v?.toLocaleString()) }} />} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
          <Bar dataKey={y} name={label} radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={36}>
            {data.map((d, i) => <Cell key={i} fill={signed ? (d[y] > 0.05 ? COLORS.up : d[y] < -0.05 ? COLORS.down : COLORS.flat) : color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** 지역 × 월 상승·하락 히트맵 (상승 레드 / 하락 블루) */
export function Heatmap({ periods, rows, onSelect }) {
  const color = (v) => {
    if (v === null || v === undefined) return 'transparent'
    const a = Math.min(1, Math.abs(v) / 1.5)
    return v >= 0 ? `rgba(225, 29, 72, ${0.08 + a * 0.75})` : `rgba(37, 99, 235, ${0.08 + a * 0.75})`
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0.5 text-[12px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white px-2 py-1 text-left font-semibold text-slate-500 dark:bg-navy-900">지역</th>
            {periods.map((p) => <th key={p} className="num px-1 py-1 font-medium text-slate-400">{p.slice(2).replace('-', '.')}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className={onSelect ? 'cursor-pointer' : ''} onClick={() => onSelect?.(r.code)}>
              <td className="sticky left-0 bg-white px-2 py-1.5 font-semibold whitespace-nowrap text-slate-700 dark:bg-navy-900 dark:text-slate-200">{r.name.replace(/^(서울특별시|경기도|부산광역시|대구광역시|인천광역시|대전광역시|세종특별자치시)\s?/, '')}</td>
              {r.values.map((v, i) => (
                <td key={i} title={`${r.name} ${periods[i]} ${pct(v)}`} className="num rounded-md px-1 py-1.5 text-center font-semibold text-slate-800 dark:text-white" style={{ background: color(v) }}>
                  {v === null ? '' : v.toFixed(1)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="caption mt-2 flex items-center gap-3">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: color(1.2) }} />상승</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: color(-1.2) }} />하락</span>
        <span>값: 3개월 이동평균 ㎡당가 전월 대비 변동률(%)</span>
      </div>
    </div>
  )
}
