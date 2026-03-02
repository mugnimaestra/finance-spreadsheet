#!/bin/bash

# fix-opencode.sh - Fix opencode installation for service user
# This script ensures opencode is accessible to the service user

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OPENCODE_ROOT_BIN="/root/.opencode/bin/opencode"
OPENCODE_ROOT_CONFIG="/root/.config/opencode/opencode.json"
SERVICE_NAME="expense-ai"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Detect service user from systemd service file
detect_service_user() {
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
    
    if [[ ! -f "$service_file" ]]; then
        log_warn "Service file not found at $service_file"
        log_info "Trying to find service file..."
        service_file=$(find /etc/systemd/system -name "*expense*" -type f 2>/dev/null | head -1)
        if [[ -z "$service_file" ]]; then
            log_error "Could not find expense-ai service file"
            exit 1
        fi
    fi
    
    log_info "Found service file: $service_file"
    
    # Extract User= directive from service file
    local service_user
    service_user=$(grep -E "^User=" "$service_file" | cut -d= -f2 | tr -d ' ')
    
    if [[ -z "$service_user" ]]; then
        log_warn "No User= directive found in service file, assuming root"
        service_user="root"
    fi
    
    echo "$service_user"
}

# Get user's home directory
get_user_home() {
    local user=$1
    getent passwd "$user" | cut -d: -f6
}

# Get user's UID
get_user_uid() {
    local user=$1
    id -u "$user"
}

# Check if opencode is installed for root
check_root_opencode() {
    if [[ ! -f "$OPENCODE_ROOT_BIN" ]]; then
        log_error "opencode not found at $OPENCODE_ROOT_BIN"
        log_info "Is opencode installed for root?"
        exit 1
    fi
    
    log_success "Found opencode at $OPENCODE_ROOT_BIN"
}

# Install opencode globally (symlink to /usr/local/bin)
install_opencode_global() {
    local target="/usr/local/bin/opencode"
    
    log_info "Creating symlink from $OPENCODE_ROOT_BIN to $target"
    
    if [[ -L "$target" ]]; then
        rm "$target"
    elif [[ -f "$target" ]]; then
        log_warn "Backing up existing opencode at $target"
        mv "$target" "${target}.backup.$(date +%s)"
    fi
    
    ln -sf "$OPENCODE_ROOT_BIN" "$target"
    chmod +x "$OPENCODE_ROOT_BIN"
    
    log_success "opencode is now available at $target"
}

# Copy config to service user
copy_config_to_user() {
    local user=$1
    local user_home
    user_home=$(get_user_home "$user")
    local user_uid
    user_uid=$(get_user_uid "$user")
    
    local config_dir="${user_home}/.config/opencode"
    local config_file="${config_dir}/opencode.json"
    
    log_info "Setting up config for user $user"
    
    # Create config directory
    mkdir -p "$config_dir"
    
    # Copy config if it exists
    if [[ -f "$OPENCODE_ROOT_CONFIG" ]]; then
        cp "$OPENCODE_ROOT_CONFIG" "$config_file"
        log_success "Copied config to $config_file"
    else
        log_warn "Root config not found at $OPENCODE_ROOT_CONFIG"
        log_info "Creating minimal config..."
        cat > "$config_file" << 'EOF'
{
  "mcp": {
    "google-docs-mcp": {
      "type": "local",
      "command": ["node", "/usr/local/lib/node_modules/@mugni/google-docs-mcp/dist/server.js"],
      "enabled": true
    }
  }
}
EOF
    fi
    
    # Set ownership
    chown -R "${user}:${user}" "$config_dir"
    chmod 700 "$config_dir"
    chmod 600 "$config_file"
    
    log_success "Config permissions set for user $user"
}

