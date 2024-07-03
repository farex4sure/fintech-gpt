'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class beneficiary extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  beneficiary.init({
    userid: DataTypes.STRING,
    acc_name: DataTypes.STRING,
    acc_num: DataTypes.STRING,
    bank_name: DataTypes.STRING,
    bank_code: DataTypes.STRING,
    status: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'beneficiary',
  });
  return beneficiary;
};