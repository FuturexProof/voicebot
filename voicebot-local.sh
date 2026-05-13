#!/usr/bin/env bash
# voicebot-local.sh — Lokales Test-Setup für ARM64-Ubuntu
#
# Nutzung:
#   ./voicebot-local.sh setup        # einmalig: Firewall, env-Datei, ngrok
#   ./voicebot-local.sh start [mode] # lokal testen (mode: dummy|full, default: full)
#   ./voicebot-local.sh stop         # aufräumen, Endpoint zurück
#   ./voicebot-local.sh status       # was läuft gerade?
#   ./voicebot-local.sh logs         # Live-Logs vom Bot
#   ./voicebot-local.sh cloud-logs   # Live-Logs vom Azure App Service

set -uo pipefail

# === Konstanten ===
ENV_FILE="$HOME/voicebot-env.sh"
PROJECT_DIR="$HOME/Projects/voicebot"
WORK_DIR="$HOME/.voicebot"
BOT_LOG="$WORK_DIR/bot.log"
NGROK_LOG="$WORK_DIR/ngrok.log"
BOT_PID="$WORK_DIR/bot.pid"
NGROK_PID="$WORK_DIR/ngrok.pid"
NGROK_URL_FILE="$WORK_DIR/ngrok.url"
ORIG_ENDPOINT_FILE="$WORK_DIR/original-endpoint"
mkdir -p "$WORK_DIR"

