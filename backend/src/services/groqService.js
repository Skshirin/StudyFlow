// ============================================================================
// AI FALLBACK — Groq variant (V2 Strict Schema)
// ----------------------------------------------------------------------------
// Converts unstructured natural language into the strict StudyFlow JSON schema.
// ============================================================================

const axios = require('axios');

const SYSTEM_PROMPT = `You convert a student's natural-language study request into a STRICT JSON object only.
DO NOT include markdown fences, code blocks, or explanatory commentary. Return ONLY the JSON object.

Schema:
{
  "subject": string | null,
  "goal": "PASS" | "SCORE_WELL" | "TOP" | "FULL_PREPARATION" | null,
  "durationDays": number | null,
  "availableHoursPerDay": number | null,
  "weakTopics": string[],
  "intent": "GENERATE_PLAN" | "REDUCE_WORKLOAD" | "BLOCK_TODAY" | "MOVE_SUBJECT" | "WEAK_AREA" | "INCREASE_TIME" | "UNKNOWN",
  "params": {}
}

Rules:
1. "subject": Extract subject name or code if mentioned, else null.
2. "goal": "PASS" if user wants to just pass/clear/minimum, "SCORE_WELL" if user wants good marks/decent score, "TOP" if user wants comprehensive coverage/top rank/100%, else null.
3. "durationDays": Total days mentioned (e.g. "in 3 days" -> 3; "24 hours" -> 1), else null.
4. "availableHoursPerDay": Hours per day mentioned, else null.
5. "weakTopics": Array of specific topic/concept/module names mentioned that student is weak in, wants to revise, or struggle with.
6. "intent": "GENERATE_PLAN" | "WEAK_AREA" | "REDUCE_WORKLOAD" | "BLOCK_TODAY" | "MOVE_SUBJECT" | "INCREASE_TIME" | "UNKNOWN".
7. If the request is gibberish or not understandable, return intent: "UNKNOWN".`;

function sanitizeParsed(data) {
  let goal = data.goal;
  if (goal === 'FULL_PREPARATION') goal = 'TOP';
  return {
    subject: typeof data.subject === 'string' ? data.subject.trim() : null,
    goal: ['PASS', 'SCORE_WELL', 'TOP'].includes(goal) ? goal : null,
    durationDays: typeof data.durationDays === 'number' ? data.durationDays : null,
    availableHoursPerDay: typeof data.availableHoursPerDay === 'number' ? data.availableHoursPerDay : null,
    weakTopics: Array.isArray(data.weakTopics) ? data.weakTopics.map(String) : [],
    intent: ['GENERATE_PLAN', 'REDUCE_WORKLOAD', 'BLOCK_TODAY', 'MOVE_SUBJECT', 'WEAK_AREA', 'INCREASE_TIME', 'UNKNOWN'].includes(data.intent) ? data.intent : 'UNKNOWN',
    params: typeof data.params === 'object' && data.params !== null ? data.params : {}
  };
}

async function parseIntentWithGroq(text) {
  if (!process.env.GROQ_API_KEY) {
    return {
      subject: null,
      goal: null,
      durationDays: null,
      availableHoursPerDay: null,
      weakTopics: [],
      intent: 'UNKNOWN',
      params: {},
      source: 'none',
      note: 'No GROQ_API_KEY configured'
    };
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
        temperature: 0.1,
        max_tokens: 300
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content?.trim() || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return { ...sanitizeParsed(parsed), source: 'groq' };
  } catch (err) {
    console.error('Groq AI parse error:', err.message);
    return {
      subject: null,
      goal: null,
      durationDays: null,
      availableHoursPerDay: null,
      weakTopics: [],
      intent: 'UNKNOWN',
      params: {},
      source: 'error',
      note: err.message
    };
  }
}

module.exports = { parseIntentWithAI: parseIntentWithGroq };
