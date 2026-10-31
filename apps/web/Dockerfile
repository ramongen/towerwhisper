FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter shared build && pnpm --filter web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# "Open http://localhost:<port>" in the logs once it starts; CRs stripped in case of a
# Windows checkout, which would break the script (and with it the container's start).
COPY apps/web/banner.sh /docker-entrypoint.d/99-towerwhisper-banner.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/99-towerwhisper-banner.sh \
 && chmod +x /docker-entrypoint.d/99-towerwhisper-banner.sh
