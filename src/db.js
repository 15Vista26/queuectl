const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../db');
const DB_FILE = path.join(DB_PATH, 'queue.sqlite');

// Ensure db directory exists
fs.mkdirSync(DB_PATH, { recursive: true });

let dbPromise = null;

async function getDb() {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = open({
    filename: DB_FILE,
    driver: sqlite3.Database
  });
  return dbPromise;
}

async function initDb() {
  const db = await getDb();

  // Create Jobs Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      run_at TEXT NOT NULL, -- For scheduling retries (backoff)
      error TEXT, -- To store the last error
      worker_id TEXT -- To see which worker processed it
    );
  `);

  // Create Config Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  
  // Set default config
  await db.run("INSERT OR IGNORE INTO config (key, value) VALUES ('max_retries', '3')");
  await db.run("INSERT OR IGNORE INTO config (key, value) VALUES ('backoff_base', '2')");
}

module.exports = { getDb, initDb };