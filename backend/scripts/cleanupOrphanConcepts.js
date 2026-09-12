/**
 * cleanupOrphanConcepts.js
 * ────────────────────────
 * One-off script: removes Concept documents whose names are NOT present in
 * the new syllabus-seed.json for a given subject.  Also cleans orphaned
 * StudentProgress records pointing at deleted concepts.
 *
 * Run BEFORE seedSyllabus.js:
 *   node backend/scripts/cleanupOrphanConcepts.js
 *   node backend/scripts/seedSyllabus.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const connectDB = require('../src/config/db');
const Subject = require('../src/models/Subject');
const Module = require('../src/models/Module');
const Concept = require('../src/models/Concept');
const StudentProgress = require('../src/models/StudentProgress');

async function cleanup() {
  const seedPath = path.resolve(__dirname, '../../syllabus-seed.json');

  if (!fs.existsSync(seedPath)) {
    console.error(`Seed file not found: ${seedPath}`);
    process.exit(1);
  }

  console.log('Connecting to database...');
  await connectDB();

  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  if (!Array.isArray(seedData.subjects)) {
    console.error('Invalid seed JSON: missing "subjects" array.');
    process.exit(1);
  }

  // Build a map: subjectCode → Set<conceptName>
  const validConceptsBySubject = new Map();
  for (const subj of seedData.subjects) {
    const code = subj.code.trim().toUpperCase();
    const names = new Set();
    for (const mod of (subj.modules || [])) {
      for (const concept of (mod.concepts || [])) {
        names.add(concept.name.trim());
      }
    }
    validConceptsBySubject.set(code, names);
  }

  let totalDeleted = 0;
  let totalProgressDeleted = 0;

  for (const [code, validNames] of validConceptsBySubject) {
    const subjectDoc = await Subject.findOne({ code });
    if (!subjectDoc) {
      console.log(`  Subject ${code} not found in DB — skipping.`);
      continue;
    }

    const modules = await Module.find({ subjectId: subjectDoc._id });
    const moduleIds = modules.map((m) => m._id);

    if (moduleIds.length === 0) {
      console.log(`  Subject ${code}: no modules found — skipping.`);
      continue;
    }

    // Find concepts under this subject whose name is NOT in the new seed
    const allConcepts = await Concept.find({ moduleId: { $in: moduleIds } });
    const orphans = allConcepts.filter((c) => !validNames.has(c.name.trim()));

    if (orphans.length === 0) {
      console.log(`  Subject ${code}: 0 orphans (all ${allConcepts.length} concepts match the new seed).`);
      continue;
    }

    const orphanIds = orphans.map((c) => c._id);
    const orphanNames = orphans.map((c) => c.name);

    // Delete orphaned StudentProgress records first
    const progressResult = await StudentProgress.deleteMany({ conceptId: { $in: orphanIds } });
    totalProgressDeleted += progressResult.deletedCount;

    // Delete orphan concepts
    const conceptResult = await Concept.deleteMany({ _id: { $in: orphanIds } });
    totalDeleted += conceptResult.deletedCount;

    console.log(`  Subject ${code}: deleted ${conceptResult.deletedCount} orphan concept(s):`);
    orphanNames.forEach((n) => console.log(`    - ${n}`));
  }

  console.log(`\nCleanup complete: ${totalDeleted} concept(s) removed, ${totalProgressDeleted} progress record(s) removed.`);

  // Also migrate any StudentSubject records with FULL_PREPARATION → TOP
  const { modifiedCount } = await mongoose.connection.db.collection('studentsubjects').updateMany(
    { targetGoal: 'FULL_PREPARATION' },
    { $set: { targetGoal: 'TOP' } }
  );
  if (modifiedCount > 0) {
    console.log(`Migrated ${modifiedCount} StudentSubject record(s) from FULL_PREPARATION → TOP.`);
  }

  await mongoose.disconnect();
  console.log('Database disconnected.');
}

cleanup().catch((err) => {
  console.error('Cleanup failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
