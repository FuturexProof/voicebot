#!/usr/bin/env bash
# voicebot-deploy.sh — Robustes Deployment mit Diagnostik
#
# Subkommandos:
#   diagnose        Prüft Env, Azure-Login, App-Status, UAMI, KV-Refs, Code
#   fix-auth        Setzt UAMI / keyVaultReferenceIdentity / Settings korrekt
#   reset           F1→B1, Restart (für F1-Crash-Loop-Blockaden)
#   deploy          Pre-Flight + Build + Deploy (mit Retry + Health-Check)
#   fix-and-deploy  fix-auth → deploy in einem Rutsch
#   logs [N]        N (Standard 100) gefilterte Cloud-Log-Zeilen
#   help            Diese Hilfe

set -uo pipefail

# === Konfiguration ===
ENV_FILE="$HOME/voicebot-env.sh"
PROJECT_DIR="$HOME/Projects/voicebot"
DEPLOY_ZIP="deploy.zip"

# === Farben ===
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
info() { echo -e "${B}==>${N} $*"; }
ok()   { echo -e "${G}✓${N}  $*"; }
warn() { echo -e "${Y}⚠${N}  $*"; }
err()  { echo -e "${R}✗${N}  $*" >&2; }

# === Auto-Source der env-Datei ===
if [ ! -f "$ENV_FILE" ]; then
  err "Env-Datei $ENV_FILE fehlt — bitte zuerst voicebot-local.sh setup ausführen"
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

# === Validate ===
need_az() {
  if ! az account show >/dev/null 2>&1; then
    err "Nicht in Azure eingeloggt — bitte: az login"
    exit 1
  fi
}

check_vars() {
  local missing=0
  for v in DEIN_NAME PROJECT LOCATION RG APP_NAME PLAN_NAME \
           SQL_SERVER SQL_DB SQL_ADMIN SPEECH_NAME LANG_NAME \
           KV_NAME UAMI_NAME BOT_NAME APP_URL \
           SUB_ID UAMI_CLIENT_ID UAMI_RESOURCE_ID; do
    if [ -z "${!v:-}" ]; then
      err "Variable \$$v ist leer"
      missing=$((missing + 1))
    fi
  done
  if [ $missing -gt 0 ]; then
    err "$missing Variable(n) fehlen — env-Datei prüfen"
    return 1
  fi
}

