FROM node:20-alpine AS base
RUN npm install -g pnpm@8.12.0

FROM base AS dependencies
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/settlement-service ./apps/settlement-service
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=dependencies /app ./
RUN pnpm --filter @betting-exchange/shared-types build
RUN pnpm --filter @betting-exchange/shared-config build
RUN pnpm --filter @betting-exchange/settlement-service build

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/settlement-service/dist ./dist
COPY --from=build /app/apps/settlement-service/package.json ./package.json
COPY --from=build /app/packages ./packages

ENV NODE_ENV=production
EXPOSE 3400

CMD ["node", "dist/index.js"]
