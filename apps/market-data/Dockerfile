FROM node:20-alpine AS base
RUN npm install -g pnpm@8.12.0

FROM base AS dependencies
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/market-data ./apps/market-data
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=dependencies /app ./
RUN pnpm --filter @betting-exchange/shared-types build
RUN pnpm --filter @betting-exchange/shared-config build
RUN pnpm --filter @betting-exchange/market-data build

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/market-data/dist ./dist
COPY --from=build /app/apps/market-data/package.json ./package.json
COPY --from=build /app/packages ./packages

ENV NODE_ENV=production
EXPOSE 3300

CMD ["node", "dist/index.js"]
