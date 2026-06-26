#!/usr/bin/env node
/*
 * Generator fuer die Projektdokumentation (PDF).
 *
 * Liest die echten Projektdateien ein und baut daraus ein einzelnes PDF,
 * aus dem sich das Projekt vollstaendig nachbauen laesst: Ueberblick,
 * Architektur, Azure-Aufbau (eingebettete Installationsanleitung),
 * vollstaendige Quellcode-Listings, Deployment und Projektstruktur.
 *
 * Aufruf:  node tools/generate-projektdoku.js
 * Ausgabe: docs/Projektdokumentation-MK-SS2026.pdf
 *
 * Einzige Abhaengigkeit: pdfkit (bereits im Projekt). DejaVu-TTF fuer
 * volle Unicode-Abdeckung (Umlaute, Pfeile, Box-Zeichen, Euro).
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FONTDIR = '/usr/share/fonts/truetype/dejavu';
const OUT = path.join(ROOT, 'docs', 'Projektdokumentation-MK-SS2026.pdf');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+$/, '');

const ACCENT = '#0a558c';   // Azure-Blau
const INK    = '#1b1b1b';
const MUTED  = '#666666';
const CODEBG = '#f3f4f6';

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 64, bottom: 64, left: 62, right: 62 },
  bufferPages: true,
  info: {
    Title: 'Projektdokumentation - Voicebot zur Benutzerregistrierung',
    Author: 'Martin Krueger',
    Subject: 'Advanced Topics in Cloud Computing, SS 2026, TH Brandenburg'
  }
});
doc.registerFont('body',  `${FONTDIR}/DejaVuSans.ttf`);
doc.registerFont('bold',  `${FONTDIR}/DejaVuSans-Bold.ttf`);
doc.registerFont('mono',  `${FONTDIR}/DejaVuSansMono.ttf`);
doc.registerFont('monob', `${FONTDIR}/DejaVuSansMono-Bold.ttf`);
doc.pipe(fs.createWriteStream(OUT));

const M = doc.page.margins;
const CW = doc.page.width - M.left - M.right;          // content width
const BOTTOM = () => doc.page.height - M.bottom;
const AVAIL = () => BOTTOM() - doc.y;
const leftReset = () => { doc.x = M.left; };

let chapterNo = 0;

function ensure(space) {
  if (AVAIL() < space) doc.addPage();
}

function h1(text) {
  doc.addPage();
  chapterNo += 1;
  leftReset();
  doc.font('bold').fontSize(20).fillColor(ACCENT)
     .text(`${chapterNo}.  ${text}`, { width: CW });
  const y = doc.y + 4;
  doc.save().moveTo(M.left, y).lineTo(M.left + CW, y)
     .lineWidth(1.2).strokeColor(ACCENT).stroke().restore();
  doc.y = y + 12;
  leftReset();
}

function h2(text) {
  ensure(60);
  doc.moveDown(0.5);
  leftReset();
  doc.font('bold').fontSize(13.5).fillColor(INK).text(text, { width: CW });
  doc.moveDown(0.25);
  leftReset();
}

function h3(text) {
  ensure(46);
  doc.moveDown(0.3);
  leftReset();
  doc.font('bold').fontSize(11).fillColor(ACCENT).text(text, { width: CW });
  doc.moveDown(0.15);
  leftReset();
}

function para(text) {
  leftReset();
  doc.font('body').fontSize(10.5).fillColor(INK)
     .text(text, { width: CW, align: 'justify', lineGap: 1.5 });
  doc.moveDown(0.5);
}

function bullet(text) {
  leftReset();
  doc.font('body').fontSize(10.5).fillColor(INK)
     .text(text, { width: CW, lineGap: 1.5, indent: 12,
                   bulletRadius: 1.6, listType: 'bullet' });
}
function bullets(items) {
  leftReset();
  doc.font('body').fontSize(10.5).fillColor(INK);
  doc.list(items, { width: CW, lineGap: 1.5, bulletIndent: 4,
                    textIndent: 12, bulletRadius: 1.6 });
  doc.moveDown(0.5);
}

function codeBlock(str) {
  const size = 8.3, gap = 1.4, padX = 8, padY = 7;
  const innerW = CW - 2 * padX;
  doc.font('mono').fontSize(size);
  const textH = doc.heightOfString(str, { width: innerW, lineGap: gap });
  const boxH = textH + 2 * padY;
  const fullPage = doc.page.height - M.top - M.bottom;

  if (boxH <= AVAIL()) {
    drawBoxed(str, boxH, size, gap, padX, padY, innerW);
  } else if (boxH <= fullPage) {
    doc.addPage();
    drawBoxed(str, boxH, size, gap, padX, padY, innerW);
  } else {
    // Block laeuft ueber mehrere Seiten: ohne Hintergrund fliessen lassen
    leftReset();
    doc.font('mono').fontSize(size).fillColor(INK)
       .text(str, M.left + padX, doc.y, { width: innerW, lineGap: gap });
    doc.moveDown(0.6);
  }
  leftReset();
}

function drawBoxed(str, boxH, size, gap, padX, padY, innerW) {
  const x = M.left, y = doc.y;
  doc.save().rect(x, y, CW, boxH).fill(CODEBG).restore();
  doc.font('mono').fontSize(size).fillColor(INK)
     .text(str, x + padX, y + padY, { width: innerW, lineGap: gap });
  doc.y = y + boxH;
  doc.moveDown(0.6);
}

// Embeds a source file as a labelled code listing.
function fileListing(rel) {
  h3(rel);
  codeBlock(read(rel));
}

// Minimal Markdown renderer for the embedded guides.
function renderMarkdown(md, { skipFirstH1 = true } = {}) {
  const lines = md.split('\n');
  let i = 0;
  let firstH1seen = false;
  while (i < lines.length) {
    let line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      if (buf.length) codeBlock(buf.join('\n'));
      continue;
    }
    // Table block (consecutive lines starting with |)
    if (/^\s*\|/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) buf.push(lines[i].trim());
        i++;
      }
      if (buf.length) codeBlock(buf.join('\n'));
      continue;
    }
    // Headings
    let m;
    if ((m = line.match(/^#\s+(.*)/))) {
      if (skipFirstH1 && !firstH1seen) { firstH1seen = true; i++; continue; }
      h2(clean(m[1])); i++; continue;
    }
    if ((m = line.match(/^##\s+(.*)/)))  { h2(clean(m[1])); i++; continue; }
    if ((m = line.match(/^###\s+(.*)/))) { h3(clean(m[1])); i++; continue; }
    // Horizontal rule
    if (/^---+\s*$/.test(line)) { doc.moveDown(0.3); i++; continue; }
    // Bullet
    if ((m = line.match(/^\s*[-*]\s+(.*)/))) {
      const items = [];
      while (i < lines.length && (m = lines[i].match(/^\s*[-*]\s+(.*)/))) {
        items.push(clean(m[1])); i++;
      }
      bullets(items);
      continue;
    }
    // Numbered list -> render as paragraph lines
    if ((m = line.match(/^\s*\d+\.\s+(.*)/))) {
      const items = [];
      while (i < lines.length && (m = lines[i].match(/^\s*(\d+\.\s+.*)/))) {
        items.push(clean(m[1])); i++;
      }
      leftReset();
      doc.font('body').fontSize(10.5).fillColor(INK);
      items.forEach(it => doc.text(it, { width: CW, lineGap: 1.5, indent: 8 }));
      doc.moveDown(0.5);
      continue;
    }
    // Blank
    if (/^\s*$/.test(line)) { i++; continue; }
    // Paragraph (gather until blank)
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !/^(#{1,3}\s|```|\s*[-*]\s|\s*\|)/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    para(clean(buf.join(' ')));
  }
}

function clean(s) {
  return s.replace(/\*\*/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/* ===================== TITELSEITE ===================== */