# === Farben ===
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}==>${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✗${NC}  $*" >&2; }

# === Hilfsfunktionen ===
need_env() {
  if [ ! -f "$ENV_FILE" ]; then
    err "Env-Datei $ENV_FILE fehlt. Starte zuerst: $0 setup"
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  for v in RG APP_NAME BOT_NAME KV_NAME APP_URL SQL_SERVER SQL_PASS UAMI_CLIENT_ID; do
    if [ -z "${!v:-}" ]; then
      err "Variable \$$v ist leer. Env-Datei erneuern: $0 setup"
      exit 1
    fi
  done
}

need_az_login() {
  if ! az account show >/dev/null 2>&1; then
    err "Nicht in Azure eingeloggt. Bitte: az login"
    exit 1
  fi
}

# =============================================================
#  setup — einmaliges Setup
# =============================================================
cmd_setup() {
  need_az_login

  info "1/5 — Variablen aus Azure ziehen und env-Datei schreiben"

  # Konstanten (anpassen falls anders)
  local DEIN_NAME="${DEIN_NAME:-hans}"
  local PROJECT="${PROJECT:-voicebot}"
  local LOCATION="${LOCATION:-switzerlandnorth}"
  local RG_LOCAL="rg-${PROJECT}"
  local APP_NAME_LOCAL="${PROJECT}-app-${DEIN_NAME}"
  local UAMI_NAME_LOCAL="${PROJECT}-id"

  if ! az group show -n "$RG_LOCAL" >/dev/null 2>&1; then
    err "Resource Group '$RG_LOCAL' existiert nicht. Falscher DEIN_NAME?"
    err "Aktuell: DEIN_NAME=$DEIN_NAME → RG=$RG_LOCAL"
    exit 1
  fi

  local SUB_ID_LOCAL TENANT_ID_LOCAL
  SUB_ID_LOCAL=$(az account show --query id -o tsv)
  TENANT_ID_LOCAL=$(az account show --query tenantId -o tsv)

  local UAMI_CLIENT_ID_LOCAL UAMI_RESOURCE_ID_LOCAL UAMI_PRINCIPAL_ID_LOCAL
  UAMI_CLIENT_ID_LOCAL=$(az identity show -g "$RG_LOCAL" -n "$UAMI_NAME_LOCAL" --query clientId -o tsv)
  UAMI_RESOURCE_ID_LOCAL=$(az identity show -g "$RG_LOCAL" -n "$UAMI_NAME_LOCAL" --query id -o tsv)
  UAMI_PRINCIPAL_ID_LOCAL=$(az identity show -g "$RG_LOCAL" -n "$UAMI_NAME_LOCAL" --query principalId -o tsv)

  # SQL_PASS: aus bestehender env-Datei übernehmen oder fragen
  local SQL_PASS_LOCAL=""
  if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    SQL_PASS_LOCAL=$(grep -E "^export SQL_PASS=" "$ENV_FILE" | head -1 | sed -E "s/^export SQL_PASS=['\"]?(.*[^'\"])['\"]?$/\1/")
  fi
  if [ -z "$SQL_PASS_LOCAL" ] || [ "$SQL_PASS_LOCAL" = "HIER_AUS_PASSWORT_MANAGER_EINFÜGEN" ]; then
    echo ""
    warn "SQL-Passwort wird benötigt. Aus Passwort-Manager einfügen:"
    read -rsp "SQL_PASS: " SQL_PASS_LOCAL
    echo ""
  fi

  cat > "$ENV_FILE" <<EOF
export DEIN_NAME="${DEIN_NAME}"
export PROJECT="${PROJECT}"
export LOCATION="${LOCATION}"
export RG="rg-\${PROJECT}"
export APP_NAME="\${PROJECT}-app-\${DEIN_NAME}"
export PLAN_NAME="\${PROJECT}-plan"
export SQL_SERVER="\${PROJECT}-sql-\${DEIN_NAME}"
export SQL_DB="\${PROJECT}db"
export SQL_ADMIN="botadmin"
export SQL_PASS='${SQL_PASS_LOCAL}'
export SPEECH_NAME="\${PROJECT}-speech-\${DEIN_NAME}"
export LANG_NAME="\${PROJECT}-lang-\${DEIN_NAME}"
export KV_NAME="kv-\${PROJECT}-\${DEIN_NAME}"
export UAMI_NAME="\${PROJECT}-id"
export BOT_NAME="\${PROJECT}-\${DEIN_NAME}"
export CLU_PROJECT="\${PROJECT}-clu"
export CLU_DEPLOYMENT="production"
export APP_URL="https://\${APP_NAME}.azurewebsites.net"
export SUB_ID="${SUB_ID_LOCAL}"
export TENANT_ID="${TENANT_ID_LOCAL}"
export UAMI_CLIENT_ID="${UAMI_CLIENT_ID_LOCAL}"
export UAMI_RESOURCE_ID="${UAMI_RESOURCE_ID_LOCAL}"
export UAMI_PRINCIPAL_ID="${UAMI_PRINCIPAL_ID_LOCAL}"
EOF
  chmod 600 "$ENV_FILE"
  ok "Env-Datei geschrieben: $ENV_FILE"

  # shellcheck disable=SC1090
  source "$ENV_FILE"

  info "2/5 — Eigene IP zur SQL-Firewall hinzufügen"
  local MY_IP
  MY_IP=$(curl -s ifconfig.me)
  if [ -z "$MY_IP" ]; then
    err "Konnte eigene IP nicht ermitteln"
    exit 1
  fi
  ok "Heim-IP: $MY_IP"

  # Existierende Regel löschen (idempotent)
  az sql server firewall-rule delete \
    --resource-group "$RG" --server "$SQL_SERVER" \
    --name "AllowDevVM" 2>/dev/null || true

  az sql server firewall-rule create \
    --resource-group "$RG" --server "$SQL_SERVER" \
    --name "AllowDevVM" \
    --start-ip-address "$MY_IP" \
    --end-ip-address "$MY_IP" >/dev/null
  ok "SQL-Firewall-Regel 'AllowDevVM' für $MY_IP angelegt"

  info "3/5 — ngrok prüfen"
  if ! command -v ngrok >/dev/null 2>&1; then
    warn "ngrok nicht installiert — installiere via snap"
    sudo snap install ngrok
  fi
  ok "ngrok: $(ngrok version 2>&1 | head -1)"

  # Auth-Token prüfen
  if ! ngrok config check >/dev/null 2>&1; then
    echo ""
    warn "ngrok Auth-Token fehlt. Bitte einmalig einrichten:"
    echo "  1. Account erstellen: https://dashboard.ngrok.com/signup"
    echo "  2. Token kopieren:    https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "  3. Setzen:            ngrok config add-authtoken DEIN_TOKEN"
    echo ""
    echo "Danach erneut: $0 setup"
    exit 1
  fi
  ok "ngrok ist konfiguriert"

  info "4/5 — Bot-Endpoint sichern (für späteres Zurücksetzen)"
  local CURRENT_ENDPOINT
  CURRENT_ENDPOINT=$(az bot show -g "$RG" -n "$BOT_NAME" --query "properties.endpoint" -o tsv)
  echo "$CURRENT_ENDPOINT" > "$ORIG_ENDPOINT_FILE"
  ok "Aktueller Endpoint gemerkt: $CURRENT_ENDPOINT"

  info "5/5 — Cloud-App-Status prüfen"
  local APP_STATE HTTP_CODE
  APP_STATE=$(az webapp show -g "$RG" -n "$APP_NAME" --query state -o tsv)
  HTTP_CODE=$(curl -sI "$APP_URL" -o /dev/null -w "%{http_code}" --max-time 30 || echo "timeout")
  echo "    App Service State: $APP_STATE"
  echo "    App URL:           $APP_URL → HTTP $HTTP_CODE"
  if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "403" ]; then
    warn "Cloud-App antwortet nicht sauber. Log-Check empfohlen: $0 cloud-logs"
  fi

  echo ""
  ok "Setup abgeschlossen."
  echo ""
  echo "Nächste Schritte:"
  echo "  $0 start       # startet Bot + ngrok + lenkt Bot-Endpoint um"
  echo "  → Dann im Azure-Portal: Bot → Test in Web Chat"
}

