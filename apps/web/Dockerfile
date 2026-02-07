# Stage 1: Build
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the web app with environment variables
WORKDIR /app/apps/web

# Accept build arguments
ARG VITE_API_URL=http://gamefix.fun:3000
ARG VITE_WS_URL=http://gamefix.fun:3000
ARG VITE_RUST_WS_URL=wss://ws.gamefix.fun/ws

# Set build-time environment variables for Vite
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_RUST_WS_URL=$VITE_RUST_WS_URL

RUN pnpm run build

# Stage 2: Production
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built app from builder
COPY --from=builder /app/apps/web/build ./apps/web/build
COPY --from=builder /app/apps/web/public ./apps/web/public

WORKDIR /app/apps/web

# Expose port 3001
EXPOSE 3001

# Set runtime environment variables
ENV PORT=3001
ENV API_BASE_URL=https://api.gamefix.fun
ENV VITE_API_URL=https://api.gamefix.fun
ENV VITE_WS_URL=https://api.gamefix.fun

# Start the app
CMD ["pnpm", "start"]
