const { createModel } = require("../db/mongo-compat");

const ErrorLog = createModel("ErrorLog", { capped: 2000 });

module.exports = ErrorLog;
