#!/bin/bash

# Script to configure expense-ai-service to use a single model
# Model: google/gemini-3-flash

set -e

SERVICE_DIR="$HOME/projects/expense-ai-service"
ENV_FILE="$SERVICE_DIR/.env"
MODEL="google/gemini-3-flash"

echo "=========================================="
echo "Expense AI Service - Single Model Config"
echo "=========================================="
echo ""

# Check if service directory exists
if [ ! -d "$SERVICE_DIR" ]; then
    echo "ERROR: Service directory not found: $SERVICE_DIR"
    echo "Please ensure the expense-ai-service is installed."
    exit 1
fi

echo "Service directory: $SERVICE_DIR"
echo "Target model: $MODEL"
echo ""

# Navigate to service directory
cd "$SERVICE_DIR"

# Backup existing .env if it exists
if [ -f "$ENV_FILE" ]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$ENV_FILE.backup.$TIMESTAMP"
    echo "Backing up existing .env to: $BACKUP_FILE"
    cp "$ENV_FILE" "$BACKUP_FILE"
    
    # Extract existing values
    echo "Extracting existing configuration values..."
    PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3000")
    API_TOKEN=$(grep "^API_TOKEN=" "$ENV_FILE" | cut -d'=' -f2 || echo "")
    FINANCE_SKILL_PATH=$(grep "^FINANCE_SKILL_PATH=" "$ENV_FILE" | cut -d'=' -f2 || echo "")
else
    echo "No existing .env file found. Using defaults."
    PORT="3000"
    API_TOKEN=""
    FINANCE_SKILL_PATH=""
fi

echo ""
echo "Configuration values to preserve:"
echo "  PORT: ${PORT:-3000}"
echo "  API_TOKEN: ${API_TOKEN:+(set)}"
echo "  FINANCE_SKILL_PATH: ${FINANCE_SKILL_PATH:-(not set)}"
echo ""

# Create new .env with single model
echo "Creating new .env with single model configuration..."

cat > "$ENV_FILE" << EOF
# Expense AI Service Configuration
# Generated: $(date)
# Single model mode: $MODEL

# Server Configuration
PORT=${PORT:-3000}
API_TOKEN=${API_TOKEN}

# AI Model Configuration (Single Model Mode)
AI_MODEL=$MODEL

# Finance Skill Path
FINANCE_SKILL_PATH=${FINANCE_SKILL_PATH}

# Note: Fallback model chain has been removed
# Previous backups available as .env.backup.*
EOF

echo "New .env file created successfully."
echo ""

# Show the new configuration
echo "New configuration:"
echo "----------------------------------------"
cat "$ENV_FILE"
echo "----------------------------------------"
echo ""

# Restart the service using pm2
echo "Restarting service with pm2..."
if command -v pm2 &> /dev/null; then
    pm2 restart expense-ai-service || pm2 start index.js --name expense-ai-service
    echo "Service restarted successfully."
    echo ""
    
    # Show status
    echo "Service status:"
    pm2 status expense-ai-service
    echo ""
    
    # Show logs
    echo "Recent logs:"
    pm2 logs expense-ai-service --lines 5 --nostream || true
else
    echo "WARNING: pm2 not found. Please restart the service manually."
    echo "You can start it with: cd $SERVICE_DIR && node index.js"
fi

echo ""
echo "=========================================="
echo "Configuration Complete!"
echo "=========================================="
echo ""
echo "Model set to: $MODEL"
echo "Backup saved to: ${BACKUP_FILE:-N/A (no previous .env)}"
echo ""
echo "To verify the service is working:"
echo "  curl http://localhost:${PORT:-3000}/health"
echo ""
