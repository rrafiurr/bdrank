#!/usr/bin/env bash
# health-monitor.sh — probe the API, detect 5xx / outages, capture the matching
# error logs, alert via webhook, and optionally auto-restart on a hard outage.
#
# Run it from cron (e.g. every 5 minutes). Configuration comes from environment
# variables, normally supplied by a sourced env file — see
# scripts/health-monitor.env.example.
#
#   */5 * * * * . /home/deploy/reviewhub/scripts/health-monitor.env && \
#               /home/deploy/reviewhub/scripts/health-monitor.sh >> \
#               /home/deploy/reviewhub/scripts/health-monitor.cron.log 2>&1
#
# "Solve": this script DETECTS and ALERTS, captures the exact error + request
# ids, and (optionally) restarts the container on a full outage. It does not fix
# logic bugs — the captured ERROR lines tell you what to fix.

set -uo pipefail

# ── Configuration (override via env) ──────────────────────────────────────────
API_BASE="${API_BASE:-https://api.bdranks.com/api/v1}"

# Space-separated list of paths to probe (relative to API_BASE).
# Keep these to cheap, public, read-only endpoints.
ENDPOINTS="${ENDPOINTS:-/stats /reviews?limit=1 /products?limit=1 /categories}"

COMPOSE_FILE="${COMPOSE_FILE:-/home/deploy/reviewhub/be/docker-compose.prod.yml}"
SERVICE="${SERVICE:-api}"
LOG_WINDOW="${LOG_WINDOW:-5m}"          # how far back to scan logs on failure
LOG_MAX_LINES="${LOG_MAX_LINES:-25}"    # max error lines to include in an alert

# Alerting: WEBHOOK_KIND = slack | discord | telegram
# Normalize: strip whitespace/CR (CRLF env files) and lowercase, so a stray
# carriage return or capitalization can't silently fall through to the default.
WEBHOOK_KIND="$(printf '%s' "${WEBHOOK_KIND:-slack}" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
WEBHOOK_URL="$(printf '%s' "${WEBHOOK_URL:-}" | tr -d '[:space:]')"                   # slack/discord
TELEGRAM_BOT_TOKEN="$(printf '%s' "${TELEGRAM_BOT_TOKEN:-}" | tr -d '[:space:]')"     # telegram
TELEGRAM_CHAT_ID="$(printf '%s' "${TELEGRAM_CHAT_ID:-}" | tr -d '[:space:]')"        # telegram

# Recovery from a hard outage (connection refused / 502 / 503 / 504).
AUTO_RESTART="${AUTO_RESTART:-false}"
RESTART_COOLDOWN="${RESTART_COOLDOWN:-900}"          # seconds between restarts

# Alert de-duplication: don't repeat the same alert more often than this.
ALERT_REPEAT="${ALERT_REPEAT:-1800}"                 # seconds

STATE_DIR="${STATE_DIR:-/tmp/bdranks-health}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-5}"
CURL_MAX_TIME="${CURL_MAX_TIME:-10}"

mkdir -p "$STATE_DIR"
STATE_SIG_FILE="$STATE_DIR/last_signature"
STATE_TS_FILE="$STATE_DIR/last_alert_ts"
STATE_RESTART_FILE="$STATE_DIR/last_restart_ts"
NOW="$(date +%s)"
TS_HUMAN="$(date '+%Y-%m-%d %H:%M:%S %Z')"

# ── Helpers ───────────────────────────────────────────────────────────────────

# probe PATH -> prints HTTP status code (000 = connection failure)
probe() {
  curl -s -o /dev/null \
    --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME" \
    -w "%{http_code}" "$API_BASE$1" 2>/dev/null
}

# is the code a failure we care about? (>=500 or 000)
is_failure() {
  local code="$1"
  [ "$code" = "000" ] || [ "$code" -ge 500 ] 2>/dev/null
}

# is the code a hard outage (worth an auto-restart)?
is_outage() {
  case "$1" in
    000|502|503|504) return 0 ;;
    *) return 1 ;;
  esac
}

# escape a string into a JSON string body (handles \, ", newlines, tabs)
json_escape() {
  if command -v jq >/dev/null 2>&1; then
    jq -Rs .
  else
    # minimal fallback escaper
    sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
      | awk 'BEGIN{printf "\""} {printf "%s\\n", $0} END{printf "\""}'
  fi
}

