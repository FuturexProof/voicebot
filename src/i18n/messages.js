const de = {
  welcome:      'Hallo! Ich bin dein Registrierungs-Assistent. Sage "Ich möchte mich registrieren", um zu starten.',
  startHint:    'Sage "Ich möchte mich registrieren", um zu starten.',
  cancelMsg:    'Okay, ich breche ab. Bis später!',
  helpMsg:      'Ich helfe dir, einen Benutzeraccount anzulegen. Sage "Ich möchte mich registrieren", um zu starten. Mit "abbrechen" stoppst du jederzeit.',
  restartMsg:   'Wir starten von vorn.',
  dialogStart:  'Hallo! Ich helfe dir beim Anlegen deines Accounts. Du kannst jederzeit "abbrechen" sagen.',
  askFirst:     'Wie ist dein Vorname?',
  askLast:      (first) => `Hallo ${first}! Und dein Nachname?`,
  askDob:       'Dein Geburtsdatum bitte (z.B. "3. Mai 1990").',
  askEmail:     'Welche E-Mail-Adresse möchtest du hinterlegen?',
  askPhone:     'Und deine Telefonnummer?',
  askStreet:    'Straße und Hausnummer bitte.',
  askZip:       'Deine Postleitzahl?',
  askCity:      'In welcher Stadt wohnst du?',
  askCountry:   'Und das Land?',
  summary:      (u, dob) =>
    `Bitte bestätige deine Angaben:\n\n` +
    `• Name: ${u.firstName} ${u.lastName}\n` +
    `• Geburtsdatum: ${dob}\n• E-Mail: ${u.email}\n` +
    `• Telefon: ${u.phone}\n` +
    `• Adresse: ${u.street}, ${u.zip} ${u.city}, ${u.country}\n\n` +
    `Sind die Daten korrekt?`,
  summaryRetry: 'Okay, dann beginnen wir von vorn.',
  saved:        (first) => `Super, ${first}! Dein Account wurde angelegt. Willkommen!`,
  dupEmail:     'Diese E-Mail-Adresse ist bereits registriert.',
  saveError:    'Speichern hat leider nicht geklappt. Bitte später nochmal.',
  langSwitched: 'Sprache gewechselt auf Deutsch.',
  nameErr1:     'Das sieht nicht wie ein Name aus. Bitte nochmal.',
  nameErr2:     'Nur Buchstaben und Bindestriche erlaubt (mind. 2 Zeichen). Bitte nochmal.',
  dobErr1:      'Ich konnte das Datum nicht erkennen. Bitte z.B. "3. Mai 1990".',
  dobRange:     'Das Datum scheint nicht plausibel (Alter 14–120 Jahre). Bitte nochmal.',
  emailErr1:    'Das ist keine gültige E-Mail-Adresse. Beispiel: max@beispiel.de',
  emailErr2:    'Bitte das Format beachten: vorname@domain.de — z.B. anna@web.de',
  phoneErr1:    'Bitte eine gültige Telefonnummer (mind. 6 Ziffern).',
  phoneErr2:    'Beispiel: +49 30 12345678 oder 0170 / 123456',
  zipErr1:      'Eine deutsche PLZ hat genau 5 Ziffern.',
  zipErr2:      'Bitte genau 5 Ziffern eingeben, z.B. 14770.',
  streetErr1:   'Bitte Straße und Hausnummer angeben (z.B. "Hauptstraße 12").',
  streetErr2:   'Die Hausnummer fehlt noch. Bitte beides angeben.',
};

