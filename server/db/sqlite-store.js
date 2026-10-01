const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

// OctoFarm used to run on MongoDB; this is the replacement storage engine. Every
// "collection" (what used to be a Mongoose model) is just a row set in one generic
// table: id + a JSON blob. This keeps the very document-shaped, loosely-typed data
// OctoFarm already dealt with (Object/Array/Mixed fields everywhere) working the
// same way, without redesigning everything into a rigid relational schema.

function resolveDatabasePath() {
  const configured = process.env.OCTOFARM_SQLITE_PATH;
  if (configured) {
    return configured;
  }
  return path.join(__dirname, "..", "octofarm.db");
}

let db;

function getDatabase() {
  if (db) {
    return db;
  }
  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (collection, id)
    );
  `);
  return db;
}

function allInCollection(collection) {
  const database = getDatabase();
  const stmt = database.prepare("SELECT id, data FROM documents WHERE collection = ? ORDER BY rowid ASC");
  return stmt.all(collection).map((row) => JSON.parse(row.data));
}

function getById(collection, id) {
  const database = getDatabase();
  const stmt = database.prepare("SELECT data FROM documents WHERE collection = ? AND id = ?");
  const row = stmt.get(collection, id);
  return row ? JSON.parse(row.data) : null;
}

function upsert(collection, id, docObject) {
  const database = getDatabase();
  const now = Date.now();
  const existing = database
    .prepare("SELECT createdAt FROM documents WHERE collection = ? AND id = ?")
    .get(collection, id);
  const createdAt = existing ? existing.createdAt : now;
  database
    .prepare(
      `INSERT INTO documents (collection, id, data, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`
    )
    .run(collection, id, JSON.stringify(docObject), createdAt, now);
}

function removeById(collection, id) {
  const database = getDatabase();
  database.prepare("DELETE FROM documents WHERE collection = ? AND id = ?").run(collection, id);
}

function removeWhere(collection, ids) {
  const database = getDatabase();
  const stmt = database.prepare("DELETE FROM documents WHERE collection = ? AND id = ?");
  for (const id of ids) {
    stmt.run(collection, id);
  }
}

function countInCollection(collection) {
  const database = getDatabase();
  const row = database
    .prepare("SELECT COUNT(*) as count FROM documents WHERE collection = ?")
    .get(collection);
  return row.count;
}

// Keeps high-frequency telemetry collections (temperature history, room sensor data,
// plugin logs) from growing forever, roughly standing in for Mongo's capped collections.
function trimToMostRecent(collection, maxDocs) {
  const database = getDatabase();
  const count = countInCollection(collection);
  if (count <= maxDocs) {
    return;
  }
  const excess = count - maxDocs;
  database
    .prepare(
      `DELETE FROM documents WHERE rowid IN (
         SELECT rowid FROM documents WHERE collection = ? ORDER BY createdAt ASC LIMIT ?
       )`
    )
    .run(collection, excess);
}

module.exports = {
  getDatabase,
  allInCollection,
  getById,
  upsert,
  removeById,
  removeWhere,
  countInCollection,
  trimToMostRecent
};
