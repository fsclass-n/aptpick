import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { INFRA, KAKAO_MAP_KEY, MAP_PROVIDER } from '../utils/config'

/*
 * 지도 엔진 추상화
 * - osm(기본): Leaflet + OpenStreetMap 타일 (API 키 불필요)
 * - kakao: VITE_MAP_PROVIDER=kakao + VITE_KAKAO_MAP_KEY(도메인 제한 공개 키) 설정 시 Kakao Maps JavaScript SDK
 * markers: [{ id, kind: 'apt'|'cluster', lat, lng, label, sub, color, active }]
 * infra:   [{ id, category, name, lat, lng }]
 */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function markerHtml(m) {
  if (m.kind === 'cluster') return `<div class="apt-cluster">${esc(m.label)}<small>${esc(m.sub)}</small></div>`
  return `<div class="apt-pin${m.active ? ' active' : ''}" style="background:${m.color};border-top-color:${m.color}">${esc(m.label)}${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</div>`
}
const infraHtml = (p) => `<div class="infra-dot" title="${esc(p.name)}" style="background:${INFRA[p.category]?.color || '#64748b'}">${INFRA[p.category]?.icon || '•'}</div>`

function leafletEngine(el, { center, zoom }, emit) {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView(center, zoom)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)
  const markers = L.layerGroup().addTo(map)
  const infra = L.layerGroup().addTo(map)
  let removed = false
  const bounds = () => {
    if (removed) return
    const b = map.getBounds()
    emit.bounds({ sw: [b.getSouth(), b.getWest()], ne: [b.getNorth(), b.getEast()], zoom: map.getZoom(), center: [map.getCenter().lat, map.getCenter().lng] })
  }
  map.on('moveend', bounds)
  setTimeout(bounds, 0)
  return {
    setMarkers(list) {
      markers.clearLayers()
      list.forEach((m) => {
        const mk = L.marker([m.lat, m.lng], { icon: L.divIcon({ className: 'apt-marker', html: markerHtml(m), iconSize: [0, 0] }), zIndexOffset: m.active ? 1000 : 0 })
        mk.on('click', () => (m.kind === 'cluster' ? map.setView([m.lat, m.lng], 14) : emit.click(m.id)))
        markers.addLayer(mk)
      })
    },
    setInfra(list) {
      infra.clearLayers()
      list.forEach((p) => infra.addLayer(L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'apt-marker', html: infraHtml(p), iconSize: [0, 0] }) })
        .bindTooltip(`${INFRA[p.category]?.label || ''} · ${p.name}`, { direction: 'top', offset: [0, -14] })))
    },
    flyTo(c, z) { if (!removed) map.setView(c, z ?? map.getZoom(), { animate: false }) },
    resize() { if (!removed) map.invalidateSize() },
    destroy() { removed = true; map.off(); map.remove() },
  }
}

let kakaoLoader
function loadKakao() {
  kakaoLoader = kakaoLoader || new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`
    s.onload = () => window.kakao.maps.load(() => resolve(window.kakao))
    s.onerror = reject
    document.head.appendChild(s)
  })
  return kakaoLoader
}
const toLevel = (zoom) => Math.max(1, Math.min(14, 19 - zoom))

function kakaoEngine(kakao, el, { center, zoom }, emit) {
  const k = kakao.maps
  const map = new k.Map(el, { center: new k.LatLng(center[0], center[1]), level: toLevel(zoom) })
  map.addControl(new k.ZoomControl(), k.ControlPosition.BOTTOMRIGHT)
  let overlays = []
  let infraOverlays = []
  const bounds = () => {
    const b = map.getBounds()
    const c = map.getCenter()
    emit.bounds({ sw: [b.getSouthWest().getLat(), b.getSouthWest().getLng()], ne: [b.getNorthEast().getLat(), b.getNorthEast().getLng()], zoom: 19 - map.getLevel(), center: [c.getLat(), c.getLng()] })
  }
  k.event.addListener(map, 'idle', bounds)
  setTimeout(bounds, 0)
  const overlay = (m, html, onClick) => {
    const node = document.createElement('div')
    node.innerHTML = html
    node.style.transform = 'translateY(0)'
    if (onClick) node.addEventListener('click', onClick)
    return new k.CustomOverlay({ position: new k.LatLng(m.lat, m.lng), content: node, yAnchor: 0, xAnchor: 0, zIndex: m.active ? 10 : 1, map })
  }
  return {
    setMarkers(list) {
      overlays.forEach((o) => o.setMap(null))
      overlays = list.map((m) => overlay(m, markerHtml(m), () => (m.kind === 'cluster' ? (map.setLevel(5), map.setCenter(new k.LatLng(m.lat, m.lng))) : emit.click(m.id))))
    },
    setInfra(list) {
      infraOverlays.forEach((o) => o.setMap(null))
      infraOverlays = list.map((p) => overlay(p, infraHtml(p)))
    },
    flyTo(c, z) { if (z) map.setLevel(toLevel(z)); map.setCenter(new k.LatLng(c[0], c[1])) },
    resize() { map.relayout() },
    destroy() { overlays.forEach((o) => o.setMap(null)); infraOverlays.forEach((o) => o.setMap(null)) },
  }
}

export default function MapView({ center = [37.5172, 127.0473], zoom = 13, markers = [], infra = [], onBoundsChange, onMarkerClick, focus, className = '' }) {
  const el = useRef(null)
  const engine = useRef(null)
  const emit = useRef({})
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  emit.current.bounds = (b) => onBoundsChange?.(b)
  emit.current.click = (id) => onMarkerClick?.(id)

  useEffect(() => {
    let disposed = false
    const proxy = { bounds: (b) => emit.current.bounds(b), click: (id) => emit.current.click(id) }
    const init = async () => {
      try {
        engine.current = MAP_PROVIDER === 'kakao'
          ? kakaoEngine(await loadKakao(), el.current, { center, zoom }, proxy)
          : leafletEngine(el.current, { center, zoom }, proxy)
        if (!disposed) setReady(true)
      } catch {
        setError('지도를 불러오지 못했습니다. (Kakao 키 도메인 등록 여부를 확인하세요)')
      }
    }
    init()
    const onResize = () => { engine.current?.resize() }
    window.addEventListener('resize', onResize)
    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      engine.current?.destroy()
      engine.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (ready) engine.current.setMarkers(markers) }, [ready, markers])
  useEffect(() => { if (ready) engine.current.setInfra(infra) }, [ready, infra])
  useEffect(() => { if (ready && focus) engine.current.flyTo(focus.center, focus.zoom) }, [ready, focus])
  useEffect(() => { if (ready) setTimeout(() => engine.current?.resize(), 50) }, [ready, className])

  return (
    <div className={`relative isolate ${className}`}>
      <div ref={el} className="absolute inset-0" />
      {error && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 p-6 text-center text-[14px] text-slate-500">{error}</div>}
      <span className="pointer-events-none absolute top-2 left-2 z-[500] rounded-md bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        {MAP_PROVIDER === 'kakao' ? 'Kakao Map' : 'OpenStreetMap'}
      </span>
    </div>
  )
}
