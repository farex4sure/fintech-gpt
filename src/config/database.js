// app.js or wherever you initialize your application

const Sequelize = require('sequelize');
const config = require('./config');
require("dotenv").config();
const config = require('./config.json');

const env = process.env.NODE_ENV || 'development';
const sequelizeConfig = config[env];

const sequelize = new Sequelize(
  sequelizeConfig.database,
  sequelizeConfig.username,
  sequelizeConfig.password,
  {
    host: sequelizeConfig.host,
    dialect: sequelizeConfig.dialect,
    logging: false, // disable logging SQL queries to console
  }
);

// Test the connection
sequelize
  .authenticate()
  .then(() => {
    console.log('Connection has been established successfully.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

// Export the sequelize instance to use in other parts of your application
module.exports = sequelize;
