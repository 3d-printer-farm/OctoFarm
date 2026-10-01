const { randomUUID } = require("crypto");
const store = require("./sqlite-store");

// A small, deliberately partial re-implementation of the slice of the Mongoose API
// OctoFarm's existing code actually calls (find/findOne/findById/findOneAndUpdate/
// findByIdAndUpdate/deleteOne/deleteMany/countDocuments/create/paginate, `new Model()`
// + `.save()`, and $set/$push/$pull/$inc update operators). It exists so the rest of
// the codebase - which is written in a very Mongoose-idiomatic, document-mutation
// style - didn't all need rewriting at once when MongoDB was dropped in favour of
// SQLite. It is NOT a general Mongo query engine: only the patterns this codebase
// uses are supported.

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (cur[key] == null || typeof cur[key] !== "object") {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[keys[keys.length - 1]] = value;
}

function comparable(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) && !isNaN(Date.parse(value))) {
    return Date.parse(value);
  }
  return value;
}

function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (a instanceof Date || b instanceof Date) {
    return comparable(a) === comparable(b);
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return a === b;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function valueMatches(actual, expected) {
  const isOperatorObject =
    expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date);

  if (!isOperatorObject) {
    return expected instanceof Date ? comparable(actual) === comparable(expected) : deepEqual(actual, expected);
  }

  return Object.entries(expected).every(([op, opVal]) => {
    switch (op) {
      case "$gte":
        return comparable(actual) >= comparable(opVal);
      case "$lte":
        return comparable(actual) <= comparable(opVal);
      case "$gt":
        return comparable(actual) > comparable(opVal);
      case "$lt":
        return comparable(actual) < comparable(opVal);
      case "$ne":
        return !deepEqual(actual, opVal);
      case "$in":
        return Array.isArray(opVal) && opVal.some((v) => deepEqual(actual, v));
      case "$exists":
        return opVal ? actual !== undefined : actual === undefined;
      default:
        // Unrecognised operator: fall back to a direct equality check against the
        // whole expected object rather than silently matching everything.
        return deepEqual(actual, expected);
    }
  });
}

function matchesFilter(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") {
      return expected.some((sub) => matchesFilter(doc, sub));
    }
    if (key === "$and") {
      return expected.every((sub) => matchesFilter(doc, sub));
    }
    const actual = key.includes(".") ? getPath(doc, key) : doc[key];
    return valueMatches(actual, expected);
  });
}

