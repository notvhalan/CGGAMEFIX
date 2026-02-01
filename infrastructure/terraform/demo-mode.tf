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

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "demo"
}

# Minimal VPC (use default VPC to save costs)
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security Group for ECS Tasks
resource "aws_security_group" "ecs_tasks" {
  name        = "betting-exchange-demo-ecs-sg"
  description = "Security group for ECS tasks (demo mode)"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 5173
    to_port     = 5173
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "betting-exchange-demo-ecs-sg"
    Environment = var.environment
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "betting-exchange-demo"

  tags = {
    Name        = "betting-exchange-demo"
    Environment = var.environment
  }
}

# ECR Repositories (Free tier: 500MB storage)
resource "aws_ecr_repository" "services" {
  for_each = toset([
    "api-gateway",
    "web"
  ])

  name                 = "betting-exchange-demo/${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false # Disable to save costs
  }

  tags = {
    Name        = each.key
    Environment = var.environment
  }
}

# Lifecycle policy to keep only last 3 images
resource "aws_ecr_lifecycle_policy" "services" {
  for_each = aws_ecr_repository.services

  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only last 3 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 3
      }
      action = {
        type = "expire"
      }
    }]
  })
}

# CloudWatch Log Group (1GB free per month)
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/betting-exchange-demo"
  retention_in_days = 1 # Keep logs for 1 day only to save costs

  tags = {
    Name        = "betting-exchange-demo-logs"
    Environment = var.environment
  }
}

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_execution_role" {
  name = "betting-exchange-demo-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "betting-exchange-demo-ecs-execution"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM Role for ECS Task
resource "aws_iam_role" "ecs_task_role" {
  name = "betting-exchange-demo-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "betting-exchange-demo-ecs-task"
    Environment = var.environment
  }
}

# Outputs
output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecr_repositories" {
  value = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

output "security_group_id" {
  value = aws_security_group.ecs_tasks.id
}

output "subnet_ids" {
  value = data.aws_subnets.default.ids
}

output "execution_role_arn" {
  value = aws_iam_role.ecs_execution_role.arn
}

output "task_role_arn" {
  value = aws_iam_role.ecs_task_role.arn
}

# Cost estimate
output "estimated_monthly_cost" {
  value = <<-EOT
    Estimated Monthly Costs (Demo Mode):
    - ECS Fargate Spot (0.25 vCPU, 0.5GB): $3-5
    - CloudWatch Logs (1GB): Free tier
    - ECR Storage (<500MB): Free tier
    - Data Transfer (first 1GB): Free
    
    Total: ~$3-7/month
    
    To further reduce costs:
    1. Use Fargate Spot (already configured)
    2. Stop tasks when not demoing
    3. Use smaller task sizes (0.25 vCPU minimum)
    4. Deploy only essential services
  EOT
}
