#!/bin/bash
set -e

# Happy Web 部署脚本
# 用法:
#   ./deploy-web.sh test      构建并部署到测试环境 (testhappy.superlinear.studio)
#   ./deploy-web.sh prod      构建并部署到正式环境 (happy.superlinear.studio)
#   ./deploy-web.sh promote   将测试版本直接复制到正式环境（无需重新构建）

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
TEST_DIR="/opt/happy-web-test"
PROD_DIR="/opt/happy-web"
WELL_KNOWN_DIR="$PROD_DIR/.well-known"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
err() { echo -e "${RED}[deploy]${NC} $1"; exit 1; }

fix_server_url() {
    local target_dir="$1"
    local bad_url_count
    bad_url_count=$(grep -rl "cluster-fluster" "$target_dir/_expo/static/js/web/" 2>/dev/null | wc -l)
    if [ "$bad_url_count" -gt 0 ]; then
        warn "发现 $bad_url_count 个文件包含错误的 server URL，正在修复..."
        sed -i "s|https://api.cluster-fluster.com|https://happy.superlinear.studio|g" "$target_dir"/_expo/static/js/web/*.js
        log "server URL 已修复"
    fi
}

build() {
    log "开始构建 web..."
    cd "$SCRIPT_DIR"
    npx expo export --platform web --clear
    log "构建完成，输出目录: $DIST_DIR"
}

deploy_to() {
    local target_dir="$1"
    local env_name="$2"

    if [ ! -d "$DIST_DIR" ]; then
        err "构建产物不存在: $DIST_DIR，请先执行构建"
    fi

    log "部署到${env_name}: $target_dir"

    # 保留 .well-known 目录（如果存在）
    if [ -d "$target_dir/.well-known" ]; then
        cp -r "$target_dir/.well-known" /tmp/.well-known-backup
    fi

    # 清空目标目录并复制新文件
    rm -rf "$target_dir"/*
    cp -r "$DIST_DIR"/* "$target_dir"/

    # 恢复 .well-known
    if [ -d /tmp/.well-known-backup ]; then
        cp -r /tmp/.well-known-backup "$target_dir/.well-known"
        rm -rf /tmp/.well-known-backup
    fi

    # 修复 server URL
    fix_server_url "$target_dir"

    log "${env_name}部署完成!"
}

case "${1:-}" in
    test)
        build
        deploy_to "$TEST_DIR" "测试环境"
        log "测试地址: https://testhappy.superlinear.studio"
        ;;
    prod)
        echo -e "${YELLOW}即将部署到正式环境！${NC}"
        read -p "确认继续? (y/N) " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo "已取消"
            exit 0
        fi
        build
        deploy_to "$PROD_DIR" "正式环境"
        log "正式地址: https://happy.superlinear.studio"
        ;;
    promote)
        if [ ! -f "$TEST_DIR/index.html" ]; then
            err "测试环境没有可用的构建，请先 ./deploy-web.sh test"
        fi
        echo -e "${YELLOW}即将把测试版本推送到正式环境！${NC}"
        read -p "确认继续? (y/N) " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo "已取消"
            exit 0
        fi

        log "复制测试版本到正式环境..."

        # 保留 .well-known
        if [ -d "$PROD_DIR/.well-known" ]; then
            cp -r "$PROD_DIR/.well-known" /tmp/.well-known-backup
        fi

        rm -rf "$PROD_DIR"/*
        cp -r "$TEST_DIR"/* "$PROD_DIR"/

        if [ -d /tmp/.well-known-backup ]; then
            cp -r /tmp/.well-known-backup "$PROD_DIR/.well-known"
            rm -rf /tmp/.well-known-backup
        fi

        log "正式环境已更新! https://happy.superlinear.studio"
        ;;
    *)
        echo "用法: $0 {test|prod|promote}"
        echo ""
        echo "  test     构建并部署到测试环境 (testhappy.superlinear.studio)"
        echo "  prod     构建并部署到正式环境 (happy.superlinear.studio)"
        echo "  promote  将测试版本复制到正式环境（无需重新构建）"
        exit 1
        ;;
esac
