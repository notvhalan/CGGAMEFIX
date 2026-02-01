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
  description = "Your domain name"
  type        = string
  default     = "gamefix.fun"
}

# Use default VPC for simplicity
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
resource "aws_security_group" "web" {
  name        = "betting-exchange-web-hybrid"
  description = "Security group for web frontend"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
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
    Name = "betting-exchange-web-hybrid"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "hybrid" {
  name = "betting-exchange-hybrid"

  tags = {
    Name = "betting-exchange-hybrid"
  }
}

# ECR Repository
resource "aws_ecr_repository" "web" {
  name                 = "betting-exchange/web-hybrid"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = {
    Name = "web-frontend-hybrid"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/betting-exchange-web-hybrid"
  retention_in_days = 1 # Keep minimal for cost savings

  tags = {
    Name = "betting-exchange-web-logs"
  }
}

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_execution_role" {
  name = "betting-exchange-web-hybrid-execution"

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
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM Role for ECS Task
resource "aws_iam_role" "ecs_task_role" {
  name = "betting-exchange-web-hybrid-task"

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
}

# ECS Task Definition
resource "aws_ecs_task_definition" "web" {
  family                   = "web-frontend-hybrid"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"  # 0.25 vCPU
  memory                   = "512"  # 0.5 GB
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name  = "web-frontend"
    image = "${aws_ecr_repository.web.repository_url}:latest"
    
    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]
    
    environment = [
      {
        name  = "NODE_ENV"
        value = "production"
      },
      {
        name  = "VITE_API_URL"
        value = "https://api.${var.domain_name}"
      },
      {
        name  = "VITE_WS_URL"
        value = "wss://api.${var.domain_name}"
      },
      {
        name  = "PORT"
        value = "3001"
      }
    ]
    
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.web.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "web"
      }
    }
  }])
}

# ECS Service
resource "aws_ecs_service" "web" {
  name            = "web-frontend"
  cluster         = aws_ecs_cluster.hybrid.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = true
  }

  # Use Fargate Spot for 70% cost savings
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight           = 100
  }
}

# Outputs
output "ecs_cluster_name" {
  value = aws_ecs_cluster.hybrid.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.web.repository_url
}

output "ecs_service_name" {
  value = aws_ecs_service.web.name
}

output "deployment_commands" {
  value = <<-EOT
    To deploy your frontend:
    
    1. Build and push Docker image:
       ./scripts/deploy-web-hybrid.ps1
       
    2. The service will automatically update with the new image
    
    3. Get the public IP:
       aws ecs describe-tasks --cluster ${aws_ecs_cluster.hybrid.name} --tasks $(aws ecs list-tasks --cluster ${aws_ecs_cluster.hybrid.name} --service-name ${aws_ecs_service.web.name} --query 'taskArns[0]' --output text) --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text | xargs -I {} aws ec2 describe-network-interfaces --network-interface-ids {} --query 'NetworkInterfaces[0].Association.PublicIp' --output text
  EOT
}

output "cost_estimate" {
  value = <<-EOT
    Estimated Monthly Costs:
    
    Frontend on ECS Fargate Spot (0.25 vCPU, 0.5GB): $3-5/month
    CloudWatch Logs (minimal): $0
    ECR Storage: $0 (free tier)
    
    Backend via Cloudflare Tunnel: $0 (FREE!)
    
    Total: ~$3-5/month 💰
  EOT
}
