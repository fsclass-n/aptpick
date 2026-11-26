// Unsplash 이미지 (Unsplash License — 무료 상업적 사용 가능, 출처 표기 권장)
// 모든 사진은 분위기 연출용 참고 이미지이며 실제 단지·매물 사진이 아닙니다. (UI 에 '참고 이미지' 표시)
export const unsplash = (id, w = 1200, h) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}${h ? `&h=${h}` : ''}&q=75`

export const IMG = {
  hero: '1546874177-9e664107314e', // 남산타워가 보이는 서울 야경
  skyline: '1534274867514-d5b47ef89ed7', // 석촌호수와 잠실 스카이라인
  street: '1517154421773-0529f29ea451', // 서울 골목 상권
  neon: '1538485399081-7191377e8241', // 도심 번화가 야경
  park: '1519331379826-f10be5486c6f', // 숲길 공원
  keys: '1560518883-ce09059eeffa', // 집 모형과 열쇠
  living: '1600607687939-ce8a6c25118c', // 모던 거실
  bedroom: '1616594039964-ae9021a400a0', // 침실
}

// 단지 참고 이미지 풀 (외관 3 · 실내 9) — 단지 id 로 고정 매칭
const POOL = [
  '1545324418-cc1a3fa10c00', '1600607687939-ce8a6c25118c', '1522708323590-d24dbb6b0267', '1460317442991-0ec209397118',
  '1502672260266-1c1ef2d93688', '1586023492125-27b2c045efd7', '1574362848149-11496d93a7c7', '1505691938895-1758d7feb511',
  '1493809842364-78817add7ffb', '1560448204-e02f11c3d0e2', '1513694203232-719a280e022f', '1536376072261-38c75010e6c9',
]
export const complexImage = (id = 0, w = 800) => unsplash(POOL[Math.abs(Number(id) || 0) % POOL.length], w, Math.round(w * 0.75))
