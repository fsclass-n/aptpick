from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_admin_write
from ..models import AnalysisReport, User
from ..schemas import AskIn, ReportGenerateIn
from ..services import report
from ..services.common import audit

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _out(r: AnalysisReport, full: bool = False) -> dict:
    data = {"id": r.id, "kind": r.kind, "kind_label": report.KINDS.get(r.kind, r.kind), "title": r.title,
            "region_code": r.region_code, "summary": r.summary, "generator": r.generator, "model": r.model,
            "data_as_of": r.data_as_of, "created_at": r.created_at.isoformat(),
            "verification": (r.stats or {}).get("verification"),
            "is_sample": ((r.stats or {}).get("context", {}).get("meta") or {}).get("is_sample", False)}
    if full:
        data.update(content=r.content, sources=((r.stats or {}).get("context", {}).get("meta") or {}).get("sources", []),
                    context=(r.stats or {}).get("context"))
    return data


@router.get("", summary="AI 부동산 분석 리포트 목록")
def list_reports(kind: str | None = None, page: int = Query(1, ge=1), size: int = Query(12, ge=1, le=50),
                 db: Session = Depends(get_db)):
    q = select(AnalysisReport)
    if kind:
        q = q.where(AnalysisReport.kind == kind)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(AnalysisReport.id.desc()).offset((page - 1) * size).limit(size)).all()
    return {"items": [_out(r) for r in rows], "total": total, "kinds": report.KINDS, "sections": report.SECTIONS}


@router.get("/{report_id}", summary="리포트 상세")
def get_report(report_id: int, db: Session = Depends(get_db)):
    r = db.get(AnalysisReport, report_id)
    if not r:
        raise HTTPException(404, "리포트를 찾을 수 없습니다.")
    return _out(r, full=True)


@router.post("/generate", status_code=201, summary="리포트 생성 (관리자) — Gemini 또는 규칙 기반")
def generate(body: ReportGenerateIn, request: Request, user: User = Depends(require_admin_write), db: Session = Depends(get_db)):
    r = report.generate(db, body.kind, body.region_code, created_by=user.email)
    audit(db, user, "report.generate", f"report:{r.id}", {"kind": body.kind, "generator": r.generator}, request)
    db.commit()
    return _out(r, full=True)


@router.delete("/{report_id}", summary="리포트 삭제 (관리자)")
def delete(report_id: int, request: Request, user: User = Depends(require_admin_write), db: Session = Depends(get_db)):
    r = db.get(AnalysisReport, report_id)
    if not r:
        raise HTTPException(404, "리포트를 찾을 수 없습니다.")
    audit(db, user, "report.delete", f"report:{r.id}", {"title": r.title}, request)
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/ask", summary="자연어 부동산 질의응답 (검증된 통계 근거)")
def ask(body: AskIn, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return report.answer(db, body.question, body.region_code)
