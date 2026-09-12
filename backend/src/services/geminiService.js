// ============================================================================
// GEMINI AI SERVICE (V2 Hybrid Architecture)
// ----------------------------------------------------------------------------
// Provides natural-language intent understanding and syllabus concept prioritization.
// Gemini NEVER invents fake topics or generates final calendar schedules;
// the Mumbai University syllabus catalog and deterministic engine remain the source of truth.
// ============================================================================

const axios = require('axios');

const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

/**
 * Executes a Gemini API call with model fallback and JSON extraction.
 */
async function callGemini(systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastError = null;

  for (const model of models) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 12000
        }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      // If 404 (model unavailable), 429 (rate limited / quota exhausted), or 503 (server overloaded), try fallback model
      if (status === 404 || status === 429 || status === 503) {
        continue;
      }
      // For other errors, break and allow deterministic fallback
      break;
    }
  }

  throw lastError || new Error('Gemini API call failed');
}

const INTENT_SYSTEM_PROMPT = `You are the study planning intelligence engine of StudyFlow.
Analyze the student's study request and extract a STRICT JSON object representing their intent and study strategy.
Do NOT include any text, reasoning, or markdown outside the JSON.

JSON Schema:
{
  "goalType": "PASS" | "SCORE_WELL" | "TOP" | "EMERGENCY" | "TARGETED_IMPROVEMENT" | "BALANCED",
  "urgency": "NORMAL" | "HIGH" | "CRITICAL",
  "coverageLevel": "ESSENTIAL" | "COMPREHENSIVE" | "FOCUSED",
  "difficultyPreference": "EASY_TO_MEDIUM" | "MEDIUM_TO_HARD" | "BALANCED",
  "practiceLevel": "LOW" | "MEDIUM" | "HIGH",
  "revisionLevel": "LOW" | "MEDIUM" | "HIGH",
  "mockTestLevel": "NONE" | "MEDIUM" | "HIGH",
  "priorityStrategy": "HIGH_WEIGHTAGE_FIRST" | "DIFFICULT_FIRST" | "TARGETED_MODULE" | "BALANCED",
  "targetedModuleName": string | null,
  "scope": { "type": "MODULE" | "CONCEPT" | "FULL_SYLLABUS", "targets": string[] } | null,
  "weakTopics": string[],
  "userIntentSummary": string,
  "durationDays": number | null,
  "subject": string | null,
  "intent": "GENERATE_PLAN" | "REDUCE_WORKLOAD" | "BLOCK_TODAY" | "MOVE_SUBJECT" | "WEAK_AREA" | "UNKNOWN"
}

IMPORTANT DISTINCTION between scope and weakTopics:
- "scope" is a HARD FILTER: "prepare only Module 3" means the plan MUST contain ONLY Module 3 concepts, zero others.
- "weakTopics" is a PRIORITY BOOST: "I'm weak in X" means X gets higher priority but other topics are NOT excluded.
- If the student says "only Module 3", set scope with type MODULE. Do NOT confuse this with weak areas.
- If the student says "I'm weak in Solidity Programming", set weakTopics. Do NOT set scope.

Strategy Guidelines:
1. "PASS" (e.g. "just want to pass", "clear the exam", "minimum marks"):
   goalType: "PASS", coverageLevel: "ESSENTIAL", difficultyPreference: "EASY_TO_MEDIUM",
   practiceLevel: "MEDIUM", revisionLevel: "HIGH", mockTestLevel: "MEDIUM", priorityStrategy: "HIGH_WEIGHTAGE_FIRST".
2. "SCORE_WELL" (e.g. "score well", "good marks", "decent score"):
   goalType: "SCORE_WELL", coverageLevel: "COMPREHENSIVE", difficultyPreference: "BALANCED",
   practiceLevel: "MEDIUM", revisionLevel: "HIGH", mockTestLevel: "MEDIUM", priorityStrategy: "BALANCED".
3. "TOP" (e.g. "top the class", "full preparation", "master everything", "100%", "I want to top it"):
   goalType: "TOP", coverageLevel: "COMPREHENSIVE", difficultyPreference: "MEDIUM_TO_HARD",
   practiceLevel: "HIGH", revisionLevel: "HIGH", mockTestLevel: "HIGH", priorityStrategy: "DIFFICULT_FIRST".
4. "EMERGENCY" (e.g. "exam in 2 days", "haven't started", "panic", "urgent"):
   goalType: "EMERGENCY", urgency: "CRITICAL", coverageLevel: "ESSENTIAL",
   priorityStrategy: "HIGH_WEIGHTAGE_FIRST", revisionLevel: "HIGH", mockTestLevel: "NONE".
5. "TARGETED_IMPROVEMENT" (e.g. "weak in Unit 3", "improve Module 2" — but NOT "only Module 3"):
   goalType: "TARGETED_IMPROVEMENT", coverageLevel: "FOCUSED", priorityStrategy: "TARGETED_MODULE",
   targetedModuleName: extract unit/module name.`;

