from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.security import (PASSWORD_PATTERN, PASSWORD_RULE, create_access_token, hash_password, is_valid_password,
                             safe_compare, verify_password)
from ..database import get_db
from ..dependencies import get_current_user
from ..models import AdminUser, User, utcnow
from ..schemas import AdminKeyIn, LoginIn, ProfileUpdateIn, SignupIn, TestLoginIn, TokenOut, UserOut, WithdrawIn
from ..services import oauth
from ..services.common import audit
from ..services.seed import TEST_ADMIN, TEST_USER

router = APIRouter(prefix="/api/auth", tags=["auth"])


def issue(db: Session, user: User) -> TokenOut:
    user.last_login_at = utcnow()
    db.commit()
    return TokenOut(access_token=create_access_token(user.id, user.email, user.role), user=UserOut.model_validate(user))


@router.get("/password-policy", summary="비밀번호 정책")
def password_policy():
    return {"pattern": PASSWORD_PATTERN.pattern, "message": PASSWORD_RULE}


@router.post("/signup", response_model=TokenOut, status_code=201, summary="회원가입")
def signup(body: SignupIn, db: Session = Depends(get_db)):
    if not is_valid_password(body.password):
        raise HTTPException(422, PASSWORD_RULE)
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "이미 가입된 이메일입니다.")
    user = User(email=email, name=body.name, phone=body.phone, password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    return issue(db, user)


@router.post("/login", response_model=TokenOut, summary="이메일 로그인")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다.")
    if not user.is_active:
        raise HTTPException(403, "비활성화된 계정입니다. 고객센터에 문의해 주세요.")
    return issue(db, user)


@router.post("/test-login", response_model=TokenOut, summary="테스트 사용자 / 테스트 관리자(읽기 전용) 로그인")
def test_login(body: TestLoginIn, db: Session = Depends(get_db)):
    account = TEST_USER if body.kind == "user" else TEST_ADMIN
    user = db.scalar(select(User).where(User.email == account["email"]))
    if not user:
        raise HTTPException(503, "테스트 계정이 준비되지 않았습니다.")
    user.role, user.is_active = account["role"], True
    return issue(db, user)


@router.post("/admin-key-login", response_model=TokenOut, summary="실제 관리자 로그인 (ADMIN_SECRET_KEY)")
def admin_key_login(body: AdminKeyIn, request: Request, db: Session = Depends(get_db)):
    if not settings.admin_secret_key:
        raise HTTPException(503, "서버에 ADMIN_SECRET_KEY 가 설정되지 않았습니다.")
    if not safe_compare(body.admin_key, settings.admin_secret_key):
        raise HTTPException(401, "관리자 보안 키가 올바르지 않습니다.")
    user = db.scalar(select(User).where(User.email == settings.admin_email))
    if not user:
        user = User(email=settings.admin_email, name="관리자", role="admin")
        db.add(user)
        db.flush()
    user.role, user.is_active = "admin", True
    admin = db.scalar(select(AdminUser).where(AdminUser.user_id == user.id)) or AdminUser(user_id=user.id)
    admin.last_access_at = utcnow()
    db.add(admin)
    audit(db, user, "admin.login", "admin-key", request=request)
    return issue(db, user)


@router.post("/logout", summary="로그아웃 (클라이언트 토큰 폐기)")
def logout():
    return {"ok": True}


@router.get("/me", response_model=UserOut, summary="내 정보")
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut, summary="내 정보 수정")
def update_me(body: ProfileUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    return user


@router.post("/me/withdraw", summary="회원 탈퇴 (개인정보 및 이용 기록 삭제)")
def withdraw(body: WithdrawIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.email in (TEST_USER["email"], TEST_ADMIN["email"]) or user.role == "admin":
        raise HTTPException(400, "테스트 계정과 관리자 계정은 탈퇴할 수 없습니다.")
    ok = body.confirm == "탈퇴" if not user.password_hash else verify_password(body.confirm, user.password_hash)
    if not ok:
        raise HTTPException(400, "확인 값이 올바르지 않습니다.")
    audit(db, user, "user.withdraw", f"user:{user.id}", request=request)
    db.delete(user)
    db.commit()
    return {"ok": True}


@router.get("/oauth/providers", summary="OAuth 제공자 설정 여부")
def oauth_providers():
    return {p: oauth.is_configured(p) for p in oauth.PROVIDERS}


@router.get("/oauth/{provider}/login", summary="OAuth 2.0 로그인 시작")
def oauth_login(provider: str):
    if provider not in oauth.PROVIDERS:
        raise HTTPException(404, "지원하지 않는 소셜 로그인입니다.")
    if not oauth.is_configured(provider):
        return RedirectResponse(f"{settings.frontend_url}/login?error=oauth_not_configured&provider={provider}")
    return RedirectResponse(oauth.authorize_url(provider))


@router.get("/oauth/{provider}/callback", summary="OAuth 2.0 콜백")
def oauth_callback(provider: str, code: str = "", state: str = "", db: Session = Depends(get_db)):
    fail = RedirectResponse(f"{settings.frontend_url}/login?error=oauth_failed&provider={provider}")
    if provider not in oauth.PROVIDERS or not code or not oauth.check_state(provider, state):
        return fail
    try:
        profile = oauth.fetch_profile(provider, code, state)
    except Exception:
        return fail
    email = profile["email"].lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(email=email, name=profile["name"][:60], provider=provider)
        db.add(user)
        db.flush()
    if not user.is_active:
        return fail
    token = issue(db, user).access_token
    return RedirectResponse(f"{settings.frontend_url}/oauth/callback#token={token}")
