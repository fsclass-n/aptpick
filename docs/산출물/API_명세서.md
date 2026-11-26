# API 명세서

> 작성: 홍기흥 (Backend) · `scripts/export_api_spec.py` 로 FastAPI OpenAPI 스키마에서 자동 생성 — Swagger(`/docs`)와 동일 원본
> 버전 1.0.0 · Base URL: `https://aptpick-api.onrender.com` (Render) / `https://aptpick.duckdns.org` (AWS)

## 공통 규칙

- 인증: `Authorization: Bearer <JWT>` (HS256, 기본 720분). 역할 클레임 `role`: `user` | `admin` | `test_admin`
- `role=test_admin` 토큰의 POST·PUT·PATCH·DELETE 는 미들웨어에서 403 `READ_ONLY` (예외: 로그인·로그아웃, `/api/ai/recommend`, `/api/reports/ask`)
- 가격 단위: 만원 · 면적: 전용 ㎡ · 날짜: ISO 8601
- 오류 형식: `{"detail": "메시지", "code": "선택"}` · 요청 제한 초과 시 429 `RATE_LIMITED`
- WebSocket: `wss://<host>/ws/notifications?token=<JWT>` — `notification` · `data_updated` 이벤트

## auth — 권한: 공개

| Method | Path | 설명 | 파라미터 | Body |
|---|---|---|---|---|
| GET | `/api/auth/password-policy` | 비밀번호 정책 | - | - |
| POST | `/api/auth/signup` | 회원가입 | - | SignupIn |
| POST | `/api/auth/login` | 이메일 로그인 | - | LoginIn |
| POST | `/api/auth/test-login` | 테스트 사용자 / 테스트 관리자(읽기 전용) 로그인 | - | TestLoginIn |
| POST | `/api/auth/admin-key-login` | 실제 관리자 로그인 (ADMIN_SECRET_KEY) | - | AdminKeyIn |
| POST | `/api/auth/logout` | 로그아웃 (클라이언트 토큰 폐기) | - | - |
| GET | `/api/auth/me` | 내 정보 | - | - |
| PATCH | `/api/auth/me` | 내 정보 수정 | - | ProfileUpdateIn |
| POST | `/api/auth/me/withdraw` | 회원 탈퇴 (개인정보 및 이용 기록 삭제) | - | WithdrawIn |
| GET | `/api/auth/oauth/providers` | OAuth 제공자 설정 여부 | - | - |
| GET | `/api/auth/oauth/{provider}/login` | OAuth 2.0 로그인 시작 | `provider` | - |
| GET | `/api/auth/oauth/{provider}/callback` | OAuth 2.0 콜백 | `provider`, `code`, `state` | - |

## apartments — 권한: 공개

| Method | Path | 설명 | 파라미터 | Body |
|---|---|---|---|---|
| GET | `/api/regions` | 시군구 목록 (데이터 보유 여부 포함) | - | - |
| GET | `/api/apartments` | 단지 목록 (지역·이름) + 평형 | `region`, `q`, `limit` | - |
| GET | `/api/apartments/suggest` | 단지명·지역 자동완성 | `q` | - |
| GET | `/api/apartments/search` | 아파트 매물 통합 검색 (등록 매물 = 호가) | `q`, `region`, `sido`, `deal_type`, `price_min`, `price_max`, `rent_max`, `area_min`, `area_max`, `build_year_min`, `build_year_max`, `rooms_min`, `sort`, `page`, `size` | - |
| GET | `/api/transactions/search` | 실거래가 조회 (국토교통부 실거래 = 계약 완료 가격) | `q`, `region`, `price_min`, `price_max`, `area_min`, `area_max`, `date_from`, `date_to`, `page`, `size` | - |
| GET | `/api/apartments/map` | 지도 영역 내 단지 마커 | `sw_lat`, `sw_lng`, `ne_lat`, `ne_lng`, `deal_type` | - |
| GET | `/api/infrastructure` | 주변 생활 인프라 (지도 레이어) | `lat`, `lng`, `radius` | - |
| GET | `/api/apartments/{complex_id}` | 아파트 단지 상세 | `complex_id` | - |
| GET | `/api/properties/{property_id}` | 매물 상세 | `property_id` | - |
| GET | `/api/apartments/{complex_id}/types/{apartment_id}` | 평형 정보 | `complex_id`, `apartment_id` | - |

