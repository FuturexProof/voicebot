const {
  ComponentDialog, WaterfallDialog,
  TextPrompt, DateTimePrompt, ConfirmPrompt
} = require('botbuilder-dialogs');
const v = require('./validators');

const REG_DIALOG = 'REG_DIALOG';
const WATERFALL  = 'WATERFALL';

class RegistrationDialog extends ComponentDialog {
  constructor(userRepo) {
    super(REG_DIALOG);
    this.userRepo = userRepo;

    this.addDialog(new TextPrompt('firstName', v.nameValidator));
    this.addDialog(new TextPrompt('lastName',  v.nameValidator));
    this.addDialog(new DateTimePrompt('dob',   v.dobValidator, 'de-DE'));
    this.addDialog(new TextPrompt('email',     v.emailValidator));
    this.addDialog(new TextPrompt('phone',     v.phoneValidator));
    this.addDialog(new TextPrompt('street',    v.streetValidator));
    this.addDialog(new TextPrompt('zip',       v.zipValidator));
    this.addDialog(new TextPrompt('city'));
    this.addDialog(new TextPrompt('country'));
    this.addDialog(new ConfirmPrompt('confirm', null, 'de-DE'));

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

  async askFirstName(step) {
    await step.context.sendActivity('Hallo! Ich helfe dir beim Anlegen deines Accounts. Du kannst jederzeit "abbrechen" sagen.');
    return step.prompt('firstName', 'Wie ist dein Vorname?');
  }
  async askLastName(step) {
    step.values.firstName = v.normalize(step.result);
    return step.prompt('lastName', `Hallo ${step.values.firstName}! Und dein Nachname?`);
  }
  async askDob(step) {
    step.values.lastName = v.normalize(step.result);
    return step.prompt('dob', 'Dein Geburtsdatum bitte (z.B. "3. Mai 1990").');
  }
  async askEmail(step) {
    step.values.dob = step.result[0].value;
    return step.prompt('email', 'Welche E-Mail-Adresse möchtest du hinterlegen?');
  }
  async askPhone(step) {
    step.values.email = v.normalize(step.result);
    return step.prompt('phone', 'Und deine Telefonnummer?');
  }
  async askStreet(step) {
    step.values.phone = v.normalize(step.result);
    return step.prompt('street', 'Straße und Hausnummer bitte.');
  }
  async askZip(step) {
    step.values.street = v.normalize(step.result);
    return step.prompt('zip', 'Deine Postleitzahl?');
  }
  async askCity(step) {
    step.values.zip = v.normalize(step.result);
    return step.prompt('city', 'In welcher Stadt wohnst du?');
  }
  async askCountry(step) {
    step.values.city = v.normalize(step.result);
    return step.prompt('country', 'Und das Land?');
  }
  async summary(step) {
    step.values.country = v.normalize(step.result);
    const u = step.values;
    const dob = new Date(u.dob).toLocaleDateString('de-DE');
    const text =
      `Bitte bestätige deine Angaben:\n\n` +
      `• Name: ${u.firstName} ${u.lastName}\n` +
      `• Geburtsdatum: ${dob}\n` +
      `• E-Mail: ${u.email}\n` +
      `• Telefon: ${u.phone}\n` +
      `• Adresse: ${u.street}, ${u.zip} ${u.city}, ${u.country}\n\n` +
      `Sind die Daten korrekt?`;
    return step.prompt('confirm', text);
  }
  async persist(step) {
    if (!step.result) {
      await step.context.sendActivity('Okay, dann beginnen wir von vorn.');
      return step.replaceDialog(REG_DIALOG);
    }
    try {
      await this.userRepo.insert(step.values);
      await step.context.sendActivity(`Super, ${step.values.firstName}! Dein Account wurde angelegt. Willkommen!`);
    } catch (err) {
      console.error('DB-Fehler:', err);
      const dup = err.message && err.message.includes('UNIQUE');
      const msg = dup
        ? 'Diese E-Mail-Adresse ist bereits registriert.'
        : 'Speichern hat leider nicht geklappt. Bitte später nochmal.';
      await step.context.sendActivity(msg);
    }
    return step.endDialog();
  }
}

module.exports = { RegistrationDialog, REG_DIALOG };
