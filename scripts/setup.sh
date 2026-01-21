#!/bin/bash

# Development setup script
# This script sets up the development environment

set -e

echo "🚀 Setting up development environment..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not found. Installing pnpm..."
    npm install -g pnpm@8.12.0
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration"
fi

# Start Docker infrastructure
echo "🐳 Starting Docker infrastructure..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
docker-compose ps

echo "✅ Development environment setup complete!"
echo ""
echo "Next steps:"
echo "  1. Review and update .env file"
echo "  2. Run 'make dev' to start all services"
echo "  3. Run 'make dev-gateway' to start only the API Gateway"
echo ""
echo "Useful commands:"
echo "  make dev          - Start all services"
echo "  make docker-logs  - View Docker logs"
echo "  make clean        - Clean all build artifacts"
