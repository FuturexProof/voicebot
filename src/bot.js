const { ActivityHandler } = require('botbuilder');
const { DialogSet, DialogTurnStatus } = require('botbuilder-dialogs');
const { RegistrationDialog, REG_DIALOG } = require('./dialogs/registrationDialog');
const { normalize } = require('./dialogs/validators');
const msgs = require('./i18n/messages');

function detectLang(text) {
  const t = (text || '').toLowerCase();
  if (/\b(i want|i'?d like|register|hello|hi there|help me|let me|please|sign up|create account|my name|yes|no)\b/.test(t))
    return 'en';
  return 'de';
}

function detectFormal(text) {
  // Erkennt höfliche Anrede ("Sie") im ursprünglichen (nicht normalisierten) Text
  return /\bSie\b|\bIhnen\b|\bIhre?\b/.test(text || '');
}

class RegistrationBot extends ActivityHandler {
  constructor(conversationState, userState, userRepo, clu) {
    super();
    this.conversationState = conversationState;
    this.userState         = userState;
    this.clu               = clu;

    this.langState   = conversationState.createProperty('Lang');
    this.formalState = conversationState.createProperty('Formal');
    this.dialogState = conversationState.createProperty('DialogState');

    this.dialogs = new DialogSet(this.dialogState);
    this.dialogs.add(new RegistrationDialog(userRepo));

    this.onMessage(async (context, next) => {
      const rawText = context.activity.text || '';

      // ── Sprachwechsel-Kommando vom Frontend ───────────────────
      if (rawText.startsWith('__setlang:')) {
        const newLang = rawText.split(':')[1];
        if (newLang === 'en' || newLang === 'de') {
          await this.langState.set(context, newLang);
          await this.formalState.set(context, false);
          await this.conversationState.saveChanges(context);
          const dc = await this.dialogs.createContext(context);
          if (dc.stack.length > 0) await dc.cancelAllDialogs();
          context.turnState.set('lang',   newLang);
          context.turnState.set('formal', false);
          await context.sendActivity(msgs.get(newLang).langSwitched);
        }
        return next();
      }

      // ── Sprache & Ton beim ersten Satz erkennen ───────────────
      let lang   = await this.langState.get(context, null);
      let formal = await this.formalState.get(context, null);

      if (lang === null) {
        lang = detectLang(rawText);
        await this.langState.set(context, lang);
      }
      if (formal === null) {
        formal = detectFormal(rawText);
        await this.formalState.set(context, formal);
      }

      // Für Validatoren in dieser Runde verfügbar machen
      context.turnState.set('lang',   lang);
      context.turnState.set('formal', formal);

      // ── Text normalisieren ────────────────────────────────────
      context.activity.text = normalize(rawText);
      const text = context.activity.text;

      const t = msgs.get(lang, formal);
      const { topIntent } = await this.clu.recognize(text);

      if (topIntent === 'cancel') {
        await context.sendActivity(t.cancelMsg);
        await this.conversationState.delete(context);
        return next();
      }
      if (topIntent === 'help') {
        await context.sendActivity(t.helpMsg);
        return next();
      }
      if (topIntent === 'restart') {
        await this.conversationState.delete(context);
        await context.sendActivity(t.restartMsg);
      }

      const dc     = await this.dialogs.createContext(context);
      const result = await dc.continueDialog();

      if (result.status === DialogTurnStatus.empty) {
        if (topIntent === 'register_start' || text.length > 0) {
          await dc.beginDialog(REG_DIALOG, { lang, formal });
        } else {
          await context.sendActivity(t.startHint);
        }
      }

      await next();
    });

    this.onMembersAdded(async (context, next) => {
      for (const m of context.activity.membersAdded) {
        if (m.id !== context.activity.recipient.id) {
          await context.sendActivity(msgs.get('de').welcome);
        }
      }
      await next();
    });
  }

  async run(context) {
    await super.run(context);
    await this.conversationState.saveChanges(context, false);
    await this.userState.saveChanges(context, false);
  }
}

module.exports = { RegistrationBot };
