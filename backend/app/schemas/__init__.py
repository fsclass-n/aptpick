from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

DealType = Literal["sale", "jeonse", "monthly"]
Email = Annotated[str, Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=191)]


# ---------------------------------------------------------------- 인증 / 사용자
class SignupIn(BaseModel):
    email: Email
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=60)
    phone: str | None = Field(default=None, max_length=20)


class LoginIn(BaseModel):
    email: Email
    password: str


class TestLoginIn(BaseModel):
    kind: Literal["user", "test_admin"] = "user"


class AdminKeyIn(BaseModel):
    admin_key: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str
    role: str
    provider: str
    phone: str | None = None
    is_active: bool = True
    created_at: datetime | None = None
    last_login_at: datetime | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    phone: str | None = Field(default=None, max_length=20)


class WithdrawIn(BaseModel):
    confirm: str = Field(description="'탈퇴' 입력 또는 현재 비밀번호")


class PreferenceIn(BaseModel):
    region_codes: list[str] = Field(default_factory=list, max_length=10)
    deal_type: DealType = "sale"
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    monthly_max: int | None = Field(default=None, ge=0)
    area_min: float | None = Field(default=None, ge=0)
    area_max: float | None = Field(default=None, ge=0)
    rooms_min: int | None = Field(default=None, ge=0, le=10)
    build_year_min: int | None = Field(default=None, ge=1950, le=2100)
    transport_weight: int = Field(default=3, ge=1, le=5)
    school_weight: int = Field(default=3, ge=1, le=5)
    infra_weight: int = Field(default=3, ge=1, le=5)
    purpose: Literal["residence", "investment"] = "residence"


class SavedSearchIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    query: dict


# ---------------------------------------------------------------- AI
class RecommendIn(PreferenceIn):
    top_k: int = Field(default=10, ge=1, le=30)
    save_preference: bool = False


class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    region_code: str | None = Field(default=None, max_length=5)


class ReportGenerateIn(BaseModel):
    kind: Literal["daily", "weekly", "monthly", "price_change", "volume_jeonse", "region_compare", "residence"] = "weekly"
    region_code: str | None = Field(default=None, max_length=5)


# ---------------------------------------------------------------- 관심 매물 / 알림
class FavoriteIn(BaseModel):
    complex_id: int
    property_id: int | None = None
    memo: str = Field(default="", max_length=200)


class AlertIn(BaseModel):
    complex_id: int
    apartment_id: int | None = None
    deal_type: DealType = "sale"
    condition: Literal["below", "above"] = "below"
    target_price: int = Field(gt=0)


class AlertUpdateIn(BaseModel):
    target_price: int | None = Field(default=None, gt=0)
    condition: Literal["below", "above"] | None = None
    active: bool | None = None


class InquiryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    email: Email
    category: Literal["general", "partnership", "data", "bug"] = "general"
    message: str = Field(min_length=5, max_length=2000)


# ---------------------------------------------------------------- 관리자
class UserAdminUpdateIn(BaseModel):
    role: Literal["user", "admin", "test_admin"] | None = None
    is_active: bool | None = None


class PropertyIn(BaseModel):
    apartment_id: int
    deal_type: DealType
    price: int = Field(ge=0)
    monthly_rent: int = Field(default=0, ge=0)
    floor: int | None = Field(default=None, ge=-5, le=120)
    direction: str = Field(default="", max_length=10)
    description: str = Field(default="", max_length=2000)
    agency: str = Field(default="", max_length=60)
    status: Literal["pending", "approved", "rejected"] = "pending"


class PropertyUpdateIn(BaseModel):
    price: int | None = Field(default=None, ge=0)
    monthly_rent: int | None = Field(default=None, ge=0)
    floor: int | None = Field(default=None, ge=-5, le=120)
    direction: str | None = Field(default=None, max_length=10)
    description: str | None = Field(default=None, max_length=2000)
    agency: str | None = Field(default=None, max_length=60)
    status: Literal["pending", "approved", "rejected"] | None = None


class CollectIn(BaseModel):
    source: Literal["molit_trade", "molit_rent"] = "molit_trade"
    region_code: str = Field(min_length=5, max_length=5)
    months: list[str] = Field(min_length=1, max_length=12, description="YYYYMM 목록")


class InquiryAnswerIn(BaseModel):
    status: Literal["open", "answered", "closed"] = "answered"
    answer: str = Field(default="", max_length=2000)


class BroadcastIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=500)
    link: str = Field(default="", max_length=200)
