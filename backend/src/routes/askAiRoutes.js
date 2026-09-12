const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/askAiController');

router.post('/', ctrl.askAi);

module.exports = router;
