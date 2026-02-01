#!/bin/bash
# AWS Infrastructure Setup Script
# This script creates the necessary AWS resources for the betting exchange

set -e

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_PREFIX="betting-exchange"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AWS Infrastructure Setup${NC}"
echo -e "${GREEN}========================================${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

echo -e "${YELLOW}Checking AWS credentials...${NC}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: Could not get AWS Account ID${NC}"
    exit 1
fi

echo -e "${GREEN}✓ AWS Account ID: $AWS_ACCOUNT_ID${NC}"

# Create ECR repositories
echo -e "${YELLOW}Creating ECR repositories...${NC}"

SERVICES=("api-gateway" "matching-engine" "wallet-service" "market-data" "settlement-service" "web")

for SERVICE in "${SERVICES[@]}"; do
    REPO_NAME="$ECR_PREFIX/$SERVICE"
    
    if aws ecr describe-repositories --repository-names $REPO_NAME --region $AWS_REGION &> /dev/null; then
        echo -e "${YELLOW}Repository $REPO_NAME already exists${NC}"
    else
        echo -e "${YELLOW}Creating repository: $REPO_NAME${NC}"
        aws ecr create-repository \
            --repository-name $REPO_NAME \
            --region $AWS_REGION \
            --image-scanning-configuration scanOnPush=true \
            --tags Key=Project,Value=betting-exchange > /dev/null
        echo -e "${GREEN}✓ Created $REPO_NAME${NC}"
    fi
done

echo -e "${GREEN}✓ ECR repositories ready${NC}"

# Check Terraform
echo -e "${YELLOW}Checking for Terraform...${NC}"

if command -v terraform &> /dev/null; then
    echo -e "${GREEN}✓ Terraform found${NC}"
    echo -e "${YELLOW}Would you like to run Terraform to create infrastructure? (y/n)${NC}"
    read -r RESPONSE
    
    if [[ "$RESPONSE" =~ ^[Yy]$ ]]; then
        cd infrastructure/terraform
        
        if [ ! -f "terraform.tfvars" ]; then
            echo -e "${YELLOW}Creating terraform.tfvars from example...${NC}"
            cp terraform.tfvars.example terraform.tfvars
            echo -e "${RED}Please edit terraform.tfvars with your values before proceeding${NC}"
            exit 1
        fi
        
        echo -e "${YELLOW}Initializing Terraform...${NC}"
        terraform init
        
        echo -e "${YELLOW}Planning Terraform changes...${NC}"
        terraform plan
        
        echo -e "${YELLOW}Apply Terraform changes? (y/n)${NC}"
        read -r APPLY_RESPONSE
        
        if [[ "$APPLY_RESPONSE" =~ ^[Yy]$ ]]; then
            terraform apply
            echo -e "${GREEN}✓ Terraform infrastructure created${NC}"
        fi
        
        cd ../..
    fi
else
    echo -e "${YELLOW}Terraform not found. You can install it to create AWS infrastructure automatically.${NC}"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Next steps:"
echo -e "1. Configure GitHub secrets for CI/CD:"
echo -e "   - AWS_ACCESS_KEY_ID"
echo -e "   - AWS_SECRET_ACCESS_KEY"
echo -e "   - AWS_ACCOUNT_ID (value: $AWS_ACCOUNT_ID)"
echo -e ""
echo -e "2. If using Terraform, review and apply the configuration:"
echo -e "   cd infrastructure/terraform"
echo -e "   terraform plan"
echo -e "   terraform apply"
echo -e ""
echo -e "3. Push to aws-prod branch to trigger deployment:"
echo -e "   git push origin aws-prod"
