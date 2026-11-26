# AGENTS.md — aptpick 작업 가이드

## 명령어 (Windows · Git Bash)
- 가상환경: `py -3.11 -m venv .venv` → `.venv/Scripts/python -m pip install -r requirements.txt` (AI 실험: `-r ai/requirements.txt`)
  - Windows pip 은 requirements.txt 를 cp949 로 읽으므로 첫 줄 `# -*- coding: utf-8 -*-` 유지
- 한글 출력 시 `PYTHONIOENCODING=utf-8`
- 백엔드: `cd backend && ../.venv/Scripts/python -m uvicorn app.main:app --reload` (Swagger `/docs`)
- 백엔드 테스트: `cd backend && PYTHONIOENCODING=utf-8 ../.venv/Scripts/python -m pytest -q`
- AI 테스트: `PYTHONIOENCODING=utf-8 .venv/Scripts/python -m pytest -q ai/tests`
- AI 평가 재실행: `python -m ai.price_prediction.train` · `python -m ai.recommendation.evaluate` · `python -m ai.anomaly_detection.detect` (결과: `ai/evaluation/results/*.json`)
- 프런트엔드: `cd frontend && npm run dev` / `npm run build` (Netlify 데모: `VITE_USE_MOCK=true`)
- Netlify Mock 스냅샷 갱신: `.venv/Scripts/python scripts/export_mock.py` (백엔드 API 응답이 바뀌면 반드시 재생성)
- API 명세서 갱신: `.venv/Scripts/python scripts/export_api_spec.py` → `docs/산출물/API_명세서.md`
- 새 npm 패키지는 `npm install --before=<7일 전 날짜> --save-exact`
- UI 확인: Git Bash 에서 `/` 인자는 경로로 변환되므로 `MSYS_NO_PATHCONV=1` 사용

## 규칙
- `backend/`, `frontend/` 는 자기완비 디렉터리 (requirements.txt·Dockerfile·.dockerignore 포함, Render rootDir)
- 환경 변수는 루트 `.env` 하나 (Vite `envDir: '..'`), 새 키는 `.env.example` 에 구분 태그와 함께 추가
- 데이터 구분: `source=sample`(가상 샘플) vs `source=molit`(국토교통부). 샘플은 UI 에 반드시 ‘가상 샘플 데이터’ 표시, 허위 실거래가 생성 금지
- 매물 가격은 ‘호가’, 실거래가는 ‘실거래’ 로 UI 에서 구분. AI 결과에는 기준일·모델 버전·범위·한계 표시
- 가격 단위는 만원, 면적은 전용 ㎡ (국토교통부 API 와 동일)
- 백엔드 라우트·권한 규칙 변경 시 `frontend/src/mock/server.js` 도 함께 수정, 추천 가중치는 `backend/app/services/recommendation.py` ↔ `frontend/src/mock/recommend.js` 동일 유지
- 테스트 관리자(`test_admin`) 쓰기 차단의 최종 방어선은 `backend/app/middleware/__init__.py` (예외 경로는 `READ_ONLY_EXEMPT`)
- Python 3.11: f-string 안에서 같은 종류의 따옴표 중첩 금지
- `components/ui.jsx` 의 `Async` 는 `isPending` 기준 — 비활성(enabled=false) 쿼리는 로딩 상태로 처리
- useEffect 콜백은 값을 반환하지 않도록 블록 `{}` 으로 작성
- 배포: Render Blueprint(`checksPass`) · Netlify Git 연동 · AWS EC2 SSH(GitHub Actions). Render/Netlify Deploy Hook 사용 금지
- push 워크플로에서 Render 배포 완료를 기다리지 말 것 (checksPass 교착) — 배포 상태 확인은 `health` 잡(schedule/수동)
- 작업 내역은 `docs/md/` 와 `docs/프로젝트_진행일지/` 에 기록, 구현되지 않은 기능은 완료로 쓰지 않음