doc.font('bold').fontSize(11).fillColor(MUTED)
   .text('Advanced Topics in Cloud Computing', { align: 'center' });
doc.font('body').fontSize(10).fillColor(MUTED)
   .text('Technische Hochschule Brandenburg  ·  Sommersemester 2026', { align: 'center' });
doc.moveDown(6);
doc.font('bold').fontSize(28).fillColor(ACCENT)
   .text('Projektdokumentation', { align: 'center' });
doc.moveDown(0.4);
doc.font('bold').fontSize(17).fillColor(INK)
   .text('Sprachbot zur Benutzerregistrierung', { align: 'center' });
doc.moveDown(0.6);
doc.font('body').fontSize(11).fillColor(MUTED)
   .text('Azure-basierter Voicebot mit Bot Framework v4, CLU,', { align: 'center' })
   .text('Speech Services, Key Vault und Azure SQL', { align: 'center' });
doc.moveDown(8);
doc.font('body').fontSize(12).fillColor(INK)
   .text('Martin Krueger', { align: 'center' });
doc.font('body').fontSize(10).fillColor(MUTED)
   .text('Prof. Dr.-Ing. Florian Marquardt', { align: 'center' });
doc.moveDown(2);
doc.font('body').fontSize(9.5).fillColor(MUTED)
   .text('Reproduzierbare Gesamtdokumentation – Stand der v2-Abgabe', { align: 'center' });
