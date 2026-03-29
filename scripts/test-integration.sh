#!/usr/bin/env bash
# Discord Bridge 集成测试启动脚本
#
# 功能：
#   1. 启动 OpeniLink Hub Mock Server
#   2. 启动 openilink-app-discord（使用 mock 环境变量）
#   3. 等待两个服务就绪
#   4. 运行集成测试
#   5. 退出时清理所有子进程
set -euo pipefail

# ── 配置 ──────────────────────────────────────────────
APP_PORT=8083
MOCK_PORT=9801
MOCK_HUB_URL="http://localhost:${MOCK_PORT}"
APP_URL="http://localhost:${APP_PORT}"

# ── 清理函数 ──────────────────────────────────────────
PIDS=()
cleanup() {
  echo "[cleanup] 正在终止子进程..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
  echo "[cleanup] 已完成"
}
trap cleanup EXIT

# ── 等待服务就绪 ──────────────────────────────────────
wait_for_service() {
  local url="$1"
  local name="$2"
  local max_wait=30
  local elapsed=0

  echo "[wait] 等待 ${name} 就绪 (${url})..."
  while ! curl -sf "${url}" >/dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$max_wait" ]; then
      echo "[error] ${name} 在 ${max_wait}s 内未就绪，退出"
      exit 1
    fi
  done
  echo "[wait] ${name} 已就绪 (${elapsed}s)"
}

# ── 1. 启动 Mock Server ───────────────────────────────
echo "[start] 启动 Hub Mock Server..."
go run github.com/openilink/openilink-hub/cmd/appmock@latest \
  --listen ":${MOCK_PORT}" \
  --webhook-url "${APP_URL}/hub/webhook" \
  --app-token mock_app_token &
PIDS+=($!)

# ── 2. 启动 App ──────────────────────────────────────
echo "[start] 启动 openilink-app-discord..."
DISCORD_BOT_TOKEN=mock_discord_token \
DISCORD_CHANNEL_ID=mock_channel_id \
HUB_URL="${MOCK_HUB_URL}" \
BASE_URL="${APP_URL}" \
PORT="${APP_PORT}" \
DB_PATH=":memory:" \
  npx tsx src/index.ts &
PIDS+=($!)

# ── 3. 等待服务就绪 ──────────────────────────────────
wait_for_service "${MOCK_HUB_URL}/mock/messages" "Hub Mock Server"
wait_for_service "${APP_URL}/health" "Discord App"

# ── 4. 运行集成测试 ──────────────────────────────────
echo "[test] 运行集成测试..."
npx vitest run tests/integration/

echo "[done] 集成测试完成"
