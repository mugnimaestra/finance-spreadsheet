#!/bin/bash

# OpenCode Diagnostic Script
# Run this on the VPS to investigate why opencode is hanging
# Usage: sudo ./investigate-opencode.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_subheader() {
    echo ""
    echo -e "${YELLOW}--- $1 ---${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_warning "Not running as root. Some diagnostics may fail."
    print_warning "Consider running with: sudo $0"
    echo ""
fi

# Get current user info
CURRENT_USER=$(whoami)
print_header "OPENCODE DIAGNOSTIC REPORT"
echo "Timestamp: $(date)"
echo "Hostname: $(hostname)"
echo "Current User: $CURRENT_USER"
echo "Script PID: $$"

# ============================================
# 1. CHECK STUCK OPENCODE PROCESSES
# ============================================
print_header "1. STUCK OPENCODE PROCESSES"

print_subheader "All opencode processes"
if pgrep -a opencode > /dev/null 2>&1; then
    ps aux | grep -E "[o]pencode|[c]laude" | grep -v grep || true
    OPENCODE_COUNT=$(pgrep -c opencode 2>/dev/null || echo "0")
    echo ""
    print_success "Found $OPENCODE_COUNT opencode process(es)"
else
    print_warning "No opencode processes found running"
fi

print_subheader "Detailed process info (tree view)"
if command -v pstree &> /dev/null; then
    pstree -p | grep -E "opencode|claude" | head -20 || print_warning "No opencode in process tree"
else
    ps auxf | grep -E "[o]pencode|[c]laude" | head -20 || print_warning "No opencode processes"
fi

print_subheader "Process states"
ps aux | grep -E "[o]pencode" | awk '{print $2, $8, $9, $10, $11}' | while read pid stat time cpu cmd; do
    echo "PID: $pid | State: $stat | CPU Time: $time | CPU%: $cpu | Command: $cmd"
done || print_warning "Could not retrieve process states"

print_subheader "Processes in D state (uninterruptible sleep - often hung)"
ps aux | awk '$8 ~ /^D/ {print}' | grep -E "opencode|claude" || print_success "No D-state opencode processes (good)"

print_subheader "Zombie processes"
ps aux | awk '$8 ~ /^Z/ {print}' | grep -E "opencode|claude" || print_success "No zombie opencode processes (good)"

# ============================================
# 2. CHECK OPEN FILES AND CONNECTIONS
# ============================================
print_header "2. OPEN FILES AND CONNECTIONS"

print_subheader "Files opened by opencode processes"
for pid in $(pgrep opencode 2>/dev/null || true); do
    echo ""
    echo "PID $pid:"
    if command -v lsof &> /dev/null; then
        lsof -p $pid 2>/dev/null | head -30 || echo "  (no files or permission denied)"
    else
        ls -la /proc/$pid/fd/ 2>/dev/null | head -20 || echo "  (cannot access /proc/$pid/fd)"
    fi
done

print_subheader "Network connections"
if command -v netstat &> /dev/null; then
    netstat -tulpn 2>/dev/null | grep opencode || print_warning "No active network connections for opencode"
elif command -v ss &> /dev/null; then
    ss -tulpn 2>/dev/null | grep opencode || print_warning "No active network connections for opencode"
else
    print_warning "Neither netstat nor ss available"
fi

print_subheader "Active connections by opencode"
for pid in $(pgrep opencode 2>/dev/null || true); do
    echo ""
    echo "PID $pid connections:"
    if [ -d /proc/$pid ]; then
        cat /proc/$pid/net/tcp 2>/dev/null | head -10 || echo "  (cannot read tcp info)"
        cat /proc/$pid/net/tcp6 2>/dev/null | head -10 || echo "  (cannot read tcp6 info)"
    fi
done

# ============================================
# 3. CHECK OPENCODE CONFIGURATION
# ============================================
print_header "3. OPENCODE CONFIGURATION"

print_subheader "opencode binary location"
which opencode 2>/dev/null || print_warning "opencode not in PATH"
echo ""

print_subheader "opencode version"
opencode --version 2>&1 || print_error "Cannot get opencode version"
echo ""

print_subheader "Configuration files"
CONFIG_PATHS=(
    "$HOME/.config/opencode"
    "$HOME/.opencode"
    "/root/.config/opencode"
    "/root/.opencode"
    "/etc/opencode"
    "/usr/local/etc/opencode"
)

for path in "${CONFIG_PATHS[@]}"; do
    if [ -e "$path" ]; then
        echo "Found: $path"
        ls -la "$path" 2>/dev/null || true
    fi