doc.font('mono').fontSize(8).fillColor(MUTED)
   .text('automatisch generiert via tools/generate-projektdoku.js', { align: 'center' });

/* ===================== 1. UEBERBLICK ===================== */
h1('Projektueberblick');
para('Der Voicebot ist ein sprachgesteuerter Registrierungs-Assistent. Nutzer oeffnen eine Webseite, aktivieren das Mikrofon und sprechen ihre Registrierungsdaten ein. Der Bot fuehrt schrittweise durch die Erfassung von Vorname und Nachname ueber Geburtsdatum, Kontakt- und Adressdaten bis zum Land, validiert jede Eingabe und legt den Account in einer Azure SQL-Datenbank an. Der gesamte Stack laeuft in Azure; kein einziger API-Schluessel steht im Quellcode, alle Geheimnisse kommen zur Laufzeit aus dem Key Vault.');
h2('Eckdaten');
bullets([
  'Aufgabe: Sprachbot zur Benutzerregistrierung mit Azure-Diensten (Einzelarbeit).',
  'Runtime: Node.js 22 mit Microsoft Bot Framework v4 (botbuilder 4.23).',
  'NLU: Azure Conversational Language Understanding (CLU) mit regelbasiertem Fallback.',
  'Sprache/Audio: Azure Speech Services (STT/TTS) im Browser via WebChat.',
  'Daten: Azure SQL Database (mssql, parametrisierte Queries).',
  'Secrets: Azure Key Vault, passwortlose Auth via User Assigned Managed Identity.',
  'Betrieb: Azure App Service (Linux, B1), CI/CD via GitHub Actions.',
  'v2-Erweiterungen: Mehrsprachigkeit DE/EN, adaptiver Dialog, UI-Redesign.'
]);
h2('Erfuellte Aufgabenanforderungen');
bullets([
  'Natuerlichsprachliche Dialogfuehrung mit Nachfragen bei unklaren Eingaben.',
  'Vollstaendige Erfassung von persoenlichen Daten, Kontakt- und Adressdaten (keine Passwoerter).',
  'Validierung auf Format und Plausibilitaet, Fehlertoleranz mit adaptiven Hinweisen.',
  'Speicherung in Azure SQL mit UNIQUE-Constraint gegen Doppelregistrierung.',
  'Admin-Dashboard mit Suche sowie Export als JSON, CSV und Statistik-PDF.',
  'Klare Trennung von Dialogmanagement, Geschaeftslogik und Datenzugriff.',
  'CI/CD-Pipeline, technische Dokumentation und Installationsanleitung.'
]);

