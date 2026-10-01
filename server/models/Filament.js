const { createModel } = require("../db/mongo-compat");

const Spool = createModel("Filament");

module.exports = Spool;
