# Development/Demo Mode with Mock Data

This configuration runs the application with minimal AWS costs by using mock data and in-memory storage.

## Architecture Changes

### Instead of AWS Services:
- **Database**: Use SQLite or in-memory storage
- **Cache**: Use in-memory cache (node-cache)
- **Message Queue**: Use in-memory event emitter

### What You Still Need on AWS:
- **ECR**: Store Docker images (free tier: 500MB)
- **ECS Fargate**: Run containers (~$10-15/month for 1-2 small tasks)
- **Application Load Balancer**: Optional, can use CloudFront + S3 for static site

## Implementation

### 1. Add Mock Data Mode to Services

Each service can detect `MOCK_MODE=true` and use in-memory storage:

```typescript
// Example: Database Service
const db = process.env.MOCK_MODE === 'true' 
  ? new InMemoryDatabase()
  : new PostgresDatabase();
```

### 2. Use Lightweight AWS Setup

**Minimal Terraform Configuration:**
```hcl
# Only ECR and minimal ECS
resource "aws_ecr_repository" "api" {
  name = "betting-exchange/api-gateway"
}

resource "aws_ecs_cluster" "main" {
  name = "betting-exchange-demo"
}

# Use Fargate Spot (70% cheaper)
resource "aws_ecs_service" "api" {
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight           = 100
  }
}
```

### 3. Environment Configuration

```bash
# .env.demo
NODE_ENV=demo
MOCK_MODE=true
USE_MEMORY_DB=true
USE_MEMORY_CACHE=true
USE_MEMORY_QUEUE=true

# Seed data for demo
SEED_DEMO_DATA=true
```

## Cost Breakdown

### Option 1: Mock Data on AWS ECS
- ECS Fargate Spot (1 task, 0.25 vCPU, 0.5GB): ~$3/month
- ECR storage (500MB free tier): $0
- CloudWatch Logs (1GB free): $0
- **Total: ~$3-5/month**

### Option 2: Mock Data + S3 Static Hosting
- S3 hosting: $0.50/month
- CloudFront: $1/month
- ECS for API only: $3-5/month
- **Total: ~$5-7/month**

### Option 3: AWS App Runner (Simplest)
- App Runner with 1 vCPU, 2GB: ~$12/month
- Automatic scaling and HTTPS
- **Total: ~$12-15/month**

## When to Upgrade

Start with mock data, then upgrade as you get users:

1. **0-100 users**: Mock data in-memory
2. **100-1000 users**: Add RDS (t3.micro) + ElastiCache
3. **1000+ users**: Full production setup

## Seed Data

Create realistic demo data that resets daily:
- Mock markets
- Mock user accounts
- Simulated order flow
- Historical data for charts