# =============================================================
#  diagnose — komplette Diagnostik ohne Veränderung
# =============================================================
cmd_diagnose() {
  info "1/8 — Env-Variablen"
  if check_vars; then ok "Alle 17 Variablen gesetzt"; else return 1; fi

  info "2/8 — Azure-Login"
  if az account show >/dev/null 2>&1; then
    ok "Eingeloggt als $(az account show --query user.name -o tsv)"
    ok "Subscription: $(az account show --query name -o tsv)"
  else
    err "Nicht eingeloggt"; return 1
  fi

  info "3/8 — Resource Group & Plan"
  if az group show -n "$RG" --query name -o tsv >/dev/null 2>&1; then
    ok "Resource Group: $RG"
  else
    err "RG $RG nicht gefunden"; return 1
  fi
  local sku
  sku=$(az appservice plan show -g "$RG" -n "$PLAN_NAME" --query sku.name -o tsv 2>/dev/null)
  if [ "$sku" = "F1" ]; then
    warn "Plan-SKU: $sku — F1 blockiert nach Crash-Loops für 1min, daily-CPU-Limit"
    warn "Empfehlung: $0 reset → skaliert auf B1 hoch"
  else
    ok "Plan-SKU: $sku"
  fi

  info "4/8 — App Service"
  local state
  state=$(az webapp show -g "$RG" -n "$APP_NAME" --query state -o tsv 2>/dev/null)
  if [ "$state" = "Running" ]; then ok "State: Running"
  else warn "State: $state (sollte Running sein)"
  fi

  info "5/8 — UAMI-Zuweisung"
  local mi_type uami_keys
  mi_type=$(az webapp identity show -g "$RG" -n "$APP_NAME" --query type -o tsv 2>/dev/null)
  uami_keys=$(az webapp identity show -g "$RG" -n "$APP_NAME" \
    --query "userAssignedIdentities" -o json 2>/dev/null)
  if echo "$uami_keys" | grep -qi "$UAMI_NAME"; then
    ok "UAMI '$UAMI_NAME' ist zugewiesen ($mi_type)"
  else
    err "UAMI '$UAMI_NAME' NICHT zugewiesen — fix-auth nötig"
    echo "    Aktuell: $uami_keys"
  fi

  info "6/8 — keyVaultReferenceIdentity"
  local kv_ref
  kv_ref=$(az webapp show -g "$RG" -n "$APP_NAME" \
    --query keyVaultReferenceIdentity -o tsv 2>/dev/null)
  if [ "$kv_ref" = "$UAMI_RESOURCE_ID" ]; then
    ok "keyVaultReferenceIdentity korrekt auf UAMI gesetzt"
  else
    err "keyVaultReferenceIdentity ist '$kv_ref'"
    err "  Sollte sein: $UAMI_RESOURCE_ID"
  fi

  info "7/8 — Wichtige App Settings"
  local settings
  settings=$(az webapp config appsettings list -g "$RG" -n "$APP_NAME" -o json 2>/dev/null)
  for key in SCM_DO_BUILD_DURING_DEPLOYMENT UAMI_CLIENT_ID KV_NAME \
             MicrosoftAppType MicrosoftAppId MicrosoftAppTenantId; do
    local val
    val=$(echo "$settings" | jq -r ".[] | select(.name==\"$key\") | .value" 2>/dev/null)
    if [ -z "$val" ] || [ "$val" = "null" ]; then
      err "$key NICHT gesetzt"
    elif [[ "$val" == "@Microsoft.KeyVault"* ]]; then
      # KV-Reference — prüfen ob aufgelöst
      local ref
      ref=$(az webapp config appsettings list -g "$RG" -n "$APP_NAME" \
        --query "[?name=='$key'] | [0]" -o json 2>/dev/null)
      ok "$key = KV-Reference (Resolution beim Start)"
    else
      ok "$key = ${val:0:40}$([ ${#val} -gt 40 ] && echo '...')"
    fi
  done

  info "8/8 — Code-Konfiguration"
  if [ ! -d "$PROJECT_DIR" ]; then
    err "Projekt-Dir $PROJECT_DIR fehlt"; return 1
  fi
  cd "$PROJECT_DIR" || return 1

  if grep -q "managedIdentityClientId" src/services/secretsClient.js 2>/dev/null; then
    ok "secretsClient.js: DefaultAzureCredential mit managedIdentityClientId"
  else
    err "secretsClient.js: managedIdentityClientId FEHLT → muss gepatcht werden"
  fi

  if grep -q "managedIdentityClientId" index.js 2>/dev/null; then
    ok "index.js: DefaultAzureCredential mit managedIdentityClientId"
  else
    warn "index.js: managedIdentityClientId FEHLT (für DirectLine-Endpoint)"
  fi

  if grep -q '"dotenv"' package.json 2>/dev/null; then
    ok "package.json: dotenv in dependencies"
  else
    err "package.json: dotenv FEHLT"
  fi

  echo ""
  info "Diagnose fertig"
}