send_alert() {
  local text="$1"
  # Telegram has a 4096-char limit; keep all channels comfortably under it.
  text="$(printf '%s' "$text" | cut -c1-3500)"

  case "$WEBHOOK_KIND" in
    telegram)
      [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ] || {
        echo "[$TS_HUMAN] telegram not configured; alert not sent" >&2; return 1; }
      curl -s --max-time 15 \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="$TELEGRAM_CHAT_ID" \
        --data-urlencode text="$text" >/dev/null
      ;;
    discord)
      [ -n "$WEBHOOK_URL" ] || { echo "[$TS_HUMAN] WEBHOOK_URL not set" >&2; return 1; }
      local payload; payload="$(printf '%s' "$text" | json_escape)"
      curl -s --max-time 15 -H "Content-Type: application/json" \
        -d "{\"content\": $payload}" "$WEBHOOK_URL" >/dev/null
      ;;
    slack|*)
      [ -n "$WEBHOOK_URL" ] || {
        echo "[$TS_HUMAN] WEBHOOK_URL not set (WEBHOOK_KIND='$WEBHOOK_KIND'). For Telegram set WEBHOOK_KIND=telegram + TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID; for Slack/Discord set WEBHOOK_URL." >&2
        return 1; }
      local payload; payload="$(printf '%s' "$text" | json_escape)"
      curl -s --max-time 15 -H "Content-Type: application/json" \
        -d "{\"text\": $payload}" "$WEBHOOK_URL" >/dev/null
      ;;
  esac
}

scan_logs() {
  docker compose -f "$COMPOSE_FILE" logs --since "$LOG_WINDOW" "$SERVICE" 2>/dev/null \
    | grep -E "ERROR|panic|level=error|runtime error" \
    | tail -n "$LOG_MAX_LINES"
}

maybe_restart() {
  [ "$AUTO_RESTART" = "true" ] || return 1
  local last=0
  [ -f "$STATE_RESTART_FILE" ] && last="$(cat "$STATE_RESTART_FILE" 2>/dev/null || echo 0)"
  if [ $((NOW - last)) -lt "$RESTART_COOLDOWN" ]; then
    echo "(restart skipped — within cooldown)"
    return 1
  fi
  echo "$NOW" > "$STATE_RESTART_FILE"
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate "$SERVICE" >/dev/null 2>&1 \
    && echo "(auto-restart triggered)" || echo "(auto-restart FAILED)"
}

# ── Test mode: send a sample alert and exit (verifies channel config) ─────────
if [ "${1:-}" = "--test" ] || [ "${TEST:-}" = "1" ]; then
  if send_alert "🔔 bdranks health-monitor test alert — $TS_HUMAN. If you can read this, alerting works."; then
    echo "[$TS_HUMAN] test alert sent via '$WEBHOOK_KIND'"
    exit 0
  else
    echo "[$TS_HUMAN] test alert FAILED — check WEBHOOK_KIND and credentials" >&2
    exit 1
  fi
fi

# ── Probe all endpoints ───────────────────────────────────────────────────────
declare -a FAILED=()
OUTAGE=false
RESULTS=""

for ep in $ENDPOINTS; do
  code="$(probe "$ep")"
  RESULTS+="  $code  $ep"$'\n'
  if is_failure "$code"; then
    FAILED+=("$code $ep")
    is_outage "$code" && OUTAGE=true
  fi
done

# ── Healthy: clear state, optionally announce recovery ───────────────────────
if [ "${#FAILED[@]}" -eq 0 ]; then
  if [ -f "$STATE_SIG_FILE" ]; then
    rm -f "$STATE_SIG_FILE" "$STATE_TS_FILE"
    send_alert "✅ bdranks API recovered — all endpoints healthy at $TS_HUMAN"
  fi
  echo "[$TS_HUMAN] OK"$'\n'"$RESULTS"
  exit 0
fi

# ── Failing: build signature for de-dup ──────────────────────────────────────
signature="$(printf '%s\n' "${FAILED[@]}" | sort | md5sum | awk '{print $1}')"
last_sig=""; last_ts=0
[ -f "$STATE_SIG_FILE" ] && last_sig="$(cat "$STATE_SIG_FILE" 2>/dev/null)"
[ -f "$STATE_TS_FILE" ] && last_ts="$(cat "$STATE_TS_FILE" 2>/dev/null || echo 0)"

restart_note=""
$OUTAGE && restart_note="$(maybe_restart)"

# Decide whether to (re)alert.
should_alert=true
if [ "$signature" = "$last_sig" ] && [ $((NOW - last_ts)) -lt "$ALERT_REPEAT" ]; then
  should_alert=false
fi

errors="$(scan_logs)"
[ -z "$errors" ] && errors="(no ERROR/panic lines found in last $LOG_WINDOW — check access logs / upstream)"

report="🚨 bdranks API 5xx detected — $TS_HUMAN

Failing endpoints:
$(printf '  %s\n' "${FAILED[@]}")
Recent error logs:
$errors"
[ -n "$restart_note" ] && report+=$'\n\n'"Recovery: $restart_note"

# Always write a local report file.
echo "$report" > "$STATE_DIR/last_report.txt"

if $should_alert; then
  send_alert "$report"
  echo "$signature" > "$STATE_SIG_FILE"
  echo "$NOW" > "$STATE_TS_FILE"
  echo "[$TS_HUMAN] FAIL — alert sent"
else
  echo "[$TS_HUMAN] FAIL — alert suppressed (deduped)"
fi

echo "$RESULTS"
exit 1
