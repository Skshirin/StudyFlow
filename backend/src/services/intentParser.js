// ============================================================================
// RULE-BASED INTENT PARSER (V2.1)
// ----------------------------------------------------------------------------
// Deterministic regex parser for natural-language study requests.
// Pre-parses common requests before invoking LLMs, outputting the strict V2.1 schema.
// If no rule matches with high confidence, returns null to trigger AI fallback.
//
// V2.1 additions:
//   - `scope` field for hard module/concept filtering
//   - `examDate` / `durationDays` always extracted when present
//   - Goal enum: PASS | SCORE_WELL | TOP (no FULL_PREPARATION)
// ============================================================================

function createEmptySchema() {
  return {
    subject: null,
    scope: null,         // { type: 'MODULE' | 'CONCEPT' | 'FULL_SYLLABUS', targets: string[] } | null
    goal: null,
    durationDays: null,
    examDate: null,
    availableHoursPerDay: null,
    weakTopics: [],
    intent: 'UNKNOWN',
    params: {}
  };
}

/**
 * Detects explicit scope restrictions in text.
 * "prepare only Module 3" / "only Module 3" / "just Module 3" → MODULE scope
 * Distinguishes from weak-area declarations ("I'm weak in Module 3" → no scope, just weakTopics)
 */
function detectScope(text) {
  const t = text.trim();

  // "only Module N" / "prepare only Module N" / "just Module N" / "focus on Module N only"
  const onlyModuleMatch = t.match(
    /(?:(?:prepare|study|cover|do|focus\s+on)\s+)?(?:only|just)\s+(?:module|unit)\s*(\d+)/i
  ) || t.match(
    /(?:module|unit)\s*(\d+)\s+only/i
  );

  if (onlyModuleMatch) {
    return {
      type: 'MODULE',
      targets: [`Module ${onlyModuleMatch[1]}`]
    };
  }

  // "prepare only [concept name]" — but NOT "weak in [concept name]"
  // This is tricky; we'll handle concept-level scope via AI mostly.
  // Rule-based only handles module-level scope.

  return null;
}

