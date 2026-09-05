// ============================================================================
// AI FALLBACK — Gemini variant
// ----------------------------------------------------------------------------
// Same job as groqService.js: turn free text into the strict intent schema.
// GEMINI_MODEL is a config value, not hardcoded, because Google has been
// retiring Gemini model versions on a few-month cadence (e.g. Gemini 2.5
// Flash is slated to shut down Oct 16 2026) — if this stops working, check
// https://aistudio.google.com/ for the current model name and set
// GEMINI_MODEL in .env, no code change needed.
// ============================================================================

const axios = require('axios');

const SYSTEM_PROMPT = `You convert a student's free-text request about their study plan into STRICT JSON only — no prose, no markdown fences.
Schema: { "intent": "REDUCE_WORKLOAD" | "BLOCK_TODAY" | "MOVE_SUBJECT" | "BLOCK_TIME" | "UNKNOWN", "params": { ... } }
- REDUCE_WORKLOAD params: { "percent": number (0-100) }
- BLOCK_TODAY params: {}
- MOVE_SUBJECT params: { "subject": string, "target": "today" | "tomorrow" }
- BLOCK_TIME params: { "date": "YYYY-MM-DD", "availableMinutes": number }
- UNKNOWN params: {}
If you are not confident, return UNKNOWN. Respond with ONLY the JSON object, no markdown fences.`;

async function parseIntentWithGemini(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { intent: 'UNKNOWN', params: {}, source: 'none', note: 'No GEMINI_API_KEY configured' };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 200 }
      },
      { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey } }
    );

    const raw = response.data.candidates[0].content.parts[0].text.trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return { ...parsed, source: 'ai' };
  } catch (err) {
    console.error('Gemini AI error:', err.message);
    return { intent: 'UNKNOWN', params: {}, source: 'error' };
  }
}

module.exports = { parseIntentWithGemini };
