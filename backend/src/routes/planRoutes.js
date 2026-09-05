const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/planController');

router.post('/generate', ctrl.generatePlan);
router.get('/today', ctrl.getToday);
router.get('/health', ctrl.getPlanHealth);
router.post('/energy', ctrl.logEnergy);
router.post('/adjust', ctrl.adjustPlan);
router.get('/:date', ctrl.getByDate); // keep last: catches any remaining 'YYYY-MM-DD' path

module.exports = router;
