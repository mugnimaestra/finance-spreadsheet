#!/bin/bash
# setup-vps-git-deploy.sh
#
# Configures git-based deployment for expense-ai-service on VPS.
# Run this ON the VPS after copying it there.
#
# Usage:
#   scp setup-vps-git-deploy.sh mugnimaestra@155.94.154.237:~/
#   ssh mugnimaestra@155.94.154.237 'bash ~/setup-vps-git-deploy.sh'
#
# What this does:
#   1. Clones the finance-spreadsheet repo (or pulls if already cloned)
#   2. Restores .env from backup to the new service location
#   3. Installs dependencies with bun
#   4. Updates the systemd service unit to point to the new paths
#   5. Restarts the service and verifies it's healthy
#   6. Creates a convenience symlink for easy access
#
# Safe to run multiple times (idempotent).

set -e

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GITHUB_REPO="git@github.com:mugnimaestra/finance-spreadsheet.git"
REPO_DIR="$HOME/projects/finance-spreadsheet"
SERVICE_SUBDIR="expense-ai-service"
SERVICE_DIR="$REPO_DIR/$SERVICE_SUBDIR"
OLD_SERVICE_DIR="$HOME/projects/expense-ai-service"
BACKUP_DIR="$HOME/projects/expense-ai-service-backup-20260302"
SYMLINK_PATH="$HOME/projects/expense-ai-service-git"
SERVICE_NAME="expense-ai-service"
SERVICE_PORT=3001
BUN_BIN="$HOME/.bun/bin/bun"
SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
GIT_USER_NAME="mugnimaestra"
GIT_USER_EMAIL="mugnimaestra@users.noreply.github.com"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
step_num=0

step() {
  step_num=$((step_num + 1))
  echo ""
  echo -e "${BLUE}${BOLD}[Step $step_num] $1${NC}"
  echo "---------------------------------------------------------------"
}

ok() {
  echo -e "  ${GREEN}OK${NC} $1"
}

warn() {
  echo -e "  ${YELLOW}WARN${NC} $1"
}

fail() {
  echo -e "  ${RED}FAIL${NC} $1"
}

abort() {
  echo ""
  echo -e "${RED}${BOLD}ABORTED:${NC} $1"
  if [ -n "$2" ]; then
    echo ""
    echo -e "${YELLOW}Recovery:${NC}"
    echo "  $2"
  fi
  exit 1
}

# ---------------------------------------------------------------------------
# Step 1: Pre-flight checks
# ---------------------------------------------------------------------------
step "Pre-flight checks"

# Check we're not on macOS (quick sanity check)
if [[ "$(uname)" == "Darwin" ]]; then
  abort "This script must be run on the VPS, not on macOS." \
    "Copy it to the VPS first: scp setup-vps-git-deploy.sh mugnimaestra@155.94.154.237:~/"
fi
ok "Running on Linux ($(uname -r))"

# Check git
if ! command -v git &>/dev/null; then
  abort "git is not installed." "Install it: sudo apt update && sudo apt install -y git"
fi
ok "git is installed ($(git --version | head -1))"

# Check bun
if [ ! -x "$BUN_BIN" ]; then
  abort "bun not found at $BUN_BIN" \
    "Install bun: curl -fsSL https://bun.sh/install | bash"
fi
ok "bun is available ($($BUN_BIN --version))"

# Check SSH key works with GitHub
echo "  Testing SSH connection to GitHub..."
if ssh -T git@github.com 2>&1 | grep -qi "successfully authenticated"; then
  ok "SSH authentication to GitHub works"
else
  # ssh -T returns exit code 1 even on success, so check output
  ssh_output=$(ssh -T git@github.com 2>&1 || true)
  if echo "$ssh_output" | grep -qi "successfully"; then
    ok "SSH authentication to GitHub works"
  else
    abort "SSH key not working with GitHub." \
      "Ensure ~/.ssh/id_ed25519 (or id_rsa) exists and is added to your GitHub account."
  fi
fi

# Check backup exists
if [ -d "$BACKUP_DIR" ]; then
  ok "Backup directory exists: $BACKUP_DIR"
else
  warn "Backup directory not found: $BACKUP_DIR"
  if [ -d "$OLD_SERVICE_DIR" ]; then
    warn "Will try to use .env from $OLD_SERVICE_DIR instead"
  fi
fi

# Check projects directory
mkdir -p "$HOME/projects"
ok "Projects directory ready: $HOME/projects"

# ---------------------------------------------------------------------------
# Step 2: Clone the repo (or pull if already cloned)
# ---------------------------------------------------------------------------
step "Clone repository"

if [ -d "$REPO_DIR/.git" ]; then
  warn "Repository already cloned at $REPO_DIR"
  echo "  Pulling latest changes..."
  cd "$REPO_DIR"
  git pull origin main || git pull origin master || warn "git pull failed — continuing with existing code"
  ok "Repository updated"
