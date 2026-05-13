const { ActivityHandler } = require('botbuilder');
const { DialogSet, DialogTurnStatus } = require('botbuilder-dialogs');
const { RegistrationDialog, REG_DIALOG } = require('./dialogs/registrationDialog');
const { normalize } = require('./dialogs/validators');

class RegistrationBot extends ActivityHandler {
  constructor(conversationState, userState, userRepo, clu) {
    super();
    this.conversationState = conversationState;
    this.userState = userState;
    this.clu = clu;

    this.dialogState = conversationState.createProperty('DialogState');
    this.dialogs = new DialogSet(this.dialogState);
    this.dialogs.add(new RegistrationDialog(userRepo));

    this.onMessage(async (context, next) => {
      // Satzzeichen aus Spracherkennung entfernen, bevor Dialoge und CLU den Text lesen
      context.activity.text = normalize(context.activity.text);
      const text = context.activity.text;
      const { topIntent } = await this.clu.recognize(text);

      if (topIntent === 'cancel') {
        await context.sendActivity('Okay, ich breche ab. Bis später!');
        await this.conversationState.delete(context);
        return next();
      }
      if (topIntent === 'help') {
        await context.sendActivity(
          'Ich helfe dir, einen Benutzeraccount anzulegen. ' +
          'Sage einfach "Ich möchte mich registrieren", um zu starten. ' +
          'Mit "abbrechen" stoppst du jederzeit.'
        );
        return next();
      }
      if (topIntent === 'restart') {
        await this.conversationState.delete(context);
        await context.sendActivity('Wir starten von vorn.');
      }

      const dc = await this.dialogs.createContext(context);
      const result = await dc.continueDialog();
      if (result.status === DialogTurnStatus.empty) {
        if (topIntent === 'register_start' || text.length > 0) {
          await dc.beginDialog(REG_DIALOG);
        } else {
          await context.sendActivity('Sage "Ich möchte mich registrieren", um zu starten.');
        }
      }

      await next();
    });

    this.onMembersAdded(async (context, next) => {
      for (const m of context.activity.membersAdded) {
        if (m.id !== context.activity.recipient.id) {
          await context.sendActivity(
            'Hallo! Ich bin dein Registrierungs-Assistent. ' +
            'Sage "Ich möchte mich registrieren", um zu starten.'
          );
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
