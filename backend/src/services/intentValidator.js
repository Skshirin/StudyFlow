// ============================================================================
// INTENT VALIDATOR
// ----------------------------------------------------------------------------
// Strict application-level validation for natural-language intent payloads.
// The AI is NEVER trusted to validate itself or invent curriculum entities.
//
// Rules enforced:
// 1. Subject lookup against real Subject collection (no guessing, no hallucination).
// 2. Weak topics lookup against real Module/Concept names under resolved subject
//    (unmatched topics are dropped and explicitly noted).
// 3. Duration & available hours range checks (reject non-positive or absurd values).
// 4. Graceful handling of UNKNOWN / unparseable intents.
// ============================================================================

const Subject = require('../models/Subject');
const Module = require('../models/Module');
const Concept = require('../models/Concept');

/**
 * Generates dynamic aliases for a syllabus subject directly from its DB record
 * (e.g. course code, lowercase name, and acronym from multi-word names).
 */
function getSubjectAliases(s) {
  const aliases = new Set();
  if (s.code) aliases.add(normalizeStr(s.code));
  if (s.name) {
    const nameNorm = normalizeStr(s.name);
    aliases.add(nameNorm);
    const words = nameNorm.split(' ').filter(Boolean);
    if (words.length > 1) {
      aliases.add(words.map((w) => w[0]).join(''));
    }
  }
  return aliases;
}

/**
 * Normalizes text for lenient keyword matching while remaining deterministic.
 */
