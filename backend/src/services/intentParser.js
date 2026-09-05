// ============================================================================
// RULE-BASED INTENT PARSER
// ----------------------------------------------------------------------------
// Most "adjust my plan" requests do NOT need an LLM. A handful of regex
// patterns cover the common phrasing students actually use. Only genuinely
// unstructured text falls through to the AI service (groqService.js). This
// keeps the app fast, free, and predictable for the common case.
// ============================================================================

const PATTERNS = [
  {
    intent: 'REDUCE_WORKLOAD',
    regex: /tired|low energy|exhausted|not feeling (it|great|good)/i,
    extract: () => ({ percent: 30 })
  },
  {
    intent: 'BLOCK_TODAY',
    regex: /can'?t study today|skip today|no time today|busy today|nothing today/i,
    extract: () => ({})
  },
  {
    intent: 'MOVE_SUBJECT',
    regex: /move\s+(.+?)\s+to\s+(tomorrow|today|next \w+)/i,
    extract: (m) => ({ subject: m[1].trim(), target: m[2].trim() })
  }
];

function parseIntent(text) {
  for (const p of PATTERNS) {
    const match = text.match(p.regex);
    if (match) {
      return { intent: p.intent, params: p.extract(match), source: 'rule' };
    }
  }
  return null; // caller should fall back to AI
}

module.exports = { parseIntent };
