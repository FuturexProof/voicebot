require('dotenv').config();
const restify = require('restify');
const {
  CloudAdapter, ConfigurationBotFrameworkAuthentication,
  ConversationState, MemoryStorage, UserState
} = require('botbuilder');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { loadSecrets } = require('./src/services/secretsClient');
const { UserRepository } = require('./src/services/userRepository');
const { CluRecognizer } = require('./src/services/cluRecognizer');
const { RegistrationBot } = require('./src/bot');

(async () => {
  const secrets = await loadSecrets(process.env.KV_NAME);
  const userRepo = new UserRepository(secrets.sqlConnectionString);
  const clu = new CluRecognizer({
    endpoint:   secrets.languageEndpoint,
    key:        secrets.languageKey,
    project:    secrets.cluProject,
    deployment: secrets.cluDeployment
  });

  const auth = new ConfigurationBotFrameworkAuthentication(process.env);
  const adapter = new CloudAdapter(auth);

  const memoryStorage = new MemoryStorage();
  const conversationState = new ConversationState(memoryStorage);
  const userState = new UserState(memoryStorage);

  adapter.onTurnError = async (context, error) => {
    console.error('[onTurnError]', error);
    await context.sendActivity('Es ist ein Fehler aufgetreten. Wir starten neu.');
    await conversationState.delete(context);
  };

  const bot = new RegistrationBot(conversationState, userState, userRepo, clu);

  const server = restify.createServer();
  server.use(restify.plugins.bodyParser());
  server.use(restify.plugins.queryParser());

  server.post('/api/messages', async (req, res) => {
    await adapter.process(req, res, (context) => bot.run(context));
  });

  // Speech-Token
  server.get('/api/speech-token', async (req, res) => {
    try {
      const r = await fetch(
        `https://${secrets.speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': secrets.speechKey } }
      );
      const token = await r.text();
      res.send({ token, region: secrets.speechRegion });
    } catch (err) {
      res.send(500, { error: err.message });
    }
  });

  // Direct Line Token
  server.get('/api/directline-token', async (req, res) => {
    try {
      let dlSecret = process.env.DIRECTLINE_SECRET;
      if (process.env.KV_NAME && !dlSecret) {
        const c = new SecretClient(`https://${process.env.KV_NAME}.vault.azure.net`, new DefaultAzureCredential({ managedIdentityClientId: process.env.UAMI_CLIENT_ID || process.env.MicrosoftAppId }));
        dlSecret = (await c.getSecret('DirectLineSecret')).value;
      }
      const r = await fetch('https://directline.botframework.com/v3/directline/tokens/generate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + dlSecret }
      });
      const tok = await r.json();
      res.send(tok);
    } catch (err) {
      res.send(500, { error: err.message });
    }
  });

  // Admin-Routen
  require('./src/admin/routes')(server, userRepo);

  // Statisches Frontend
  server.get('/*', restify.plugins.serveStatic({
    directory: './public',
    default: 'index.html'
  }));

  const port = process.env.PORT || 3978;
  server.listen(port, () => console.log(`Bot läuft auf Port ${port}`));
})();
