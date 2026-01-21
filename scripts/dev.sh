#!/bin/bash

# Development runner script
# Starts all services in development mode

set -e

echo "🚀 Starting all services in development mode..."

# Check if infrastructure is running
if ! docker-compose ps | grep -q "Up"; then
    echo "⚠️  Docker infrastructure not running. Starting..."
    docker-compose up -d
    sleep 5
fi

# Build shared packages first
echo "📦 Building shared packages..."
pnpm --filter @betting-exchange/shared-types build
pnpm --filter @betting-exchange/shared-config build

# Start all services in parallel
echo "🔥 Starting services..."
pnpm --parallel --stream run dev
