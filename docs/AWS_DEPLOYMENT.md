# AWS Production Deployment Guide

This guide covers deploying the Betting Exchange to AWS using the `aws-prod` branch.

## Architecture Overview

### AWS Services Used

- **ECS Fargate**: Container orchestration for microservices
- **RDS PostgreSQL**: Managed database
- **ElastiCache Redis**: Managed cache
- **Application Load Balancer**: Traffic distribution
- **ECR**: Docker image registry
- **VPC**: Network isolation
- **CloudWatch**: Logging and monitoring

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Docker** installed locally
4. **Terraform** (optional, for infrastructure as code)
5. **GitHub account** for CI/CD

## Initial Setup

### 1. Configure AWS Credentials

```bash
# Install AWS CLI
# Windows: Download from https://aws.amazon.com/cli/
# Mac: brew install awscli
# Linux: sudo apt-get install awscli

# Configure credentials
aws configure
# Enter: AWS Access Key ID
# Enter: AWS Secret Access Key
# Enter: Default region (e.g., us-east-1)
# Enter: Default output format (json)
```

### 2. Run Infrastructure Setup

```bash
# From project root
chmod +x scripts/setup-aws.sh
./scripts/setup-aws.sh
```

This will:
- Create ECR repositories for all services
- Prompt to run Terraform for full infrastructure
- Display next steps

### 3. Create Infrastructure with Terraform

```bash
cd infrastructure/terraform

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
# IMPORTANT: Set strong database password!
nano terraform.tfvars

# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Create infrastructure
terraform apply
```

This creates:
- VPC with public/private subnets
- RDS PostgreSQL database
- ElastiCache Redis cluster
- ECS cluster
- Application Load Balancer
- Security groups
- ECR repositories
- CloudWatch log groups

### 4. Create ECS Task Definitions

After Terraform completes, you need to create ECS task definitions and services. This is typically done through the AWS Console or additional Terraform modules.

**Example Task Definition** (for api-gateway):

```json
{
  "family": "api-gateway",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "api-gateway",
      "image": "<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/betting-exchange/api-gateway:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "DATABASE_URL",
          "value": "postgresql://user:pass@rds-endpoint:5432/betting_exchange"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/betting-exchange",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "api-gateway"
        }
      }
    }
  ]
}
```

### 5. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
- `AWS_ACCOUNT_ID`: Your AWS account ID (get from `aws sts get-caller-identity`)

### 6. Update Environment Configuration

```bash
# Copy production template
cp .env.production.template .env.production

# Edit with your AWS values (from Terraform outputs)
nano .env.production
```

Update:
- `DATABASE_URL`: RDS endpoint from Terraform output
- `REDIS_URL`: ElastiCache endpoint from Terraform output
- `JWT_SECRET`: Generate strong random secret
- Other service URLs and credentials

## Deployment

### Automatic Deployment (CI/CD)

Simply push to the `aws-prod` branch:

```bash
# From your local development branch
git checkout aws-prod
git merge main  # or your feature branch
git push origin aws-prod
```

This triggers the GitHub Actions workflow that:
1. Builds Docker images for all services
2. Pushes images to ECR
3. Updates ECS services with new images
4. Waits for deployment to complete

### Manual Deployment

```bash
# Set environment variables
export AWS_ACCOUNT_ID=your-account-id
export AWS_REGION=us-east-1

# Run deployment script
chmod +x scripts/deploy-manual.sh
./scripts/deploy-manual.sh
```

## Development Workflow

### Working on Local Machine

```bash
# Switch to development branch
git checkout main  # or your feature branch

# Use local Docker infrastructure
make docker-up

# Run services locally
make dev

# Make changes and test locally
```

### Deploying to AWS

```bash
# Commit your changes
git add .
git commit -m "feat: new feature"

# Merge to aws-prod branch
git checkout aws-prod
git merge main

# Push to trigger deployment
git push origin aws-prod

# Switch back to development
git checkout main
```

### Branch Strategy

- `main`: Development branch for local work
- `aws-prod`: Production deployment branch
- `feature/*`: Feature branches merge to main
- When ready for production: merge main → aws-prod

## Monitoring

### View Logs

```bash
# View all logs
aws logs tail /ecs/betting-exchange --follow

# View specific service logs
aws logs tail /ecs/betting-exchange --follow --filter-pattern "api-gateway"
```

### Check Service Health

```bash
# List ECS services
aws ecs list-services --cluster betting-exchange

# Get service details
aws ecs describe-services \
  --cluster betting-exchange \
  --services api-gateway

# Check task status
aws ecs list-tasks --cluster betting-exchange --service-name api-gateway
```

### CloudWatch Metrics

Access CloudWatch in AWS Console:
- CPU/Memory utilization
- Request count
- Error rates
- Custom application metrics

## Database Migrations

Run migrations on production database:

```bash
# Connect to RDS via bastion host or VPN
psql -h <rds-endpoint> -U postgres -d betting_exchange

# Or run migration from ECS task
aws ecs run-task \
  --cluster betting-exchange \
  --task-definition db-migration \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}"
```

## Scaling

### Manual Scaling

```bash
# Scale a service
aws ecs update-service \
  --cluster betting-exchange \
  --service api-gateway \
  --desired-count 3
```

### Auto Scaling (Configure in AWS Console or Terraform)

- Target tracking based on CPU/Memory
- Scheduled scaling for predictable load
- Step scaling for gradual increases

## Troubleshooting

### Deployment Failed

```bash
# Check service events
aws ecs describe-services \
  --cluster betting-exchange \
  --services api-gateway \
  --query 'services[0].events' \
  --output table

# Check task logs
aws logs tail /ecs/betting-exchange --follow
```

### Database Connection Issues

- Check security groups allow ECS tasks → RDS
- Verify DATABASE_URL is correct
- Check RDS is in same VPC
- Verify credentials

### Service Not Starting

- Check task definition has correct image
- Verify environment variables
- Check CloudWatch logs for errors
- Ensure sufficient CPU/memory allocated

## Cost Optimization

1. **Use Fargate Spot**: 70% cost savings for non-critical services
2. **Right-size instances**: Start with t3.micro for RDS/Redis
3. **Enable auto-scaling**: Scale down during low traffic
4. **Use single NAT gateway**: For dev/test environments
5. **Set up budget alerts**: Monitor AWS costs

## Security Best Practices

1. **Use Secrets Manager**: Store sensitive credentials
2. **Enable encryption**: RDS and Redis at rest/in transit
3. **Restrict security groups**: Minimal required access
4. **Enable CloudTrail**: Audit all API calls
5. **Regular updates**: Keep Docker images updated
6. **Use IAM roles**: Avoid hardcoded credentials

## Rollback

If deployment fails or issues occur:

```bash
# Rollback to previous task definition
aws ecs update-service \
  --cluster betting-exchange \
  --service api-gateway \
  --task-definition api-gateway:PREVIOUS_VERSION

# Or redeploy previous image tag
# Update task definition with previous image tag
# Then update service
```

## Useful Commands

```bash
# Get Terraform outputs
cd infrastructure/terraform
terraform output

# Get load balancer DNS
aws elbv2 describe-load-balancers \
  --names betting-exchange-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text

# List all running tasks
aws ecs list-tasks --cluster betting-exchange

# Force new deployment (useful for pulling latest image)
aws ecs update-service \
  --cluster betting-exchange \
  --service api-gateway \
  --force-new-deployment
```

## Support

For issues or questions:
- Check CloudWatch logs first
- Review service events in ECS console
- Check GitHub Actions workflow logs
- Verify environment variables and secrets