# =============================================================
#  fix-auth — UAMI / KV-Ref / Settings korrekt setzen
# =============================================================
cmd_fix_auth() {
  need_az
  check_vars || return 1

  info "1/5 — UAMI dem App Service zuweisen"
  az webapp identity assign -g "$RG" -n "$APP_NAME" \
    --identities "$UAMI_RESOURCE_ID" >/dev/null
  ok "UAMI zugewiesen: $UAMI_RESOURCE_ID"

  info "2/5 — keyVaultReferenceIdentity setzen"
  local app_id
  app_id=$(az webapp show -g "$RG" -n "$APP_NAME" --query id -o tsv)
  az resource update --ids "$app_id" \
    --set properties.keyVaultReferenceIdentity="$UAMI_RESOURCE_ID" >/dev/null
  ok "keyVaultReferenceIdentity = UAMI"

  info "3/5 — Pflicht-App-Settings"
  az webapp config appsettings set -g "$RG" -n "$APP_NAME" \
    --settings \
      SCM_DO_BUILD_DURING_DEPLOYMENT=true \
      UAMI_CLIENT_ID="$UAMI_CLIENT_ID" \
      KV_NAME="$KV_NAME" \
      WEBSITES_PORT=8080 \
      WEBSITE_NODE_DEFAULT_VERSION="~22" \
    >/dev/null
  ok "SCM_BUILD, UAMI_CLIENT_ID, KV_NAME, WEBSITES_PORT, NODE_VERSION gesetzt"

  info "4/5 — Code-Check secretsClient.js"
  cd "$PROJECT_DIR" || return 1
  if ! grep -q "managedIdentityClientId" src/services/secretsClient.js; then
    warn "secretsClient.js übergibt keine UAMI Client-ID — patche..."
    # Idempotent patch: replace `new DefaultAzureCredential()` with proper version
    #sed -i 's|new DefaultAzureCredential()|new DefaultAzureCredential({ managedIdentityClientId: process.env.UAMI_CLIENT_ID || process.env.MicrosoftAppId })|g' \
    #  src/services/secretsClient.js
    sed -i 's#new DefaultAzureCredential()#new DefaultAzureCredential({ managedIdentityClientId: process.env.UAMI_CLIENT_ID || process.env.MicrosoftAppId })#g' \
  src/services/secretsClient.js
    ok "secretsClient.js gepatcht"
  else
    ok "secretsClient.js bereits korrekt"
  fi

  info "5/5 — Code-Check index.js"
  if ! grep -q "managedIdentityClientId" index.js; then
    warn "index.js: kein managedIdentityClientId — patche..."
#    sed -i 's|new DefaultAzureCredential()|new DefaultAzureCredential({ managedIdentityClientId: process.env.UAMI_CLIENT_ID || process.env.MicrosoftAppId })|g' \
#      index.js
    sed -i 's#new DefaultAzureCredential()#new DefaultAzureCredential({ managedIdentityClientId: process.env.UAMI_CLIENT_ID || process.env.MicrosoftAppId })#g' \
  index.js
    ok "index.js gepatcht"
  else
    ok "index.js bereits korrekt"
  fi

  echo ""
  ok "Auth-Konfiguration komplett. Nächster Schritt: $0 deploy"
}

# =============================================================
#  reset — F1 → B1 (löst Crash-Loop-Blockaden + CPU-Quota)
# =============================================================
cmd_reset() {
  need_az
  check_vars || return 1

  info "Prüfe Plan-SKU"
  local sku
  sku=$(az appservice plan show -g "$RG" -n "$PLAN_NAME" --query sku.name -o tsv)
  echo "  Aktuell: $sku"

  if [ "$sku" = "F1" ]; then
    info "Skaliere F1 → B1"
    warn "Kosten: ~13€/Monat anteilig, für 2-3 Tage ~1-2€"
    warn "Vor Endabgabe zurück: az appservice plan update -g \$RG -n \$PLAN_NAME --sku F1"
    az appservice plan update -g "$RG" -n "$PLAN_NAME" --sku B1
    ok "Plan ist jetzt B1 (Always-On verfügbar, keine Daily-CPU-Quota, keine Cold-Start-Blockaden)"
  else
    ok "Plan bereits $sku (kein Reset nötig)"
  fi

  info "App restart"
  az webapp restart -g "$RG" -n "$APP_NAME" >/dev/null
  ok "Restart angestoßen"

  info "Warte 30s bis State auf Running stabil ist..."
  sleep 30

  local state
  state=$(az webapp show -g "$RG" -n "$APP_NAME" --query state -o tsv)
  echo "  State: $state"
}

