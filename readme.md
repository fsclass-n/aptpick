# aptpick — 부동산 플랫폼

> **데이터로 분석하고, AI로 찾는 나에게 맞는 부동산**

국토교통부 실거래가 등 공공데이터와 AI 분석을 결합해 지역별 시장 동향, AI 적정가격 추정, 사용자 조건 기반 맞춤 매물 추천을 제공하는 B2C·B2B 부동산 플랫폼입니다.

| 구분 | 주소 | 용도 |
|---|---|---|
| Netlify Demo | https://aptpick.netlify.app | 프런트엔드 데모 (브라우저 Mock · 가상 샘플 데이터) |
| Render Frontend | https://aptpick.onrender.com | 프런트엔드 운영 (실제 API 연동) |
| Render Backend | https://aptpick-api.onrender.com/docs | FastAPI 백엔드 · Swagger |
| AWS Fullstack | https://aptpick.duckdns.org | EC2 통합 운영 (Nginx · HTTPS · Docker) |

> ⚠️ 공공데이터 인증키(`DATA_GO_KR_API_KEY`)가 없는 환경에서는 **가상 샘플 데이터**(`source=sample`)로 동작하며, 화면에 “가상 샘플 데이터 · 실제 시세 아님”이 항상 표시됩니다. 인증키 설정 후 관리자 > 데이터 관제에서 국토교통부 실거래를 수집하고 샘플 데이터를 삭제할 수 있습니다.

## 주요 기능

- **아파트 통합 검색** — 등록 매물(호가)과 실거래가(계약 가격)를 구분, 지역·가격·면적·준공연도·방 개수 필터, 정렬, 검색 조건 저장
- **지도 탐색** — Leaflet + OpenStreetMap(기본) / Kakao Map(키 설정 시), 가격 마커·지역 클러스터, 지하철·버스·학교·병원·마트·공원 레이어, 목록 동기화
- **부동산 시장 분석** — 월·분기·연 변동률, 거래량, 전세가율, 평형별 분포, 변동성, 거래량-가격 상관, 상승·하락 히트맵, 지역 비교, 급등·급락 탐지
- **AI 가격 예측** — HistGradientBoosting + 분위수 회귀 + 분할 등각 보정(80% 구간), 층·경과연수 민감도, 유사 단지 비교, 모델 성능(MAE·RMSE·MAPE·R²) 공개
- **AI 맞춤 추천** — 예산·지역 적합도, 교통·학군·생활 인프라, 가격 경쟁력, 실거주/투자 목적별 가중치, 추천 이유·주의 사항
- **관심 매물 · 가격 알림** — 목표 호가 도달 시 WebSocket 실시간 알림
- **AI 리포트** — 검증된 통계만 Gemini 에 전달, 생성 수치 자동 대조(미연동 시 규칙 기반)
- **관리자 콘솔** — 회원·매물(검수·중복)·공공데이터 수집 관제·AI 모델 관제·리포트·감사 로그·문의·공지, 테스트 관리자(읽기 전용·마스킹)

## 디렉터리 구조

```
aptpick/
├── backend/            FastAPI (app/core · models · schemas · routers · services · repositories · middleware · dependencies · database), tests/
├── frontend/           React 19 + Vite + Tailwind v4 (components · layouts · pages · hooks · contexts · services · api · routes · utils · styles · mock)
├── ai/                 data_processing · feature_engineering · price_prediction · recommendation · anomaly_detection · evaluation · models · tests
├── data/               raw(미커밋) · processed(미커밋) · samples · analysis
├── docs/               md(개발 기록) · 프로젝트_진행일지 · 산출물 · pdf
├── deploy/             AWS EC2 (bootstrap · nginx · DuckDNS · remote-deploy)
├── scripts/            export_mock.py(Netlify 스냅샷) · export_api_spec.py(API 명세서)
├── .github/workflows/  deploy-frontend.yml · deploy-backend.yml · deploy-aws.yml
├── render.yaml · netlify.toml · docker-compose.yml · requirements.txt · .env.example
```

## 로컬 실행

```bash
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
cp .env.example .env                       # JWT_SECRET_KEY · ADMIN_SECRET_KEY 입력
cd backend && ../.venv/Scripts/python -m uvicorn app.main:app --reload   # http://localhost:8000/docs
cd frontend && npm ci && npm run dev                                       # http://localhost:5173
# 또는 docker compose up --build
```

- DB: `DATABASE_URL`/`TIDB_*` 미설정 시 SQLite(`backend/storage/aptpick.db`), TiDB 설정 시 `aptpick` 데이터베이스를 자동 생성
- 테스트: `cd backend && ../.venv/Scripts/python -m pytest -q` · `.venv/Scripts/python -m pytest -q ai/tests`
- Netlify 데모 빌드: `VITE_USE_MOCK=true npm run build` (스냅샷 갱신: `.venv/Scripts/python scripts/export_mock.py`)

## 계정 유형

| 유형 | 진입 | 권한 |
|---|---|---|
| 일반 사용자 | 회원가입 · Google/Naver/Kakao OAuth · ‘테스트 사용자’ 버튼 | 검색·추천·관심 매물·알림·마이페이지 |
| 테스트 관리자 | 로그인 화면 ‘테스트 관리자’ 버튼 (JWT `role: test_admin`) | 관리자 메뉴 전체 조회, 쓰기 403, 개인정보 마스킹 |
| 실제 관리자 | ‘실제 관리자 로그인’ + `ADMIN_SECRET_KEY` | 전체 CRUD · 데이터 수집 · 모델 재학습 · 감사 로그 |

## 배포 (Deploy Hook 미사용)

1. **Render** — 대시보드 > New > Blueprint 로 이 저장소를 1회 연결 → `render.yaml` 의 `aptpick-api`, `aptpick` 서비스 생성. 이후 main push 시 GitHub Actions 검증 통과(`checksPass`) 후 자동 배포. `sync: false` 환경 변수(TiDB·API 키 등)는 대시보드에서 입력
2. **Netlify** — Add new site > Import from Git 으로 저장소 1회 연결(사이트명 `aptpick`) → `netlify.toml` 로 frontend 변경 시 자동 배포
3. **AWS EC2** — `deploy/bootstrap-ec2.sh` → `/etc/aptpick/*.env` 작성 → `deploy/enable-ssl.sh`. GitHub Secrets `EC2_HOST`·`EC2_USER`·`EC2_SSH_KEY`(선택 `EC2_PORT`·`EC2_PROJECT_PATH`) 등록 시 main push 마다 SSH 배포 + Health Check + 실패 시 롤백
4. 배포 상태 확인 — `deploy-frontend.yml`·`deploy-backend.yml` 의 `health` 잡(6시간 주기·수동 실행), AWS 는 배포 직후 Health Check

## 팀

| 이름 | 역할 |
|---|---|
| 박미금 (조장) | PM · Frontend · UI/UX |
| 김모란 | AI 모델링 · Machine Learning |
| 이오리 | 데이터 분석 · 수집 · AI 리포트 · 산출물 총괄 |
| 홍기흥 | Backend · Database · Infrastructure |

© 2026 aptpick. All rights reserved.