function getDeterministicIntentFallback(text) {
  const t = (text || '').toLowerCase();
  let goalType = 'BALANCED';
  let coverageLevel = 'COMPREHENSIVE';
  let difficultyPreference = 'BALANCED';
  let practiceLevel = 'MEDIUM';
  let revisionLevel = 'MEDIUM';
  let mockTestLevel = 'MEDIUM';
  let priorityStrategy = 'BALANCED';
  let urgency = 'NORMAL';
  let targetedModuleName = null;
  let scope = null;
  let weakTopics = [];

  // Detect scope (hard filter) — "only Module 3", "prepare only Module 3"
  const onlyModuleMatch = t.match(/(?:prepare|study|cover|do|focus\s+on)?\s*(?:only|just)\s+(?:module|unit)\s*(\d+)/i)
    || t.match(/(?:module|unit)\s*(\d+)\s+only/i);
  if (onlyModuleMatch) {
    scope = { type: 'MODULE', targets: [`Module ${onlyModuleMatch[1]}`] };
  }

  if (/just\s*want\s*to\s*pass|only\s*pass|clear|don't\s*need\s*to\s*top|just\s*pass/i.test(t)) {
    goalType = 'PASS';
    coverageLevel = 'ESSENTIAL';
    difficultyPreference = 'EASY_TO_MEDIUM';
    priorityStrategy = 'HIGH_WEIGHTAGE_FIRST';
    revisionLevel = 'HIGH';
  } else if (/score\s*well|good marks|decent score/i.test(t)) {
    goalType = 'SCORE_WELL';
    coverageLevel = 'COMPREHENSIVE';
    difficultyPreference = 'BALANCED';
    revisionLevel = 'HIGH';
  } else if (/top|rank|master\s*everything|full\s*prep|highest\s*score|want to ace|i want to top/i.test(t)) {
    goalType = 'TOP';
    coverageLevel = 'COMPREHENSIVE';
    difficultyPreference = 'MEDIUM_TO_HARD';
    priorityStrategy = 'DIFFICULT_FIRST';
    practiceLevel = 'HIGH';
    revisionLevel = 'HIGH';
    mockTestLevel = 'HIGH';
  } else if (/emergency|haven't\s*started|exam\s*in\s*(?:[1-3]|one|two|three)\s*days/i.test(t)) {
    goalType = 'EMERGENCY';
    urgency = 'CRITICAL';
    coverageLevel = 'ESSENTIAL';
    priorityStrategy = 'HIGH_WEIGHTAGE_FIRST';
    revisionLevel = 'HIGH';
    mockTestLevel = 'NONE';
  } else if (!scope && /weak\s*in\s*(?:module|unit)\s*(\d+|[a-z0-9]+)/i.test(t)) {
    // Only treat as TARGETED_IMPROVEMENT if there's no scope restriction
    goalType = 'TARGETED_IMPROVEMENT';
    priorityStrategy = 'TARGETED_MODULE';
    const match = t.match(/(?:module|unit)\s*(\d+|[a-z0-9]+)/i);
    if (match) targetedModuleName = `Module ${match[1]}`;
  }

  // Detect weak topics (priority boost, not scope)
  const weakMatch = t.match(/(?:weak\s+in|struggling\s+with)\s+(.+?)(?:\s+before|\s+for|\.|,|$)/i);
  if (weakMatch && !scope) {
    const topic = weakMatch[1].replace(/^(the|a|an)\s+/i, '').trim();
    if (!/^(?:module|unit)\s*\d+$/i.test(topic)) {
      weakTopics = [topic];
    }
  }

  let durationDays = null;
  const daysMatch = t.match(/in\s+(\d+)\s*days?/i) || t.match(/(\d+)\s*days?/i);
  if (daysMatch) {
    durationDays = parseInt(daysMatch[1], 10);
  } else if (/next\s*week/i.test(t)) {
    durationDays = 7;
  } else if (/2\s*weeks|two\s*weeks/i.test(t)) {
    durationDays = 14;
  } else if (/3\s*weeks|three\s*weeks/i.test(t)) {
    durationDays = 21;
  }

  return {
    goalType,
    urgency,
    coverageLevel,
    difficultyPreference,
    practiceLevel,
    revisionLevel,
    mockTestLevel,
    priorityStrategy,
    targetedModuleName,
    scope,
    weakTopics,
    userIntentSummary: `Goal: ${goalType}. Strategy: ${priorityStrategy}.${scope ? ' Scope: ' + scope.targets.join(', ') : ''}`,
    durationDays,
    subject: null,
    intent: scope || weakTopics.length > 0 || goalType !== 'BALANCED' ? 'GENERATE_PLAN' : 'GENERATE_PLAN',
    source: 'fallback'
  };
}