/* ===================== 2. ARCHITEKTUR & STACK ===================== */
h1('Architektur und Technologie-Stack');
para('Das System besteht aus sieben eigenstaendigen Komponenten, die ueber definierte Schnittstellen kommunizieren. Bewusst wurde auf schwere Frameworks verzichtet; Restify genuegt fuer einen Bot-Backend-Prozess und haelt die Abhaengigkeiten klein. Die Schichten sind getrennt: das Frontend liefert Audio und WebChat, bot.js uebernimmt Routing und Spracherkennung, der Dialog steuert den Ablauf, und die Services kapseln Key Vault, CLU und die Datenbank.');
h2('Komponenten');
bullets([
  'public/index.html: WebChat-Frontend, laedt Direct-Line- und Speech-Token, DE/EN-Umschalter.',
  'index.js: Restify-Server, registriert alle HTTP-Routen und initialisiert den Bot-Adapter.',
  'src/bot.js: ActivityHandler, Sprach- und Tonerkennung, normalize(), CLU-Intent-Routing.',
  'src/dialogs/registrationDialog.js: WaterfallDialog mit neun Abfragefeldern und typisierten Prompts.',
  'src/dialogs/validators.js: Validierung, normalize() und adaptive Hinweise via attemptCount.',
  'src/i18n/messages.js: alle Bot-Texte in DE, DE-formal und EN an einem Ort.',
  'src/services/cluRecognizer.js: CLU-Client mit DE/EN-Regel-Fallback.',
  'src/services/secretsClient.js: Key-Vault-Loader (DefaultAzureCredential mit UAMI-Client-ID).',
  'src/services/userRepository.js: MSSQL-Zugriff mit parametrisierten Queries.',
  'src/admin/routes.js: Admin-API fuer Liste, Export und Statistik-PDF.'
]);
h2('Anfragefluss (Registrierung)');
bullets([
  'Browser nimmt Sprache auf und sendet die Activity ueber Direct Line an den Bot Service.',
  'Bot Service ruft POST /api/messages am App Service auf.',
  'bot.js normalisiert den Text und fragt CLU nach dem Intent.',
  'Bei register_start startet der WaterfallDialog und fragt Feld fuer Feld ab.',
  'Jede Antwort wird validiert; bei Fehlern erscheint ein gezielter Hinweis.',
  'Nach Bestaetigung schreibt userRepository.insert() den Datensatz in Azure SQL.'
]);
h2('Technologie-Stack');
bullets([
  'Webserver: Restify 11 (offiziell in den Bot-Framework-Samples verwendet).',
  'Dialog-Engine: botbuilder-dialogs (WaterfallDialog, TextPrompt, DateTimePrompt, ConfirmPrompt).',
  'Auth: @azure/identity, DefaultAzureCredential mit managedIdentityClientId.',
  'Secrets: @azure/keyvault-secrets (SecretClient).',
  'Datenbank: mssql 12 gegen Azure SQL, TLS-Pflicht.',
  'PDF-Export: pdfkit. i18n: eigenes Modul ohne externes Framework.',
  'Frontend: Vanilla HTML/CSS/JS plus Bot Framework WebChat (CDN).'
]);

/* ===================== 3. AZURE-INFRASTRUKTUR ===================== */
h1('Azure-Infrastruktur und Erstaufbau');
para('Das folgende Kapitel ist die vollstaendige Installationsanleitung. Es beschreibt den Aufbau der Azure-Umgebung von Grund auf und das erstmalige Deployment. Die Reihenfolge der Schritte ist relevant (die UAMI muss vor dem Key Vault existieren, da ihre Principal-ID fuer die RBAC-Zuweisung gebraucht wird).');
renderMarkdown(read('docs/INSTALLATIONSANLEITUNG.md'));

/* ===================== 4. QUELLCODE ===================== */
h1('Vollstaendiger Quellcode');
para('Dieses Kapitel enthaelt alle Projektdateien im Wortlaut. Zusammen mit dem Infrastruktur-Kapitel laesst sich das Projekt daraus vollstaendig nachbauen.');

h2('Projektkonfiguration');
fileListing('package.json');

h2('Server und Bot-Logik');
fileListing('index.js');
fileListing('src/bot.js');
fileListing('src/dialogs/registrationDialog.js');
fileListing('src/dialogs/validators.js');
fileListing('src/i18n/messages.js');

h2('Services');
fileListing('src/services/cluRecognizer.js');
fileListing('src/services/secretsClient.js');
fileListing('src/services/userRepository.js');

h2('Admin-Bereich');
fileListing('src/admin/routes.js');
fileListing('src/admin/dashboard.html');

h2('Frontend');
fileListing('public/index.html');

h2('CI/CD');
fileListing('.github/workflows/deploy.yml');

