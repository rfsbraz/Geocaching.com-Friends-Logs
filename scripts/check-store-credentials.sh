#!/usr/bin/env bash
# Checks that the store publishing credentials still work. Read-only.
#
# Chrome: exchanges CHROME_REFRESH_TOKEN for an access token, then reads the item.
#   A successful exchange also keeps the refresh token in use.
# Edge: calls the Add-ons API with EDGE_CLIENT_ID and EDGE_API_KEY, and warns when
#   the key is close to EDGE_API_KEY_EXPIRES.
#
# Never prints tokens or response bodies. Prints only HTTP status codes and error codes.
# Writes a short report to $REPORT_FILE (default: store-report.md).
# Exit code: 1 if any check failed, 0 otherwise. Expiry warnings do not fail the run.
set -euo pipefail
set +x

CHROME_EXTENSION_ID="${CHROME_EXTENSION_ID:-bgildcbomgimjfoblhlhmaehaeieeaam}"
CHROME_TOKEN_URL="${CHROME_TOKEN_URL:-https://oauth2.googleapis.com/token}"
CHROME_API_BASE="${CHROME_API_BASE:-https://www.googleapis.com/chromewebstore/v1.1}"
CHROME_API_V2_BASE="${CHROME_API_V2_BASE:-https://chromewebstore.googleapis.com/v2}"
EDGE_API_BASE="${EDGE_API_BASE:-https://api.addons.microsoftedge.microsoft.com/v1}"
EDGE_API_KEY_EXPIRES="${EDGE_API_KEY_EXPIRES:?EDGE_API_KEY_EXPIRES must be set (YYYY-MM-DD)}"
EDGE_WARN_DAYS="${EDGE_WARN_DAYS:-30}"
REPORT_FILE="${REPORT_FILE:-store-report.md}"

failed=0
warned=0
work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT
: >"$REPORT_FILE"

report() { printf -- '- %s\n' "$1" >>"$REPORT_FILE"; }
fail() {
  echo "::error title=$1::$2"
  report "$1: $2"
  failed=1
}
warn() {
  echo "::warning title=$1::$2"
  report "$1: $2"
  warned=1
}
mask() {
  # Only GitHub Actions understands this. Locally it would print the value.
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "::add-mask::$1"
  fi
}
# Pull an error code out of a JSON body. Falls back to "unknown". Never prints the body.
error_code() {
  jq -r '(.error | if type == "object" then (.status // .code // "unknown") else . end)
         // .errorCode // .code // "unknown"' "$1" 2>/dev/null | head -c 64 || echo unknown
}
missing() {
  local name
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      echo "$name"
      return 0
    fi
  done
  return 1
}

check_chrome() {
  local name status code token
  if name="$(missing CHROME_CLIENT_ID CHROME_CLIENT_SECRET CHROME_REFRESH_TOKEN)"; then
    fail "Chrome" "secret $name is not set"
    return
  fi

  # Secrets go in a file, not on the curl command line.
  # jq reads them from the environment so they never appear in a process list.
  jq -jn '"client_id=\(env.CHROME_CLIENT_ID|@uri)&client_secret=\(env.CHROME_CLIENT_SECRET|@uri)&refresh_token=\(env.CHROME_REFRESH_TOKEN|@uri)&grant_type=refresh_token"' \
    >"$work/token-body"
  if ! status="$(curl -sS --max-time 30 -o "$work/token.json" -w '%{http_code}' \
    -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-binary @"$work/token-body" "$CHROME_TOKEN_URL" 2>/dev/null)"; then
    fail "Chrome" "token exchange request failed (network error)"
    return
  fi
  if [ "$status" != "200" ]; then
    code="$(error_code "$work/token.json")"
    fail "Chrome" "token exchange returned HTTP $status ($code). invalid_grant means the refresh token expired or was revoked."
    return
  fi
  token="$(jq -r '.access_token // empty' "$work/token.json")"
  rm -f "$work/token.json" "$work/token-body"
  if [ -z "$token" ]; then
    fail "Chrome" "token exchange returned no access token"
    return
  fi
  mask "$token"
  printf 'Authorization: Bearer %s\n' "$token" >"$work/chrome-auth"
  unset token

  local url
  if [ -n "${CHROME_PUBLISHER_ID:-}" ]; then
    url="$CHROME_API_V2_BASE/publishers/$CHROME_PUBLISHER_ID/items/$CHROME_EXTENSION_ID:fetchStatus"
  else
    url="$CHROME_API_BASE/items/$CHROME_EXTENSION_ID?projection=DRAFT"
  fi
  if ! status="$(curl -sS --max-time 30 -o "$work/item.json" -w '%{http_code}' \
    -H @"$work/chrome-auth" "$url" 2>/dev/null)"; then
    fail "Chrome" "item read failed (network error)"
    return
  fi
  rm -f "$work/chrome-auth"
  if [ "$status" != "200" ]; then
    fail "Chrome" "item read returned HTTP $status ($(error_code "$work/item.json"))"
    return
  fi
  echo "Chrome: token exchange OK, item read HTTP $status"
  report "Chrome: OK"
}

check_edge() {
  local name status
  if name="$(missing EDGE_CLIENT_ID EDGE_API_KEY EDGE_PRODUCT_ID)"; then
    fail "Edge" "secret $name is not set"
  else
    printf 'Authorization: ApiKey %s\nX-ClientID: %s\n' "$EDGE_API_KEY" "$EDGE_CLIENT_ID" >"$work/edge-auth"
    # The v1.1 API has no plain product GET. Asking for the status of an operation id that
    # does not exist is read-only: bad credentials give 401/403, good ones give 404.
    local url="$EDGE_API_BASE/products/$EDGE_PRODUCT_ID/submissions/operations/00000000-0000-0000-0000-000000000000"
    if ! status="$(curl -sS --max-time 30 -o "$work/edge.json" -w '%{http_code}' \
      -H @"$work/edge-auth" "$url" 2>/dev/null)"; then
      fail "Edge" "status request failed (network error)"
    else
      case "$status" in
        200 | 404)
          echo "Edge: credentials accepted (HTTP $status)"
          report "Edge: credentials accepted"
          ;;
        401 | 403) fail "Edge" "API key rejected (HTTP $status). Create a new key in Partner Center." ;;
        *) fail "Edge" "status request returned HTTP $status ($(error_code "$work/edge.json"))" ;;
      esac
    fi
    rm -f "$work/edge-auth"
  fi

  local expires_s now_s days
  if ! expires_s="$(date -u -d "$EDGE_API_KEY_EXPIRES" +%s 2>/dev/null)"; then
    fail "Edge" "EDGE_API_KEY_EXPIRES is not a valid date"
    return
  fi
  now_s="$(date -u +%s)"
  days=$(((expires_s - now_s) / 86400))
  if [ "$days" -lt 0 ]; then
    fail "Edge" "API key expired on $EDGE_API_KEY_EXPIRES. Create a new key and update EDGE_API_KEY and EDGE_API_KEY_EXPIRES."
  elif [ "$days" -le "$EDGE_WARN_DAYS" ]; then
    warn "Edge" "API key expires on $EDGE_API_KEY_EXPIRES ($days days left). Create a new key and update EDGE_API_KEY and EDGE_API_KEY_EXPIRES."
  else
    echo "Edge: API key expires on $EDGE_API_KEY_EXPIRES ($days days left)"
  fi
}

check_chrome
check_edge

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "failed=$failed" >>"$GITHUB_OUTPUT"
  echo "warned=$warned" >>"$GITHUB_OUTPUT"
fi
exit "$failed"