done

print_subheader "Environment variables"
env | grep -iE "opencode|claude|anthropic|api_key|model" | grep -v "^$" || print_warning "No opencode-related env vars found"

print_subheader "Global config (opencode.json)"
if [ -f "$HOME/.config/opencode/opencode.json" ]; then
    cat "$HOME/.config/opencode/opencode.json" 2>/dev/null | grep -v "api_key" || print_warning "Cannot read config"
elif [ -f "/root/.config/opencode/opencode.json" ]; then
    cat "/root/.config/opencode/opencode.json" 2>/dev/null | grep -v "api_key" || print_warning "Cannot read config"
else
    print_warning "No opencode.json found in standard locations"
fi

print_subheader "Project config"
if [ -f "/root/projects/expense-ai-service/opencode.json" ]; then
    echo "Found project config at: /root/projects/expense-ai-service/opencode.json"
    cat "/root/projects/expense-ai-service/opencode.json" 2>/dev/null | grep -v "api_key" || print_warning "Cannot read project config"
fi

# ============================================
# 4. TEST OPENCODE MANUALLY
# ============================================
print_header "4. MANUAL OPENCODE TEST"

print_subheader "Testing opencode with timeout (10 seconds)"
echo "Running: echo 'hello' | timeout 10 opencode --stdin 2>&1"
echo ""

TEST_OUTPUT=$(echo "hello" | timeout 10 opencode --stdin 2>&1) || TEST_EXIT=$?

if [ -z "$TEST_EXIT" ]; then
    TEST_EXIT=0
fi

if [ "$TEST_EXIT" -eq 0 ]; then
    print_success "opencode responded within 10 seconds"
    echo "Output preview:"
    echo "$TEST_OUTPUT" | head -20
elif [ "$TEST_EXIT" -eq 124 ]; then
    print_error "opencode TIMED OUT after 10 seconds - this confirms the hang issue"
    echo "Partial output (if any):"
    echo "$TEST_OUTPUT" | head -20
else
    print_error "opencode exited with code $TEST_EXIT"
    echo "Error output:"
    echo "$TEST_OUTPUT" | head -20
fi

print_subheader "Testing opencode help (should be instant)"
echo "Running: timeout 5 opencode --help"
timeout 5 opencode --help 2>&1 | head -30 && print_success "Help command responded" || print_error "Help command timed out or failed"

print_subheader "Testing opencode with strace (if available)"
if command -v strace &> /dev/null; then
    echo "Running strace on a quick opencode command (5 second timeout)..."
    timeout 5 strace -f -e trace=network,file,process opencode --help 2>&1 | tail -50 || print_warning "strace test completed or timed out"
else
    print_warning "strace not available"
fi

# ============================================
# 5. CHECK SYSTEM RESOURCES
# ============================================
print_header "5. SYSTEM RESOURCES"

print_subheader "CPU and Memory"
if command -v free &> /dev/null; then
    free -h
else
    cat /proc/meminfo | head -10
fi

echo ""
if command -v top &> /dev/null; then
    echo "Top 10 processes by CPU:"
    top -bn1 | head -17 | tail -11
else
    ps aux --sort=-%cpu | head -10
fi

print_subheader "Disk Space"
df -h | grep -E "Filesystem|/dev/|overlay" | head -10

print_subheader "Load Average"
cat /proc/loadavg
uptime 2>/dev/null || true

print_subheader "Open file limits"
if [ -f /proc/sys/fs/file-max ]; then
    echo "System file-max: $(cat /proc/sys/fs/file-max)"
fi
ulimit -n 2>/dev/null && echo "Current process limit (nofile): $(ulimit -n)"

print_subheader "Inotify watches (can cause hangs if exhausted)"
if [ -f /proc/sys/fs/inotify/max_user_watches ]; then
    echo "Max user watches: $(cat /proc/sys/fs/inotify/max_user_watches)"
