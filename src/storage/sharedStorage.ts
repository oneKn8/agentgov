import { SqliteStorage } from "./SqliteStorage.js";

let storagePromise: Promise<SqliteStorage> | undefined;

export function getStorage(): Promise<SqliteStorage> {
  storagePromise ??= initializedStorage().catch((error) => {
    storagePromise = undefined;
    throw error;
  });
  return storagePromise;
}

async function initializedStorage(): Promise<SqliteStorage> {
  const storage = new SqliteStorage();
  await storage.init();
  return storage;
}
