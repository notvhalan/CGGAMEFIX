#!/bin/bash
# Deploy frontend to AWS S3 while keeping backend local

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
BUCKET_NAME="${S3_BUCKET_NAME}"
CLOUDFRONT_DIST_ID="${CLOUDFRONT_DIST_ID}"
API_URL="${API_URL:-https://api.yourdomain.com}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Hybrid Deployment - Frontend to AWS${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if bucket name is set
if [ -z "$BUCKET_NAME" ]; then
    echo -e "${RED}Error: S3_BUCKET_NAME environment variable not set${NC}"
    echo "Usage: S3_BUCKET_NAME=your-bucket ./scripts/deploy-hybrid.sh"
    exit 1
fi

# Check AWS credentials
echo -e "${YELLOW}Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    exit 1
fi
echo -e "${GREEN}✓ AWS credentials verified${NC}"

# Build frontend
echo -e "${YELLOW}Building frontend with production API...${NC}"
cd apps/web

VITE_API_URL=$API_URL \
VITE_WS_URL=${API_URL/https:/wss:} \
npm run build

echo -e "${GREEN}✓ Frontend built successfully${NC}"

# Upload to S3
echo -e "${YELLOW}Uploading to S3 bucket: $BUCKET_NAME${NC}"
aws s3 sync build/ s3://$BUCKET_NAME --delete

echo -e "${GREEN}✓ Files uploaded to S3${NC}"

# Invalidate CloudFront cache if distribution ID is provided
if [ ! -z "$CLOUDFRONT_DIST_ID" ]; then
    echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
    aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_DIST_ID \
        --paths "/*" > /dev/null
    echo -e "${GREEN}✓ CloudFront cache invalidated${NC}"
fi

cd ../..

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Frontend deployment completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Frontend deployed to S3"
echo -e "API URL: ${API_URL}"
echo -e ""
echo -e "Next steps:"
echo -e "1. Ensure backend is running locally:"
echo -e "   make docker-up && make dev"
echo -e ""
echo -e "2. Ensure Cloudflare Tunnel is running:"
echo -e "   cloudflared tunnel run betting-exchange"
echo -e ""
echo -e "3. Access your site at:"
echo -e "   https://$BUCKET_NAME.s3-website-us-east-1.amazonaws.com"