function parseIntent(text) {
  const t = text.trim();
  const subject = null;

  // Extract scope first (before other pattern matching)
  const scope = detectScope(t);

  // 1. Workload reduction
  if (/tired|feeling tired|low energy|exhausted|not feeling (it|great|good|well)|burnout|sick|headache|take it easy|light day|reduce (work)?load|less today/i.test(t)) {
    return {
      ...createEmptySchema(),
      subject,
      intent: 'REDUCE_WORKLOAD',
      params: { percent: 30 },
      source: 'rule'
    };
  }

  // 2. Block/skip today
  if (/can'?t study today|skip today|no time today|busy today|nothing today/i.test(t)) {
    return {
      ...createEmptySchema(),
      subject,
      intent: 'BLOCK_TODAY',
      params: {},
      source: 'rule'
    };
  }

  // 3. Move subject
  const moveMatch = t.match(/move\s+(.+?)\s+to\s+(tomorrow|today|next \w+)/i);
  if (moveMatch) {
    return {
      ...createEmptySchema(),
      subject: moveMatch[1].trim(),
      intent: 'MOVE_SUBJECT',
      params: { target: moveMatch[2].trim() },
      source: 'rule'
    };
  }

  // 3b. Add study session ("add a session", "add study session", "add session for ML", "add another session")
  const addSessionMatch = t.match(/(?:add|schedule|give me|put|include)\s+(?:a\s+|an\s+|another\s+|one\s+|\d+\s+)?(?:study\s+)?session(?:\s+(?:for|of|in)\s+([A-Za-z0-9\s]+?))?(?:\s+today|\s+tomorrow)?$/i)
    || t.match(/(?:add|schedule)\s+([A-Za-z0-9\s]+?)\s+session/i);
  if (addSessionMatch) {
    const targetSubj = addSessionMatch[1] ? addSessionMatch[1].trim() : null;
    return {
      ...createEmptySchema(),
      subject: targetSubj,
      intent: 'ADD_SESSION',
      params: { duration: 45 },
      source: 'rule'
    };
  }

  // 4. "I want to complete [Subject] in [N] days / hours ... pass / score well / top"
  const planMatch = t.match(/(?:complete|finish|cover|study|prepare)\s+(.+?)\s+in\s+(\d+)\s*(days?|hours?)/i);
  if (planMatch) {
    const rawSubj = planMatch[1].trim();
    const qty = parseInt(planMatch[2], 10);
    const unit = planMatch[3].toLowerCase();

    let goal = null;
    if (/(?:just|only)?\s*want to\s*pass|don't (?:want|need) to top|pass only/i.test(t)) goal = 'PASS';
    else if (/score\s*well|good marks|high score/i.test(t)) goal = 'SCORE_WELL';
    else if (/top|full\s*(prep|preparation)|master everything|want to ace/i.test(t)) goal = 'TOP';

    return {
      ...createEmptySchema(),
      subject: rawSubj,
      scope,
      goal,
      durationDays: unit.startsWith('day') ? qty : (qty <= 24 ? 1 : Math.ceil(qty / 24)),
      availableHoursPerDay: unit.startsWith('hour') && qty <= 24 ? qty : null,
      intent: 'GENERATE_PLAN',
      params: {},
      source: 'rule'
    };
  }

  // 4b. "Exam is [next week / in N days] ... [pass / score well / top]"
  if (/exam\s+(?:is\s+)?(?:in|next|tomorrow|\d+)/i.test(t) || /(?:just want to pass|don't want to top|pass this subject)/i.test(t)) {
    let durationDays = null;
    if (/tomorrow|in 1 day/i.test(t)) durationDays = 1;
    else if (/next week|in (?:7|a) days?/i.test(t)) durationDays = 7;
    else {
      const daysMatch = t.match(/in\s+(\d+)\s*days?/i);
      if (daysMatch) durationDays = parseInt(daysMatch[1], 10);
    }

    let goal = null;
    if (/(?:just|only)?\s*want to\s*pass|don't (?:want|need) to top|pass (?:this|only)/i.test(t)) goal = 'PASS';
    else if (/score\s*well|good marks|high score/i.test(t)) goal = 'SCORE_WELL';
    else if (/top|full\s*(prep|preparation)|master everything|want to ace/i.test(t)) goal = 'TOP';

    let detectedSubj = null;
    const forMatch = t.match(/for\s+([A-Za-z0-9\s]+?)(?::|\.\s+my|$)/i);
    if (forMatch) {
      detectedSubj = forMatch[1].trim();
    }

    return {
      ...createEmptySchema(),
      subject: detectedSubj,
      scope,
      goal,
      durationDays: durationDays || 7,
      availableHoursPerDay: null,
      intent: 'GENERATE_PLAN',
      params: {},
      source: 'rule'
    };
  }

  // 4c. Scope-triggered plan generation ("prepare only Module 3, I want to top it")
  if (scope) {
    let goal = null;
    if (/(?:just|only)?\s*want to\s*pass|don't (?:want|need) to top|pass/i.test(t)) goal = 'PASS';
    else if (/score\s*well|good marks|high score/i.test(t)) goal = 'SCORE_WELL';
    else if (/top|full\s*(prep|preparation)|master|ace/i.test(t)) goal = 'TOP';

    let durationDays = null;
    const daysMatch = t.match(/in\s+(\d+)\s*days?/i) || t.match(/(\d+)\s*days?/i);
    if (daysMatch) durationDays = parseInt(daysMatch[1], 10);

    // Try to detect subject from "of Machine Learning" / "for Blockchain"
    let detectedSubj = null;
    const ofMatch = t.match(/(?:of|for|in)\s+([A-Za-z][A-Za-z0-9\s]+?)(?:\s*,|\s*\.|$)/i);
    if (ofMatch) {
      // Don't capture "of Module 3" as a subject
      const candidate = ofMatch[1].trim();
      if (!/^module\s*\d+$/i.test(candidate)) {
        detectedSubj = candidate;
      }
    }

    return {
      ...createEmptySchema(),
      subject: detectedSubj,
      scope,
      goal,
      durationDays,
      intent: 'GENERATE_PLAN',
      params: {},
      source: 'rule'
    };
  }

  // 5. "I only have [N] hours today" -> workload reduction for today
  const hoursTodayMatch = t.match(/(?:(?:only|just)?\s*have|have\s+(?:only|just)?)\s*(\d+(?:\.\d+)?)\s*hours?\s*(?:today)?/i);
  if (hoursTodayMatch && (/today/i.test(t) || !/days?/i.test(t)) && !/weak/i.test(t)) {
    const hours = parseFloat(hoursTodayMatch[1]);
    if (/today/i.test(t)) {
      return {
        ...createEmptySchema(),
        subject,
        intent: 'REDUCE_WORKLOAD',
        params: { targetHoursToday: hours },
        source: 'rule'
      };
    }
  }

  // 6. "I have only [N] hours / days" (general plan horizon)
  const hoursOnlyMatch = t.match(/(?:(?:only|just)?\s*have|have\s+(?:only|just)?)\s*(\d+)\s*(hours?|days?)/i);
  if (hoursOnlyMatch && !/weak/i.test(t)) {
    const qty = parseInt(hoursOnlyMatch[1], 10);
    const unit = hoursOnlyMatch[2].toLowerCase();

    return {
      ...createEmptySchema(),
      subject,
      durationDays: unit.startsWith('day') ? qty : 1,
      availableHoursPerDay: unit.startsWith('hour') ? Math.min(qty, 24) : null,
      intent: 'GENERATE_PLAN',
      params: { rawHours: unit.startsWith('hour') ? qty : null },
      source: 'rule'
    };
  }

  // 7. Weakness in topics / revision / mastering
  const weakMatch = t.match(/(?:i'm\s+weak\s+in|weakness\s+in|struggling\s+with|focus\s+on|revise|want to master|master)\s+(.+?)(?:\s+before|\s+for|\.|$)/i);
  if (weakMatch) {
    const topic = weakMatch[1].replace(/^(the|a|an)\s+/i, '').trim();
    let detectedSubj = null;

    // Check for "for NLP", "before my Blockchain exam", etc.
    const forSubjMatch = t.match(/(?:for|before(?:\s+my)?)\s+([A-Za-z0-9\s]+?)(?:\s+exam|\.|$)/i);
    if (forSubjMatch) {
      detectedSubj = forSubjMatch[1].trim();
    }

    return {
      ...createEmptySchema(),
      subject: detectedSubj,
      goal: /master/i.test(t) ? 'TOP' : null,
      weakTopics: [topic],
      intent: 'WEAK_AREA',
      params: {},
      source: 'rule'
    };
  }

  return null; // Fall back to AI
}

module.exports = { parseIntent };
