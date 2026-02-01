#!/bin/bash
# Manual deployment script for AWS
# Use this for initial setup or when GitHub Actions is not available

set -e

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID}"
ECR_PREFIX="betting-exchange"
ECS_CLUSTER="betting-exchange"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Betting Exchange - AWS Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Check prerequisites
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: AWS_ACCOUNT_ID environment variable is not set${NC}"
    exit 1
fi

echo -e "${YELLOW}Checking AWS credentials...${NC}"
aws sts get-caller-identity > /dev/null || {
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    exit 1
}

echo -e "${GREEN}✓ AWS credentials verified${NC}"

# Login to ECR
echo -e "${YELLOW}Logging in to Amazon ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

echo -e "${GREEN}✓ ECR login successful${NC}"

# Get git commit SHA for tagging
GIT_SHA=$(git rev-parse --short HEAD)
IMAGE_TAG="${GIT_SHA}"

echo -e "${YELLOW}Building and pushing Docker images (tag: $IMAGE_TAG)...${NC}"

# Build and push each service
SERVICES=("api-gateway" "matching-engine" "wallet-service" "market-data" "settlement-service" "web")

for SERVICE in "${SERVICES[@]}"; do
    echo -e "${YELLOW}Building $SERVICE...${NC}"
    
    docker build \
        -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_PREFIX/$SERVICE:$IMAGE_TAG \
        -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_PREFIX/$SERVICE:latest \
        -f apps/$SERVICE/Dockerfile .
    
    echo -e "${YELLOW}Pushing $SERVICE...${NC}"
    docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_PREFIX/$SERVICE:$IMAGE_TAG
    docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_PREFIX/$SERVICE:latest
    
    echo -e "${GREEN}✓ $SERVICE pushed successfully${NC}"
done

# Update ECS services
echo -e "${YELLOW}Updating ECS services...${NC}"

for SERVICE in "${SERVICES[@]}"; do
    echo -e "${YELLOW}Updating $SERVICE service...${NC}"
    
    aws ecs update-service \
        --cluster $ECS_CLUSTER \
        --service $SERVICE \
        --force-new-deployment \
        --region $AWS_REGION > /dev/null
    
    echo -e "${GREEN}✓ $SERVICE service updated${NC}"
done

# Wait for deployments to stabilize
echo -e "${YELLOW}Waiting for services to stabilize...${NC}"
echo -e "${YELLOW}This may take several minutes...${NC}"

aws ecs wait services-stable \
    --cluster $ECS_CLUSTER \
    --services api-gateway matching-engine wallet-service \
    --region $AWS_REGION

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Image Tag: ${IMAGE_TAG}"
echo -e "Region: ${AWS_REGION}"
echo -e "Cluster: ${ECS_CLUSTER}"
