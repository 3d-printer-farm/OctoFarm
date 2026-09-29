const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const Logger = require("../handlers/logger");
const { LOGGER_ROUTE_KEYS } = require("../constants/logger.constants");

const logger = new Logger(LOGGER_ROUTE_KEYS.ROUTE_FARM_PRINT_QUEUE);

// Files staged here are gcode dropped off by a slicer (e.g. OrcaSlicer's OctoPrint
// print-host) that isn't addressed to any specific printer yet. They wait for a
// human to pick a target printer (or several) from the OctoFarm UI popup.
const inboxFolder = path.join(os.tmpdir(), "octofarm-farm-print-inbox");
fs.mkdirSync(inboxFolder, { recursive: true });

const jobs = new Map();

const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour: don't let forgotten jobs pile up on disk

function pruneExpiredJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      removeJob(jobId);
    }
  }
}

function createJob({ fileName, filePath, size, print }) {
  pruneExpiredJobs();
  const jobId = crypto.randomUUID();
  const job = {
    jobId,
    fileName,
    filePath,
    size,
    print: !!print,
    createdAt: Date.now()
  };
  jobs.set(jobId, job);
  return job;
}

function getJob(jobId) {
  return jobs.get(jobId);
}

function listJobs() {
  pruneExpiredJobs();
  return Array.from(jobs.values()).map(({ jobId, fileName, size, print, createdAt }) => ({
    jobId,
    fileName,
    size,
    print,
    createdAt
  }));
}

function removeJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }
  fs.unlink(job.filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      logger.error(`Failed to clean up staged farm print file ${job.filePath}`, err);
    }
  });
  jobs.delete(jobId);
}

module.exports = {
  inboxFolder,
  createJob,
  getJob,
  listJobs,
  removeJob
};