# =============================================================
#  deploy — Pre-Flight + Build + Deploy mit Retry + Health-Check
# =============================================================
cmd_deploy() {
  need_az
  check_vars || return 1

  info "1/5 — Pre-Flight"
  local state sku
  state=$(az webapp show -g "$RG" -n "$APP_NAME" --query state -o tsv)
  sku=$(az appservice plan show -g "$RG" -n "$PLAN_NAME" --query sku.name -o tsv)
  echo "  Plan-SKU: $sku"
  echo "  App-State: $state"

  if [ "$state" != "Running" ]; then
    warn "App ist '$state' — starte"
    az webapp start -g "$RG" -n "$APP_NAME" >/dev/null
    sleep 15
  fi

  if [ "$sku" = "F1" ]; then
    warn "Plan ist F1 — Crash-Loops können den Site blockieren."
    warn "Empfehlung: $0 reset (B1) für stabile Iteration"
  fi

  info "2/5 — Erstelle deploy.zip"
  if [ ! -d "$PROJECT_DIR" ]; then
    err "Projekt-Dir $PROJECT_DIR fehlt"; return 1
  fi
  cd "$PROJECT_DIR" || return 1
  rm -f "$DEPLOY_ZIP"
  zip -rq "$DEPLOY_ZIP" . \
    -x "node_modules/*" ".git/*" ".env*" "*.log" "$DEPLOY_ZIP" \
       "voicebot-local.sh" "voicebot-deploy.sh" "skript.sh" \
       ".voicebot/*" "tmp/*" ".vscode/*"
  local size
  size=$(ls -lh "$DEPLOY_ZIP" | awk '{print $5}')
  ok "Zip erstellt: $size"

  info "3/5 — Azure-Deployment (mit Retry)"
  local attempt=1 max=3
  while [ $attempt -le $max ]; do
    echo "  Versuch $attempt/$max..."
    if az webapp deploy \
        -g "$RG" -n "$APP_NAME" \
        --src-path "$DEPLOY_ZIP" --type zip \
        --timeout 900 2>&1 | tail -20; then
      ok "Deploy übermittelt"
      break
    fi
    err "Deploy-Versuch $attempt fehlgeschlagen"
    if [ $attempt -lt $max ]; then
      warn "Warte 60s, dann Retry..."
      sleep 60
      # Vor Retry: App-State prüfen
      local cur_state
      cur_state=$(az webapp show -g "$RG" -n "$APP_NAME" --query state -o tsv 2>/dev/null)
      if [ "$cur_state" != "Running" ]; then
        warn "App ist '$cur_state' — neustart vor Retry"
        az webapp start -g "$RG" -n "$APP_NAME" >/dev/null
        sleep 15
      fi
    fi
    attempt=$((attempt + 1))
  done
  if [ $attempt -gt $max ]; then
    err "Deploy nach $max Versuchen fehlgeschlagen"
    err "Vermutliche Ursachen: F1-Block, Site-Disabled, Network-Timeout"
    err "Empfehlung: $0 reset, dann $0 deploy"
    return 1
  fi

  info "4/5 — Health-Check"
  echo "  Warte auf Startup..."
  local i http_code success=0
  for i in {1..30}; do
    sleep 10
    http_code=$(curl -sI "$APP_URL/api/messages" -o /dev/null -w "%{http_code}" \
      --max-time 10 2>/dev/null)
    case "$http_code" in
      401|405)
        ok "App antwortet (HTTP $http_code = Bot Endpoint OK, Auth wird vom Bot Framework geprüft)"
        success=1; break ;;
      200)
        ok "App antwortet (HTTP 200)"
        success=1; break ;;
      503)
        echo "  $i/30: 503 — App startet noch..."
        ;;
      *)
        echo "  $i/30: HTTP $http_code"
        ;;
    esac
  done
  if [ $success -eq 0 ]; then
    err "App reagiert auch nach 5 Min nicht — Logs prüfen"
  fi

  info "5/5 — Letzte Logs (gefiltert)"
  cmd_logs 30
}

# =============================================================
#  logs — gefilterte Cloud-Logs
# =============================================================
cmd_logs() {
  need_az
  check_vars || return 1

  local lines="${1:-100}"
  info "Cloud-Logs (gefiltert nach Node-Output, $lines Zeilen)"

  # az webapp log tail liefert kontinuierlich, wir limitieren via timeout
  timeout 60 az webapp log tail -g "$RG" -n "$APP_NAME" 2>&1 | \
    grep -E "Bot läuft|Error|CredentialUnavailable|MODULE_NOT_FOUND|Cannot find|throw|^\s+at /home|node:internal|Container has finished|exit code|deprecate" | \
    grep -v "DEP011[15]\|DEP0040\|Container start method\|named pipe\|Nested mountpoint" | \
    head -"$lines"

  echo ""
  info "Für Live-Stream: az webapp log tail -g \$RG -n \$APP_NAME"
}

# =============================================================
#  shutdown — B1 → F1 + App stoppen (Kostensparung)
# =============================================================
cmd_shutdown() {
  need_az
  check_vars || return 1

  info "1/2 — Skaliere App Service Plan auf F1 (kostenfrei)"
  az appservice plan update -g "$RG" -n "$PLAN_NAME" --sku F1 >/dev/null
  ok "Plan ist jetzt F1 — keine Plankosten mehr (~0 €/Tag)"

  info "2/2 — Stoppe App Service"
  az webapp stop -g "$RG" -n "$APP_NAME" >/dev/null
  ok "App gestoppt"

  echo ""
  warn "Speech- und Language-Dienste sind pay-per-use und verursachen keine Standby-Kosten."
  ok "Kostensparung aktiv. Neustart mit: $0 wakeup"
}

