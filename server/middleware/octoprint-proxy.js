const { getPrinterStoreCache } = require("../cache/printer-store.cache");
const fetch = require("node-fetch");
const Logger = require("../handlers/logger");
const { LOGGER_ROUTE_KEYS } = require("../constants/logger.constants");

const logger = new Logger(LOGGER_ROUTE_KEYS.MIDDLEWARE_OCTOPRINT_PROXY);

module.exports = {
  async proxyOctoPrintClientRequests(req, res) {
    const id = req.paramString("id");
    const item = req.paramString("item");

    const { printerURL, apikey } = getPrinterStoreCache().getPrinter(id);

    const redirectUrl = `${printerURL}/${item}`;
    const queryString = new URLSearchParams(req.query).toString();
    const fullUrl = queryString ? `${redirectUrl}?${queryString}` : redirectUrl;

    const isMultipart =
      req.headers["content-type"] && req.headers["content-type"].match(/^multipart\/form-data/);

    let headers;
    let body;
    if (isMultipart) {
      headers = Object.assign({}, req.headers, { "X-Api-Key": apikey });
      body = req.readable ? req : JSON.stringify(req.body);
    } else {
      headers = {
        "Content-Type": "application/json",
        "X-Api-Key": apikey
      };
      body = req.readable ? req : JSON.stringify(req.body);
    }

    try {
      const proxyResponse = await fetch(fullUrl, {
        method: req.method,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
        headers,
        redirect: "follow"
      });

      res.status(proxyResponse.status);
      proxyResponse.headers.forEach((value, name) => {
        res.setHeader(name, value);
      });

      proxyResponse.body.pipe(res);
      proxyResponse.body.on("error", () => {
        logger.error("Error pipe broken for mjpeg stream");
      });
      proxyResponse.body.on("end", () => {
        logger.info("Pipe ended on octoprint proxy");
      });
      res.on("close", () => {
        proxyResponse.body.destroy();
      });
    } catch (e) {
      logger.error("Error proxying request to OctoPrint", e);
      res.status(502).end();
    }
  }
};
