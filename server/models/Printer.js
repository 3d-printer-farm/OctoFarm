const { createModel } = require("../db/mongo-compat");

const defaults = {
  disabled: false,
  onboarding: {
    fullyScanned: false,
    userApi: false,
    settingsApi: false,
    systemApi: false,
    profileApi: false,
    stateApi: false
  },
  category: "OctoPrint"
};

const Printer = createModel("Printer", { defaults });

module.exports = Printer;
