const models = require('../models');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Validator = require('fastest-validator');
require("dotenv").config();
const { Op, Sequelize, fn, col, literal } = require('sequelize');
const { v4: uuidv4 } = require('uuid');



// async function getUserInfo(req, res) {
//     try {
//         // get the id
//         const id = req.params.id;

//         if (!id) {
//             return res.status(400).json({
//                 message: "Invalid or missing user id"
//             });
//         }

//         const users = await models.user.findAll({
//             where: { userid: id }
//         });

//         if (users && users.length > 0) {
//             return res.status(200).json({
//                 details: users
//             });
//         } else {
//             return res.status(404).json({
//                 message: "user not found"
//             });
//         }
//     } catch (error) {
//         return res.status(500).json({
//             message: "something went wrong",
//             error: error.message
//         });
//     }
// }


// async function getUserInfo(req, res) {
//     try {
//         // get the id
//         const id = req.params.id;

//         if (!id) {
//             return res.status(400).json({
//                 message: "Invalid or missing user id"
//             });
//         }

//         // User details
//         const users = await models.user.findAll({
//             where: { userid: id }
//         });

//         // User beneficiary
//         const beneficiary = await models.beneficiary.findAll({
//             where: { userid: id },
//             order: [['id', 'DESC']]
//         });

//         // User transactions
//         const getUserAccount = await models.user.findOne({ where: { userid: id } });

//         const transactions = await models.transaction.findAll({
//             where: {
//                 [Op.or]: [
//                     { sender: id },
//                     { receiver: getUserAccount.phone }
//                 ]
//             },
//             order: [['id', 'DESC']]
//         });

        
//             return res.status(200).json({
//                 details: users,
//                 beneficiaries: beneficiary,
//                 transaction: transactions
//             });
//     } catch (error) {
//         return res.status(500).json({
//             message: "something went wrong",
//             error: error.message
//         });
//     }
// }


async function getUserInfo(req, res) {
    try {
        // get the id
        const id = req.params.id;

        if (!id) {
            return res.status(400).json({
                message: "Invalid or missing user id"
            });
        }

        // User details
        const users = await models.user.findAll({
            where: { userid: id }
        });

        // User beneficiary
        const beneficiaries = await models.beneficiary.findAll({
            where: { userid: id },
            order: [['id', 'DESC']]
        });

        // Attach images to beneficiaries
        for (const beneficiary of beneficiaries) {
            const user = await models.user.findOne({
                where: { phone: beneficiary.acc_num }
            });
            if (user && user.image) {
                beneficiary.image = user.image; // Assuming the image field in the user table is 'image'
            } else {
                beneficiary.image = null; // or set a default image
            }
        }

        // User transactions
        const getUserAccount = await models.user.findOne({ where: { userid: id } });

        const transactions = await models.transaction.findAll({
            where: {
                [Op.or]: [
                    { sender: id },
                    { receiver: getUserAccount.phone }
                ]
            },
            order: [['id', 'DESC']]
        });

        return res.status(200).json({
            details: users,
            beneficiaries: beneficiaries,
            transactions: transactions
        });
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
            password: { type: "number", optional: false, },
            image: { type: "string", optional: false, }
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
            image: req.body.image,
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
            narration: { type: "string", optional: true, },
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
            narration: req.body.narration,
            pin: hash,
        };

        // Check if phone number already exists
        const phoneExists = await models.user.findOne({ where: { phone: send.receiver } });
        if (!phoneExists) {
            return res.status(409).json({ message: "Receiver's number does not exist" });
        }

        // Get the user account
        const getUserAccount = await models.user.findOne({ where: { userid: send.sender } });

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
            { where: { userid: send.sender } }
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

        // Get the user account
        const getUserAccount = await models.user.findOne({ where: { userid: id } });

        // if (getUserAccount) {
        //     if(getUserAccount.balance < send.amount){
        //         return res.status(507).json({
        //             message: "Insufficient balance"
        //         });
        //     }
        // }

        const transactions = await models.transaction.findAll({
            where: {
                [Op.or]: [
                    { sender: id },
                    { receiver: getUserAccount.phone }
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



async function addBeneficiary(req, res) {
    try {

        // Validate input
        const schema = {
            userid: { type: "string", optional: false, max: "100" },
            acc_name: { type: "string", optional: false, max: "100" },
            acc_num: { type: "string", optional: false, max: "100" },
            bank_name: { type: "string", optional: true, max: "100" },
            bank_code: { type: "number", optional: true, }
        };

        const v = new Validator();
        const validationResponse = v.validate(req.body, schema);

        if (validationResponse !== true) {
            return res.status(400).json({
                message: "Validation failed",
                errors: validationResponse
            });
        }

        const beneficiary = {
            userid: req.body.userid,
            acc_name: req.body.acc_name,
            acc_num: req.body.acc_num,
            bank_name: req.body.bank_name,
            bank_code: req.body.bank_code,
            status: 0
        };

        // Check if email or phone number already exists
        const checkBeneficiary = await models.beneficiary.findAll({ where: { userid: req.body.userid, acc_num: req.body.acc_num  } });
        if (checkBeneficiary) {
            return res.status(200).json({
                message: "beneficiary added"
            });
        }

        // Save user to the database
        await models.beneficiary.create(beneficiary);
        res.status(200).json({
            message: "beneficiary added"
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            message: "Something went wrong",
            error: error.message
        });
    }
}



async function getBeneficiary(req, res) {
    try {
        // get the id
        const id = req.params.id;

        if (!id) {
            return res.status(400).json({
                message: "Invalid or missing user id"
            });
        }

        const beneficiary = await models.beneficiary.findAll({
            where: { userid: id },
            order: [['id', 'DESC']]
        });

        if (beneficiary && beneficiary.length > 0) {
            return res.status(200).json({
                beneficiaries: beneficiary
            });
        } else {
            return res.status(404).json({
                message: "beneficiary not found"
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
    getTransaction: getTransaction,
    addBeneficiary: addBeneficiary,
    getBeneficiary: getBeneficiary
}