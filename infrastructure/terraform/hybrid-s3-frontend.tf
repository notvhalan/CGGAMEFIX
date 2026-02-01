terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Your domain name (e.g., yourdomain.com)"
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name for frontend hosting"
  type        = string
}

# S3 Bucket for Static Website Hosting
resource "aws_s3_bucket" "frontend" {
  bucket = var.bucket_name

  tags = {
    Name        = "Betting Exchange Frontend"
    Environment = "hybrid"
  }
}

# S3 Bucket Website Configuration
resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# S3 Bucket Public Access
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# S3 Bucket Policy for Public Read
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "betting-exchange-oac"
  description                       = "OAC for Betting Exchange Frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # Use only US, Canada, Europe (cheapest)

  aliases = [var.domain_name]

  origin {
    domain_name = aws_s3_bucket_website_configuration.frontend.website_endpoint
    origin_id   = "S3-${var.bucket_name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.bucket_name}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  # Custom error response for SPA routing
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name        = "Betting Exchange Frontend CDN"
    Environment = "hybrid"
  }
}

# ACM Certificate (must be in us-east-1 for CloudFront)
resource "aws_acm_certificate" "frontend" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "Betting Exchange Frontend Certificate"
  }
}

# Route53 Zone (optional - if you manage DNS with AWS)
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

# Route53 Record for CloudFront
resource "aws_route53_record" "frontend" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# Outputs
output "s3_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "s3_website_endpoint" {
  value = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "website_url" {
  value = "https://${var.domain_name}"
}

output "deployment_command" {
  value = <<-EOT
    To deploy your frontend:
    
    1. Build the frontend:
       cd apps/web
       VITE_API_URL=https://api.${var.domain_name} npm run build
    
    2. Upload to S3:
       aws s3 sync build/ s3://${var.bucket_name} --delete
    
    3. Invalidate CloudFront cache:
       aws cloudfront create-invalidation \
         --distribution-id ${aws_cloudfront_distribution.frontend.id} \
         --paths "/*"
  EOT
}

output "cost_estimate" {
  value = <<-EOT
    Estimated Monthly Costs (Hybrid Deployment):
    
    AWS Costs:
    - S3 Storage (1GB): $0.023
    - S3 Requests (10k GET): $0.004
    - CloudFront (10GB transfer): $0.85
    - Route53 Hosted Zone: $0.50
    
    Total AWS: ~$1.38/month
    
    Local Backend: $0 (your electricity)
    Cloudflare Tunnel: $0 (free)
    
    Grand Total: ~$1-2/month 💰
  EOT
}
