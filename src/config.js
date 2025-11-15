const { getDb } = require('./db');

async function setConfig(key, value) {
  const db = await getDb();
  await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value]);
  console.log(`Config set: ${key} = ${value}`);
}

async function getConfig(key, defaultValue = null) {
  const db = await getDb();
  const row = await db.get('SELECT value FROM config WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

module.exports = { setConfig, getConfig };