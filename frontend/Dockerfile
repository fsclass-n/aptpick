# aptpick 프런트엔드 - 빌드 컨텍스트: frontend/ (docker-compose / AWS EC2)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_USE_MOCK=false
ARG VITE_MAP_PROVIDER=osm
ARG VITE_KAKAO_MAP_KEY=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_USE_MOCK=$VITE_USE_MOCK VITE_MAP_PROVIDER=$VITE_MAP_PROVIDER VITE_KAKAO_MAP_KEY=$VITE_KAKAO_MAP_KEY
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
