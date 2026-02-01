# AWS Production Branch

This branch is dedicated to AWS production deployments.

## 🚀 Quick Start

### Prerequisites
- AWS Account with appropriate permissions
- AWS CLI configured
- Docker installed
- Terraform installed (optional)

### Initial Setup

1. **Configure AWS credentials:**
   ```bash
   aws configure
   ```

2. **Run infrastructure setup:**
   ```bash
   chmod +x scripts/setup-aws.sh
   ./scripts/setup-aws.sh
   ```

3. **Create infrastructure with Terraform:**
   ```bash
   cd infrastructure/terraform
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   terraform init
   terraform plan
   terraform apply
   ```

4. **Configure GitHub Secrets:**
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_ACCOUNT_ID`

### Deployment

**Automatic (CI/CD):**
```bash
git push origin aws-prod
```

**Manual:**
```bash
export AWS_ACCOUNT_ID=your-account-id
export AWS_REGION=us-east-1
./scripts/deploy-manual.sh
```

## 📁 AWS-Specific Files

- `.github/workflows/deploy-aws.yml` - GitHub Actions deployment workflow
- `infrastructure/terraform/` - Terraform infrastructure as code
- `scripts/setup-aws.sh` - AWS setup script
- `scripts/deploy-manual.sh` - Manual deployment script
- `.env.production.template` - Production environment template
- `docs/AWS_DEPLOYMENT.md` - Comprehensive deployment guide

## 🔄 Development Workflow

1. **Work locally on `main` branch:**
   ```bash
   git checkout main
   make docker-up
   make dev
   ```

2. **When ready to deploy:**
   ```bash
   git checkout aws-prod
   git merge main
   git push origin aws-prod
   ```

3. **GitHub Actions automatically:**
   - Builds Docker images
   - Pushes to ECR
   - Updates ECS services
   - Waits for deployment completion

## 📚 Documentation

See [AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md) for detailed deployment guide including:
- Architecture overview
- Step-by-step setup
- Monitoring and troubleshooting
- Scaling and security
- Cost optimization

## 🏗️ Architecture

- **ECS Fargate**: Container orchestration
- **RDS PostgreSQL**: Managed database
- **ElastiCache Redis**: Managed cache
- **ALB**: Load balancing
- **ECR**: Docker registry
- **CloudWatch**: Logging & monitoring

## 🔐 Security Notes

- Never commit `.env.production` or `terraform.tfvars`
- Use AWS Secrets Manager for sensitive data
- Enable encryption for RDS and Redis
- Review security groups regularly
- Keep Docker images updated

## 📊 Monitoring

View logs:
```bash
aws logs tail /ecs/betting-exchange --follow
```

Check service health:
```bash
aws ecs describe-services --cluster betting-exchange --services api-gateway
```

## 🆘 Support

- Review [AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md)
- Check CloudWatch logs
- Review GitHub Actions workflow logs
- Verify environment variables
