const { createModel } = require("../db/mongo-compat");

const TempHistory = createModel("TempHistory", { capped: 10000 });

module.exports = TempHistory;
