let majorVersion = null;
try {
  majorVersion = parseInt(process.version.replace("v", "").split(".")[0]);
} catch (e) {
  // We dont abort on parsing failures
}

// SQLite storage (node:sqlite) requires a modern Node runtime.
if (!!majorVersion && majorVersion < 22) {
  // Dont require this in the normal flow (or NODE_ENV can not be fixed before start)
  const { serveNodeVersionFallback, setupFallbackExpressServer } = require("./app-fallbacks");

  const octoFarmServer = setupFallbackExpressServer();
  serveNodeVersionFallback(octoFarmServer);
} else {
  const { setupEnvConfig, fetchOctoFarmPort } = require("./app-env");

  function bootAutoDiscovery() {
    require("./services/octoprint-auto-discovery.service.js");
  }

  // Set environment/.env file and NODE_ENV if not set. Will call startup checks.
  setupEnvConfig();

  const {
    setupExpressServer,
    serveOctoFarmNormally,
    ensureSystemSettingsInitiated
  } = require("./app-core");

  const { LOGGER_ROUTE_KEYS } = require("./constants/logger.constants");
  const Logger = require("./handlers/logger.js");

  const logger = new Logger(LOGGER_ROUTE_KEYS.SERVER_APP);

  const octoFarmServer = setupExpressServer();

  ensureSystemSettingsInitiated()
    .then(async () => {
      const port = fetchOctoFarmPort();
      if (!port || Number.isNaN(parseInt(port))) {
        throw new Error("OctoFarm requires a numeric port input argument");
      }

      const app = await serveOctoFarmNormally(octoFarmServer);

      const { onShutdown } = require("./services/system-service-control.service");

      const applicationServer = app.listen(port, "0.0.0.0", () => {
        logger.info(`Server started... open it at http://127.0.0.1:${port}`);
        if (typeof process.send === "function") {
          process.send("ready");
        }
      });

      process.on("SIGINT", function () {
        logger.debug("SIGINT: Requesting shutdown of Application");
        onShutdown(applicationServer);
      });

      process.on("SIGTERM", function () {
        logger.debug("SIGTERM: Requesting shutdown of Application");
        onShutdown(applicationServer);
      });

      //PM2 Specific
      process.on("message", function (msg) {
        if (msg === "shutdown") {
          logger.debug("SIGTERM: Requesting shutdown of Application");
          onShutdown(applicationServer);
        }
      });

      logger.debug("Listeners for shutdown added!");
    })
    .catch((err) => {
      logger.error("OctoFarm failed to start", err.stack);
      process.exitCode = 1;
    });

  bootAutoDiscovery();
}