function normalizeStr(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validates and resolves an intent payload against real syllabus collections.
 *
 * @param {Object} parsed - Raw parsed JSON from rule-parser or AI
 * @param {Object} context
 * @param {Array} [context.enrolledSubjects=[]] - Student's enrolled subjects if known
 * @returns {Promise<Object>} Validation result { isValid, intent, error, resolved, droppedWeakTopics }
 */
async function validateAndResolveIntent(parsed, context = {}) {
  const result = {
    isValid: true,
    error: null,
    clarificationNeeded: false,
    parsedInput: parsed,
    resolved: {
      subject: null,
      goal: null,
      durationDays: null,
      availableHoursPerDay: null,
      weakTopics: [],
      intent: parsed.intent || 'UNKNOWN',
      params: parsed.params || {}
    },
    droppedWeakTopics: []
  };

  // 0. Check for UNKNOWN intent
  if (!parsed.intent || parsed.intent === 'UNKNOWN') {
    result.isValid = false;
    result.error = "I couldn't confidently understand your request. Please rephrase (e.g., \"I want to complete Machine Learning in 3 days to pass\" or \"I'm weak in Ensemble Learning\").";
    return result;
  }

  // 1. SUBJECT VALIDATION & RESOLUTION
  const allSubjects = await Subject.find({ code: { $exists: true } }).lean();

  if (parsed.subject) {
    const rawSub = normalizeStr(parsed.subject);
    const matched = allSubjects.find((s) => {
      const aliases = getSubjectAliases(s);
      if (aliases.has(rawSub)) return true;
      const codeNorm = normalizeStr(s.code || '');
      const nameNorm = normalizeStr(s.name || '');
      if (codeNorm === rawSub || nameNorm === rawSub) return true;
      if (nameNorm.includes(rawSub) || rawSub.includes(nameNorm)) return true;
      return false;
    });

    if (!matched) {
      result.isValid = false;
      result.error = `Subject "${parsed.subject}" does not exist in the syllabus. Available subjects: ${allSubjects.map((s) => `${s.name} (${s.code})`).join(', ')}.`;
      return result;
    }

    result.resolved.subject = {
      _id: matched._id,
      code: matched.code,
      name: matched.name,
      credits: matched.credits
    };
  } else if (Array.isArray(parsed.weakTopics) && parsed.weakTopics.length > 0) {
    // If no subject named, check if the topic uniquely matches a Module or Concept in the catalog
    const allModules = await Module.find().populate('subjectId').lean();
    const allConcepts = await Concept.find().populate('moduleId').lean();

    let matchedSubject = null;
    for (const rawTopic of parsed.weakTopics) {
      const normTopic = normalizeStr(rawTopic);
      if (!normTopic) continue;

      const modMatch = allModules.find((m) => {
        const mNorm = normalizeStr(m.name);
        return mNorm.includes(normTopic) || normTopic.includes(mNorm.replace(/^module \d+ /i, ''));
      });
      if (modMatch && modMatch.subjectId) {
        matchedSubject = modMatch.subjectId;
        break;
      }

      const conMatch = allConcepts.find((c) => {
        const cNorm = normalizeStr(c.name);
        return cNorm.includes(normTopic) || normTopic.includes(cNorm);
      });
      if (conMatch && conMatch.moduleId) {
        const parentMod = allModules.find(
          (m) => m._id.toString() === (conMatch.moduleId._id || conMatch.moduleId).toString()
        );
        if (parentMod && parentMod.subjectId) {
          matchedSubject = parentMod.subjectId;
          break;
        }
      }
    }

    if (matchedSubject) {
      result.resolved.subject = {
        _id: matchedSubject._id,
        code: matchedSubject.code,
        name: matchedSubject.name,
        credits: matchedSubject.credits
      };
    } else {
      // Topic was not found under any subject
      result.isValid = false;
      result.error = `None of the specified topics (${parsed.weakTopics.join(', ')}) exist in the syllabus.`;
      result.droppedWeakTopics = parsed.weakTopics.map((t) => ({
        topic: t,
        reason: 'Topic does not exist anywhere in the official syllabus catalog.'
      }));
      return result;
    }
  } else {
    // No subject explicitly named and no valid weak topics to infer from
    const enrolled = context.enrolledSubjects || [];
    if (parsed.intent === 'REDUCE_WORKLOAD' || parsed.intent === 'BLOCK_TODAY') {
      // Day-level operations apply across today's schedule regardless of subject
      result.resolved.subject = null;
    } else if (enrolled.length === 1) {
      // Single subject enrolled -> safely associate
      const single = enrolled[0];
      const match = allSubjects.find((s) => s._id.toString() === (single.subjectId?._id || single.subjectId || single._id).toString());
      if (match) {
        result.resolved.subject = { _id: match._id, code: match.code, name: match.name };
      }
    } else if (enrolled.length > 1) {
      // Multiple subjects -> Ask for clarification rather than silently guessing
      const subjectNames = enrolled.map((s) => s.name || s.subjectId?.name).filter(Boolean);
      result.isValid = false;
      result.clarificationNeeded = true;
      result.error = `No subject was specified. You currently have ${enrolled.length} active subjects (${subjectNames.join(', ')}). Which subject would you like this plan adjustment applied to?`;
      return result;
    } else if (parsed.intent === 'GENERATE_PLAN' || parsed.intent === 'WEAK_AREA') {
      result.isValid = false;
      result.clarificationNeeded = true;
      result.error = 'No subject was specified. Please specify which subject you would like to study.';
      return result;
    }
  }

  // 2. WEAK TOPICS VALIDATION (Must match real Module or Concept names under resolved subject)
  if (result.resolved.subject && Array.isArray(parsed.weakTopics) && parsed.weakTopics.length > 0) {
    const subjectId = result.resolved.subject._id;
    const modules = await Module.find({ subjectId }).sort({ order: 1 }).lean();
    const moduleIds = modules.map((m) => m._id);
    const concepts = await Concept.find({ moduleId: { $in: moduleIds } }).sort({ order: 1 }).lean();

    for (const rawTopic of parsed.weakTopics) {
      const normTopic = normalizeStr(rawTopic);
      if (!normTopic) continue;

      // Check against Modules
      const matchedModule = modules.find((m) => {
        const mNorm = normalizeStr(m.name);
        return mNorm.includes(normTopic) || normTopic.includes(mNorm.replace(/^module \d+ /i, ''));
      });

      // Check against Concepts
      const matchedConcept = concepts.find((c) => {
        const cNorm = normalizeStr(c.name);
        return cNorm.includes(normTopic) || normTopic.includes(cNorm);
      });

      if (matchedModule) {
        result.resolved.weakTopics.push({
          type: 'MODULE',
          id: matchedModule._id,
          name: matchedModule.name,
          order: matchedModule.order
        });
      } else if (matchedConcept) {
        const parentMod = modules.find((m) => m._id.toString() === matchedConcept.moduleId.toString());
        result.resolved.weakTopics.push({
          type: 'CONCEPT',
          id: matchedConcept._id,
          name: matchedConcept.name,
          moduleName: parentMod?.name || '',
          importance: matchedConcept.importance,
          examRelevance: matchedConcept.examRelevance
        });
      } else {
        // Drop unmatched topic — never invent a fake concept
        result.droppedWeakTopics.push({
          topic: rawTopic,
          reason: `Topic "${rawTopic}" is not part of the official syllabus for ${result.resolved.subject.name}.`
        });
      }
    }

    if (parsed.intent === 'WEAK_AREA' && result.resolved.weakTopics.length === 0) {
      result.isValid = false;
      result.error = `None of the specified topics (${parsed.weakTopics.join(', ')}) were found in the syllabus for ${result.resolved.subject.name}.`;
      return result;
    }
  }

  // 3. DURATION & AVAILABLE HOURS VALIDATION
  if (parsed.durationDays !== undefined && parsed.durationDays !== null) {
    const days = Number(parsed.durationDays);
    if (isNaN(days) || days <= 0 || days > 90) {
      result.isValid = false;
      result.error = `Invalid duration (${parsed.durationDays} days). Duration must be a positive number up to 90 days.`;
      return result;
    }
    result.resolved.durationDays = Math.round(days);
  }

  if (parsed.availableHoursPerDay !== undefined && parsed.availableHoursPerDay !== null) {
    const hours = Number(parsed.availableHoursPerDay);
    if (isNaN(hours) || hours <= 0 || hours > 18) {
      result.isValid = false;
      result.error = `Invalid daily hours (${parsed.availableHoursPerDay} hrs). Daily study hours must be between 0.5 and 18 hours.`;
      return result;
    }
    result.resolved.availableHoursPerDay = Math.round(hours * 10) / 10;
  }

  // 4. GOAL VALIDATION
  if (parsed.goal) {
    const validGoals = ['PASS', 'SCORE_WELL', 'TOP', 'FULL_PREPARATION'];
    let normGoal = parsed.goal.toUpperCase().replace(/\s+/g, '_');
    if (normGoal === 'FULL_PREPARATION') normGoal = 'TOP';
    if (validGoals.includes(normGoal)) {
      result.resolved.goal = normGoal;
    } else {
      result.resolved.goal = 'SCORE_WELL'; // Fallback to balanced default
    }
  }

  return result;
}

module.exports = {
  validateAndResolveIntent
};
