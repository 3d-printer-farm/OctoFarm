const { createModel } = require("../db/mongo-compat");

const User = createModel("User");

module.exports = User;
