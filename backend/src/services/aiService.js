// ============================================================================
// AI PROVIDER SERVICE (Gemini Hybrid Layer)
// ----------------------------------------------------------------------------
// Dispatches natural language requests and syllabus concept prioritization
// to Gemini with automatic resilient fallbacks.
// ============================================================================

const { parseIntentWithGemini, prioritizeConceptsWithGemini } = require('./geminiService');

async function parseIntentWithAI(text) {
  return await parseIntentWithGemini(text);
}

async function prioritizeConceptsWithAI({ intent, concepts, subjectName }) {
  return await prioritizeConceptsWithGemini({ intent, concepts, subjectName });
}

module.exports = {
  parseIntentWithAI,
  prioritizeConceptsWithAI
};

