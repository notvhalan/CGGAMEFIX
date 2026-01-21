$env:NATS_URL='nats://localhost:4222'; $env:PORT=3000
pnpm --filter @betting-exchange/api-gateway build
node apps/api-gateway/dist/main.js