else
  if [ -d "$REPO_DIR" ]; then
    warn "$REPO_DIR exists but is not a git repo — removing it"
    rm -rf "$REPO_DIR"
  fi
  echo "  Cloning $GITHUB_REPO ..."
  git clone "$GITHUB_REPO" "$REPO_DIR"
  ok "Repository cloned to $REPO_DIR"
fi

# Set git config
cd "$REPO_DIR"
git config user.name "$GIT_USER_NAME"
git config user.email "$GIT_USER_EMAIL"
ok "Git config set (user: $GIT_USER_NAME)"

# Verify service subdirectory exists
if [ ! -d "$SERVICE_DIR" ]; then
  abort "Service subdirectory not found: $SERVICE_DIR" \
    "Check that the repo contains the '$SERVICE_SUBDIR/' directory."
fi
ok "Service directory found: $SERVICE_DIR"

# ---------------------------------------------------------------------------
# Step 3: Restore .env
# ---------------------------------------------------------------------------
step "Restore .env file"

ENV_SOURCE=""

if [ -f "$SERVICE_DIR/.env" ]; then
  ok ".env already exists at $SERVICE_DIR/.env — keeping it"
  ENV_SOURCE="existing"
elif [ -f "$BACKUP_DIR/.env" ]; then
  cp "$BACKUP_DIR/.env" "$SERVICE_DIR/.env"
  ok "Copied .env from backup: $BACKUP_DIR/.env"
  ENV_SOURCE="backup"
elif [ -f "$OLD_SERVICE_DIR/.env" ]; then
  cp "$OLD_SERVICE_DIR/.env" "$SERVICE_DIR/.env"
  ok "Copied .env from old service dir: $OLD_SERVICE_DIR/.env"
  ENV_SOURCE="old-service"
else
  abort "No .env file found in any of these locations:
    - $SERVICE_DIR/.env
    - $BACKUP_DIR/.env
    - $OLD_SERVICE_DIR/.env" \
    "Create a .env file manually at $SERVICE_DIR/.env with the required environment variables, then re-run this script."
fi

# Verify .env is not empty
if [ ! -s "$SERVICE_DIR/.env" ]; then
  abort ".env file exists but is empty at $SERVICE_DIR/.env" \
    "Populate it with the required environment variables and re-run."
fi

env_lines=$(wc -l < "$SERVICE_DIR/.env")
ok ".env has $env_lines lines (source: $ENV_SOURCE)"

# ---------------------------------------------------------------------------
# Step 4: Install dependencies
# ---------------------------------------------------------------------------
step "Install dependencies"

cd "$SERVICE_DIR"
echo "  Running bun install..."
"$BUN_BIN" install
ok "Dependencies installed"

# ---------------------------------------------------------------------------
# Step 5: Update systemd service
# ---------------------------------------------------------------------------
step "Update systemd service"

UNIT_CONTENT="[Unit]
Description=Expense AI Service for Telegram Bot
After=network.target

[Service]
Type=simple
User=mugnimaestra
WorkingDirectory=/home/mugnimaestra/projects/finance-spreadsheet/expense-ai-service
ExecStart=/home/mugnimaestra/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=5
EnvironmentFile=/home/mugnimaestra/projects/finance-spreadsheet/expense-ai-service/.env
Environment=\"PATH=/home/mugnimaestra/.opencode/bin:/home/mugnimaestra/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\"
StandardOutput=journal
StandardError=journal
SyslogIdentifier=expense-ai-service

[Install]
WantedBy=multi-user.target"

# Check if existing unit file differs
if [ -f "$SYSTEMD_UNIT" ]; then
  existing_content=$(sudo cat "$SYSTEMD_UNIT" 2>/dev/null || true)
  if [ "$existing_content" = "$UNIT_CONTENT" ]; then
    ok "Systemd unit already up to date"
  else
    echo "  Updating systemd unit file..."
    echo "$UNIT_CONTENT" | sudo tee "$SYSTEMD_UNIT" > /dev/null
    ok "Systemd unit file updated"
  fi
else
  echo "  Creating systemd unit file..."
  echo "$UNIT_CONTENT" | sudo tee "$SYSTEMD_UNIT" > /dev/null
  ok "Systemd unit file created"
fi

echo "  Reloading systemd daemon..."
sudo systemctl daemon-reload
ok "systemd daemon reloaded"

sudo systemctl enable "$SERVICE_NAME" 2>/dev/null || true
ok "Service enabled on boot"

# ---------------------------------------------------------------------------
# Step 6: Restart service
# ---------------------------------------------------------------------------
step "Restart service"

echo "  Restarting $SERVICE_NAME..."
sudo systemctl restart "$SERVICE_NAME"
ok "Restart command issued"

echo "  Waiting 3 seconds for service to start..."
sleep 3

# Check systemd status
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Service is active"
else
  fail "Service is not active"
  echo ""
  echo -e "${YELLOW}Service logs (last 20 lines):${NC}"
  sudo journalctl -u "$SERVICE_NAME" -n 20 --no-pager || true
  echo ""
  abort "Service failed to start. Check the logs above." \
    "sudo journalctl -u $SERVICE_NAME -f"
fi