// Nur die Strings, die sich formal unterscheiden — der Rest wird von `de` geerbt
const de_formal = {
  ...de,
  welcome:      'Guten Tag! Ich bin Ihr Registrierungs-Assistent. Sagen Sie "Ich möchte mich registrieren", um zu starten.',
  startHint:    'Sagen Sie "Ich möchte mich registrieren", um zu starten.',
  cancelMsg:    'Okay, ich breche ab. Auf Wiedersehen!',
  helpMsg:      'Ich helfe Ihnen, einen Benutzeraccount anzulegen. Sagen Sie "Ich möchte mich registrieren", um zu starten. Mit "abbrechen" stoppen Sie jederzeit.',
  restartMsg:   'Wir starten von vorn.',
  dialogStart:  'Guten Tag! Ich helfe Ihnen beim Anlegen Ihres Accounts. Sie können jederzeit "abbrechen" sagen.',
  askFirst:     'Wie ist Ihr Vorname?',
  askLast:      (first) => `Guten Tag, ${first}! Und Ihr Nachname?`,
  askDob:       'Ihr Geburtsdatum bitte (z.B. "3. Mai 1990").',
  askEmail:     'Welche E-Mail-Adresse möchten Sie hinterlegen?',
  askPhone:     'Und Ihre Telefonnummer?',
  askZip:       'Ihre Postleitzahl?',
  askCity:      'In welcher Stadt wohnen Sie?',
  askCountry:   'Und das Land?',
  saved:        (first) => `Super, ${first}! Ihr Account wurde angelegt. Willkommen!`,
};

const en = {
  welcome:      'Hello! I\'m your registration assistant. Say "I want to register" to get started.',
  startHint:    'Say "I want to register" to get started.',
  cancelMsg:    'Alright, cancelling. See you later!',
  helpMsg:      'I help you create a user account. Say "I want to register" to start. You can say "cancel" at any time.',
  restartMsg:   'Starting over.',
  dialogStart:  'Hello! I\'ll help you create your account. You can say "cancel" at any time.',
  askFirst:     'What\'s your first name?',
  askLast:      (first) => `Hello ${first}! And your last name?`,
  askDob:       'Your date of birth please (e.g. "May 3, 1990").',
  askEmail:     'What email address would you like to use?',
  askPhone:     'And your phone number?',
  askStreet:    'Your street and house number please.',
  askZip:       'Your postal code?',
  askCity:      'What city do you live in?',
  askCountry:   'And the country?',
  summary:      (u, dob) =>
    `Please confirm your details:\n\n` +
    `• Name: ${u.firstName} ${u.lastName}\n` +
    `• Date of birth: ${dob}\n• Email: ${u.email}\n` +
    `• Phone: ${u.phone}\n` +
    `• Address: ${u.street}, ${u.zip} ${u.city}, ${u.country}\n\n` +
    `Are these details correct?`,
  summaryRetry: 'Okay, let\'s start over.',
  saved:        (first) => `Great, ${first}! Your account has been created. Welcome!`,
  dupEmail:     'This email address is already registered.',
  saveError:    'Sorry, saving failed. Please try again later.',
  langSwitched: 'Language switched to English.',
  nameErr1:     'That doesn\'t look like a name. Please try again.',
  nameErr2:     'Only letters and hyphens allowed (min. 2 chars). Please try again.',
  dobErr1:      'I couldn\'t recognize that date. Please try e.g. "May 3, 1990".',
  dobRange:     'That date doesn\'t seem right (age 14–120). Please try again.',
  emailErr1:    'That\'s not a valid email address. Example: john@example.com',
  emailErr2:    'Please use the format: name@domain.com — e.g. anna@gmail.com',
  phoneErr1:    'Please enter a valid phone number (at least 6 digits).',
  phoneErr2:    'Example: +1 555 123 4567 or (555) 123-4567',
  zipErr1:      'Please enter a valid postal code.',
  zipErr2:      'Please enter your postal code (digits only).',
  streetErr1:   'Please enter your street and house number (e.g. "Main Street 12").',
  streetErr2:   'The house number seems to be missing. Please include street and number.',
};

function get(lang, formal = false) {
  if (lang === 'en') return en;
  return (formal ? de_formal : de);
}

module.exports = { get, de, de_formal, en };
