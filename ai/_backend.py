"""backend/app 패키지를 import 할 수 있도록 경로를 등록하고 DB 세션을 제공합니다.

DATABASE_URL(또는 TIDB_*)이 지정되면 해당 DB(TiDB aptpick)를, 없으면 backend/storage/aptpick.db 를 사용합니다.
"""
import sys
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@contextmanager
def session(seed: bool = True):
    from app.database import Base, SessionLocal, engine
    from app.services import stats
    from app.services.seed import seed_base, seed_sample

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if seed:
            seed_base(db)
            if seed_sample(db):
                stats.refresh_regional_statistics(db)
        yield db
