require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const connectDB = require('../src/config/db');
const Subject = require('../src/models/Subject');
const Module = require('../src/models/Module');
const Concept = require('../src/models/Concept');

async function seedSyllabus() {
  const seedPath = path.resolve(__dirname, '../../syllabus-seed.json');

  if (!fs.existsSync(seedPath)) {
    console.error(`Syllabus seed file not found at: ${seedPath}`);
    process.exit(1);
  }

  console.log('Connecting to database...');
  await connectDB();

  const rawData = fs.readFileSync(seedPath, 'utf8');
  const syllabusData = JSON.parse(rawData);

  if (!syllabusData.subjects || !Array.isArray(syllabusData.subjects)) {
    console.error('Invalid syllabus JSON: "subjects" array is missing.');
    process.exit(1);
  }

  console.log(`Starting syllabus seed for ${syllabusData.subjects.length} subjects...`);

  let subjectsUpserted = 0;
  let modulesUpserted = 0;
  let conceptsUpserted = 0;

  for (const subjectData of syllabusData.subjects) {
    // 1. Upsert Subject by unique course code
    const subjectDoc = await Subject.findOneAndUpdate(
      { code: subjectData.code.trim().toUpperCase() },
      {
        $set: {
          code: subjectData.code.trim().toUpperCase(),
          name: subjectData.name.trim(),
          credits: subjectData.credits
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    subjectsUpserted++;

    if (!Array.isArray(subjectData.modules)) continue;

    for (let mIdx = 0; mIdx < subjectData.modules.length; mIdx++) {
      const moduleData = subjectData.modules[mIdx];

      // 2. Upsert Module by subjectId + module name
      const moduleDoc = await Module.findOneAndUpdate(
        {
          subjectId: subjectDoc._id,
          name: moduleData.name.trim()
        },
        {
          $set: {
            subjectId: subjectDoc._id,
            name: moduleData.name.trim(),
            order: mIdx + 1,
            hours: moduleData.hours || 0
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      modulesUpserted++;

      if (!Array.isArray(moduleData.concepts)) continue;

      for (let cIdx = 0; cIdx < moduleData.concepts.length; cIdx++) {
        const conceptData = moduleData.concepts[cIdx];

        // 3. Upsert Concept by moduleId + concept name
        await Concept.findOneAndUpdate(
          {
            moduleId: moduleDoc._id,
            name: conceptData.name.trim()
          },
          {
            $set: {
              moduleId: moduleDoc._id,
              name: conceptData.name.trim(),
              description: conceptData.description || '',
              importance: conceptData.importance ?? 2,
              difficulty: conceptData.difficulty ?? 2,
              examRelevance: conceptData.examRelevance ?? 2,
              estimatedStudyMinutes: conceptData.estimatedStudyMinutes ?? 60,
              order: cIdx + 1
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        conceptsUpserted++;
      }
    }
  }

  console.log('Syllabus seed completed successfully:');
  console.log(`- Subjects: ${subjectsUpserted}`);
  console.log(`- Modules:  ${modulesUpserted}`);
  console.log(`- Concepts: ${conceptsUpserted}`);
  console.log('- Resources: 0 (left empty as specified)');

  await mongoose.disconnect();
  console.log('Database disconnected.');
}

seedSyllabus().catch((err) => {
  console.error('Seed script failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
