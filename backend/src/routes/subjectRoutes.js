const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subjectController');

// Syllabus catalog & enrollment
router.get('/catalog', ctrl.getCatalog);
router.post('/enroll', ctrl.enrollSubjects);
router.put('/concepts/:conceptId/progress', ctrl.updateConceptProgress);

// Enrolled subjects & CRUD
router.post('/', ctrl.createSubject);
router.get('/', ctrl.getSubjects);
router.put('/:id', ctrl.updateSubject);
router.put('/:id/topics/:topicName', ctrl.updateTopicStatus);
router.delete('/:id', ctrl.deleteSubject);

module.exports = router;