## market — 권한: 공개

| Method | Path | 설명 | 파라미터 | Body |
|---|---|---|---|---|
| GET | `/api/market/overview` | 전국(분석 대상 지역) 시장 개요 | - | - |
| GET | `/api/market/regions` | 지역별 최신 시장 지표 | - | - |
| GET | `/api/market/regions/{code}` | 지역 상세 분석 (월·분기·연 변동, 거래량, 전세가율, 평형 분포, 변동성) | `code` | - |
| GET | `/api/market/heatmap` | 지역 × 월 가격 변동률 히트맵 | `months` | - |
| GET | `/api/market/compare` | 지역 비교 | `codes` | - |
| GET | `/api/market/recent-transactions` | 최근 수집 실거래 | `limit`, `region` | - |
| GET | `/api/market/popular-regions` | 인기 검색 지역 | - | - |
| GET | `/api/market/anomalies` | 지역 급등·급락 및 이상 거래 | - | - |

## ai — 권한: 공개(이력은 로그인)

| Method | Path | 설명 | 파라미터 | Body |
|---|---|---|---|---|
| GET | `/api/ai/model` | 가격 예측 모델 정보·성능 지표 | - | - |
| GET | `/api/ai/predict/{apartment_id}` | AI 아파트 적정가격 추정 | `apartment_id`, `floor` | - |
| POST | `/api/ai/recommend` | 맞춤형 매물 추천 | - | RecommendIn |
| GET | `/api/ai/recommendations/history` | 내 추천 이력 | - | - |

## me — 권한: 로그인

| Method | Path | 설명 | 파라미터 | Body |
|---|---|---|---|---|
| GET | `/api/favorites` | 관심 아파트·매물 목록 | - | - |
| POST | `/api/favorites` | 관심 매물 등록 | - | FavoriteIn |
| DELETE | `/api/favorites/{fav_id}` | 관심 매물 삭제 | `fav_id` | - |
| GET | `/api/alerts` | 가격 알림 목록 | - | - |
| POST | `/api/alerts` | 가격 알림 등록 (등록 즉시 현재 호가로 1회 평가) | - | AlertIn |
| PATCH | `/api/alerts/{alert_id}` | 가격 알림 수정 | `alert_id` | AlertUpdateIn |
| DELETE | `/api/alerts/{alert_id}` | 가격 알림 삭제 | `alert_id` | - |
| GET | `/api/notifications` | 내 알림 (개인 + 전체 공지) | - | - |
| POST | `/api/notifications/read-all` | 알림 모두 읽음 | - | - |
| GET | `/api/me/preferences` | 개인화 선호 조건 | - | - |
| PUT | `/api/me/preferences` | 개인화 선호 조건 저장 | - | PreferenceIn |
| POST | `/api/me/saved-searches` | 검색 조건 저장 | - | SavedSearchIn |
| DELETE | `/api/me/saved-searches/{name}` | 저장한 검색 조건 삭제 | `name` | - |
| GET | `/api/me/recent-searches` | 최근 검색 내역 | - | - |
| POST | `/api/inquiries` | 고객센터·제휴 문의 접수 | - | InquiryIn |

## reports — 권한: 공개·관리자

