const { createModel } = require("../db/mongo-compat");

const defaults = {
  dashboard: {
    defaultLayout: [],
    savedLayout: [],
    farmActivity: {
      currentOperations: true,
      cumulativeTimes: true,
      averageTimes: true
    },
    printerStates: {
      printerState: true,
      printerTemps: true,
      printerUtilisation: true,
      printerProgress: true,
      currentStatus: true
    },
    farmUtilisation: {
      currentUtilisation: true,
      farmUtilisation: true
    },
    historical: {
      weeklyUtilisation: true,
      hourlyTotalTemperatures: true,
      environmentalHistory: false,
      historyCompletionByDay: false,
      filamentUsageByDay: false,
      filamentUsageOverTime: false
    },
    other: {
      timeAndDate: false,
      cameraCarousel: false
    }
  },
  views: {
    currentOperations: true,
    showOffline: false,
    showDisconnected: true,
    cameraColumns: 3,
    groupColumns: 4
  },
  fileManager: {
    currentOperations: false
  },
  printerManager: {
    currentOperations: false
  },
  filamentManager: {
    currentOperations: false
  },
  history: {
    currentOperations: false
  }
};

const ClientSettings = createModel("ClientSettings", { defaults });

module.exports = ClientSettings;
