const express = require('express');
const userController = require('../controllers/userController');
const checkAuthMiddleware = require('../middleware/check-auth');


const router = express.Router();

router.post("/signup", userController.signUp);
router.post("/transfer", userController.transfer);
router.get("/getTransactions/:id", userController.getTransaction);
router.get("/getUserInfo/:id", userController.getUserInfo);
router.post("/addBeneficiary", userController.addBeneficiary);
router.get("/getBeneficiary/:id", userController.getBeneficiary);
router.post("/verifyPin", userController.verifyPin);

module.exports = router;