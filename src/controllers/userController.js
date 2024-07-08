const models = require('../models');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Validator = require('fastest-validator');
require("dotenv").config();
const { Op, Sequelize, fn, col, literal } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require("nodemailer");



async function getUserInfo(req, res) {
    try {
        // Get the id
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
        const updatedBeneficiaries = await Promise.all(beneficiaries.map(async (beneficiary) => {
            const user = await models.user.findOne({
                where: { phone: beneficiary.acc_num }
            });
            // Create a new object with the image field
            return {
                ...beneficiary.toJSON(), // Convert to plain object
                image: user && user.image ? user.image : null // or set a default image
            };
        }));

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

        // Attach sender and receiver names and isCredit field to transactions
        const updatedTransactions = await Promise.all(transactions.map(async (transaction) => {
            const senderUser = await models.user.findOne({
                where: { userid: transaction.sender }
            });

            const receiverUser = await models.user.findOne({
                where: { phone: transaction.receiver }
            });

            return {
                ...transaction.toJSON(), // Convert to plain object
                senderName: senderUser ? senderUser.fullname : null,
                receiverName: receiverUser ? receiverUser.fullname : null,

                senderPic: senderUser ? senderUser.image : null,
                receiverPic: receiverUser ? receiverUser.image : null,
                isCredit: transaction.sender !== id // Determine if the transaction is a credit
            };
        }));

        // Log updated beneficiaries and transactions for debugging
        // console.log(updatedBeneficiaries);
        // console.log(updatedTransactions);

        return res.status(200).json({
            details: users,
            beneficiaries: updatedBeneficiaries,
            transactions: updatedTransactions
        });
    } catch (error) {
        return res.status(500).json({
            message: "Something went wrong",
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
        // const salt = await bcryptjs.genSalt(10);
        const hash = numberAsString

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
            amount: { type: "number", optional: false },
            narration: { type: "string", optional: true },
            pin: { type: "number", optional: false }
        };

        const v = new Validator();
        const validationResponse = v.validate(req.body, schema);

        if (validationResponse !== true) {
            return res.status(400).json({
                message: "Validation failed",
                errors: validationResponse
            });
        }

        // Hash the PIN
        const numberAsString = req.body.pin.toString();
        // const salt = await bcryptjs.genSalt(10);
        const hash = numberAsString

        const send = {
            sender: req.body.sender,
            receiver: req.body.receiver,
            amount: req.body.amount,
            narration: req.body.narration,
            pin: hash
        };

        // Check if receiver's phone number exists
        const phoneExists = await models.user.findOne({ where: { phone: send.receiver } });
        if (!phoneExists) {
            return res.status(409).json({ message: "Receiver's number does not exist" });
        }

        // Get the sender's user account
        const getUserAccount = await models.user.findOne({ where: { userid: send.sender } });

        if (getUserAccount) {
            if (getUserAccount.balance < send.amount) {
                return res.status(507).json({
                    message: "Insufficient balance"
                });
            }
        }

        if (hash !== getUserAccount.password ) {
            return res.status(507).json({
                message: "Incorrect Pin"
            });
        }

        // Calculate new balances
        const newSBal = getUserAccount.balance - send.amount;
        const newRBal = phoneExists.balance + send.amount;

        // Update sender's balance
        await models.user.update(
            { balance: newSBal },
            { where: { userid: send.sender } }
        );

        // Update receiver's balance
        await models.user.update(
            { balance: newRBal },
            { where: { phone: send.receiver } }
        );

        // Generate payment reference ID
        const paymentRefId = uuidv4();

        // Get current timestamp
        const currentUnixTimestamp = Math.floor(Date.now() / 1000);

        // Create transaction object
        const transact = {
            userid: req.body.sender,
            sender: req.body.sender,
            receiver: req.body.receiver,
            amount: req.body.amount,
            refid: paymentRefId,
            narration: req.body.narration,
            date: currentUnixTimestamp
        };

        // Save transaction to the database
        const transaction = await models.transaction.create(transact);

        // Get sender and receiver details
        const senderUser = await models.user.findOne({ where: { userid: transaction.sender } });
        const receiverUser = await models.user.findOne({ where: { phone: transaction.receiver } });

        // Attach additional data to the transaction
        const updatedTransaction = {
            ...transaction.toJSON(),
            senderName: senderUser ? senderUser.fullname : null,
            receiverName: receiverUser ? receiverUser.fullname : null,
            senderPic: senderUser ? senderUser.image : null,
            receiverPic: receiverUser ? receiverUser.image : null,
            isCredit: transaction.sender !== req.body.sender
        };

        return res.status(200).json({
            // message: "Transaction Successful",
            transaction: updatedTransaction
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
            bank_code: { type: "string", optional: true }
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

        // Check if beneficiary already exists
        const checkBeneficiary = await models.beneficiary.findOne({ where: { userid: req.body.userid, acc_num: req.body.acc_num } });
        if (checkBeneficiary) {
            return res.status(200).json({
                // message: "Beneficiary already exists",
                beneficiary: checkBeneficiary
            });
        }

        // Save beneficiary to the database
        const newBeneficiary = await models.beneficiary.create(beneficiary);
        res.status(200).json({
            // message: "Beneficiary added",
            beneficiary: newBeneficiary
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



async function verifyPin(req, res) {
    try {

        // Validate input
        const schema = {
            userid: { type: "string", optional: false, max: "100" },
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
        // const salt = await bcryptjs.genSalt(10);
        const hash = numberAsString

        const send = {
            userid: req.body.userid,
            pin: hash,
        };

        // Get the user pin
        const getUserAccount = await models.user.findOne({ where: { userid: send.userid } });

        if (getUserAccount) {
            if(getUserAccount.password !== send.pin){
                return res.status(200).json({
                    verified: false
                });
            }else{
                return res.status(200).json({
                    verified: true
                });
            }
        }else{
            return res.status(404).json({
                message: "User not found"
            });
        }

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            message: "Something went wrong",
            error: error.message
        });
    }
}



// async function sendMail(req, res) {
//     try {

//         // Validate input
//         const schema = {
//             listofitems: { type: "string", optional: false, max: "100" },
//             itemsimages: { type: "string", optional: false, max: "100" },
//             dailycost: { type: "string", optional: false, max: "100" },
//             delivery: { type: "string", optional: false, max: "100" },
//             day: { type: "string", optional: false, max: "100" },
//             total: { type: "string", optional: false, max: "100" }
//         };

//         const v = new Validator();
//         const validationResponse = v.validate(req.body, schema);

//         if (validationResponse !== true) {
//             return res.status(400).json({
//                 message: "Validation failed",
//                 errors: validationResponse
//             });
//         }

//         // Transporter setup using environment variables for security
//         let transporter = nodemailer.createTransport({
//             host: 'saudinnov.sa',
//             port: 465,
//             secure: true, // true for 465, false for other ports
//             auth: {
//                 user: 'shop@saudinnov.sa', // your email address
//                 pass: 'k,r]K8-Ws(y7' // your email password
//             }
//         });
//         // const transporter = nodemailer.createTransport({
//         //     service: 'gmail',
//         //     auth: {
//         //         user: 'faruqhassan176@gmail.com',
//         //         pass: 'zczpgharpqurijsa'
//         //     }
//         // });

//         const mailOptions = {
//             from: 'shop@saudinnov.sa',
//             to: req.body.email,
//             subject: 'New Rent',
            
//             // Your OTP for registration is: ${otp},
//             html: `
//             <!DOCTYPE html>
//             <html>
//             <body>
//                 <div style="width: 300px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; font-family: Arial, sans-serif;">
//                     <h2 style="text-align: left; font-size: 18px; margin-bottom: 20px;">Order Summary</h2>
//                     <label for="days" style="display: block; margin-bottom: 5px;">Day(s)</label>
//                     <input type="text" id="days" name="days" value="1" readonly style="width: 100%; padding: 5px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px;">
//                     <div class="cost-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
//                         <span>Daily Cost:</span>
//                         <span>SAR 3137.00</span>
//                     </div>
//                     <div class="cost-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
//                         <span>Delivery:</span>
//                         <span>SAR 50.00</span>
//                     </div>
//                     <div class="cost-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
//                         <span>Day(s):</span>
//                         <span>1</span>
//                     </div>
//                     <div class="cost-item total" style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px;">
//                         <span>Total:</span>
//                         <span>SAR 3187.00</span>
//                     </div>
//                     <button type="button" style="width: 100%; padding: 10px; background-color: #007B55; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">Checkout</button>
//                 </div>
//             </body>
//             </html>

//             `
//         };

//         transporter.sendMail(mailOptions, (error, info) => {
//             if (error) {
//                 console.log(error);
//             } else {

//                 models.otp.destroy({where: {email:req.body.email}}).then(result => {
//                     models.otp.create(send).then(result => {
//                         res.status(200).json({
//                             message: "OTP has been successfully sent"
//                         });
//                     }).catch(error => {
//                         res.status(500).json({
//                             message: "Something went wrong",
//                             error: error
//                         });
//                     });
//                 })
//             }
//         })
        
//     } catch (error) {
//         console.error('Error:', error);
//         res.status(500).json({
//             message: "Something went wrong",
//             error: error.message
//         });
//     }
// }


// async function sendMail(req, res) {
//     try {
//         // Validate input
//         const schema = {
//             listofitems: { type: "array", items: "string", optional: false },
//             itemsimages: { type: "array", items: "string", optional: false },
//             dailycost: { type: "string", optional: false, max: 100 },
//             delivery: { type: "string", optional: false, max: 100 },
//             day: { type: "string", optional: false, max: 100 },
//             total: { type: "string", optional: false, max: 100 },
//             email: { type: "email", optional: false }
//         };

//         const v = new Validator();
//         const validationResponse = v.validate(req.body, schema);

//         if (validationResponse !== true) {
//             return res.status(400).json({
//                 message: "Validation failed",
//                 errors: validationResponse
//             });
//         }

//         // Transporter setup using environment variables for security
//         // let transporter = nodemailer.createTransport({
//         //     host: 'saudinnov.sa',
//         //     port: 465,
//         //     secure: true, // true for 465, false for other ports
//         //     auth: {
//         //         user: 'shop@saudinnov.sa', // your email address
//         //         pass: 'k,r]K8-Ws(y7' // your email password
//         //     }
//         // });
//         const transporter = nodemailer.createTransport({
//             service: 'gmail',
//             auth: {
//                 user: 'faruqhassan176@gmail.com',
//                 pass: 'zczpgharpqurijsa'
//             }
//         });

//         // Generate items list HTML
//         let itemsHtml = '';
//         req.body.listofitems.forEach((item, index) => {
//             itemsHtml += `
//                 <div style="margin-bottom: 10px;">
//                     <img src="${req.body.itemsimages[index]}" alt="Item Image" style="max-width: 100px; max-height: 100px;">
//                     <p>${item}</p>
//                 </div>
//             `;
//         });

//         const mailOptions = {
//             from: 'shop@saudinnov.sa',
//             to: req.body.email,
//             subject: 'New Rent',
//             html: `
//             <!DOCTYPE html>
//             <html>
//             <body>
//                 <div style="width: 300px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; font-family: Arial, sans-serif;">
//                     <h2 style="text-align: left; font-size: 18px; margin-bottom: 20px;">Order Summary</h2>
//                     ${itemsHtml}
//                     <div class="cost-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
//                         <span>Daily Cost:</span>
//                         <span>${req.body.dailycost}</span>
//                     </div>
//                     <div class="cost-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
//                         <span>Delivery:</span>
//                         <span>${req.body.delivery}</span>
//                     </div>
//                     <div class="cost-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
//                         <span>Day(s):</span>
//                         <span>${req.body.day}</span>
//                     </div>
//                     <div class="cost-item total" style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px;">
//                         <span>Total:</span>
//                         <span>${req.body.total}</span>
//                     </div>
//                 </div>
//             </body>
//             </html>
//             `
//         };

//         transporter.sendMail(mailOptions, (error, info) => {
//             if (error) {
//                 console.log(error);
//                 return res.status(500).json({
//                     message: "Failed to send email",
//                     error: error
//                 });
//             } else {
//                 res.status(200).json({
//                     message: "message has been successfully sent"
//                 });
//             }
//         });

//     } catch (error) {
//         console.error('Error:', error);
//         res.status(500).json({
//             message: "Something went wrong",
//             error: error.message
//         });
//     }
// }



async function sendMail(req, res) {
    try {
        // Validate input
        const schema = {
            listofitems: { type: "array", items: "string", optional: false },
            itemsimages: { type: "array", items: "string", optional: false },
            dailycost: { type: "string", optional: false, max: 100 },
            delivery: { type: "string", optional: false, max: 100 },
            day: { type: "string", optional: false, max: 100 },
            total: { type: "string", optional: false, max: 100 },
            receiverEmail: { type: "email", optional: false },
            userEmail: { type: "email", optional: false },
            fullname: { type: "string", optional: false, max: 100 },
            mobile: { type: "string", optional: false, max: 20 }
        };

        const v = new Validator();
        const validationResponse = v.validate(req.body, schema);

        if (validationResponse !== true) {
            return res.status(400).json({
                message: "Validation failed",
                errors: validationResponse
            });
        }
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'faruqhassan176@gmail.com',
                pass: 'zczpgharpqurijsa'
            }
        });

        // Generate items list HTML with grid layout for images
        let itemsHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px;">';
        req.body.listofitems.forEach((item, index) => {
            itemsHtml += `
                <div style="text-align: center;">
                    <img src="${req.body.itemsimages[index]}" alt="Item Image" style="max-width: 100px; max-height: 100px;">
                    <p>${item}</p>
                </div>
            `;
        });
        itemsHtml += '</div>';

        const mailOptions = {
            from: 'shop@saudinnov.sa',
            to: req.body.receiverEmail,
            subject: 'New Rent',
            html: `
            <!DOCTYPE html>
            <html>
            <body>
                <div style="width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; font-family: Arial, sans-serif;">
                    <h2 style="text-align: left; font-size: 18px; margin-bottom: 20px;">Order Summary</h2>
                    <p><strong>Full Name:</strong> ${req.body.fullname}</p>
                    <p><strong>Mobile:</strong> ${req.body.mobile}</p>
                    <p><strong>Email:</strong> ${req.body.userEmail}</p>
                    ${itemsHtml}
                    <div class="cost-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span>Daily Cost:</span>
                        <span>${req.body.dailycost}</span>
                    </div>
                    <div class="cost-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span>Delivery:</span>
                        <span>${req.body.delivery}</span>
                    </div>
                    <div class="cost-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span>Day(s):</span>
                        <span>${req.body.day}</span>
                    </div>
                    <div class="cost-item total" style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px;">
                        <span>Total:</span>
                        <span>${req.body.total}</span>
                    </div>
                </div>
            </body>
            </html>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                return res.status(500).json({
                    message: "Failed to send email",
                    error: error
                });
            } else {
                res.status(200).json({
                    message: "Message has been successfully sent"
                });
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            message: "Something went wrong",
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
    getBeneficiary: getBeneficiary,
    verifyPin: verifyPin,
    sendMail: sendMail
}