/* ===================== 5. DEPLOYMENT & BETRIEB ===================== */
h1('Deployment und Betrieb');
para('Deployments laufen als ZIP-Deploy ueber die Azure CLI; den Build (npm install, Node 22) uebernimmt Oryx serverseitig. Auf jeden Push nach main deployt zusaetzlich GitHub Actions automatisch. Fuer manuelle Deploys, Diagnose und Kostensteuerung dient das Skript voicebot-deploy.sh.');
h2('Befehle: voicebot-deploy.sh');
codeBlock(
`diagnose        Vollstaendige Vorab-Pruefung (Env, Login, RG, Plan, App, UAMI, Settings)
fix-auth        UAMI / Key Vault / App-Settings konfigurieren
reset           Plan F1 -> B1 (loest Crash-Loop-Blockaden)
deploy          ZIP erstellen + deployen + Health-Check
fix-and-deploy  fix-auth + deploy in einem Schritt
logs [N]        Gefilterte Cloud-Logs (N Zeilen, Default 100)
shutdown        App stoppen + Plan auf F1 skalieren (Kostensparung)
wakeup          Plan auf B1 + App starten + Health-Check`);
h2('Befehle: voicebot-local.sh (lokale Tests)');
codeBlock(
`setup           SQL-Firewall, env-Datei schreiben, ngrok pruefen
start [mode]    Bot + ngrok starten, Bot-Endpoint auf ngrok umlenken
                mode=full: mit Key Vault | mode=dummy: ohne DB/KV
stop            Aufraeumen, Bot-Endpoint zurueck auf App Service
status          Was laeuft gerade?
logs            Live-Logs des lokalen Bot-Prozesses
cloud-logs      Live-Logs vom Azure App Service`);
h2('Kostenuebersicht');
bullets([
  'Aktiv (App Service B1 + SQL Basic + Free-Tier-Dienste): rund 0,60 EUR/Tag.',
  'Shutdown (Plan auf F1, App gestoppt): rund 0,17 EUR/Tag (nur Azure SQL).',
  'Empfehlung: nach dem Testen immer ./voicebot-deploy.sh shutdown ausfuehren.'
]);

/* ===================== 6. PROJEKTSTRUKTUR ===================== */
h1('Projektstruktur');
para('Verzeichnisbaum der relevanten Projektdateien:');
codeBlock(
`voicebot/
├── index.js                      Einstiegspunkt: Server, Adapter, Routen
├── package.json                  Dependencies, Engine (Node >=22)
├── public/
│   └── index.html                WebChat-Frontend (Redesign + Sprachumschalter)
├── src/
│   ├── bot.js                    ActivityHandler, Spracherkennung, Intent-Routing
│   ├── i18n/
│   │   └── messages.js           Alle UI-Texte (DE, DE-formal, EN)
│   ├── admin/
│   │   ├── routes.js             Admin-API (users, export, stats)
│   │   └── dashboard.html        Admin-Dashboard
│   ├── dialogs/
│   │   ├── registrationDialog.js WaterfallDialog (9 Felder)  
│   │   └── validators.js         Validierung + normalize() + adaptive Hints
│   └── services/
│       ├── cluRecognizer.js      CLU-Client + DE/EN Regel-Fallback
│       ├── secretsClient.js      Key Vault Secret-Loader
│       └── userRepository.js     MSSQL-Zugriff
├── voicebot-deploy.sh            Cloud-Deploy + Diagnose
├── voicebot-local.sh            Lokales Test-Setup
├── tools/
│   └── generate-projektdoku.js   Generator dieser PDF
├── docs/                         Architektur, Installationsanleitung, Praesentation
└── .github/workflows/deploy.yml  CI/CD GitHub Actions`);

/* ===================== FUSSZEILEN ===================== */
const range = doc.bufferedPageRange();
for (let p = range.start; p < range.start + range.count; p++) {
  doc.switchToPage(p);
  // Bottom-Margin temporaer ausschalten, sonst loest text() in der
  // Fusszeilen-Zone einen automatischen Seitenumbruch aus.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const fy = doc.page.height - 42;
  doc.font('body').fontSize(8).fillColor(MUTED)
     .text(`Voicebot SS 2026  ·  Projektdokumentation`,
           M.left, fy, { width: CW, align: 'left', lineBreak: false });
  doc.font('body').fontSize(8).fillColor(MUTED)
     .text(`Seite ${p + 1} / ${range.count}`,
           M.left, fy, { width: CW, align: 'right', lineBreak: false });
  doc.page.margins.bottom = savedBottom;
}

doc.end();
doc.on('end', () => {}); // Stream-Ende wird von createWriteStream behandelt
process.stdout.write(`PDF geschrieben: ${path.relative(ROOT, OUT)}\n`);
