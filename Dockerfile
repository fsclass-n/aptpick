# 리포 루트 빌드 컨텍스트용 백엔드 이미지 (Render Docker 서비스의 Root Directory 가 비어 있을 때 사용)
# 정식 경로는 backend/Dockerfile — docker-compose·EC2·Render rootDir=backend 설정 시 그쪽이 사용됨
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
RUN useradd --create-home appuser && mkdir -p /app/storage && chown -R appuser /app
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
