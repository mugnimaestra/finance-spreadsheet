#!/bin/bash
# Setup OpenCode configuration for OpenRouter provider on VPS
#
# This script ensures the VPS has:
# 1. ~/.config/opencode/opencode.json with the openrouter provider block
# 2. The OPENROUTER_API_KEY from the service .env substituted into the config
#
# Usage:
#   On VPS: cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/setup-opencode-config.sh
#   Remote: ssh mugnimaestra@155.94.154.237 'cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/setup-opencode-config.sh'

set -e

# Paths
SERVICE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_ENV="$SERVICE_DIR/.env"
OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
OPENCODE_CONFIG="$OPENCODE_CONFIG_DIR/opencode.json"

echo "=== OpenCode OpenRouter Configuration Setup ==="
echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Step 1: Read OPENROUTER_API_KEY from service .env
echo "[1/3] Reading OPENROUTER_API_KEY from $SERVICE_ENV..."
if [ ! -f "$SERVICE_ENV" ]; then
  echo "  ⚠ WARNING: $SERVICE_ENV not found. Skipping config update."
  echo "    Create $SERVICE_ENV and add OPENROUTER_API_KEY=<your-key>, then re-run."
  exit 0
fi

OPENROUTER_API_KEY=$(grep -E '^OPENROUTER_API_KEY=' "$SERVICE_ENV" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$OPENROUTER_API_KEY" ] || [ "$OPENROUTER_API_KEY" = "your-openrouter-api-key-here" ]; then
  echo "  ⚠ WARNING: OPENROUTER_API_KEY missing or placeholder in $SERVICE_ENV. Skipping config update."
  echo "    Set a real OPENROUTER_API_KEY in .env, then re-run this script."
  exit 0
fi
echo "  → Found OPENROUTER_API_KEY (${#OPENROUTER_API_KEY} chars)"

# Step 2: Ensure config directory exists
echo "[2/3] Ensuring config directory exists..."
mkdir -p "$OPENCODE_CONFIG_DIR"
echo "  → $OPENCODE_CONFIG_DIR"

# Step 3: Write/update opencode.json with openrouter provider
echo "[3/3] Configuring openrouter provider in opencode.json..."

if command -v jq &> /dev/null; then
  if [ ! -f "$OPENCODE_CONFIG" ]; then
    echo '{"$schema":"https://opencode.ai/config.json"}' > "$OPENCODE_CONFIG"
  fi
  jq --arg key "$OPENROUTER_API_KEY" \
    '.["$schema"] = "https://opencode.ai/config.json" | .provider.openrouter = {"options": {"apiKey": $key}}' \
    "$OPENCODE_CONFIG" > "${OPENCODE_CONFIG}.tmp"
  mv "${OPENCODE_CONFIG}.tmp" "$OPENCODE_CONFIG"
  echo "  → openrouter provider configured (via jq) ✓"
else
  # Fallback: only create if missing; otherwise warn
  if [ ! -f "$OPENCODE_CONFIG" ]; then
    cat > "$OPENCODE_CONFIG" << JSONEOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "openrouter": {
      "options": { "apiKey": "$OPENROUTER_API_KEY" }
    }
  }
}
JSONEOF
    echo "  → Created $OPENCODE_CONFIG with openrouter provider"
  elif grep -q '"openrouter"' "$OPENCODE_CONFIG" 2>/dev/null; then
    echo "  → openrouter provider already present in $OPENCODE_CONFIG ✓"
    echo "    (Install jq to auto-update apiKey: sudo apt-get install jq)"
  else
    echo "  ⚠ WARNING: openrouter provider not found in $OPENCODE_CONFIG."
    echo "    Install jq for automatic updates: sudo apt-get install jq"
    echo "    Or manually add the provider block."
  fi
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Verify openrouter is working:"
echo "  opencode run --model openrouter/openrouter/free 'say hello'"
