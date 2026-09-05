// ============================================================================
// AI PROVIDER SWITCH
// ----------------------------------------------------------------------------
// Only used when intentParser.js (rule-based) can't classify the student's
// free text. Picks whichever provider has a key configured — Gemini takes
// priority if both are set, since it's what most students will already have
// a free key for. If neither is set, degrades to UNKNOWN gracefully (the
// caller in planController.js already handles that by asking for clarification).
// ============================================================================

const { parseIntentWithGemini } = require('./geminiService');
const { parseIntentWithAI: parseIntentWithGroq } = require('./groqService');

async function parseIntentWithAI(text) {
  if (process.env.GEMINI_API_KEY) return parseIntentWithGemini(text);
  if (process.env.GROQ_API_KEY) return parseIntentWithGroq(text);
  return { intent: 'UNKNOWN', params: {}, source: 'none', note: 'No AI provider configured' };
}

module.exports = { parseIntentWithAI };
