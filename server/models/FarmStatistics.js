const { createModel } = require("../db/mongo-compat");

const FarmInfo = createModel("FarmInfo");

module.exports = FarmInfo;
