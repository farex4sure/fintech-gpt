const models = require('../models');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Validator = require('fastest-validator');
require("dotenv").config();
const { Op, Sequelize, fn, col, literal } = require('sequelize');

async function signUp(req, res) {
    try {

        // Validate input
        const schema = {
            userid: { type: "string", optional: false, max: "100" },
            fullname: { type: "string", optional: false, max: "100" },
            email: { type: "string", optional: false, max: "100" },
            phone: { type: "string", optional: false, max: "100" },
            password: { type: "integer", optional: false, max: "6" }
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
        const salt = await bcryptjs.genSalt(10);
        const hash = await bcryptjs.hash(req.body.password, salt);

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
        const token = jwt.sign({ phone: verify.phone }, process.env.JWT_KEY, { expiresIn: '1d' });
        res.status(201).json({
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

module.exports = {
    signUp:signUp
}