const {
  ComponentDialog, WaterfallDialog,
  TextPrompt, DateTimePrompt, ConfirmPrompt
} = require('botbuilder-dialogs');
const v    = require('./validators');
const msgs = require('../i18n/messages');

const REG_DIALOG = 'REG_DIALOG';
const WATERFALL  = 'WATERFALL';

class RegistrationDialog extends ComponentDialog {
  constructor(userRepo) {
    super(REG_DIALOG);
    this.userRepo = userRepo;

    this.addDialog(new TextPrompt('firstName', v.nameValidator));
    this.addDialog(new TextPrompt('lastName',  v.nameValidator));
    this.addDialog(new DateTimePrompt('dob-de', v.dobValidator, 'de-DE'));
    this.addDialog(new DateTimePrompt('dob-en', v.dobValidator, 'en-US'));
    this.addDialog(new TextPrompt('email',     v.emailValidator));
    this.addDialog(new TextPrompt('phone',     v.phoneValidator));
    this.addDialog(new TextPrompt('street',    v.streetValidator));
    this.addDialog(new TextPrompt('zip',       v.zipValidator));
    this.addDialog(new TextPrompt('city'));
    this.addDialog(new TextPrompt('country'));
    this.addDialog(new ConfirmPrompt('confirm-de', null, 'de-DE'));
    this.addDialog(new ConfirmPrompt('confirm-en', null, 'en-US'));

    this.addDialog(new WaterfallDialog(WATERFALL, [
      this.askFirstName.bind(this),
      this.askLastName.bind(this),
      this.askDob.bind(this),
      this.askEmail.bind(this),
      this.askPhone.bind(this),
      this.askStreet.bind(this),
      this.askZip.bind(this),
      this.askCity.bind(this),
      this.askCountry.bind(this),
      this.summary.bind(this),
      this.persist.bind(this)
    ]));

    this.initialDialogId = WATERFALL;
  }

  // Hilfsmethode: Spracheinstellungen aus dem ersten Schritt übernehmen
  _t(step) {
    return msgs.get(step.values.lang || 'de', step.values.formal || false);
  }

  async askFirstName(step) {
    // Sprache und Ton aus dialogOptions übernehmen (gesetzt von bot.js)
    const opts = step.options || {};
    step.values.lang   = opts.lang   || 'de';
    step.values.formal = opts.formal || false;
    const t = this._t(step);
    await step.context.sendActivity(t.dialogStart);
    return step.prompt('firstName', t.askFirst);
  }

  async askLastName(step) {
    step.values.firstName = v.normalize(step.result);
    return step.prompt('lastName', this._t(step).askLast(step.values.firstName));
  }

  async askDob(step) {
    step.values.lastName = v.normalize(step.result);
    const dobId = step.values.lang === 'en' ? 'dob-en' : 'dob-de';
    return step.prompt(dobId, this._t(step).askDob);
  }

  async askEmail(step) {
    step.values.dob = step.result[0].value;
    return step.prompt('email', this._t(step).askEmail);
  }

  async askPhone(step) {
    step.values.email = v.normalize(step.result);
    return step.prompt('phone', this._t(step).askPhone);
  }

  async askStreet(step) {
    step.values.phone = v.normalize(step.result);
    return step.prompt('street', this._t(step).askStreet);
  }

  async askZip(step) {
    step.values.street = v.normalize(step.result);
    return step.prompt('zip', this._t(step).askZip);
  }

  async askCity(step) {
    step.values.zip = v.normalize(step.result);
    return step.prompt('city', this._t(step).askCity);
  }

  async askCountry(step) {
    step.values.city = v.normalize(step.result);
    return step.prompt('country', this._t(step).askCountry);
  }

  async summary(step) {
    step.values.country = v.normalize(step.result);
    const u   = step.values;
    const dob = new Date(u.dob).toLocaleDateString(u.lang === 'en' ? 'en-US' : 'de-DE');
    const confirmId = u.lang === 'en' ? 'confirm-en' : 'confirm-de';
    return step.prompt(confirmId, this._t(step).summary(u, dob));
  }

  async persist(step) {
    if (!step.result) {
      await step.context.sendActivity(this._t(step).summaryRetry);
      return step.replaceDialog(REG_DIALOG, {
        lang:   step.values.lang,
        formal: step.values.formal
      });
    }
    try {
      await this.userRepo.insert(step.values);
      await step.context.sendActivity(this._t(step).saved(step.values.firstName));
    } catch (err) {
      console.error('DB-Fehler:', err);
      const t   = this._t(step);
      const msg = err.message?.includes('UNIQUE') ? t.dupEmail : t.saveError;
      await step.context.sendActivity(msg);
    }
    return step.endDialog();
  }
}

module.exports = { RegistrationDialog, REG_DIALOG };
