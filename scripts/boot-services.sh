#!/bin/bash
#
# Happy services boot script
# Starts Redis, happy-server, happy-web, happy-daemon in correct order with health checks.
# Usage: ./scripts/boot-services.sh [--stop] [--status] [--restart]
#

set -euo pipefail

HAPPY_DIR="$HOME/happy"
ECOSYSTEM="$HAPPY_DIR/ecosystem.local.config.cjs"
LOG_FILE="$HOME/.pm2/happy-boot.log"

export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log() { echo -e "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"; }
ok()  { log "${GREEN}[OK]${NC} $1"; }
err() { log "${RED}[FAIL]${NC} $1"; }
warn(){ log "${YELLOW}[WARN]${NC} $1"; }

wait_for_port() {
    local port=$1 name=$2 timeout=${3:-30}
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if curl -sf -o /dev/null "http://localhost:$port/" 2>/dev/null; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    return 1
}

wait_for_redis() {
    local timeout=${1:-15} elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if redis-cli ping 2>/dev/null | grep -q PONG; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    return 1
}

check_daemon_connected() {
    local timeout=${1:-20} elapsed=0
    while [ $elapsed -lt $timeout ]; do
        local logfile
        logfile=$(ls -t "$HOME/.happy-dev/logs/"*daemon* 2>/dev/null | head -1)
        if [ -n "$logfile" ] && grep -q "Connected to server" "$logfile" 2>/dev/null; then
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    return 1
}

status_services() {
    log "--- Service Status ---"
    # Redis
    if redis-cli ping 2>/dev/null | grep -q PONG; then
        ok "Redis: running"
    else
        err "Redis: not running"
    fi
    # Server
    if curl -sf -o /dev/null "http://localhost:3005/" 2>/dev/null; then
        ok "happy-server (port 3005): responding"
    else
        err "happy-server (port 3005): not responding"
    fi
    # Web
    if curl -sf -o /dev/null "http://localhost:8082/" 2>/dev/null; then
        ok "happy-web (port 8082): responding"
    else
        err "happy-web (port 8082): not responding"
    fi
    # Daemon
    if pm2 pid happy-daemon 2>/dev/null | grep -qE '^[0-9]+$'; then
        local pid
        pid=$(pm2 pid happy-daemon 2>/dev/null)
        if kill -0 "$pid" 2>/dev/null; then
            ok "happy-daemon (PID $pid): running"
        else
            err "happy-daemon: process dead"
        fi
    else
        err "happy-daemon: not running"
    fi
    pm2 list 2>/dev/null
}

stop_services() {
    log "Stopping all Happy services..."
    pm2 kill 2>/dev/null || true
    ok "PM2 processes stopped"
}

start_services() {
    echo "" > "$LOG_FILE"
    log "=== Happy Services Boot ==="

    # Step 1: Redis
    log "Step 1/4: Starting Redis..."
    if redis-cli ping 2>/dev/null | grep -q PONG; then
        ok "Redis already running"
    else
        brew services start redis >/dev/null 2>&1 || redis-server --daemonize yes 2>/dev/null
        if wait_for_redis 15; then
            ok "Redis started"
        else
            err "Redis failed to start - Feishu login will not work"
        fi
    fi

    # Step 2: happy-server
    log "Step 2/4: Starting happy-server..."
    pm2 delete happy-server-local 2>/dev/null || true
    cd "$HAPPY_DIR"
    pm2 start "$ECOSYSTEM" --only happy-server-local 2>/dev/null

    if wait_for_port 3005 "happy-server" 30; then
        ok "happy-server responding on port 3005"
    else
        err "happy-server failed to start within 30s"
        pm2 logs happy-server-local --lines 10 --nostream 2>&1 | tee -a "$LOG_FILE"
        return 1
    fi

    # Step 3: happy-web
    log "Step 3/4: Starting happy-web..."
    pm2 delete happy-web-local 2>/dev/null || true
    pm2 start "$ECOSYSTEM" --only happy-web-local 2>/dev/null

    if wait_for_port 8082 "happy-web" 60; then
        ok "happy-web responding on port 8082"
    else
        warn "happy-web not responding yet (Expo may still be bundling)"
    fi

    # Step 4: happy-daemon
    log "Step 4/4: Starting happy-daemon..."
    pm2 delete happy-daemon 2>/dev/null || true
    pm2 start "$ECOSYSTEM" --only happy-daemon 2>/dev/null

    sleep 3
    local daemon_pid
    daemon_pid=$(pm2 pid happy-daemon 2>/dev/null || echo "")
    if [ -n "$daemon_pid" ] && kill -0 "$daemon_pid" 2>/dev/null; then
        if check_daemon_connected 20; then
            ok "happy-daemon connected to server"
        else
            warn "happy-daemon running (PID $daemon_pid) but not confirmed connected"
        fi
    else
        err "happy-daemon failed to start"
        pm2 logs happy-daemon --lines 10 --nostream 2>&1 | tee -a "$LOG_FILE"
    fi

    # Save PM2 state
    pm2 save 2>/dev/null
    ok "PM2 state saved"

    log "=== Boot Complete ==="
    echo ""
    status_services
}

case "${1:-start}" in
    start)     start_services ;;
    --stop)    stop_services ;;
    --status)  status_services ;;
    --restart) stop_services; sleep 2; start_services ;;
    *)         echo "Usage: $0 [start|--stop|--status|--restart]" ;;
esac
