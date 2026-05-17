import { SqliteStorage } from "./SqliteStorage.js";

let storagePromise: Promise<SqliteStorage> | undefined;

export function getStorage(): Promise<SqliteStorage> {
  storagePromise ??= initializedStorage();
  return storagePromise;
}

async function initializedStorage(): Promise<SqliteStorage> {
  const storage = new SqliteStorage();
  await storage.init();
  return storage;
}
