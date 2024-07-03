const express = require('express');
const userController = require('../controllers/userController');
const checkAuthMiddleware = require('../middleware/check-auth');


const router = express.Router();

module.exports = router;