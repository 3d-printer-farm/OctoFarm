const { createModel } = require("../db/mongo-compat");

const User = createModel("User", { computedDefaults: { date: () => new Date() } });

module.exports = User;