# =============================================================
#  start — lokalen Bot + ngrok starten, Endpoint umlenken
# =============================================================
cmd_start() {
  need_env
  need_az_login

  local MODE="${1:-full}"
  if [ "$MODE" != "full" ] && [ "$MODE" != "dummy" ]; then
    err "Mode muss 'full' oder 'dummy' sein. Standard: full"
    exit 1
  fi

  if [ -f "$BOT_PID" ] && kill -0 "$(cat "$BOT_PID")" 2>/dev/null; then
    err "Bot läuft schon (PID $(cat "$BOT_PID")). Erst stoppen: $0 stop"
    exit 1
  fi

  cd "$PROJECT_DIR" || { err "Projekt-Dir fehlt: $PROJECT_DIR"; exit 1; }

  # 1. Bot starten
  info "Starte Bot im Modus '$MODE' ..."
  if [ "$MODE" = "full" ]; then
    KV_NAME="$KV_NAME" nohup node index.js > "$BOT_LOG" 2>&1 &
  else
    KV_NAME="" nohup node index.js > "$BOT_LOG" 2>&1 &
  fi
  echo $! > "$BOT_PID"
  sleep 3
  if ! kill -0 "$(cat "$BOT_PID")" 2>/dev/null; then
    err "Bot ist abgestürzt. Logs:"
    tail -20 "$BOT_LOG"
    exit 1
  fi
  ok "Bot läuft (PID $(cat "$BOT_PID")), Log: $BOT_LOG"

  # 2. ngrok starten
  info "Starte ngrok ..."
  # Sicherheitshalber alte Instanz killen
  pkill -f "ngrok http" 2>/dev/null || true
  sleep 1
  nohup ngrok http 3978 --log=stdout > "$NGROK_LOG" 2>&1 &
  echo $! > "$NGROK_PID"

  # 3. ngrok-URL aus API ziehen
  info "Warte auf ngrok-URL ..."
  local NGROK_URL=""
  for i in {1..15}; do
    sleep 1
    NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
      | jq -r '.tunnels[] | select(.proto == "https") | .public_url' 2>/dev/null | head -1)
    [ -n "$NGROK_URL" ] && [ "$NGROK_URL" != "null" ] && break
  done

  if [ -z "$NGROK_URL" ] || [ "$NGROK_URL" = "null" ]; then
    err "ngrok-URL konnte nicht ermittelt werden. Logs:"
    tail -20 "$NGROK_LOG"
    cmd_stop
    exit 1
  fi
  echo "$NGROK_URL" > "$NGROK_URL_FILE"
  ok "ngrok: $NGROK_URL"

  # 4. Bot-Endpoint umstellen
  info "Stelle Bot-Endpoint auf ngrok um ..."
  az bot update -g "$RG" -n "$BOT_NAME" \
    --endpoint "${NGROK_URL}/api/messages" >/dev/null
  ok "Bot-Endpoint: ${NGROK_URL}/api/messages"

  echo ""
  ok "Alles bereit zum Testen."
  echo ""
  echo "Test-URL (im Browser öffnen):"
  echo "  https://portal.azure.com/#@${TENANT_ID}/resource${RG_PATH:-}"
  echo ""
  echo "Oder direkter Weg im Portal:"
  echo "  Portal → Resource Group '$RG' → Bot '$BOT_NAME' →"
  echo "  Settings → Test in Web Chat"
  echo ""
  echo "Im Webchat tippen (Dialog durchspielen):"
  echo "  ❯ Ich möchte mich registrieren"
  echo "  ❯ Max"
  echo "  ❯ Mustermann"
  echo "  ❯ 3. Mai 1990"
  echo "  ❯ max@example.com"
  echo "  ❯ +49 30 12345678"
  echo "  ❯ Hauptstraße 12"
  echo "  ❯ 10115"
  echo "  ❯ Berlin"
  echo "  ❯ Deutschland"
  echo "  ❯ ja"
  echo ""
  echo "Bot-Logs live verfolgen:"
  echo "  $0 logs"
  echo ""
  echo "Wenn fertig:"
  echo "  $0 stop    # Endpoint zurück auf App Service, alles aufräumen"
}

