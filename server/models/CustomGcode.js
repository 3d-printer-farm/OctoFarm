const { createModel } = require("../db/mongo-compat");

const CustomGcode = createModel("CustomGcode");

module.exports = CustomGcode;
