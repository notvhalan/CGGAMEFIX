FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@8.12.0

FROM base AS dependencies

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/api-gateway ./apps/api-gateway

# Install dependencies
RUN pnpm install --frozen-lockfile

FROM base AS build

WORKDIR /app

COPY --from=dependencies /app ./

# Build shared packages
RUN pnpm --filter @betting-exchange/shared-types build
RUN pnpm --filter @betting-exchange/shared-config build

# Build api-gateway
RUN pnpm --filter @betting-exchange/api-gateway build

FROM base AS runtime

WORKDIR /app

# Copy only production dependencies and built files
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api-gateway/dist ./dist
COPY --from=build /app/apps/api-gateway/package.json ./package.json
COPY --from=build /app/packages ./packages

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]