async function parseIntentWithGemini(text) {
  try {
    const parsed = await callGemini(INTENT_SYSTEM_PROMPT, text);
    if (parsed && parsed.goalType) {
      return {
        ...parsed,
        source: 'gemini'
      };
    }
    return getDeterministicIntentFallback(text);
  } catch (err) {
    console.warn('Gemini intent parsing failed, using deterministic fallback:', err.message);
    return getDeterministicIntentFallback(text);
  }
}

const PRIORITIZE_SYSTEM_PROMPT = `You are StudyFlow's syllabus prioritization intelligence.
You receive:
1. Student Intent & Strategy (goalType, priorityStrategy, coverageLevel, etc.)
2. Master List of real syllabus concepts (ID, name, moduleName, order, importance (1-3), examRelevance (1-3), difficulty (1-5))

Your task:
Rank and order the concepts to optimize the student's stated goal:
- For PASS: Place high-weightage (examRelevance: 3, importance: 3) and fundamental concepts first. Lower-value concepts should be pushed to the bottom or omitted.
- For TOP: Comprehensive coverage. Place fundamental building blocks first, followed by high-difficulty and deep concepts, ensuring thorough mastery.
- For EMERGENCY: Focus solely on top-scoring exam-critical concepts.
- For TARGETED_IMPROVEMENT: Elevate concepts from the targeted module/unit to the top.

Return ONLY a STRICT JSON object:
{
  "prioritizedConceptIds": [string], // array of IDs strictly from the provided concepts list
  "strategyExplanation": string
}`;

async function prioritizeConceptsWithGemini({ intent, concepts, subjectName }) {
  if (!Array.isArray(concepts) || concepts.length === 0) {
    return { prioritizedConceptIds: [], strategyExplanation: 'No concepts to prioritize.' };
  }

  const validConceptIdSet = new Set(concepts.map((c) => c.id.toString()));

  try {
    const compactConcepts = concepts.map((c) => ({
      id: c.id.toString(),
      name: c.name,
      moduleName: c.moduleName,
      importance: c.importance,
      examRelevance: c.examRelevance,
      difficulty: c.difficulty
    }));

    const userPayload = JSON.stringify({
      subject: subjectName,
      studentIntent: intent,
      syllabusConcepts: compactConcepts
    });

    const res = await callGemini(PRIORITIZE_SYSTEM_PROMPT, userPayload);

    if (Array.isArray(res?.prioritizedConceptIds) && res.prioritizedConceptIds.length > 0) {
      // Filter out any hallucinated IDs and retain only valid syllabus concepts
      const validRanked = res.prioritizedConceptIds.filter((id) => validConceptIdSet.has(id.toString()));
      const seen = new Set(validRanked);
      // Append any remaining syllabus concepts not mentioned in the response so no syllabus content is lost
      for (const c of concepts) {
        const idStr = c.id.toString();
        if (!seen.has(idStr)) {
          validRanked.push(idStr);
          seen.add(idStr);
        }
      }

      return {
        prioritizedConceptIds: validRanked,
        strategyExplanation: res.strategyExplanation || 'Concepts prioritized based on your strategic goal.'
      };
    }
  } catch (err) {
    console.warn('Gemini concept prioritization failed, using deterministic prioritization:', err.message);
  }

  // Deterministic fallback prioritization
  const fallbackRanked = [...concepts].sort((a, b) => {
    const goal = intent?.goalType || 'BALANCED';
    if (goal === 'PASS' || goal === 'EMERGENCY') {
      // High relevance + high importance first, easier concepts preferred
      const scoreA = (a.examRelevance || 2) * 3 + (a.importance || 2) * 2 - (a.difficulty || 3) * 0.5;
      const scoreB = (b.examRelevance || 2) * 3 + (b.importance || 2) * 2 - (b.difficulty || 3) * 0.5;
      return scoreB - scoreA;
    }
    if (goal === 'TOP') {
      // High difficulty and comprehensive coverage
      const scoreA = (a.difficulty || 3) * 2 + (a.importance || 2) * 2 + (a.examRelevance || 2);
      const scoreB = (b.difficulty || 3) * 2 + (b.importance || 2) * 2 + (b.examRelevance || 2);
      return scoreB - scoreA;
    }
    if (goal === 'TARGETED_IMPROVEMENT' && intent?.targetedModuleName) {
      const isTargetA = (a.moduleName || '').toLowerCase().includes(intent.targetedModuleName.toLowerCase());
      const isTargetB = (b.moduleName || '').toLowerCase().includes(intent.targetedModuleName.toLowerCase());
      if (isTargetA && !isTargetB) return -1;
      if (!isTargetA && isTargetB) return 1;
    }
    // Default order by module and concept order
    return (a.order || 0) - (b.order || 0);
  });

  return {
    prioritizedConceptIds: fallbackRanked.map((c) => c.id.toString()),
    strategyExplanation: `Deterministic prioritization aligned with ${intent?.goalType || 'standard'} strategy.`
  };
}

module.exports = {
  parseIntentWithGemini,
  prioritizeConceptsWithGemini
};

