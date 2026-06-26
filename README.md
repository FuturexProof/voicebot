# Sprachbot zur Benutzerregistrierung

**Advanced Topics in Cloud Computing · Sommersemester 2026**  
Technische Hochschule Brandenburg · Prof. Dr.-Ing. Florian Marquardt  
Bearbeiter: MK

## Projektbeschreibung

Nutzer öffnen eine Webseite, klicken das Mikrofon an und sprechen ihre Registrierungsdaten ein. Der Bot fragt schrittweise nach, von Vorname und Nachname über das Geburtsdatum bis zum Land, validiert jede Eingabe und speichert den Account in einer Azure SQL-Datenbank. Tippfehler und Nachfragen sind eingebaut; wer eine ungültige E-Mail spricht, bekommt beim zweiten Fehler ein konkretes Format-Beispiel statt derselben Fehlermeldung.

Der gesamte Stack läuft auf Azure: Bot Framework v4, Azure CLU für die Intent-Erkennung, Speech Services für STT/TTS im Browser, Key Vault für alle Secrets. Kein einziger API-Key steht im Quellcode.

**Live-URL:** https://voicebot-app-hans.azurewebsites.net  
*(nach `./voicebot-deploy.sh wakeup`, Startup ca. 2 Min.)*

## Versionen & Versionswechsel

| Branch | Beschreibung | Tag |
|---|---|---|
| `main` | Stabile Basisversion | `v1.0-stable` |
| `v2-improvements` | Mehrsprachigkeit, adaptiver Dialog, UI-Redesign | (noch kein Tag) |

```bash
# Zur stabilen v1.0 wechseln
git checkout main && ./voicebot-deploy.sh deploy

# Zur v2 mit allen Verbesserungen wechseln
git checkout v2-improvements && ./voicebot-deploy.sh deploy
```

### Neu in v2

- **Mehrsprachigkeit (DE/EN):** Der Bot erkennt schon am ersten Satz, ob jemand Deutsch oder Englisch spricht. Im Header sitzt ein DE/EN-Umschalter. Ob jemand gesiezt oder geduzt werden möchte, leitet der Bot aus einem großgeschriebenen „Sie" ab.
- **Adaptiver Dialog:** Wer beim zweiten Versuch wieder etwas Ungültiges sagt, bekommt nicht dieselbe Meldung, sondern ein konkretes Format-Beispiel. Das läuft über `ctx.attemptCount` aus dem Bot Framework, ein eigener State-Counter ist nicht nötig.
- **UI-Redesign:** Dunkler Hintergrund, Card-Layout, Azure-Blau als Akzentfarbe, dazu ein animierter Status-Punkt und ein Lade-Spinner beim Verbindungsaufbau.
- **i18n-Modul:** Alle Bot-Texte liegen gebündelt in `src/i18n/messages.js`, jeweils als DE, DE-formal und EN. Ganz ohne externes Framework.

## Architektur-Überblick

Der Browser lädt das WebChat-Frontend (`public/index.html`) und spricht über Direct Line mit dem Bot. `src/bot.js` erkennt Sprache und Intent (Azure CLU, mit Regel-Fallback) und steuert den Waterfall-Dialog (9 Abfragefelder) unter `src/dialogs/`. Drei Service-Module kapseln die Azure-Anbindung:

- `secretsClient.js` – lädt alle Secrets passwortlos (UAMI) aus dem Key Vault
- `cluRecognizer.js` – ruft Azure CLU für die Intent-Erkennung auf
- `userRepository.js` – schreibt die fertige Registrierung in die Azure SQL-Datenbank

Das Admin-Dashboard unter `src/admin/` liest dieselbe Datenbank für Benutzerliste, Export und Statistik.

Ausführliche Dokumentation mit Sequenzdiagrammen: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)

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

## Projektstruktur

```
voicebot/
├── index.js                      Einstiegspunkt (Server, Adapter, Routen)
├── package.json
├── public/
│   └── index.html                WebChat-Frontend (v2: Redesign + Sprachumschalter)
├── src/
│   ├── bot.js                    ActivityHandler, Spracherkennung, Intent-Routing
│   ├── i18n/
│   │   └── messages.js           Alle UI-Texte (DE, DE-formal, EN)   ← neu in v2
│   ├── admin/
│   │   ├── routes.js             Admin-API (users, export, stats)
│   │   └── dashboard.html        Admin-Dashboard
│   ├── dialogs/
│   │   ├── registrationDialog.js WaterfallDialog, 9 Felder (v2: i18n, 2× ConfirmPrompt)
│   │   └── validators.js         Validierung + normalize() + adaptive Hints
│   └── services/
│       ├── cluRecognizer.js      CLU-Client + DE/EN Regel-Fallback
│       ├── secretsClient.js      Key Vault Secret-Loader
│       └── userRepository.js     MSSQL CRUD
├── voicebot-deploy.sh            Cloud-Deploy + Diagnose
├── voicebot-local.sh             Lokales Test-Setup
├── tools/
│   └── generate-projektdoku.js   Generator der Projektdokumentation (PDF)
├── docs/
│   ├── ARCHITEKTUR.md            Architektur + Sequenzdiagramme
│   ├── INSTALLATIONSANLEITUNG.md Schritt-für-Schritt Azure-Setup
│   ├── SLIDES.html               Abschlusspräsentation (11 Folien, Browser)
│   └── SPRECHERNOTIZEN.md        Sprechernotizen zur Präsentation
└── .github/
    └── workflows/
        └── deploy.yml            CI/CD GitHub Actions
```

## CI/CD

Automatisches Deployment via GitHub Actions bei jedem Push auf `main`.  
Konfiguration: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

Benötigte GitHub Secrets:
- `AZURE_CREDENTIALS`: Service Principal JSON (siehe Installationsanleitung)

## Admin-Interface

Erreichbar unter `/admin` (HTTP Basic Auth).

| Endpunkt | Beschreibung |
|---|---|
| `/admin` | Dashboard mit Benutzerliste |
| `/admin/api/users?q=` | JSON-Suche |
| `/admin/api/export.json` | Vollexport JSON |
| `/admin/api/export.csv` | Vollexport CSV |
| `/admin/api/stats.pdf` | Statistik-PDF |

## Dialogfluss

```
Start → Vorname → Nachname → Geburtsdatum → E-Mail →
Telefon → Straße → PLZ → Stadt → Land → Bestätigung → Speichern
```

Jederzeit verfügbar: `abbrechen`, `hilfe`, `neu starten`

## Kosten

| Zustand | Kosten/Tag |
|---|---|
| Aktiv (B1) | ~0,60 € |
| Shutdown (F1) | ~0,17 € (nur SQL) |

## Meilensteine

| Datum | Meilenstein | Status |
|---|---|---|
| 04.05.2026 | Konzeptpapier, CLU-Modell, Azure-Ressourcen | erledigt |
| 08.06.2026 | Prototyp, Datenbankintegration, Zwischenpräsentation | erledigt |
| 29.06.2026 | Vollständiger Bot, Dokumentation, Abschlusspräsentation | in Arbeit |
