#!/bin/bash
# Deploy script for cleanup scheduler feature
# Run with: sudo bash deploy-cleanup.sh

set -e

echo "=== Deploying Cleanup Scheduler ==="

echo ""
echo "1. Checking files before restart..."
echo "   Files in /tmp/expense-ai-images/:"
ls -la /tmp/expense-ai-images/ 2>/dev/null || echo "   Directory doesn't exist yet"

echo ""
echo "2. Restarting expense-ai-service..."
systemctl restart expense-ai-service

echo ""
echo "3. Waiting for service to start (5 seconds)..."
sleep 5

echo ""
echo "4. Checking service status..."
systemctl status expense-ai-service --no-pager | head -15

echo ""
echo "5. Checking cleanup logs..."
journalctl -u expense-ai-service --since "30 seconds ago" --no-pager | grep -E "(Cleanup|starting|Started)" || echo "   No cleanup logs yet"

echo ""
echo "6. Checking files after cleanup..."
echo "   Files in /tmp/expense-ai-images/:"
ls -la /tmp/expense-ai-images/ 2>/dev/null || echo "   Directory doesn't exist"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Expected output above should show:"
echo "  - [Cleanup] Running startup cleanup (max age: 60 min)..."
echo "  - [Cleanup] Deleted X old image file(s) (older than 60 min)"
echo "  - [Cleanup] Scheduler started (interval: 60 min)"
