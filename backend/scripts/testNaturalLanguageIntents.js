require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { parseIntent } = require('../src/services/intentParser');
const { parseIntentWithAI } = require('../src/services/aiService');
const { validateAndResolveIntent } = require('../src/services/intentValidator');
const Subject = require('../src/models/Subject');

async function processPhrase(phrase, context = {}) {
  // 1. Try rule-based first
  let rawParsed = parseIntent(phrase);
  let source = 'rule';

  // 2. Fall back to AI if rule-based returns null
  if (!rawParsed) {
    const aiResult = await parseIntentWithAI(phrase);
    rawParsed = aiResult;
    source = aiResult.source || 'ai';
  }

  // 3. Application-level validation
  const validation = await validateAndResolveIntent(rawParsed, context);

  return {
    phrase,
    source,
    rawParsed,
    validation
  };
}

async function runTests() {
  await connectDB();
  console.log('Database connected for AI intent testing.\n');

  const allSubjects = await Subject.find().lean();
  const sampleEnrolled = [
    { name: 'Machine Learning', code: 'CSC701' },
    { name: 'Blockchain', code: 'CSDC7022' }
  ];

  const testPhrases = [
    {
      label: 'Test 1: Plan Generation with Subject, Duration, and PASS Goal',
      phrase: "I want to complete Machine Learning in 3 days. I don't need to top, I just want to pass.",
      context: { enrolledSubjects: sampleEnrolled }
    },
    {
      label: 'Test 2: No Subject Named (Ambiguous 24-hour request across multiple subjects)',
      phrase: "I have only 24 hours.",
      context: { enrolledSubjects: sampleEnrolled } // multiple enrolled subjects
    },
    {
      label: 'Test 3: Weak in Module (Ensemble Learning in CSC701)',
      phrase: "I'm weak in Ensemble Learning",
      context: { enrolledSubjects: sampleEnrolled }
    },
    {
      label: 'Test 4: Weak in NLP Module (Syntax Analysis for NLP -> CSDC7013)',
      phrase: "I'm weak in Syntax Analysis for NLP",
      context: { enrolledSubjects: allSubjects }
    },
    {
      label: 'Test 5: Concept Revision in Blockchain (Solidity Programming -> CSDC7022)',
      phrase: "Help me revise Solidity Programming before my Blockchain exam",
      context: { enrolledSubjects: allSubjects }
    },
    {
      label: 'Test 6: Hallucinated / Non-Existent Concept (Quantum Neural Compression)',
      phrase: "I want to master Quantum Neural Compression",
      context: { enrolledSubjects: sampleEnrolled }
    },
    {
      label: 'Test 7: Deliberately Malformed / Gibberish Input',
      phrase: "asdfghjk 998877 qwerty !@#$%^&*",
      context: { enrolledSubjects: sampleEnrolled }
    }
  ];

  for (const t of testPhrases) {
    console.log(`================================================================`);
    console.log(`INPUT PHRASE: "${t.phrase}"`);
    console.log(`SCENARIO: ${t.label}`);
    console.log(`----------------------------------------------------------------`);

    const res = await processPhrase(t.phrase, t.context);

    console.log(`[Parser Output (${res.source})]:`);
    console.log(JSON.stringify(res.rawParsed, null, 2));

    console.log(`\n[Validation Outcome]:`);
    console.log(`- Is Valid: ${res.validation.isValid}`);
    if (res.validation.error) {
      console.log(`- Error / Clarification: "${res.validation.error}"`);
    }
    if (res.validation.resolved.subject) {
      console.log(`- Resolved Subject: ${res.validation.resolved.subject.name} (${res.validation.resolved.subject.code})`);
    }
    if (res.validation.resolved.weakTopics.length > 0) {
      console.log(`- Resolved Topics:`, res.validation.resolved.weakTopics.map((wt) => `${wt.type}: ${wt.name}`));
    }
    if (res.validation.droppedWeakTopics.length > 0) {
      console.log(`- Dropped Topics:`, res.validation.droppedWeakTopics);
    }
    console.log('\n');
  }

  await mongoose.disconnect();
  console.log('Tests completed.');
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
