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

# Step 4: Install the expense-extract agent.
# This agent disables ALL tools (including google-docs-mcp). Extraction calls
# pass --agent expense-extract so opencode does NOT inject tool defs into the
# request. Critical because OpenRouter routes vision requests to Google Gemini,
# whose strict JSON-schema validator rejects google-docs-mcp tools that declare
# nested array schemas without items.items (appendSpreadsheetRows,
# writeSpreadsheet, createSpreadsheet) — that produced HTTP 400 + a misleading
# "Missing required field: date" error.
#
# writeExpenseToSheets does NOT use this agent, so it keeps full MCP access.
echo ""
echo "[4/4] Installing expense-extract agent (no-tools agent for extraction)..."
AGENTS_DIR="$OPENCODE_CONFIG_DIR/agents"
mkdir -p "$AGENTS_DIR"
cat > "$AGENTS_DIR/expense-extract.md" << 'AGENTEOF'
---
description: Stateless expense data extractor. No tools, no MCP — just text/image in, JSON out. Used by extract endpoints to avoid loading google-docs-mcp tool defs that get rejected by Gemini's schema validator (HTTP 400). Do NOT use for write-sheets calls.
mode: primary
tools:
  bash: false
  edit: false
  write: false
  read: false
  list: false
  glob: false
  grep: false
  webfetch: false
  websearch: false
  task: false
  todowrite: false
  todoread: false
  google-docs-mcp*: false
  context7*: false
permission:
  bash: deny
  edit: deny
  webfetch: deny
---
You are an expense extraction service. Output ONLY a single JSON object that matches the schema in the user prompt. No prose, no markdown fences, no tool calls, no reasoning preamble.
AGENTEOF
echo "  → $AGENTS_DIR/expense-extract.md installed ✓"
