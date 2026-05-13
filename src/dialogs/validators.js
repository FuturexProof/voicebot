const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-()]{6,20}$/;
const ZIP_RE   = /^\d{5}$/;

// Entfernt Satzzeichen, die Spracherkennung ans Ende anhängt (z.B. "Max." → "Max")
function normalize(str) {
  return (str || '').trim().replace(/[.,!?;:]+$/, '').trim();
}

async function nameValidator(ctx) {
  const v = normalize(ctx.recognized.value);
  if (v.length >= 2 && /^[A-Za-zÄÖÜäöüß\-\s]+$/.test(v)) return true;
  await ctx.context.sendActivity('Das sieht nicht wie ein Name aus. Bitte nochmal eingeben.');
  return false;
}

async function dobValidator(ctx) {
  if (!ctx.recognized.succeeded) {
    await ctx.context.sendActivity('Ich konnte das Datum nicht erkennen. Bitte z.B. "3. Mai 1990".');
    return false;
  }
  const date = new Date(ctx.recognized.value[0].value);
  const now = new Date();
  const age = (now - date) / (365.25 * 24 * 3600 * 1000);
  if (age >= 14 && age <= 120) return true;
  await ctx.context.sendActivity('Das Datum scheint nicht plausibel. Bitte nochmal.');
  return false;
}

async function emailValidator(ctx) {
  if (EMAIL_RE.test(normalize(ctx.recognized.value))) return true;
  await ctx.context.sendActivity('Das ist keine gültige E-Mail-Adresse. Beispiel: max@beispiel.de');
  return false;
}

async function phoneValidator(ctx) {
  if (PHONE_RE.test(normalize(ctx.recognized.value))) return true;
  await ctx.context.sendActivity('Bitte eine gültige Telefonnummer (mind. 6 Ziffern).');
  return false;
}

async function zipValidator(ctx) {
  if (ZIP_RE.test(normalize(ctx.recognized.value))) return true;
  await ctx.context.sendActivity('Eine deutsche PLZ hat 5 Ziffern.');
  return false;
}

async function streetValidator(ctx) {
  const v = normalize(ctx.recognized.value);
  if (v.length >= 3 && /\d/.test(v)) return true;
  await ctx.context.sendActivity('Bitte Straße und Hausnummer (z.B. "Hauptstraße 12").');
  return false;
}

module.exports = {
  normalize,
  nameValidator, dobValidator, emailValidator,
  phoneValidator, zipValidator, streetValidator
};