| Method | Path | 설명 | 파라미터 | Body |
|---|---|---|---|---|
| GET | `/api/reports` | AI 부동산 분석 리포트 목록 | `kind`, `page`, `size` | - |
| GET | `/api/reports/{report_id}` | 리포트 상세 | `report_id` | - |
| DELETE | `/api/reports/{report_id}` | 리포트 삭제 (관리자) | `report_id` | - |
| POST | `/api/reports/generate` | 리포트 생성 (관리자) — Gemini 또는 규칙 기반 | - | ReportGenerateIn |
| POST | `/api/reports/ask` | 자연어 부동산 질의응답 (검증된 통계 근거) | - | AskIn |

## admin — 권한: 관리자 조회(admin·test_admin) / 쓰기(admin)

| Method | Path | 설명 | 파라미터 | Body |
|---|---|---|---|---|
| GET | `/api/admin/dashboard` | 관리자 통합 대시보드 | - | - |
| GET | `/api/admin/users` | 회원 목록 (test_admin 은 마스킹) | `q`, `role`, `page`, `size` | - |
| PATCH | `/api/admin/users/{user_id}` | 회원 권한·활성 상태 변경 | `user_id` | UserAdminUpdateIn |
| GET | `/api/admin/properties` | 매물 목록 (검수 상태별) | `status`, `q`, `page`, `size` | - |
| POST | `/api/admin/properties` | 매물 등록 | - | PropertyIn |
| GET | `/api/admin/properties/duplicates` | 중복 의심 매물 (동일 평형·유형·가격·층) | - | - |
| PUT | `/api/admin/properties/{prop_id}` | 매물 수정 (승인·반려 포함) | `prop_id` | PropertyUpdateIn |
| DELETE | `/api/admin/properties/{prop_id}` | 매물 삭제 | `prop_id` | - |
| GET | `/api/admin/complexes/{complex_id}/types` | 단지 평형 목록 (매물 등록용) | `complex_id` | - |
| GET | `/api/admin/data/sources` | 데이터 출처·수집 상태 | - | - |
| GET | `/api/admin/data/logs` | 데이터 수집 이력 | `limit` | - |
| POST | `/api/admin/data/collect` | 국토교통부 실거래 수집 실행 (백그라운드) | - | CollectIn |
| POST | `/api/admin/data/refresh-stats` | 지역 통계·AI 모델 재계산 | - | - |
| DELETE | `/api/admin/data/sample` | 가상 샘플 데이터 일괄 삭제 (실데이터 전환 시) | - | - |
| GET | `/api/admin/models` | AI 모델 버전·성능 이력 | - | - |
| POST | `/api/admin/models/retrain` | 가격 예측 모델 재학습 | - | - |
| GET | `/api/admin/anomalies` | 이상 거래·지역 급변 탐지 결과 | - | - |
| GET | `/api/admin/audit-logs` | 관리자 감사 로그 | `limit` | - |
| GET | `/api/admin/inquiries` | 사용자 문의 목록 | - | - |
| PATCH | `/api/admin/inquiries/{inquiry_id}` | 문의 답변·상태 변경 | `inquiry_id` | InquiryAnswerIn |
| POST | `/api/admin/notifications/broadcast` | 전체 공지 알림 발송 | - | BroadcastIn |

## system — 권한: 공개

| Method | Path | 설명 | 파라미터 | Body |
|---|---|---|---|---|
| GET | `/api/health` | Health Check | - | - |

## 요청 스키마

### AdminKeyIn

| 필드 | 타입 | 필수 |
|---|---|---|
| admin_key | string | Y |

### AlertIn

| 필드 | 타입 | 필수 |
|---|---|---|
| complex_id | integer | Y |
| apartment_id | integer/null |  |
| deal_type | string (sale·jeonse·monthly) |  |
| condition | string (below·above) |  |
| target_price | integer | Y |

### AlertUpdateIn

| 필드 | 타입 | 필수 |
|---|---|---|
| target_price | integer/null |  |
| condition | string/null |  |
| active | boolean/null |  |

### AskIn

| 필드 | 타입 | 필수 |
|---|---|---|
| question | string | Y |
| region_code | string/null |  |

### BroadcastIn

