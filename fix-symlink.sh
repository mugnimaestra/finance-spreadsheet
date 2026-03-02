#!/bin/bash

# fix-symlink.sh
# Fixes the opencode symlink in /usr/local/bin

set -e

OLD_SYMLINK="/usr/local/bin/opencode"
NEW_TARGET="/home/mugnimaestra/.opencode/bin/opencode"

echo "Fixing opencode symlink..."
echo ""

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run with sudo"
    echo "Usage: sudo $0"
    exit 1
fi

# Check if target exists
if [ ! -f "$NEW_TARGET" ]; then
    echo "Error: Target does not exist: $NEW_TARGET"
    exit 1
fi

# Remove old symlink if it exists
if [ -L "$OLD_SYMLINK" ]; then
    echo "Removing old symlink: $OLD_SYMLINK"
    rm "$OLD_SYMLINK"
elif [ -f "$OLD_SYMLINK" ]; then
    echo "Removing old file: $OLD_SYMLINK"
    rm "$OLD_SYMLINK"
fi

# Create new symlink
echo "Creating new symlink: $OLD_SYMLINK -> $NEW_TARGET"
ln -s "$NEW_TARGET" "$OLD_SYMLINK"

# Verify the symlink works
echo ""
echo "Verifying symlink..."
if [ -L "$OLD_SYMLINK" ] && [ -f "$OLD_SYMLINK" ]; then
    echo "Symlink created successfully!"
    echo ""
    echo "Testing opencode..."
    "$OLD_SYMLINK" --version || true
    echo ""
    echo "Done! opencode is now available at: $OLD_SYMLINK"
else
    echo "Error: Symlink verification failed"
    exit 1
fi
