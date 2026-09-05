const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/taskController');

router.post('/:id/complete', ctrl.completeTask);
router.post('/:id/miss', ctrl.missTask);

module.exports = router;
