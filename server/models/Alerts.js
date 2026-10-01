const { createModel } = require("../db/mongo-compat");

const Alert = createModel("Alerts");

module.exports = Alert;
