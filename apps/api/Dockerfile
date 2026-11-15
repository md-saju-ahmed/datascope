FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.18.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages packages
RUN pnpm build
RUN pnpm --filter @datascope/api deploy --prod --legacy /runtime \
    && rm -rf /runtime/src /runtime/test /runtime/dist/test

FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production API_HOST=0.0.0.0 PORT=4000
WORKDIR /app
# Deploy retains production workspace dependencies, Argon2 and DB migrations.
COPY --from=build --chown=node:node /runtime /app
COPY --chown=node:node infra/scripts/migrate-production.mjs /app/ops/migrate-production.mjs
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
