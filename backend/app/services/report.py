"""AI 부동산 분석 리포트 (Google Gemini API) + 규칙 기반 대체 생성.

원칙
- Gemini 에는 stats 서비스가 계산한 '검증된 통계(JSON)'만 전달하고, 데이터에 없는 수치 생성을 금지합니다.
- 생성 결과의 숫자를 근거 데이터와 대조(verify_numbers)하여 근거 없는 수치가 있으면 표시합니다.
- GEMINI_API_KEY 가 없거나 호출이 실패하면 동일 구조의 규칙 기반 리포트를 생성합니다.
"""
import json
import re

import httpx
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models import AnalysisReport
from . import anomaly, stats

KINDS = {
    "daily": "일간 부동산 시장 분석", "weekly": "주간 부동산 시장 분석", "monthly": "월간 지역별 시장 동향",
    "price_change": "아파트 가격 변동 분석", "volume_jeonse": "거래량 및 전세가율 분석",
    "region_compare": "지역 간 투자 환경 비교", "residence": "실거주 관점의 지역 분석",
}
SECTIONS = ["핵심 요약", "주요 시장 지표", "지역별 가격 변화", "거래량 분석", "주요 상승·하락 지역", "데이터 기반 분석 의견",
            "위험 요인", "향후 관찰 지표"]
SYSTEM_PROMPT = (
    "당신은 aptpick 의 부동산 데이터 분석가입니다. 반드시 사용자가 제공한 JSON 통계만 근거로 한국어 Markdown 리포트를 작성하세요. "
    "JSON 에 없는 가격·거래량·비율·단지명·정책 수치를 만들어내지 마세요. 수치는 JSON 값을 그대로(필요 시 반올림) 인용하고, "
    "투자 권유나 미래 가격 단정 표현을 쓰지 마세요. 데이터가 가상 샘플이면 그 사실을 첫 문단에 명시하세요. "
    f"섹션은 순서대로 '## 1. {SECTIONS[0]}' 부터 '## 8. {SECTIONS[7]}' 까지 8개 제목을 사용합니다."
)


def _fmt_price(v) -> str:
    if v is None:
        return "-"
    v = int(round(v))
    eok, man = divmod(v, 10000)
    return f"{eok}억 {man:,}만원" if eok and man else f"{eok}억원" if eok else f"{man:,}만원"


def _vol_list(rows: list[dict]) -> str:
    return ", ".join("{}({}건)".format(r["name"], r["volume_3m"]) for r in rows)


def _pct(v) -> str:
    return "-" if v is None else f"{v:+.2f}%"


def build_context(db: Session, kind: str, region_code: str | None = None) -> dict:
    ov = stats.overview(db)
    ctx = {"report_kind": KINDS.get(kind, kind), "meta": ov["meta"], "national": ov["kpi"],
           "national_recent_months": ov["series"][-6:], "top_risers_yoy": ov["risers"][:3], "top_fallers_yoy": ov["fallers"][:3],
           "regions": [{k: r[k] for k in ("name", "ppm2", "pyeong_price", "volume_3m", "jeonse_ratio", "mom", "yoy")}
                       for r in ov["regions"]],
           "region_surges": anomaly.region_surges(db, months=3)[:6]}
    if region_code:
        detail = stats.region_detail(db, region_code)
        if detail and detail.get("has_data"):
            ctx["focus_region"] = {"region": detail["region"]["name"], "monthly_recent": detail["monthly"][-6:],
                                   "indicators": detail["indicators"], "area_distribution": detail["area_distribution"],
                                   "top_complexes": detail["top_complexes"][:5]}
    return ctx


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}


