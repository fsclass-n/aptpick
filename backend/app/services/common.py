"""감사 로그 · 개인정보 마스킹 · 가격 알림 평가 공통 유틸"""
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import AuditLog, Notification, PriceAlert, Property, User, utcnow
from .realtime import hub


def client_ip(request: Request | None) -> str:
    if not request:
        return ""
    forwarded = request.headers.get("x-forwarded-for", "")
    return (forwarded.split(",")[0].strip() or (request.client.host if request.client else ""))[:64]


def audit(db: Session, user: User | None, action: str, target: str = "", detail: dict | None = None,
          request: Request | None = None) -> None:
    db.add(AuditLog(user_id=user.id if user else None, actor_email=user.email if user else "anonymous",
                    role=user.role if user else "-", action=action, target=target[:120], detail=detail or {},
                    ip=client_ip(request)))


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:2]}{'*' * max(len(name) - 2, 1)}@{domain}"


def mask_name(name: str) -> str:
    return name[0] + "*" * (len(name) - 1) if len(name) > 1 else "*"


def mask_phone(phone: str | None) -> str | None:
    return None if not phone else phone[:3] + "-****-" + phone[-4:]


DEAL_LABEL = {"sale": "매매", "jeonse": "전세", "monthly": "월세"}


def evaluate_alert(db: Session, alert: PriceAlert) -> Notification | None:
    """활성 알림 조건을 현재 등록 매물(호가) 최저/최고가와 비교해 충족 시 알림 생성 + WebSocket 전송"""
    if not alert.active:
        return None
    agg = func.min(Property.price) if alert.condition == "below" else func.max(Property.price)
    q = select(agg).where(Property.complex_id == alert.complex_id, Property.deal_type == alert.deal_type,
                          Property.status == "approved")
    if alert.apartment_id:
        q = q.where(Property.apartment_id == alert.apartment_id)
    price = db.scalar(q)
    if price is None:
        return None
    hit = price <= alert.target_price if alert.condition == "below" else price >= alert.target_price
    if not hit or alert.last_triggered_price == price:
        return None
    from ..models import ApartmentComplex  # 순환 import 방지
    c = db.get(ApartmentComplex, alert.complex_id)
    alert.last_triggered_at, alert.last_triggered_price = utcnow(), price
    note = Notification(user_id=alert.user_id, kind="price_alert",
                        title=f"{c.name if c else '관심 단지'} {DEAL_LABEL.get(alert.deal_type, '')} 가격 알림",
                        message=f"등록 매물 호가 {price:,}만원 — 설정한 {alert.target_price:,}만원 "
                                f"{'이하' if alert.condition == 'below' else '이상'} 조건을 충족했습니다.",
                        link=f"/apartments/{alert.complex_id}")
    db.add(note)
    db.flush()
    hub.send_user(alert.user_id, {"type": "notification", "id": note.id, "title": note.title, "message": note.message,
                                  "link": note.link})
    return note


def evaluate_alerts_for_complex(db: Session, complex_id: int) -> int:
    alerts = db.scalars(select(PriceAlert).where(PriceAlert.complex_id == complex_id, PriceAlert.active.is_(True))).all()
    return sum(1 for a in alerts if evaluate_alert(db, a))
