#!/bin/bash
set -e

echo "======================================"
echo "Expense AI Service - Production Setup"
echo "======================================"

# Stop any existing background process
echo "[1/6] Stopping any existing background processes..."
pkill -f "bun run src/index.ts" 2>/dev/null || true

# Create systemd service
echo "[2/6] Creating systemd service..."
sudo tee /etc/systemd/system/expense-ai-service.service > /dev/null << SERVICEEOF
[Unit]
Description=Expense AI Service for Telegram Bot
After=network.target

[Service]
Type=simple
User=mugnimaestra
WorkingDirectory=/home/mugnimaestra/projects/expense-ai-service
ExecStart=/home/mugnimaestra/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=5
EnvironmentFile=/home/mugnimaestra/projects/expense-ai-service/.env
Environment="PATH=/home/mugnimaestra/.opencode/bin:/home/mugnimaestra/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
StandardOutput=journal
StandardError=journal
SyslogIdentifier=expense-ai-service

[Install]
WantedBy=multi-user.target
SERVICEEOF

# Enable and start systemd service
echo "[3/6] Enabling and starting systemd service..."
sudo systemctl daemon-reload
sudo systemctl enable expense-ai-service
sudo systemctl restart expense-ai-service
sleep 3

# Check service status
echo "[4/6] Checking service status..."
sudo systemctl status expense-ai-service --no-pager

# Setup nginx
echo "[5/6] Setting up nginx..."
sudo tee /etc/nginx/sites-available/opencode-agent.mugnimaestra.dev > /dev/null << NGINXEOF
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=expense_api_limit:10m rate=60r/m;

# Upstream configuration
upstream expense_ai_service {
    server 127.0.0.1:3001;
    keepalive 32;
}

# HTTP server (certbot will add HTTPS)
server {
    listen 80;
    listen [::]:80;
    server_name opencode-agent.mugnimaestra.dev;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json
        application/xml;
    
    # Client body size
    client_max_body_size 10M;
    
    # Timeouts
    proxy_connect_timeout 30s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Main application
    location / {
        limit_req zone=expense_api_limit burst=30 nodelay;
        
        proxy_pass http://expense_ai_service;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 8k;
        proxy_buffers 16 8k;
        proxy_busy_buffers_size 16k;
    }
    
    # Health check endpoint (no rate limiting)
    location /health {
        proxy_pass http://expense_ai_service;
        access_log off;
        
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Block access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
NGINXEOF

# Enable nginx site
sudo ln -sf /etc/nginx/sites-available/opencode-agent.mugnimaestra.dev /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Test local endpoints
echo "[6/6] Testing endpoints..."
echo "Health check:"
curl -s http://127.0.0.1:3001/health
echo ""

echo ""
echo "======================================"
echo "Setup complete!"
echo ""
echo "NEXT STEPS:"
echo "1. Configure DNS A record:"
echo "   Name: opencode-agent"
echo "   Value: $(curl -s ifconfig.me)"
echo ""
echo "2. After DNS propagates, run SSL setup:"
echo "   sudo certbot --nginx -d opencode-agent.mugnimaestra.dev"
echo ""
echo "3. Test endpoints:"
echo "   curl -s https://opencode-agent.mugnimaestra.dev/health"
echo "======================================"
