const { createModel } = require("../db/mongo-compat");

const PluginLogs = createModel("PluginLogs", { capped: 10000 });

module.exports = PluginLogs;
