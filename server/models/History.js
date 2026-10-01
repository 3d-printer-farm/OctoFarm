const { createModel } = require("../db/mongo-compat");

const History = createModel("History");

module.exports = History;