# =============================================================
#  stop — aufräumen, Endpoint zurück
# =============================================================
cmd_stop() {
  need_env

  info "Räume auf ..."

  # ngrok beenden
  if [ -f "$NGROK_PID" ]; then
    local PID
    PID=$(cat "$NGROK_PID")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      ok "ngrok gestoppt (PID $PID)"
    fi
    rm -f "$NGROK_PID"
  fi
  pkill -f "ngrok http" 2>/dev/null || true

  # Bot beenden
  if [ -f "$BOT_PID" ]; then
    local PID
    PID=$(cat "$BOT_PID")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      ok "Bot gestoppt (PID $PID)"
    fi
    rm -f "$BOT_PID"
  fi
  pkill -f "node index.js" 2>/dev/null || true

  # Endpoint zurücksetzen
  if az account show >/dev/null 2>&1; then
    local TARGET="${APP_URL}/api/messages"
    if [ -f "$ORIG_ENDPOINT_FILE" ]; then
      local ORIG
      ORIG=$(cat "$ORIG_ENDPOINT_FILE")
      # Nur zurücksetzen, wenn das ein App-Service-Endpoint war (nicht selbst ein ngrok)
      if [[ "$ORIG" == *"azurewebsites.net"* ]]; then
        TARGET="$ORIG"
      fi
    fi
    az bot update -g "$RG" -n "$BOT_NAME" --endpoint "$TARGET" >/dev/null
    ok "Bot-Endpoint zurückgesetzt: $TARGET"
  else
    warn "Nicht eingeloggt — Endpoint manuell zurücksetzen:"
    echo "  az bot update -g \$RG -n \$BOT_NAME --endpoint \"\${APP_URL}/api/messages\""
  fi

  rm -f "$NGROK_URL_FILE"
  ok "Fertig."
}

# =============================================================
#  status — was läuft gerade?
# =============================================================
cmd_status() {
  need_env

  echo "=== Lokaler Bot ==="
  if [ -f "$BOT_PID" ] && kill -0 "$(cat "$BOT_PID")" 2>/dev/null; then
    ok "Läuft (PID $(cat "$BOT_PID")), Log: $BOT_LOG"
    ss -tlnp 2>/dev/null | grep ":3978" || true
  else
    echo "  (nicht aktiv)"
  fi

  echo ""
  echo "=== ngrok ==="
  if [ -f "$NGROK_PID" ] && kill -0 "$(cat "$NGROK_PID")" 2>/dev/null; then
    local URL
    URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
      | jq -r '.tunnels[] | select(.proto == "https") | .public_url' 2>/dev/null | head -1)
    ok "Läuft (PID $(cat "$NGROK_PID"))"
    echo "  URL: $URL"
    echo "  Web-UI: http://127.0.0.1:4040"
  else
    echo "  (nicht aktiv)"
  fi

  echo ""
  echo "=== Azure Bot Endpoint ==="
  if az account show >/dev/null 2>&1; then
    local EP
    EP=$(az bot show -g "$RG" -n "$BOT_NAME" --query "properties.endpoint" -o tsv 2>/dev/null)
    echo "  $EP"
  else
    warn "Nicht eingeloggt"
  fi
}

# =============================================================
#  logs — Bot-Log live
# =============================================================
cmd_logs() {
  if [ ! -f "$BOT_LOG" ]; then
    err "Kein Bot-Log gefunden. Erst starten: $0 start"
    exit 1
  fi
  tail -f "$BOT_LOG"
}

# =============================================================
#  cloud-logs — App-Service-Log live
# =============================================================
cmd_cloud_logs() {
  need_env
  need_az_login
  az webapp log tail -g "$RG" -n "$APP_NAME"
}

# =============================================================
#  help
# =============================================================
cmd_help() {
  cat <<EOF
voicebot-local.sh — Lokales Test-Setup

Befehle:
  setup        Einmaliges Setup: SQL-Firewall, env-Datei, ngrok-Check
  start [mode] Bot + ngrok starten, Endpoint umlenken
               mode: 'full' (Standard, mit Cloud-DB) oder 'dummy' (ohne DB)
  stop         ngrok + Bot beenden, Endpoint zurück auf App Service
  status       Was läuft gerade?
  logs         Live-Logs des lokalen Bots
  cloud-logs   Live-Logs vom Azure App Service

Typischer Ablauf:
  $0 setup           # einmalig
  $0 start           # vor jedem Test
  # ... im Azure-Portal-Webchat testen ...
  $0 stop            # nach dem Test

Pfade:
  Env-Datei:     $ENV_FILE
  Projekt-Dir:   $PROJECT_DIR
  Arbeits-Dir:   $WORK_DIR
EOF
}

# === Dispatch ===
cmd="${1:-help}"
shift || true
case "$cmd" in
  setup)       cmd_setup "$@" ;;
  start)       cmd_start "$@" ;;
  stop)        cmd_stop "$@" ;;
  status)      cmd_status "$@" ;;
  logs)        cmd_logs "$@" ;;
  cloud-logs)  cmd_cloud_logs "$@" ;;
  help|--help|-h) cmd_help ;;
  *)           err "Unbekannter Befehl: $cmd"; cmd_help; exit 1 ;;
esac
