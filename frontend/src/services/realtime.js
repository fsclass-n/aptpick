import { getToken } from '../api/client'
import { USE_MOCK, WS_URL } from '../utils/config'

// 가격 알림·공지 WebSocket — 끊기면 지수 백오프로 재연결
export function connectNotifications(onMessage) {
  if (USE_MOCK) return () => {}
  let ws, timer, closed = false, retry = 0
  const open = () => {
    const token = getToken()
    ws = new WebSocket(`${WS_URL}${token ? `?token=${encodeURIComponent(token)}` : ''}`)
    ws.onopen = () => { retry = 0 }
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)) } catch { /* ignore */ }
    }
    ws.onclose = () => {
      if (!closed) timer = setTimeout(open, Math.min(30000, 1000 * 2 ** retry++))
    }
  }
  open()
  const ping = setInterval(() => ws?.readyState === 1 && ws.send('ping'), 25000)
  return () => {
    closed = true
    clearTimeout(timer)
    clearInterval(ping)
    ws?.close()
  }
}
