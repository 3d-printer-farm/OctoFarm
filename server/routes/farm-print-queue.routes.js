const express = require("express");
const multer = require("multer");
const fs = require("fs");
const fetch = require("node-fetch");
const FormData = require("form-data");

const router = express.Router();
const { getPrinterStoreCache } = require("../cache/printer-store.cache");
const { notifySubscribers } = require("../services/server-side-events.service");
const { MESSAGE_TYPES } = require("../constants/sse.constants");
const {
  inboxFolder,
  createJob,
  getJob,
  listJobs,
  removeJob
} = require("../services/farm-print-queue.service");
const Logger = require("../handlers/logger");
const { LOGGER_ROUTE_KEYS } = require("../constants/logger.constants");

const logger = new Logger(LOGGER_ROUTE_KEYS.ROUTE_FARM_PRINT_QUEUE);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, inboxFolder),
    filename: (req, file, callback) => callback(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: {
    fileSize: 1024 * 1024 * 1024 // 1GB, gcode files can be large
  }
});

// OctoPrint-compatible upload endpoint. This is what slicers such as OrcaSlicer's
// "Print Host" upload target instead of a single printer: it doesn't know about
// OctoFarm's printer list, so the file lands in a shared inbox and OctoFarm asks a
// human which printer(s) on the farm should actually receive it.
router.post("/files/local", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file was uploaded" });
  }

  const print = req.body?.print === "true" || req.body?.print === true;
  const job = createJob({
    fileName: req.file.originalname,
    filePath: req.file.path,
    size: req.file.size,
    print
  });

  logger.info(`Received farm print inbox upload: ${job.fileName} (print=${print})`);

  notifySubscribers(job.jobId, MESSAGE_TYPES.FARM_PRINT_REQUEST, {
    jobId: job.jobId,
    fileName: job.fileName,
    size: job.size,
    print: job.print
  });

  // Mimic OctoPrint's file upload response shape closely enough for slicers that
  // just check for a 200/201 and don't otherwise parse the body.
  res.status(201).json({
    done: true,
    files: {
      local: {
        name: job.fileName,
        path: job.fileName
      }
    }
  });
});

router.get("/farm-print-queue", (req, res) => {
  res.json(listJobs());
});

router.delete("/farm-print-queue/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  removeJob(req.params.jobId);
  res.status(204).end();
});

// Human picks the target printer(s) from the popup; forward the staged file on to
// each chosen printer's real OctoPrint instance, same as a normal per-printer upload.
router.post("/farm-print-queue/:jobId/dispatch", async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found or already expired" });
  }

  const printerIds = Array.isArray(req.body?.printerIds) ? req.body.printerIds : [];
  if (printerIds.length === 0) {
    return res.status(400).json({ error: "No printers selected" });
  }

  const results = [];
  for (const printerId of printerIds) {
    const printer = getPrinterStoreCache().getPrinter(printerId);
    if (!printer) {
      results.push({ printerId, success: false, error: "Printer not found" });
      continue;
    }

    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(job.filePath), job.fileName);
      form.append("print", job.print ? "true" : "false");

      const response = await fetch(`${printer.printerURL}/api/files/local`, {
        method: "POST",
        headers: {
          "X-Api-Key": printer.apikey,
          ...form.getHeaders()
        },
        body: form
      });

      results.push({
        printerId,
        printerName: printer.printerName,
        success: response.ok,
        status: response.status
      });
    } catch (e) {
      logger.error(`Failed dispatching farm print job ${job.jobId} to printer ${printerId}`, e);
      results.push({ printerId, success: false, error: e.message });
    }
  }

  removeJob(job.jobId);

  res.json({ jobId: job.jobId, results });
});

module.exports = router;
