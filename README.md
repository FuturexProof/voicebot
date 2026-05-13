# Sprachbot zur Benutzerregistrierung

**Advanced Topics in Cloud Computing — Sommersemester 2026**  
Technische Hochschule Brandenburg · Prof. Dr.-Ing. Florian Marquardt  
Bearbeiter: Martin Krüger

---

## Projektbeschreibung

Sprachgesteuerter Registrierungs-Assistent auf Basis von Microsoft Azure. Nutzer sprechen ihre Daten in ein Webchat-Interface; der Bot führt einen natürlichsprachlichen Dialog, validiert alle Eingaben und legt den Account in einer Azure SQL-Datenbank an.

**Live-URL:** https://voicebot-app-hans.azurewebsites.net

---

## Architektur-Überblick

```
┌─────────────────────────────────────────────────────────────────┐
│                        Azure App Service                        │
│  ┌─────────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │ public/         │   │  src/bot.js  │   │ src/admin/      │  │
│  │ index.html      │◄──│  (Router)    │   │ Dashboard, API  │  │
│  │ WebChat Widget  │   └──────┬───────┘   └─────────────────┘  │
│  └─────────────────┘          │                                 │
│                         ┌─────▼────────────────────────────┐    │
│                         │  src/dialogs/                    │    │
│                         │  registrationDialog.js (10 Schr.)│    │
│                         │  validators.js + normalize()     │    │
│                         └─────┬────────────────────────────┘    │
│                               │                                 │
│               ┌───────────────┼───────────────────┐            │
│               ▼               ▼                   ▼            │
│        secretsClient    cluRecognizer       userRepository      │
└───────────────┬───────────────┬───────────────────┬────────────┘
                │               │                   │
        ┌───────▼──┐    ┌───────▼────┐    ┌─────────▼──────┐
        │Key Vault │    │Azure CLU   │    │Azure SQL DB    │
        └──────────┘    └────────────┘    └────────────────┘
                │
        ┌───────▼──────────────────────┐
        │ DirectLineSecret, SpeechKey, │
        │ SqlConnectionString, ...     │
        └──────────────────────────────┘
```

Ausführliche Dokumentation: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)

---

## Verwendete Azure-Dienste

| Dienst | Ressource | Zweck |
|---|---|---|
| Azure App Service | voicebot-app-hans | Hosting (Node.js 22) |
| Azure Bot Service | voicebot-hans | Bot-Kanal, Auth |
| Azure Speech Services | voicebot-speech-hans | STT/TTS im Browser |
| Azure CLU | voicebot-lang-hans | Intent-Erkennung |
| Azure SQL Database | voicebotdb | Benutzerspeicherung |
| Azure Key Vault | kv-voicebot-hans | Secrets Management |
| User Assigned MI | voicebot-id | Passwortlose Auth |

---

## Schnellstart

### Voraussetzungen

- Node.js >= 22
- Azure CLI (`az login` mit TH-Brandenburg-Account)
- ngrok (für lokale Tests)

### Lokale Entwicklung

```bash
# Einmaliges Setup (SQL-Firewall, env-Datei, ngrok-Check)
./voicebot-local.sh setup

# Bot lokal starten + ngrok + Bot-Endpoint umlenken
./voicebot-local.sh start

# Nach dem Test aufräumen
./voicebot-local.sh stop
```

### Deployment

```bash
# Erstmalig (UAMI, Settings, Code-Patches)
./voicebot-deploy.sh fix-auth
./voicebot-deploy.sh deploy

# Folge-Deploys
./voicebot-deploy.sh deploy

# Kostensparung nach dem Testen
./voicebot-deploy.sh shutdown   # B1 → F1, App gestoppt
./voicebot-deploy.sh wakeup     # F1 → B1, App gestartet
```

Detaillierte Installationsanleitung: [docs/INSTALLATIONSANLEITUNG.md](docs/INSTALLATIONSANLEITUNG.md)

---

## Projektstruktur

```
voicebot/
├── index.js                      Einstiegspunkt (Server, Adapter, Routen)
├── package.json
├── public/
│   └── index.html                WebChat-Frontend
├── src/
│   ├── bot.js                    ActivityHandler, Intent-Routing
│   ├── admin/
│   │   ├── routes.js             Admin-API (users, export, stats)
│   │   └── dashboard.html        Admin-Dashboard
│   ├── dialogs/
│   │   ├── registrationDialog.js 10-Schritt-WaterfallDialog
│   │   └── validators.js         Validierung + normalize()
│   └── services/
│       ├── cluRecognizer.js      CLU-Client + Regel-Fallback
│       ├── secretsClient.js      Key Vault Secret-Loader
│       └── userRepository.js     MSSQL CRUD
├── voicebot-deploy.sh            Cloud-Deploy + Diagnose
├── voicebot-local.sh             Lokales Test-Setup
├── docs/
│   ├── ARCHITEKTUR.md            Architektur + Sequenzdiagramme
│   └── INSTALLATIONSANLEITUNG.md Schritt-für-Schritt Azure-Setup
└── .github/
    └── workflows/
        └── deploy.yml            CI/CD GitHub Actions
```

---

## CI/CD

Automatisches Deployment via GitHub Actions bei jedem Push auf `main`.  
Konfiguration: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

Benötigte GitHub Secrets:
- `AZURE_CREDENTIALS` — Service Principal JSON (siehe Installationsanleitung)

---

## Admin-Interface

Erreichbar unter `/admin` (HTTP Basic Auth).

| Endpunkt | Beschreibung |
|---|---|
| `/admin` | Dashboard mit Benutzerliste |
| `/admin/api/users?q=` | JSON-Suche |
| `/admin/api/export.json` | Vollexport JSON |
| `/admin/api/export.csv` | Vollexport CSV |
| `/admin/api/stats.pdf` | Statistik-PDF |

---

## Dialogfluss

```
Start → Vorname → Nachname → Geburtsdatum → E-Mail →
Telefon → Straße → PLZ → Stadt → Land → Bestätigung → Speichern
```

Jederzeit verfügbar: `abbrechen`, `hilfe`, `neu starten`

---

## Kosten

| Zustand | Kosten/Tag |
|---|---|
| Aktiv (B1) | ~0,60 € |
| Shutdown (F1) | ~0,17 € (nur SQL) |

---

## Meilensteine

| Datum | Meilenstein | Status |
|---|---|---|
| 04.05.2026 | Konzeptpapier, CLU-Modell, Azure-Ressourcen | ✅ |
| 08.06.2026 | Prototyp, Datenbankintegration, Zwischenpräsentation | 🔄 |
| 29.06.2026 | Vollständiger Bot, Dokumentation, Abschlusspräsentation | 🔄 |
