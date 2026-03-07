#!/bin/bash
# Setup OpenCode configuration for general-opus agent on VPS
#
# This script ensures the VPS has:
# 1. The general-opus agent definition (markdown file)
# 2. The github-copilot provider with claude-opus-4.6 model in opencode.json
#
# Usage:
#   On VPS: cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/setup-opencode-config.sh
#   Remote: ssh mugnimaestra@155.94.154.237 'cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/setup-opencode-config.sh'

set -e

# Paths
REPO_AGENTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/opencode-agents"
OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
OPENCODE_AGENTS_DIR="$OPENCODE_CONFIG_DIR/agents"
OPENCODE_CONFIG="$OPENCODE_CONFIG_DIR/opencode.json"

echo "=== OpenCode Agent Configuration Setup ==="
echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Step 1: Create agents directory
echo "[1/3] Ensuring agents directory exists..."
mkdir -p "$OPENCODE_AGENTS_DIR"
echo "  → $OPENCODE_AGENTS_DIR"

# Step 2: Copy agent definition
echo "[2/3] Syncing general-opus agent definition..."
if [ -f "$REPO_AGENTS_DIR/general-opus.md" ]; then
  cp "$REPO_AGENTS_DIR/general-opus.md" "$OPENCODE_AGENTS_DIR/general-opus.md"
  echo "  → Copied general-opus.md to $OPENCODE_AGENTS_DIR/"
else
  echo "  ✗ ERROR: $REPO_AGENTS_DIR/general-opus.md not found"
  exit 1
fi

# Step 3: Ensure github-copilot provider in opencode.json
echo "[3/3] Checking opencode.json provider configuration..."

if [ ! -f "$OPENCODE_CONFIG" ]; then
  echo "  → Creating minimal opencode.json..."
  cat > "$OPENCODE_CONFIG" << 'JSONEOF'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "github-copilot": {
      "models": {
        "claude-opus-4.6": {}
      }
    }
  }
}
JSONEOF
  echo "  → Created $OPENCODE_CONFIG with github-copilot provider"
else
  # Check if github-copilot provider exists
  if command -v jq &> /dev/null; then
    # Use jq if available
    HAS_COPILOT=$(jq -r '.provider["github-copilot"] // empty' "$OPENCODE_CONFIG" 2>/dev/null)
    if [ -z "$HAS_COPILOT" ]; then
      echo "  → Adding github-copilot provider with claude-opus-4.6..."
      jq '.provider["github-copilot"] = {"models": {"claude-opus-4.6": {}}}' "$OPENCODE_CONFIG" > "${OPENCODE_CONFIG}.tmp"
      mv "${OPENCODE_CONFIG}.tmp" "$OPENCODE_CONFIG"
      echo "  → Added github-copilot provider"
    else
      # Check if claude-opus-4.6 model exists
      HAS_MODEL=$(jq -r '.provider["github-copilot"].models["claude-opus-4.6"] // empty' "$OPENCODE_CONFIG" 2>/dev/null)
      if [ -z "$HAS_MODEL" ]; then
        echo "  → Adding claude-opus-4.6 model to github-copilot provider..."
        jq '.provider["github-copilot"].models["claude-opus-4.6"] = {}' "$OPENCODE_CONFIG" > "${OPENCODE_CONFIG}.tmp"
        mv "${OPENCODE_CONFIG}.tmp" "$OPENCODE_CONFIG"
        echo "  → Added claude-opus-4.6 model"
      else
        echo "  → github-copilot provider with claude-opus-4.6 already configured ✓"
      fi
    fi
  else
    # Fallback: check with grep
    if grep -q '"github-copilot"' "$OPENCODE_CONFIG" 2>/dev/null; then
      if grep -q '"claude-opus-4.6"' "$OPENCODE_CONFIG" 2>/dev/null; then
        echo "  → github-copilot provider with claude-opus-4.6 already configured ✓"
      else
        echo "  ⚠ WARNING: github-copilot provider exists but claude-opus-4.6 model not found."
        echo "    Install jq for automatic config updates: sudo apt-get install jq"
        echo "    Or manually add to $OPENCODE_CONFIG under provider.github-copilot.models:"
        echo '    "claude-opus-4.6": {}'
      fi
    else
      echo "  ⚠ WARNING: No github-copilot provider found in opencode.json."
      echo "    Install jq for automatic config updates: sudo apt-get install jq"
      echo "    Or manually add the provider section to $OPENCODE_CONFIG"
    fi
  fi
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Verify agent is available:"
echo "  opencode run --model opencode/big-pickle 'delegate this task into @general-opus: say hello'"