# ---------------------------------------------------------------------------
# Step 7: Health check
# ---------------------------------------------------------------------------
step "Health check"

HEALTH_URL="http://127.0.0.1:${SERVICE_PORT}/health"
HEALTH_OK=false

for attempt in 1 2 3; do
  echo "  Attempt $attempt/3: curl $HEALTH_URL"
  if curl -sf "$HEALTH_URL" -o /dev/null -w "  HTTP %{http_code}\n" 2>/dev/null; then
    HEALTH_OK=true
    health_response=$(curl -sf "$HEALTH_URL" 2>/dev/null || echo "(no body)")
    ok "Health check passed (response: $health_response)"
    break
  else
    if [ "$attempt" -lt 3 ]; then
      warn "Attempt $attempt failed, retrying in 2 seconds..."
      sleep 2
    else
      fail "All 3 health check attempts failed"
    fi
  fi
done

if [ "$HEALTH_OK" = false ]; then
  warn "Health check failed but service is running. It may need more time to initialize."
  warn "Check manually: curl $HEALTH_URL"
fi

# ---------------------------------------------------------------------------
# Step 8: Update deploy script (if it exists)
# ---------------------------------------------------------------------------
step "Check deploy script"

DEPLOY_SCRIPT="$SERVICE_DIR/scripts/deploy.sh"
if [ -f "$DEPLOY_SCRIPT" ]; then
  # Check if deploy script references the old path and update it
  if grep -q "HOME/projects/expense-ai-service" "$DEPLOY_SCRIPT" 2>/dev/null; then
    echo "  Updating PROJECT_DIR in deploy script..."
    sed -i 's|"\$HOME/projects/expense-ai-service"|"\$HOME/projects/finance-spreadsheet/expense-ai-service"|g' "$DEPLOY_SCRIPT"
    sed -i 's|\$HOME/projects/expense-ai-service|\$HOME/projects/finance-spreadsheet/expense-ai-service|g' "$DEPLOY_SCRIPT"
    ok "Deploy script updated with new paths"
    warn "This is a local change. The repo version should also be updated."
  else
    ok "Deploy script already has correct paths (or uses different path format)"
  fi

  # If deploy script has a git pull pointing to wrong dir, fix the cd command
  if grep -q 'cd.*finance-spreadsheet/expense-ai-service.*&&.*git pull' "$DEPLOY_SCRIPT" 2>/dev/null; then
    ok "Deploy script git pull path looks correct"
  elif grep -q 'git pull' "$DEPLOY_SCRIPT" 2>/dev/null; then
    warn "Deploy script has git pull — verify the working directory is correct"
  fi
else
  warn "Deploy script not found at $DEPLOY_SCRIPT — skipping"
fi

# ---------------------------------------------------------------------------
# Step 9: Create convenience symlink
# ---------------------------------------------------------------------------
step "Create convenience symlink"

if [ -L "$SYMLINK_PATH" ]; then
  rm -f "$SYMLINK_PATH"
fi

ln -sf "$SERVICE_DIR" "$SYMLINK_PATH"
ok "Symlink created: $SYMLINK_PATH -> $SERVICE_DIR"

# ---------------------------------------------------------------------------
# Step 10: Summary
# ---------------------------------------------------------------------------
step "Summary"

echo ""
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo -e "${BOLD}Paths:${NC}"
echo "  Repository:     $REPO_DIR"
echo "  Service code:   $SERVICE_DIR"
echo "  Symlink:        $SYMLINK_PATH"
echo "  .env file:      $SERVICE_DIR/.env (source: $ENV_SOURCE)"
echo "  Systemd unit:   $SYSTEMD_UNIT"
echo ""
echo -e "${BOLD}Git status:${NC}"
cd "$REPO_DIR"
echo "  Branch: $(git branch --show-current)"
echo "  Commit: $(git log -1 --format='%h %s' 2>/dev/null || echo 'unknown')"
echo ""
echo -e "${BOLD}Service status:${NC}"
echo "  $(sudo systemctl is-active $SERVICE_NAME 2>/dev/null || echo 'unknown')"
if [ "$HEALTH_OK" = true ]; then
  echo -e "  Health: ${GREEN}passing${NC}"
else
  echo -e "  Health: ${YELLOW}not confirmed${NC} (check manually: curl $HEALTH_URL)"
fi
echo ""
echo -e "${BOLD}Future deployments:${NC}"
echo "  cd ~/projects/finance-spreadsheet && git pull origin main"
echo "  cd expense-ai-service && bun install"
echo "  sudo systemctl restart expense-ai-service"
echo ""
echo "  Or use the deploy script:"
echo "  cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/deploy.sh"
echo ""
echo -e "${BOLD}Useful commands:${NC}"
echo "  View logs:      sudo journalctl -u $SERVICE_NAME -f"
echo "  Restart:        sudo systemctl restart $SERVICE_NAME"
echo "  Status:         sudo systemctl status $SERVICE_NAME"
echo "  Health check:   curl http://127.0.0.1:$SERVICE_PORT/health"
echo ""
