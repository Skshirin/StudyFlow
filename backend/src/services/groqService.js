// ============================================================================
// AI FALLBACK (Groq, free tier)
// ----------------------------------------------------------------------------
// Used ONLY when the rule-based intentParser can't classify the student's
// free-text request. The model's only job is to turn messy natural language
// into the same small, strict intent schema the rule-based parser produces —
// the scheduling/adaptive engines still do all the actual planning work.
// If no GROQ_API_KEY is set, this degrades gracefully instead of crashing.
// ============================================================================

const axios = require('axios');

const SYSTEM_PROMPT = `You convert a student's free-text request about their study plan into STRICT JSON only — no prose, no markdown fences.
Schema: { "intent": "REDUCE_WORKLOAD" | "BLOCK_TODAY" | "MOVE_SUBJECT" | "BLOCK_TIME" | "UNKNOWN", "params": { ... } }
- REDUCE_WORKLOAD params: { "percent": number (0-100) }
- BLOCK_TODAY params: {}
- MOVE_SUBJECT params: { "subject": string, "target": "today" | "tomorrow" }
- BLOCK_TIME params: { "date": "YYYY-MM-DD", "availableMinutes": number }
- UNKNOWN params: {}
If you are not confident, return UNKNOWN. Respond with ONLY the JSON object.`;

async function parseIntentWithAI(text) {
  if (!process.env.GROQ_API_KEY) {
    return { intent: 'UNKNOWN', params: {}, source: 'none', note: 'No GROQ_API_KEY configured' };
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ],
        temperature: 0.2,
        max_tokens: 200
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = response.data.choices[0].message.content.trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return { ...parsed, source: 'ai' };
  } catch (err) {
    console.error('Groq AI error:', err.message);
    return { intent: 'UNKNOWN', params: {}, source: 'error' };
  }
}

module.exports = { parseIntentWithAI };
