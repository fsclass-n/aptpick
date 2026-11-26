#!/usr/bin/env bash
# GitHub Actions(deploy-aws.yml)가 EC2 에서 실행. 실패 시 직전 릴리스로 자동 롤백.
set -Eeuo pipefail
: "${PROJECT_DIR:?missing PROJECT_DIR}"
: "${RELEASE:?missing RELEASE}"
PROJECT_DIR=$(cd "$PROJECT_DIR" && pwd)
release_dir="$PROJECT_DIR/releases/$RELEASE"
current_link="$PROJECT_DIR/current"
previous=$(readlink "$current_link" 2>/dev/null || true)
compose() { docker compose -p aptpick -f docker-compose.yml -f deploy/docker-compose.ec2.yml "$@"; }

rollback() {
  echo "::error::배포 실패 — 직전 릴리스로 복구합니다" >&2
  compose logs --tail 80 api || true
  if [ -n "$previous" ] && [ "$previous" != "$release_dir" ] && [ -d "$previous" ]; then
    ln -sfn "$previous" "$current_link"
    cd "$current_link"
    compose up -d --build --remove-orphans || true
  fi
}
trap rollback ERR

test -f "$release_dir/docker-compose.yml"
test -f /etc/aptpick/aptpick.env
if [ "$(df --output=avail -k / | tail -1)" -lt 4000000 ]; then
  docker builder prune -af >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
fi
ln -sfn "$release_dir" "$current_link"
cd "$current_link"
GIT_COMMIT="$RELEASE" compose up -d --build --remove-orphans
for _ in $(seq 1 36); do
  if curl -fsS --max-time 5 http://127.0.0.1:8000/api/health | grep -q "\"commit\":\"$RELEASE\""; then
    curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:5173/
    echo "health check OK ($RELEASE)"
    docker image prune -f >/dev/null
    find "$PROJECT_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf
    exit 0
  fi
  sleep 5
done
false
