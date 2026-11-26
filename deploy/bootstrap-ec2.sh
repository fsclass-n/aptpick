#!/usr/bin/env bash
# EC2(Ubuntu) 최초 1회 실행: bash deploy/bootstrap-ec2.sh
# Docker · Nginx · Certbot 설치, 프로젝트 디렉터리·DuckDNS 갱신 타이머·HTTP 초기 vhost 구성
set -Eeuo pipefail
PROJECT_DIR=${PROJECT_DIR:-/opt/aptpick}
sudo apt-get update
sudo apt-get install -y ca-certificates curl rsync docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
# 1GiB 소형 인스턴스는 Docker·npm 빌드를 위해 swap 이 필요
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
sudo systemctl enable --now docker nginx
sudo usermod -aG docker "$USER"
sudo install -d -m 750 -o "$USER" -g "$USER" "$PROJECT_DIR" "$PROJECT_DIR/releases"
sudo install -d -m 750 /etc/aptpick /var/lib/aptpick /var/www/certbot
sudo install -m 700 deploy/duckdns-update.sh /usr/local/sbin/aptpick-duckdns-update
sudo install -m 644 deploy/systemd/aptpick-duckdns.service /etc/systemd/system/
sudo install -m 644 deploy/systemd/aptpick-duckdns.timer /etc/systemd/system/
# 인증서 발급 전 HTTP 전용 vhost → enable-ssl.sh 가 HTTPS vhost 로 교체
sudo cp deploy/nginx/aptpick-init.conf /etc/nginx/sites-available/aptpick
sudo ln -sfn /etc/nginx/sites-available/aptpick /etc/nginx/sites-enabled/aptpick
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl daemon-reload
sudo systemctl enable --now aptpick-duckdns.timer
echo "다음 단계: /etc/aptpick/{aptpick.env,duckdns.env} 작성(권한 600) → DNS 반영 확인 → sudo bash deploy/enable-ssl.sh [email]"
