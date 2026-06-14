const msgs = require('../i18n/messages');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-()]{6,20}$/;
const ZIP_RE   = /^\d{5}$/;

function normalize(str) {
  return (str || '').trim().replace(/[.,!?;:]+$/, '').trim();
}

function t(ctx) {
  const lang   = ctx.context.turnState.get('lang')   || 'de';
  const formal = ctx.context.turnState.get('formal') || false;
  return msgs.get(lang, formal);
}

async function nameValidator(ctx) {
  const v = normalize(ctx.recognized.value);
  if (v.length >= 2 && /^[A-Za-zÄÖÜäöüß\-\s]+$/.test(v)) return true;
  await ctx.context.sendActivity(ctx.attemptCount >= 2 ? t(ctx).nameErr2 : t(ctx).nameErr1);
  return false;
}

async function dobValidator(ctx) {
  if (!ctx.recognized.succeeded) {
    await ctx.context.sendActivity(t(ctx).dobErr1);
    return false;
  }
  const date = new Date(ctx.recognized.value[0].value);
  const age  = (Date.now() - date) / (365.25 * 24 * 3600 * 1000);
  if (age >= 14 && age <= 120) return true;
  await ctx.context.sendActivity(t(ctx).dobRange);
  return false;
}

async function emailValidator(ctx) {
  if (EMAIL_RE.test(normalize(ctx.recognized.value))) return true;
  await ctx.context.sendActivity(ctx.attemptCount >= 2 ? t(ctx).emailErr2 : t(ctx).emailErr1);
  return false;
}

async function phoneValidator(ctx) {
  if (PHONE_RE.test(normalize(ctx.recognized.value))) return true;
  await ctx.context.sendActivity(ctx.attemptCount >= 2 ? t(ctx).phoneErr2 : t(ctx).phoneErr1);
  return false;
}

async function zipValidator(ctx) {
  if (ZIP_RE.test(normalize(ctx.recognized.value))) return true;
  await ctx.context.sendActivity(ctx.attemptCount >= 2 ? t(ctx).zipErr2 : t(ctx).zipErr1);
  return false;
}

async function streetValidator(ctx) {
  const v = normalize(ctx.recognized.value);
  if (v.length >= 3 && /\d/.test(v)) return true;
  await ctx.context.sendActivity(ctx.attemptCount >= 2 ? t(ctx).streetErr2 : t(ctx).streetErr1);
  return false;
}

module.exports = {
  normalize,
  nameValidator, dobValidator, emailValidator,
  phoneValidator, zipValidator, streetValidator
};
