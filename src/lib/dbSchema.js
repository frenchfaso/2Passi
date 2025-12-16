export const DB_NAME = "2passi-db";
export const DB_VERSION = 2;

export function ensureDbSchema(db) {
  if (!db.objectStoreNames.contains("tracks")) {
    const store = db.createObjectStore("tracks", { keyPath: "id" });
    store.createIndex("addedAt", "addedAt");
  }

  if (!db.objectStoreNames.contains("photos")) {
    db.createObjectStore("photos", { keyPath: "id" });
  }

  if (!db.objectStoreNames.contains("tileAccess")) {
    db.createObjectStore("tileAccess", { keyPath: "tileUrl" });
  }
}