def verify_numbers(content: str, ctx: dict) -> dict:
    """리포트 본문의 수치(3자리 이상 또는 소수)가 근거 데이터에서 유도 가능한지 대조"""
    src = json.dumps(ctx, ensure_ascii=False)
    allowed = _numbers(src)
    for raw in list(allowed):
        try:
            f = float(raw)
        except ValueError:
            continue
        allowed.update({f"{f:.0f}", f"{f:.1f}", f"{f:.2f}", f"{f * 100:.1f}", f"{f * 100:.2f}", f"{f * 100:.0f}",
                        f"{abs(f):.2f}", f"{abs(f):.1f}", f"{f / 10000:.1f}", str(int(f) // 10000), str(int(f) % 10000)})
    checked = [n for n in _numbers(content) if len(n.replace(".", "")) >= 3 or "." in n]
    unverified = sorted({n for n in checked if n not in allowed and not re.fullmatch(r"20\d\d", n)})
    return {"checked": len(checked), "unverified": unverified[:20], "passed": not unverified}


def rule_based(ctx: dict, kind: str) -> str:
    k, m = ctx["national"] or {}, ctx["meta"]
    sample = "※ 본 리포트는 **가상 샘플 데이터**로 생성되었으며 실제 시장 상황이 아닙니다.\n\n" if m.get("is_sample") else ""
    risers, fallers = ctx["top_risers_yoy"], ctx["top_fallers_yoy"]
    focus = ctx.get("focus_region")
    lines = [sample + f"데이터 기준일 {m.get('as_of')} · 출처: " + ", ".join(s["label"] for s in m.get("sources", [])), ""]
    trend = "상승" if (k.get("yoy") or 0) > 0.5 else "하락" if (k.get("yoy") or 0) < -0.5 else "보합"
    lines += [f"## 1. {SECTIONS[0]}",
              f"- {k.get('period')} 기준 분석 대상 {k.get('region_count')}개 지역의 ㎡당 평균 거래가는 {k.get('ppm2')}만원(3개월 이동평균)이며, "
              f"전년 동월 대비 {_pct(k.get('yoy'))}로 **{trend}** 흐름입니다.",
              f"- 최근 월 거래량은 {k.get('volume')}건(전년 동월 대비 {_pct(k.get('volume_yoy'))}), 전세가율은 {round((k.get('jeonse_ratio') or 0) * 100, 1)}% 입니다.",
              "", f"## 2. {SECTIONS[1]}", "| 지표 | 값 |", "|---|---|",
              f"| 평균 거래가 (최근 3개월) | {_fmt_price(k.get('avg_price'))} |", f"| ㎡당 평균가 | {k.get('ppm2')}만원 |",
              f"| 3.3㎡(평)당 평균가 | {k.get('pyeong_price')}만원 |", f"| 전월 대비 | {_pct(k.get('mom'))} |",
              f"| 전년 동월 대비 | {_pct(k.get('yoy'))} |", f"| 월 거래량 | {k.get('volume')}건 |", "",
              f"## 3. {SECTIONS[2]}", "| 지역 | ㎡당가(만원) | 전월 대비 | 전년 대비 | 전세가율 |", "|---|---|---|---|---|"]
    lines += [f"| {r['name']} | {r['ppm2']} | {_pct(r['mom'])} | {_pct(r['yoy'])} | {round((r['jeonse_ratio'] or 0) * 100, 1)}% |"
              for r in ctx["regions"][:10]]
    vol_sorted = sorted(ctx["regions"], key=lambda r: -(r["volume_3m"] or 0))
    lines += ["", f"## 4. {SECTIONS[3]}",
              f"- 최근 3개월 거래가 가장 많은 지역은 {_vol_list(vol_sorted[:3])} 입니다.",
              f"- 거래가 가장 적은 지역은 {_vol_list(vol_sorted[-2:])} 입니다.", "",
              f"## 5. {SECTIONS[4]}",
              "- 상승: " + (", ".join(f"{r['name']} {_pct(r['yoy'])}" for r in risers) or "-"),
              "- 하락: " + (", ".join(f"{r['name']} {_pct(r['yoy'])}" for r in fallers) or "-"), ""]
    if ctx["region_surges"]:
        lines.append("- 최근 3개월 단기 급변: " + ", ".join(f"{s['region']} {s['period']} {s['kind']}({_pct(s['mom'])})" for s in ctx["region_surges"]))
        lines.append("")
    lines += [f"## 6. {SECTIONS[5]}"]
    if focus:
        ind = focus["indicators"]
        lines += [f"- **{focus['region']}**: 최근 12개월 거래 {ind['volume_12m']}건, 월간 변동성 {ind['volatility']}%, "
                  f"거래량-가격변동 상관계수 {ind['volume_price_corr']}, 월세 비중 {ind['monthly_rent_share']}%."]
    lines += ["- 상승 지역은 거래량 동반 여부를, 하락 지역은 전세가율 변화를 함께 확인해야 추세의 지속성을 판단할 수 있습니다.",
              "- 지역 평균은 거래된 단지 구성에 따라 달라지므로 단지·평형 단위 실거래와 함께 해석해야 합니다.", "",
              f"## 7. {SECTIONS[6]}",
              "- 전세가율이 높은 지역은 매매가 하락 시 보증금 반환 위험이 커질 수 있습니다.",
              "- 거래량이 적은 달의 평균가는 소수 거래에 크게 좌우됩니다.",
              "- 금리·대출 규제·공급(입주) 물량 등 본 데이터에 없는 외부 요인은 반영되지 않았습니다.", "",
              f"## 8. {SECTIONS[7]}", "- 월별 거래량 추이와 3개월 이동평균 ㎡당가의 방향 전환",
              "- 지역별 전세가율 변화 및 월세 비중", "- 신고가·직거래 등 이상 거래 비중"]
    return "\n".join(lines)


def call_gemini(ctx: dict, kind: str, question: str | None = None) -> str | None:
    if not settings.gemini_api_key:
        return None
    user = (f"질문: {question}\n다음 JSON 통계만 근거로 3~6문장으로 답하고, 근거가 없으면 '제공된 데이터로는 확인할 수 없습니다'라고 답하세요.\n"
            if question else f"리포트 유형: {KINDS.get(kind, kind)}\n") + json.dumps(ctx, ensure_ascii=False)
    try:
        res = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent",
                         headers={"x-goog-api-key": settings.gemini_api_key},
                         json={"systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                               "contents": [{"role": "user", "parts": [{"text": user}]}],
                               "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096}}, timeout=60)
        res.raise_for_status()
        parts = res.json()["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts).strip() or None
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None


def generate(db: Session, kind: str, region_code: str | None = None, created_by: str = "system") -> AnalysisReport:
    ctx = build_context(db, kind, region_code)
    content = call_gemini(ctx, kind)
    generator, model = ("gemini", settings.gemini_model) if content else ("rule", "aptpick-rule-v1")
    content = content or rule_based(ctx, kind)
    verification = verify_numbers(content, ctx)
    region_name = (ctx.get("focus_region") or {}).get("region")
    k = ctx["national"] or {}
    summary = (f"{k.get('period')} ㎡당 평균 {k.get('ppm2')}만원 · 전년 대비 {_pct(k.get('yoy'))} · 거래 {k.get('volume')}건"
               if k else "데이터 없음")
    report = AnalysisReport(kind=kind, title=f"{KINDS.get(kind, kind)}{' · ' + region_name if region_name else ''} ({ctx['meta']['as_of'][:7]})",
                            region_code=region_code, summary=summary, content=content,
                            stats={"context": ctx, "verification": verification}, generator=generator, model=model,
                            data_as_of=ctx["meta"]["as_of"], created_by=created_by)
    db.add(report)
    db.commit()
    return report


def answer(db: Session, question: str, region_code: str | None = None) -> dict:
    ctx = build_context(db, "daily", region_code)
    text = call_gemini(ctx, "qa", question)
    if text:
        return {"answer": text, "generator": "gemini", "verification": verify_numbers(text, ctx), "meta": ctx["meta"]}
    k = ctx["national"] or {}
    focus = ctx.get("focus_region")
    parts = [f"Gemini API 가 연결되지 않아 통계 요약으로 답변합니다. {k.get('period')} 기준 분석 지역 ㎡당 평균가는 {k.get('ppm2')}만원,"
             f" 전년 대비 {_pct(k.get('yoy'))}, 전세가율 {round((k.get('jeonse_ratio') or 0) * 100, 1)}% 입니다."]
    if focus:
        last = focus["monthly_recent"][-1]
        parts.append(f"{focus['region']}의 최근 월 ㎡당가는 {last['ma3']}만원(전월 대비 {_pct(last['mom'])}), 거래 {last['volume']}건입니다.")
    if ctx["meta"].get("is_sample"):
        parts.append("(가상 샘플 데이터 기준)")
    return {"answer": " ".join(parts), "generator": "rule", "verification": {"passed": True, "unverified": [], "checked": 0},
            "meta": ctx["meta"]}