fi
if command -v find &> /dev/null; then
    CURRENT_WATCHES=$(find /proc/*/fd -ilname 'anon_inode:inotify' 2>/dev/null | wc -l)
    echo "Current inotify instances: $CURRENT_WATCHES"
fi

# ============================================
# 6. CHECK LOGS
# ============================================
print_header "6. LOG FILES"

print_subheader "System logs (last 50 lines)"
if command -v journalctl &> /dev/null; then
    journalctl -n 50 --no-pager 2>/dev/null | grep -iE "opencode|claude|killed|timeout" | tail -20 || print_warning "No relevant entries in journalctl"
else
    print_warning "journalctl not available"
fi

print_subheader "Syslog"
if [ -f /var/log/syslog ]; then
    tail -50 /var/log/syslog 2>/dev/null | grep -iE "opencode|claude|oom|killed" | tail -20 || print_warning "No relevant entries in syslog"
elif [ -f /var/log/messages ]; then
    tail -50 /var/log/messages 2>/dev/null | grep -iE "opencode|claude|oom|killed" | tail -20 || print_warning "No relevant entries in messages"
fi

print_subheader "Application logs in project directory"
if [ -d /root/projects/expense-ai-service ]; then
    find /root/projects/expense-ai-service -name "*.log" -type f -mtime -1 2>/dev/null | while read logfile; do
        echo ""
        echo "Log file: $logfile"
        tail -30 "$logfile" 2>/dev/null || print_warning "Cannot read $logfile"
    done
else
    print_warning "Project directory not found"
fi

print_subheader "Recent crashes (dmesg)"
dmesg 2>/dev/null | grep -iE "killed|oom|segfault|opencode" | tail -20 || print_warning "No relevant dmesg entries"

print_subheader "Audit logs (if available)"
if [ -f /var/log/audit/audit.log ]; then
    tail -30 /var/log/audit/audit.log 2>/dev/null | grep opencode | tail -10 || print_warning "No opencode entries in audit log"
fi

# ============================================
# 7. ADDITIONAL DIAGNOSTICS
# ============================================
print_header "7. ADDITIONAL DIAGNOSTICS"

print_subheader "Check for lock files"
LOCK_FILES=(
    "/tmp/opencode*"
    "/var/lock/opencode*"
    "$HOME/.config/opencode/*.lock"
)
for pattern in "${LOCK_FILES[@]}"; do
    ls -la $pattern 2>/dev/null || true
done

print_subheader "Check temp directories"
echo "Temp files related to opencode:"
find /tmp -name "*opencode*" -o -name "*claude*" 2>/dev/null | head -20 || print_success "No temp files found"

print_subheader "Check for hanging IPC"
ipcs 2>/dev/null | head -20 || print_warning "Cannot check IPC"

print_subheader "Check systemd services"
if command -v systemctl &> /dev/null; then
    systemctl list-units --type=service --state=running 2>/dev/null | grep -iE "opencode|expense" || print_warning "No relevant systemd services"
else
    print_warning "systemctl not available"
fi

# ============================================
# SUMMARY
# ============================================
print_header "DIAGNOSTIC SUMMARY"

echo "Quick Summary:"
echo "--------------"

# Count processes
OPENCODE_PIDS=$(pgrep opencode 2>/dev/null | wc -l)
if [ "$OPENCODE_PIDS" -gt 0 ]; then
    print_warning "Found $OPENCODE_PIDS opencode process(es) running"
    echo "   PIDs: $(pgrep opencode 2>/dev/null | tr '\n' ' ')"
else
    print_success "No opencode processes currently running"
fi

# Check test result
if [ "$TEST_EXIT" -eq 124 ]; then
    print_error "CONFIRMED: opencode is hanging (timed out during test)"
elif [ "$TEST_EXIT" -eq 0 ]; then
    print_success "opencode responded to test command"
else
    print_warning "opencode test returned exit code $TEST_EXIT"
fi

# Check resources
LOAD=$(cat /proc/loadavg | awk '{print $1}')
CPU_COUNT=$(nproc 2>/dev/null || echo "1")
LOAD_THRESHOLD=$(echo "$CPU_COUNT * 2" | bc 2>/dev/null || echo "$((CPU_COUNT * 2))")

if command -v bc &> /dev/null; then
    if (( $(echo "$LOAD > $LOAD_THRESHOLD" | bc -l) )); then
        print_warning "High load average: $LOAD (threshold: $LOAD_THRESHOLD)"
    else
        print_success "Load average normal: $LOAD"
    fi
else
    print_warning "Load average: $LOAD (cannot compare without bc)"
fi

echo ""
echo -e "${GREEN}Diagnostic complete!${NC}"
echo ""
echo "Recommended next steps:"
echo "1. If processes are stuck, kill them: kill -9 $(pgrep opencode 2>/dev/null | tr '\n' ' ')"
echo "2. Check API key configuration in opencode.json"
echo "3. Try running opencode with verbose logging: opencode --verbose"
echo "4. Check network connectivity to API endpoints"
echo "5. Review the 'TEST OPENCODE MANUALLY' section above for timeout confirmation"