| 필드 | 타입 | 필수 |
|---|---|---|
| title | string | Y |
| message | string | Y |
| link | string |  |

### CollectIn

| 필드 | 타입 | 필수 |
|---|---|---|
| source | string (molit_trade·molit_rent) |  |
| region_code | string | Y |
| months | array | Y |

### FavoriteIn

| 필드 | 타입 | 필수 |
|---|---|---|
| complex_id | integer | Y |
| property_id | integer/null |  |
| memo | string |  |

### InquiryAnswerIn

| 필드 | 타입 | 필수 |
|---|---|---|
| status | string (open·answered·closed) |  |
| answer | string |  |

### InquiryIn

| 필드 | 타입 | 필수 |
|---|---|---|
| name | string | Y |
| email | string | Y |
| category | string (general·partnership·data·bug) |  |
| message | string | Y |

### LoginIn

| 필드 | 타입 | 필수 |
|---|---|---|
| email | string | Y |
| password | string | Y |

### PreferenceIn

| 필드 | 타입 | 필수 |
|---|---|---|
| region_codes | array |  |
| deal_type | string (sale·jeonse·monthly) |  |
| budget_min | integer/null |  |
| budget_max | integer/null |  |
| monthly_max | integer/null |  |
| area_min | number/null |  |
| area_max | number/null |  |
| rooms_min | integer/null |  |
| build_year_min | integer/null |  |
| transport_weight | integer |  |
| school_weight | integer |  |
| infra_weight | integer |  |
| purpose | string (residence·investment) |  |

### ProfileUpdateIn

| 필드 | 타입 | 필수 |
|---|---|---|
| name | string/null |  |
| phone | string/null |  |

### PropertyIn

| 필드 | 타입 | 필수 |
|---|---|---|
| apartment_id | integer | Y |
| deal_type | string (sale·jeonse·monthly) | Y |
| price | integer | Y |
| monthly_rent | integer |  |
| floor | integer/null |  |
| direction | string |  |
| description | string |  |
| agency | string |  |
| status | string (pending·approved·rejected) |  |

### PropertyUpdateIn

| 필드 | 타입 | 필수 |
|---|---|---|
| price | integer/null |  |
| monthly_rent | integer/null |  |
| floor | integer/null |  |
| direction | string/null |  |
| description | string/null |  |
| agency | string/null |  |
| status | string/null |  |

### RecommendIn

| 필드 | 타입 | 필수 |
|---|---|---|
| region_codes | array |  |
| deal_type | string (sale·jeonse·monthly) |  |
| budget_min | integer/null |  |
| budget_max | integer/null |  |
| monthly_max | integer/null |  |
| area_min | number/null |  |
| area_max | number/null |  |
| rooms_min | integer/null |  |
| build_year_min | integer/null |  |
| transport_weight | integer |  |
| school_weight | integer |  |
| infra_weight | integer |  |
| purpose | string (residence·investment) |  |
| top_k | integer |  |
| save_preference | boolean |  |

### ReportGenerateIn

| 필드 | 타입 | 필수 |
|---|---|---|
| kind | string (daily·weekly·monthly·price_change·volume_jeonse·region_compare·residence) |  |
| region_code | string/null |  |

### SavedSearchIn

| 필드 | 타입 | 필수 |
|---|---|---|
| name | string | Y |
| query | object | Y |

### SignupIn

| 필드 | 타입 | 필수 |
|---|---|---|
| email | string | Y |
| password | string | Y |
| name | string | Y |
| phone | string/null |  |

### TestLoginIn

| 필드 | 타입 | 필수 |
|---|---|---|
| kind | string (user·test_admin) |  |

### UserAdminUpdateIn

| 필드 | 타입 | 필수 |
|---|---|---|
| role | string/null |  |
| is_active | boolean/null |  |

### WithdrawIn

| 필드 | 타입 | 필수 |
|---|---|---|
| confirm | string | Y |
