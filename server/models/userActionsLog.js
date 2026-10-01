const { createModel } = require("../db/mongo-compat");

const UserAction = createModel("UserAction", { capped: 5000 });

module.exports = UserAction;
