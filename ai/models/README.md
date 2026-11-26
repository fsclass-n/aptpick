# ai/models
학습된 모델 가중치(*.pkl, *.joblib, *.pt 등)는 저장소에 커밋하지 않고 Object Storage 에 보관합니다. (.gitignore)
운영 서버는 기동 시 DB 데이터로 재학습하며 버전·지표는 `model_versions` 테이블에 기록됩니다.
