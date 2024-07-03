const express = require('express');
const userController = require('../controllers/userController');
const checkAuthMiddleware = require('../middleware/check-auth');


const router = express.Router();

router.post("/signup", userController.signUp);
router.post("/transfer", userController.transfer);
router.post("/getTransactions", userController.getTransaction);

module.exports = router;