# Install opencode for specific user
install_opencode_for_user() {
    local user=$1
    local user_home
    user_home=$(get_user_home "$user")
    
    log_info "Installing opencode for user $user"
    
    # Run installation as the target user
    su - "$user" -c 'curl -fsSL https://opencode.ai/install.sh | bash' || {
        log_error "Failed to install opencode for user $user"
        return 1
    }
    
    log_success "opencode installed for user $user"
}

# Update service environment to include opencode in PATH
update_service_environment() {
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
    
    log_info "Checking service environment configuration"
    
    if [[ ! -f "$service_file" ]]; then
        log_warn "Service file not found, skipping environment update"
        return
    fi
    
    # Check if Environment=PATH already includes /usr/local/bin
    if grep -q "Environment=.*PATH.*" "$service_file"; then
        if grep -q "Environment=.*PATH.*usr/local/bin" "$service_file"; then
            log_info "Service already has /usr/local/bin in PATH"
            return
        fi
        # Update existing PATH
        log_info "Updating existing PATH in service file"
        sed -i 's|Environment="PATH=\(.*\)"|Environment="PATH=/usr/local/bin:\1"|' "$service_file"
    else
        # Add new PATH environment
        log_info "Adding PATH environment to service file"
        # Find [Service] section and add after it
        sed -i '/^\[Service\]/a Environment="PATH=/usr/local/bin:/usr/bin:/bin"' "$service_file"
    fi
    
    log_success "Updated service environment"
}

# Reload systemd and restart service
restart_service() {
    log_info "Reloading systemd daemon"
    systemctl daemon-reload
    
    log_info "Restarting ${SERVICE_NAME} service"
    systemctl restart "$SERVICE_NAME"
    
    sleep 2
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "Service ${SERVICE_NAME} is running"
    else
        log_error "Service ${SERVICE_NAME} failed to start"
        systemctl status "$SERVICE_NAME" --no-pager
        exit 1
    fi
}

# Test opencode installation
test_opencode() {
    local user=$1
    
    log_info "Testing opencode installation"
    
    # Test as service user
    if su - "$user" -c 'which opencode' >/dev/null 2>&1; then
        local version
        version=$(su - "$user" -c 'opencode --version' 2>/dev/null || echo "unknown")
        log_success "opencode is accessible to user $user (version: $version)"
    else
        log_error "opencode is NOT accessible to user $user"
        return 1
    fi
    
    # Test globally
    if /usr/local/bin/opencode --version >/dev/null 2>&1; then
        log_success "opencode works from /usr/local/bin"
    else
        log_warn "opencode may have issues from /usr/local/bin"
    fi
}

# Main execution
main() {
    echo "========================================"
    echo "  OpenCode Installation Fix Script"
    echo "========================================"
    echo ""
    
    check_root
    check_root_opencode
    
    local service_user
    service_user=$(detect_service_user)
    log_info "Service runs as user: $service_user"
    
    if [[ "$service_user" == "root" ]]; then
        log_info "Service already runs as root, no user fix needed"
        # Just ensure opencode is in PATH
        if [[ ! -L "/usr/local/bin/opencode" ]]; then
            install_opencode_global
        fi
    else
        log_info "Service runs as non-root user: $service_user"
        
        # Option 1: Create global symlink (preferred for simplicity)
        install_opencode_global
        
        # Option 2: Copy config to service user
        copy_config_to_user "$service_user"
        
        # Option 3: Alternative - install opencode for the user
        # Uncomment the following line if you prefer per-user installation
        # install_opencode_for_user "$service_user"
    fi
    
    # Update service environment
    update_service_environment
    
    # Restart service
    restart_service
    
    # Test installation
    echo ""
    echo "========================================"
    echo "  Testing Installation"
    echo "========================================"
    test_opencode "$service_user"
    
    echo ""
    echo "========================================"
    log_success "OpenCode fix completed successfully!"
    echo "========================================"
    echo ""
    log_info "You can verify the service with: systemctl status ${SERVICE_NAME}"
    log_info "View logs with: journalctl -u ${SERVICE_NAME} -f"
}

# Run main function
main "$@"
