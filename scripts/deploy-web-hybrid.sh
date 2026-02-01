#!/bin/bash
# Deploy Web Frontend to AWS ECS Fargate

set -e

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="474668399531"
ECR_REPOSITORY="betting-exchange/web-hybrid"
ECS_CLUSTER="betting-exchange-hybrid"
ECS_SERVICE="web-frontend"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying Frontend to AWS${NC}"
echo -e "${GREEN}========================================${NC}"

# Check AWS credentials
echo -e "${YELLOW}Checking AWS credentials...${NC}"
aws sts get-caller-identity > /dev/null || {
    echo "Error: AWS credentials not configured"
    exit 1
}
echo -e "${GREEN}✓ AWS credentials verified${NC}"

# Create ECR repository if it doesn't exist
echo -e "${YELLOW}Checking ECR repository...${NC}"
if ! aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION > /dev/null 2>&1; then
    echo -e "${YELLOW}Creating ECR repository...${NC}"
    aws ecr create-repository \
        --repository-name $ECR_REPOSITORY \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=false
    echo -e "${GREEN}✓ ECR repository created${NC}"
else
    echo -e "${GREEN}✓ ECR repository exists${NC}"
fi

# Login to ECR
echo -e "${YELLOW}Logging in to ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

echo -e "${GREEN}✓ ECR login successful${NC}"

# Build Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build \
    -t $ECR_REPOSITORY:$IMAGE_TAG \
    -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG \
    -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest \
    -f apps/web/Dockerfile .

echo -e "${GREEN}✓ Docker image built${NC}"

# Push to ECR
echo -e "${YELLOW}Pushing image to ECR...${NC}"
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

echo -e "${GREEN}✓ Image pushed to ECR${NC}"

# Update ECS service (if exists)
echo -e "${YELLOW}Updating ECS service...${NC}"
if aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION > /dev/null 2>&1; then
    aws ecs update-service \
        --cluster $ECS_CLUSTER \
        --service $ECS_SERVICE \
        --force-new-deployment \
        --region $AWS_REGION > /dev/null
    echo -e "${GREEN}✓ ECS service updated${NC}"
else
    echo -e "${YELLOW}ECS service not found. You need to create it first.${NC}"
    echo -e "${YELLOW}Run: ./scripts/create-ecs-service.sh${NC}"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Deployment completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Image: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"
echo -e "Region: $AWS_REGION"
