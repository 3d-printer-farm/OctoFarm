const { createModel } = require("../db/mongo-compat");

const Profiles = createModel("Profile");

module.exports = Profiles;
