const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function loadSecrets(kvName) {
  if (!kvName) {
    console.warn('[secretsClient] KV_NAME nicht gesetzt - laufe mit Dummy-Werten');
    return {
      sqlConnectionString: process.env.SQL_CONN || '',
      speechKey: process.env.SPEECH_KEY || '',
      speechRegion: process.env.SPEECH_REGION || 'switzerlandnorth',
      languageKey: process.env.LANG_KEY || '',
      languageEndpoint: process.env.LANG_ENDPOINT || '',
      cluProject: process.env.CLU_PROJECT || 'voicebot-clu',
      cluDeployment: process.env.CLU_DEPLOYMENT || 'production'
    };
  }

  // UAMI Client-ID explizit angeben - sonst findet DefaultAzureCredential
  // die User-Assigned MI im App Service nicht (probiert nur System-Assigned)
  const credential = new DefaultAzureCredential({
    managedIdentityClientId: process.env.UAMI_CLIENT_ID || process.env.MicrosoftAppId
  });
  const client = new SecretClient(`https://${kvName}.vault.azure.net`, credential);
  const get = (n) => client.getSecret(n).then(s => s.value);

  const [sql, sk, sr, lk, le, cp, cd] = await Promise.all([
    get('SqlConnectionString'),
    get('SpeechKey'),
    get('SpeechRegion'),
    get('LanguageKey'),
    get('LanguageEndpoint'),
    get('CluProjectName'),
    get('CluDeploymentName')
  ]);

  return {
    sqlConnectionString: sql,
    speechKey: sk,
    speechRegion: sr,
    languageKey: lk,
    languageEndpoint: le,
    cluProject: cp,
    cluDeployment: cd
  };
}

module.exports = { loadSecrets };
