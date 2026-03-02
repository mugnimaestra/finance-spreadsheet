#!/bin/bash
# Cleanup script to free up disk space on mugni-vps
# Run this with sudo: sudo bash cleanup.sh

echo "=== Disk Cleanup Script ==="
echo "Current disk usage:"
df -h

echo -e "\n=== Cleaning up large log files ==="
# Find and remove large log files (keep last 3 rotations)
echo "Removing old owntracks-whatsapp.log files..."
find /var/log -name "owntracks-whatsapp.log.*" -type f -exec rm -f {} + 2>/dev/null || true

# Clear apt cache
echo "Cleaning apt cache..."
apt-get clean 2>/dev/null || true

# Remove old journal logs
echo "Cleaning journal logs..."
journalctl --vacuum-size=100M 2>/dev/null || true

# Clear tmp files older than 7 days
echo "Cleaning old tmp files..."
find /tmp -type f -mtime +7 -exec rm -f {} + 2>/dev/null || true

echo -e "\n=== Cleanup complete ==="
echo "Current disk usage:"
df -h