function applyUpdate(doc, update) {
  const operatorKeys = Object.keys(update).filter((key) => key.startsWith("$"));
  if (operatorKeys.length === 0) {
    // Mongoose treats a plain (non-operator) update object as an implicit $set.
    Object.assign(doc, update);
    return doc;
  }
  for (const op of operatorKeys) {
    const payload = update[op];
    if (op === "$set") {
      for (const [path, value] of Object.entries(payload)) {
        setPath(doc, path, value);
      }
    } else if (op === "$push") {
      for (const [path, value] of Object.entries(payload)) {
        const current = getPath(doc, path);
        const arr = Array.isArray(current) ? current.slice() : [];
        arr.push(value);
        setPath(doc, path, arr);
      }
    } else if (op === "$pull") {
      for (const [path, value] of Object.entries(payload)) {
        const current = getPath(doc, path);
        if (Array.isArray(current)) {
          setPath(
            doc,
            path,
            current.filter((item) => !deepEqual(item, value))
          );
        }
      }
    } else if (op === "$inc") {
      for (const [path, value] of Object.entries(payload)) {
        setPath(doc, path, (getPath(doc, path) || 0) + value);
      }
    } else if (op === "$unset") {
      for (const path of Object.keys(payload)) {
        setPath(doc, path, undefined);
      }
    }
    // Any other operator is silently ignored rather than throwing - better to keep
    // the server up than to hard-fail on an update shape nothing here produces.
  }
  return doc;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

// Mongoose schemas carried nested `default:` values (e.g. new ServerSettings()
// producing a fully populated settings tree). modelOptions.defaults replicates that:
// a plain-object template deep-merged under whatever data the caller actually passed.
function deepMergeDefaults(defaults, data) {
  const result = JSON.parse(JSON.stringify(defaults));
  function merge(target, source) {
    for (const [key, value] of Object.entries(source)) {
      if (isPlainObject(value) && isPlainObject(target[key])) {
        merge(target[key], value);
      } else {
        target[key] = value;
      }
    }
  }
  merge(result, data);
  return result;
}

// Chainable, thenable stand-in for a Mongoose Query: supports the sort/limit/skip/
// lean/select/exec calls this codebase chains onto find(). Sorting on `_id` means
// "insertion order" (as ObjectIds did in Mongo), since ids here are random UUIDs.
class Query {
  constructor(loadDocs, hydrate) {
    this.loadDocs = loadDocs;
    this.hydrate = hydrate;
    this.sortSpec = null;
    this.limitCount = null;
    this.skipCount = 0;
    this.isLean = false;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  limit(n) {
    this.limitCount = n;
    return this;
  }

  skip(n) {
    this.skipCount = n;
    return this;
  }

  lean() {
    this.isLean = true;
    return this;
  }

  select() {
    return this;
  }

  run() {
    let docs = this.loadDocs().map((doc, index) => ({ doc, index }));
    if (this.sortSpec) {
      const [key, dir] = Object.entries(this.sortSpec)[0] || [];
      if (key) {
        docs.sort((a, b) => {
          const av = key === "_id" ? a.index : comparable(getPath(a.doc, key));
          const bv = key === "_id" ? b.index : comparable(getPath(b.doc, key));
          if (av < bv) return dir > 0 ? -1 : 1;
          if (av > bv) return dir > 0 ? 1 : -1;
          return 0;
        });
      }
    }
    let result = docs.map((entry) => entry.doc);
    if (this.skipCount) {
      result = result.slice(this.skipCount);
    }
    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }
    return this.isLean ? result : result.map(this.hydrate);
  }

  exec(callback) {
    const promise = Promise.resolve().then(() => this.run());
    if (typeof callback === "function") {
      promise.then((docs) => callback(null, docs)).catch((err) => callback(err));
      return undefined;
    }
    return promise;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

function createModel(collectionName, modelOptions = {}) {
  class ModelInstance {
    constructor(data = {}) {
      const withDefaults = modelOptions.defaults ? deepMergeDefaults(modelOptions.defaults, data) : data;
      Object.assign(this, withDefaults);
      if (!this._id) {
        this._id = randomUUID();
      }
    }

    get id() {
      return this._id;
    }

    markModified() {}

    toObject() {
      return JSON.parse(JSON.stringify(this));
    }

    async save() {
      const plain = this.toObject();
      store.upsert(collectionName, this._id, plain);
      if (modelOptions.capped) {
        store.trimToMostRecent(collectionName, modelOptions.capped);
      }
      return this;
    }
  }

  function hydrate(data) {
    if (!data) {
      return null;
    }
    const instance = Object.create(ModelInstance.prototype);
    return Object.assign(instance, data);
  }

  const statics = {
    find(filter = {}) {
      return new Query(() =>
        store
          .allInCollection(collectionName)
          .filter((doc) => matchesFilter(doc, filter))
      , hydrate);
    },

    async findOne(filter = {}) {
      const doc = store.allInCollection(collectionName).find((entry) => matchesFilter(entry, filter));
      return doc ? hydrate(doc) : null;
    },

    findById(id, callback) {
      const run = async () => {
        if (id === undefined || id === null) {
          return null;
        }
        return hydrate(store.getById(collectionName, String(id)));
      };
      if (typeof callback === "function") {
        run()
          .then((doc) => callback(null, doc))
          .catch((err) => callback(err));
        return undefined;
      }
      return run();
    },

    async findByIdAndUpdate(id, update, opts = {}) {
      const data = store.getById(collectionName, String(id));
      if (!data) {
        return null;
      }
      applyUpdate(data, update);
      store.upsert(collectionName, String(id), data);
      return hydrate(data);
    },

    async findOneAndUpdate(filter, update, opts = {}) {
      const data = store.allInCollection(collectionName).find((entry) => matchesFilter(entry, filter));
      if (!data) {
        if (opts.upsert) {
          const created = new ModelInstance({ ...filter });
          applyUpdate(created, update);
          await created.save();
          return created;
        }
        return null;
      }
      applyUpdate(data, update);
      store.upsert(collectionName, data._id, data);
      return hydrate(data);
    },

    async deleteOne(filter = {}) {
      const doc = store.allInCollection(collectionName).find((entry) => matchesFilter(entry, filter));
      if (doc) {
        store.removeById(collectionName, doc._id);
      }
      return { deletedCount: doc ? 1 : 0, acknowledged: true };
    },

    async deleteMany(filter = {}) {
      const docs = store.allInCollection(collectionName).filter((entry) => matchesFilter(entry, filter));
      store.removeWhere(
        collectionName,
        docs.map((doc) => doc._id)
      );
      return { deletedCount: docs.length, acknowledged: true };
    },

    async countDocuments(filter = {}) {
      return store.allInCollection(collectionName).filter((doc) => matchesFilter(doc, filter)).length;
    },

    async create(data) {
      const instance = new ModelInstance(data);
      await instance.save();
      return instance;
    },

    // Mimics the subset of mongoose-paginate-v2 OctoFarm's history service relies on:
    // find+sort+page+limit, with its "customLabels" remapping, and a callback whose
    // return value (if any) becomes the resolved value - matching how history.service.js
    // actually consumes it.
    async paginate(filter = {}, options = {}, callback) {
      let docs = store.allInCollection(collectionName).filter((doc) => matchesFilter(doc, filter));

      if (options.sort) {
        const [sortKey, sortDir] = Object.entries(options.sort)[0] || [];
        if (sortKey) {
          docs = docs.slice().sort((a, b) => {
            const av = comparable(getPath(a, sortKey));
            const bv = comparable(getPath(b, sortKey));
            if (av < bv) return sortDir > 0 ? -1 : 1;
            if (av > bv) return sortDir > 0 ? 1 : -1;
            return 0;
          });
        }
      }

      const page = options.page || 1;
      const limit = options.limit || docs.length || 10;
      const totalDocs = docs.length;
      const totalPages = Math.max(1, Math.ceil(totalDocs / limit));
      const start = (page - 1) * limit;
      const pageDocs = docs.slice(start, start + limit).map(hydrate);

      const labels = options.customLabels || {};
      const rawResult = { docs: pageDocs, totalDocs, limit, page, totalPages };
      const labelledResult = {};
      for (const [key, value] of Object.entries(rawResult)) {
        labelledResult[labels[key] || key] = value;
      }
      if (labels.meta) {
        labelledResult[labels.meta] = labelledResult;
      }

      if (typeof callback === "function") {
        const callbackReturn = callback(null, { ...rawResult, paginator: labelledResult });
        return callbackReturn !== undefined ? callbackReturn : labelledResult;
      }
      return labelledResult;
    }
  };

  return Object.assign(ModelInstance, statics);
}

module.exports = { createModel };
