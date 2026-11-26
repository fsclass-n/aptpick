"""FastAPI OpenAPI 스키마 → docs/산출물/API_명세서.md (Swagger 와 동일한 원본에서 생성)

사용: .venv/Scripts/python scripts/export_api_spec.py
"""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.update({"DATABASE_URL": f"sqlite:///{Path(tempfile.mkdtemp()) / 'spec.db'}", "WARMUP_ON_STARTUP": "false"})
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402

AUTH = {"auth": "공개", "apartments": "공개", "market": "공개", "ai": "공개(이력은 로그인)", "me": "로그인", "reports": "공개·관리자",
        "admin": "관리자 조회(admin·test_admin) / 쓰기(admin)", "websocket": "JWT 쿼리(선택)", "system": "공개"}


def main() -> None:
    spec = app.openapi()
    lines = ["# API 명세서", "", "> 작성: 홍기흥 (Backend) · `scripts/export_api_spec.py` 로 FastAPI OpenAPI 스키마에서 자동 생성 — Swagger(`/docs`)와 동일 원본",
             f"> 버전 {spec['info']['version']} · Base URL: `https://aptpick-api.onrender.com` (Render) / `https://aptpick.duckdns.org` (AWS)", "",
             "## 공통 규칙", "", "- 인증: `Authorization: Bearer <JWT>` (HS256, 기본 720분). 역할 클레임 `role`: `user` | `admin` | `test_admin`",
             "- `role=test_admin` 토큰의 POST·PUT·PATCH·DELETE 는 미들웨어에서 403 `READ_ONLY` (예외: 로그인·로그아웃, `/api/ai/recommend`, `/api/reports/ask`)",
             "- 가격 단위: 만원 · 면적: 전용 ㎡ · 날짜: ISO 8601", "- 오류 형식: `{\"detail\": \"메시지\", \"code\": \"선택\"}` · 요청 제한 초과 시 429 `RATE_LIMITED`",
             "- WebSocket: `wss://<host>/ws/notifications?token=<JWT>` — `notification` · `data_updated` 이벤트", ""]
    groups: dict[str, list] = {}
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            if method.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                continue
            tag = (op.get("tags") or ["system"])[0]
            params = ", ".join(f"`{p['name']}`" for p in op.get("parameters", []) if p["in"] in ("query", "path"))
            body = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {}).get("$ref", "")
            groups.setdefault(tag, []).append((method.upper(), path, op.get("summary", ""), params, body.split("/")[-1]))
    for tag, rows in groups.items():
        lines += [f"## {tag} — 권한: {AUTH.get(tag, '-')}", "", "| Method | Path | 설명 | 파라미터 | Body |", "|---|---|---|---|---|"]
        lines += [f"| {m} | `{p}` | {s} | {q or '-'} | {b or '-'} |" for m, p, s, q, b in rows]
        lines.append("")
    lines += ["## 요청 스키마", ""]
    for name, schema in spec.get("components", {}).get("schemas", {}).items():
        if name.endswith("In"):
            props = schema.get("properties", {})
            req = set(schema.get("required", []))
            lines += [f"### {name}", "", "| 필드 | 타입 | 필수 |", "|---|---|---|"]
            for field, info in props.items():
                typ = info.get("type") or "/".join(x.get("type", x.get("$ref", "").split("/")[-1]) for x in info.get("anyOf", [])) or "-"
                if "enum" in info:
                    typ += f" ({'·'.join(map(str, info['enum']))})"
                lines.append(f"| {field} | {typ} | {'Y' if field in req else ''} |")
            lines.append("")
    out = ROOT / "docs" / "산출물" / "API_명세서.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out} ({sum(len(r) for r in groups.values())} endpoints)")


if __name__ == "__main__":
    main()
