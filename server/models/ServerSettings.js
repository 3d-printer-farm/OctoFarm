const { createModel } = require("../db/mongo-compat");

const defaults = {
  server: {
    loginRequired: false,
    registration: true
  },
  timeout: {
    apiRetry: 30000,
    webSocketRetry: 5000
  },
  filament: {
    filamentCheck: false,
    downDateSuccess: false,
    downDateFailed: false,
    hideEmpty: false,
    allowMultiSelect: true
  },
  history: {
    snapshot: {
      onComplete: false,
      onFailure: false
    },
    thumbnails: {
      onComplete: false,
      onFailure: false
    },
    timelapse: {
      onComplete: false,
      onFailure: false,
      deleteAfter: false
    }
  },
  influxExport: {
    active: false,
    host: undefined,
    port: undefined,
    database: undefined,
    username: undefined,
    password: undefined,
    retentionPolicy: {
      defaultRet: undefined
    }
  },
  monitoringViews: {
    panel: true,
    list: true,
    camera: true,
    group: false,
    currentOperations: false,
    combined: false
  },
  cameras: {
    proxyEnabled: false,
    aspectRatio: "0",
    updateInterval: 10000
  }
};

const ServerSettings = createModel("ServerSettings", { defaults });

module.exports = ServerSettings;
