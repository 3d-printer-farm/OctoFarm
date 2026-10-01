const { createModel } = require("../db/mongo-compat");

const RoomData = createModel("RoomData", { capped: 10000 });

module.exports = RoomData;
