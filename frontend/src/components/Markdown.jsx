// 리포트용 경량 Markdown 렌더러 (제목·목록·표·굵게) — HTML 은 이스케이프 후 변환
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>')

function toHtml(md) {
  const lines = (md || '').split('\n')
  const out = []
  let list = null
  let table = null
  const flush = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null }
    if (table) {
      const [head, ...rows] = table
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      out.push(`<div class="overflow-x-auto"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      table = null
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^\|.*\|$/.test(line.trim())) { if (list) flush(); table = table || []; if (!/^\|[\s|:-]+\|$/.test(line.trim())) table.push(line.trim()); continue }
    if (table) flush()
    const h = line.match(/^(#{1,4})\s+(.*)/)
    const li = line.match(/^\s*[-*]\s+(.*)/)
    const ol = line.match(/^\s*\d+\.\s+(.*)/)
    if (h) { flush(); const lv = Math.min(4, Math.max(2, h[1].length)); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`) }
    else if (li || ol) {
      const tag = li ? 'ul' : 'ol'
      if (list && list.tag !== tag) flush()
      list = list || { tag, items: [] }
      list.items.push((li || ol)[1])
    } else if (!line.trim()) flush()
    else { flush(); out.push(`<p>${inline(line)}</p>`) }
  }
  flush()
  return out.join('')
}

export default function Markdown({ children, className = '' }) {
  return <div className={`prose-report ${className}`} dangerouslySetInnerHTML={{ __html: toHtml(children) }} />
}
