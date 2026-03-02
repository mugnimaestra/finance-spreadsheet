#!/bin/bash
# VPS Swap Setup Script
# Run this on mugni-vps to add 2GB swap space

set -e

echo "=== VPS Swap Setup ==="
echo ""

# Check current status
echo "Current memory status:"
free -h
echo ""
echo "Current swap status:"
swapon --show 2>/dev/null || echo "No swap active"
echo ""

# Check if /swapfile already exists
if [ -f /swapfile ]; then
    echo "WARNING: /swapfile already exists!"
    read -p "Remove existing swapfile and create new one? (y/N): " confirm
    if [[ $confirm == [yY] ]]; then
        echo "Removing existing swap..."
        sudo swapoff /swapfile 2>/dev/null || true
        sudo rm /swapfile
    else
        echo "Aborted."
        exit 1
    fi
fi

# Create 2GB swap file
echo "Creating 2GB swap file..."
if command -v fallocate &> /dev/null; then
    sudo fallocate -l 2G /swapfile
else
    sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
fi

# Set permissions
echo "Setting permissions..."
sudo chmod 600 /swapfile

# Set up swap
echo "Setting up swap area..."
sudo mkswap /swapfile

# Enable swap
echo "Enabling swap..."
sudo swapon /swapfile

# Add to fstab if not already there
if ! grep -q "/swapfile" /etc/fstab; then
    echo "Adding to /etc/fstab..."
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
else
    echo "/swapfile already in /etc/fstab"
fi

# Tune swappiness
echo "Tuning swappiness to 10..."
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

# Verify
echo ""
echo "=== Setup Complete ==="
echo ""
echo "New memory status:"
free -h
echo ""
echo "Swap status:"
swapon --show

echo ""
echo "Swap setup complete! Reboot to ensure everything persists."
