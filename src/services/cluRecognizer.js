const { ConversationAnalysisClient } = require('@azure/ai-language-conversations');
const { AzureKeyCredential } = require('@azure/core-auth');

class CluRecognizer {
  constructor({ endpoint, key, project, deployment }) {
    if (!endpoint || !key) {
      console.warn('[cluRecognizer] CLU nicht konfiguriert — Regelfallback');
      return;
    }
    this.client = new ConversationAnalysisClient(endpoint, new AzureKeyCredential(key));
    this.project = project;
    this.deployment = deployment;
  }

  async recognize(text) {
    if (!this.client) return this._fallback(text);
    try {
      const result = await this.client.analyzeConversation({
        kind: 'Conversation',
        analysisInput: { conversationItem: { id: '1', participantId: 'u', text } },
        parameters: {
          projectName: this.project,
          deploymentName: this.deployment,
          stringIndexType: 'TextElement_V8'
        }
      });
      const pred = result.result.prediction;
      return { topIntent: pred.topIntent, confidence: pred.intents[0]?.confidenceScore ?? 0 };
    } catch (err) {
      console.error('CLU-Fehler, nutze Fallback:', err.message);
      return this._fallback(text);
    }
  }

  _fallback(text) {
    const t = (text || '').toLowerCase().trim();
    if (/registrier|anmeld|account|konto eröffnen|profil anlegen/.test(t)) return { topIntent: 'register_start', confidence: 0.5 };
    if (/^(ja|stimmt|passt|korrekt|richtig|okay|klar|perfekt)$/.test(t)) return { topIntent: 'confirm', confidence: 0.5 };
    if (/abbrech|stop|nein doch|ende|tschüss/.test(t)) return { topIntent: 'cancel', confidence: 0.5 };
    if (/hilfe|verstehe nicht|hilf mir/.test(t)) return { topIntent: 'help', confidence: 0.5 };
    if (/von vorn|neu start|reset|zurücksetzen/.test(t)) return { topIntent: 'restart', confidence: 0.5 };
    return { topIntent: 'None', confidence: 0 };
  }
}

module.exports = { CluRecognizer };
