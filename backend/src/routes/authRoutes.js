const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const identifyUser = require('../middleware/identifyUser');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/guest', authController.createGuestSession);
router.get('/me', identifyUser, authController.getMe);

module.exports = router;
