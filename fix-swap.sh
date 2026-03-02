#!/bin/bash
set -e

echo "=== Fix 1: Adding 4GB Swap Space ==="

# Check if swapfile2 already exists
if [ -f /swapfile2 ]; then
    echo "[SKIP] /swapfile2 already exists"
else
    echo "[1/4] Creating 4GB swapfile..."
    fallocate -l 4G /swapfile2
    
    echo "[2/4] Setting permissions..."
    chmod 600 /swapfile2
    
    echo "[3/4] Formatting as swap..."
    mkswap /swapfile2
    
    echo "[4/4] Enabling swap..."
    swapon /swapfile2
    
    # Make permanent if not already in fstab
    if ! grep -q "/swapfile2" /etc/fstab; then
        echo "/swapfile2 none swap sw 0 0" >> /etc/fstab
        echo "[OK] Added to /etc/fstab for persistence"
    fi
    
    echo "[OK] Swap added successfully"
fi

echo ""
echo "=== Restarting expense-ai-service ==="
systemctl daemon-reload
systemctl restart expense-ai-service
echo "[OK] Service restarted"

echo ""
echo "=== Verification ==="
echo ""
echo "Memory status:"
free -h

echo ""
echo "Swap files:"
swapon --show

echo ""
echo "Service status:"
systemctl status expense-ai-service --no-pager | head -10

echo ""
echo "=== Done ==="
