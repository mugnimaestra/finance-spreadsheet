#!/bin/bash
# add-memory-limits.sh
# Adds memory limits to the expense-ai service via systemd drop-in

set -e

SERVICE_NAME="expense-ai-service"
OVERRIDE_DIR="/etc/systemd/system/${SERVICE_NAME}.service.d"
OVERRIDE_FILE="${OVERRIDE_DIR}/memory-limits.conf"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "Error: This script must be run with sudo or as root" >&2
    exit 1
fi

echo "=== Adding memory limits to ${SERVICE_NAME} ==="
echo ""

# Step 1: Create override directory
echo "[1/5] Creating override directory: ${OVERRIDE_DIR}"
mkdir -p "${OVERRIDE_DIR}"
echo "  Done."
echo ""

# Step 2: Create memory limits config
echo "[2/5] Creating memory-limits.conf"
cat > "${OVERRIDE_FILE}" << 'EOF'
[Service]
MemoryMax=1G
MemorySwapMax=2G
TasksMax=30
EOF
echo "  Created: ${OVERRIDE_FILE}"
echo "  Contents:"
echo "    MemoryMax=1G"
echo "    MemorySwapMax=2G"
echo "    TasksMax=30"
echo ""

# Step 3: Reload systemd
echo "[3/5] Reloading systemd daemon"
systemctl daemon-reload
echo "  Done."
echo ""

# Step 4: Restart service
echo "[4/5] Restarting ${SERVICE_NAME}"
if systemctl restart "${SERVICE_NAME}"; then
    echo "  Service restarted successfully."
else
    echo "  Warning: Failed to restart service" >&2
    exit 1
fi
echo ""

# Step 5: Show status
echo "[5/5] Service status:"
echo ""
systemctl status "${SERVICE_NAME}" --no-pager -l
echo ""

# Show memory info
echo "=== Memory limits applied ==="
systemctl show "${SERVICE_NAME}" -p MemoryMax -p MemorySwapMax -p TasksMax
echo ""

echo "=== Complete ==="
echo "Memory limits have been applied to ${SERVICE_NAME}"