# =============================================================
#  wakeup — F1 → B1 + App starten + Health-Check
# =============================================================
cmd_wakeup() {
  need_az
  check_vars || return 1

  info "1/3 — Skaliere App Service Plan auf B1"
  az appservice plan update -g "$RG" -n "$PLAN_NAME" --sku B1 >/dev/null
  ok "Plan ist jetzt B1"

  info "2/3 — Starte App Service"
  az webapp start -g "$RG" -n "$APP_NAME" >/dev/null
  ok "App-Start angestoßen"

  info "3/3 — Health-Check (max. 3 Min)"
  local i http_code success=0
  for i in {1..18}; do
    sleep 10
    http_code=$(curl -sI "$APP_URL/api/messages" -o /dev/null -w "%{http_code}" \
      --max-time 10 2>/dev/null)
    case "$http_code" in
      401|405|200)
        ok "App läuft (HTTP $http_code)"
        success=1; break ;;
      503) echo "  $i/18: noch am Starten..." ;;
      *)   echo "  $i/18: HTTP $http_code" ;;
    esac
  done
  if [ $success -eq 0 ]; then
    err "App reagiert nicht — Logs prüfen: $0 logs"
    return 1
  fi
  echo ""
  ok "Bot erreichbar unter: $APP_URL"
}

# =============================================================
#  help
# =============================================================
cmd_help() {
  cat <<EOF
voicebot-deploy.sh — Robustes Deployment mit Diagnostik

Subkommandos:
  diagnose         Prüft Env, Azure, App, UAMI, KV-Refs, Code-Konfiguration
  fix-auth         Setzt UAMI / keyVaultReferenceIdentity / Settings korrekt
                   und patcht Code (DefaultAzureCredential mit Client-ID)
  reset            Plan F1 → B1, App-Restart (löst Crash-Loop-Blockaden)
  deploy           Pre-Flight + Build + Deploy (Retry, Health-Check)
  fix-and-deploy   fix-auth → deploy in einem Rutsch
  logs [N]         Gefilterte Cloud-Logs (Standard 100 Zeilen)
  shutdown         App stoppen + Plan auf F1 skalieren (0€/Tag)
  wakeup           Plan auf B1 + App starten + Health-Check
  help             Diese Hilfe

═════════════════════════════════════════════════════════════
EMPFOHLENER ABLAUF — beim ersten Mal:
  $0 reset          # F1 → B1 (falls noch nicht passiert)
  $0 fix-auth       # UAMI + Settings + Code-Patches
  $0 deploy         # Code in die Cloud
  $0 logs           # Status prüfen

  Erwartete Erfolgsmeldung in Logs: "Bot läuft auf Port 8080"

═════════════════════════════════════════════════════════════
SCHNELLPFAD (für Folge-Deploys):
  $0 fix-and-deploy

═════════════════════════════════════════════════════════════
KOSTEN SPAREN (nach dem Testen):
  $0 shutdown       # B1 → F1, App gestoppt  (~0 €/Tag)
  $0 wakeup         # F1 → B1, App gestartet (~0.43 €/Tag)

═════════════════════════════════════════════════════════════
WENN ETWAS NICHT KLAPPT:
  $0 diagnose       # zeigt alles auf einen Blick
EOF
}

# === Dispatch ===
cmd="${1:-help}"
shift || true
case "$cmd" in
  diagnose)       cmd_diagnose "$@" ;;
  fix-auth)       cmd_fix_auth "$@" ;;
  reset)          cmd_reset "$@" ;;
  deploy)         cmd_deploy "$@" ;;
  fix-and-deploy) cmd_fix_auth "$@" && cmd_deploy "$@" ;;
  logs)           cmd_logs "$@" ;;
  shutdown)       cmd_shutdown "$@" ;;
  wakeup)         cmd_wakeup "$@" ;;
  help|--help|-h) cmd_help ;;
  *)              err "Unbekannter Befehl: $cmd"; cmd_help; exit 1 ;;
esac
