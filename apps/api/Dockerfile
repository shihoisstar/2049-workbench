# 单机部署镜像(ADR/部署推荐:单台云主机 + Docker Compose + Caddy)。
# V0 务实单阶段(含 devDeps 以便 db:migrate);镜像优化列为后续候选,不做提前优化。
FROM node:24-alpine
# worker 水印管线需要 ffmpeg
RUN apk add --no-cache ffmpeg
WORKDIR /repo

# 依赖清单先行(层缓存;lockfile importers 含 miniapp,清单必须齐全)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/miniapp/package.json apps/miniapp/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/model-gateway/package.json packages/model-gateway/
COPY packages/shared/package.json packages/shared/
RUN corepack enable && pnpm install --frozen-lockfile --filter @wb/api...

# 源码与构建
COPY tsconfig.base.json ./
COPY eslint.config.mjs ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @wb/api... run build

# 启动:先迁移后起服务(工作目录 apps/api,.env 由 compose env 注入)
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && node dist/index.js"]
