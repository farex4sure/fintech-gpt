const models = require('../models');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Validator = require('fastest-validator');
require("dotenv").config();
const { Op, Sequelize, fn, col, literal } = require('sequelize');
const { v4: uuidv4 } = require('uuid');



async function getUserInfo(req, res) {
    try {
        // get the id
        const id = req.params.id;

        if (!id) {
            return res.status(400).json({
                message: "Invalid or missing user id"
            });
        }

        const users = await models.user.findAll({
            where: { phone: id }
        });

        if (users && users.length > 0) {
            return res.status(200).json({
                details: users
            });
        } else {
            return res.status(404).json({
                message: "user not found"
            });
        }
    } catch (error) {
        return res.status(500).json({
            message: "something went wrong",
            error: error.message
        });
    }
}



async function signUp(req, res) {
    try {

        // Validate input
        const schema = {
            userid: { type: "string", optional: false, max: "100" },
            fullname: { type: "string", optional: false, max: "100" },
            email: { type: "string", optional: false, max: "100" },
            phone: { type: "string", optional: false, max: "100" },
            password: { type: "number", optional: false, }
        };

        const v = new Validator();
        const validationResponse = v.validate(req.body, schema);

        if (validationResponse !== true) {
            return res.status(400).json({
                message: "Validation failed",
                errors: validationResponse
            });
        }

        // Hash the password
        const numberAsString = req.body.password.toString();
        const salt = await bcryptjs.genSalt(10);
        const hash = await bcryptjs.hash(numberAsString, salt);

        const send = {
            userid: req.body.userid,
            fullname: req.body.fullname,
            email: req.body.email,
            phone: req.body.phone,
            password: hash,
            balance: 0,
            status: 0
        };

        // Check if email or phone number already exists
        const emailExists = await models.user.findOne({ where: { email: send.email } });
        if (emailExists) {
            return res.status(409).json({ message: "Email Address already exists" });
        }

        const phoneExists = await models.user.findOne({ where: { phone: send.phone } });
        if (phoneExists) {
            return res.status(409).json({ message: "Phone number already exists" });
        }

        // Save user to the database
        await models.user.create(send);
        const token = jwt.sign({ phone: send.email }, process.env.JWT_KEY, { expiresIn: '1d' });
        res.status(200).json({
            message: "registration successfull",
            token: token
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            message: "Something went wrong",
            error: error.message
        });
    }
}



async function transfer(req, res) {
    try {

        // Validate input
        const schema = {
            sender: { type: "string", optional: false, max: "100" },
            receiver: { type: "string", optional: false, max: "100" },
            amount: { type: "number", optional: false, },
            pin: { type: "number", optional: false, }
        };

        const v = new Validator();
        const validationResponse = v.validate(req.body, schema);

        if (validationResponse !== true) {
            return res.status(400).json({
                message: "Validation failed",
                errors: validationResponse
            });
        }

        // Hash the password
        const numberAsString = req.body.pin.toString();
        const salt = await bcryptjs.genSalt(10);
        const hash = await bcryptjs.hash(numberAsString, salt);

        const send = {
            sender: req.body.sender,
            receiver: req.body.receiver,
            amount: req.body.amount,
            pin: hash,
        };

        // Check if phone number already exists
        const phoneExists = await models.user.findOne({ where: { phone: send.receiver } });
        if (!phoneExists) {
            return res.status(409).json({ message: "Receiver's number does not exist" });
        }

        // Get the user account
        const getUserAccount = await models.user.findOne({ where: { phone: send.sender } });

        if (getUserAccount) {
            if(getUserAccount.balance < send.amount){
                return res.status(507).json({
                    message: "Insufficient balance"
                });
            }
        }

        // sender new balance
        const newSBal = getUserAccount.balance-send.amount;

        // receiver new balance
        const newRBal = phoneExists.balance+send.amount;

        // Update send balance
        await models.user.update(
            { balance: newSBal },
            { where: { phone: send.sender } }
          );

        //   Update receiver balance
        await models.user.update(
        { balance: newRBal },
        { where: { phone: send.receiver } }
        );

        function generatePaymentRefId() {
            return uuidv4();
        }

        // generate reference id for the payment
        const paymentRefId = generatePaymentRefId();

        // get current time stamp
        const currentUnixTimestamp = Math.floor(Date.now() / 1000);

        // the transaction details body
        const transact = {
            userid: req.body.sender,
            sender: req.body.sender,
            receiver: req.body.receiver,
            amount: req.body.amount,
            refid: paymentRefId,
            date: currentUnixTimestamp,
        };

        // Save transaction to the database
        await models.transaction.create(transact);

        return res.status(200).json({
            message: "Transaction Successfull"
        });

        

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            message: "Something went wrong",
            error: error.message
        });
    }
}



async function getTransaction(req, res) {
    try {
        // get the id
        const id = req.params.id;

        if (!id) {
            return res.status(400).json({
                message: "Invalid or missing user id"
            });
        }

        const transactions = await models.transaction.findAll({
            where: {
                [Op.or]: [
                    { sender: id },
                    { receiver: id }
                ]
            },
            order: [['id', 'DESC']]
        });

        if (transactions && transactions.length > 0) {
            return res.status(200).json({
                transaction: transactions
            });
        } else {
            return res.status(404).json({
                message: "transaction not found"
            });
        }
    } catch (error) {
        return res.status(500).json({
            message: "something went wrong",
            error: error.message
        });
    }
}


module.exports = {
    getUserInfo: getUserInfo,
    signUp:signUp,
    transfer: transfer,
    getTransaction: getTransaction
}