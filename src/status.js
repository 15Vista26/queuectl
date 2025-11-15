const { getDb } = require('./db');
const path = require('path');
const fs = require('fs');

const PID_DIR = path.join(__dirname, '../.pids');

async function showStatus() {
  const db = await getDb();
  const states = await db.all("SELECT state, COUNT(*) as count FROM jobs GROUP BY state");
  
  console.log("--- Job Status ---");
  if (states.length === 0) {
    console.log("No jobs in queue.");
  } else {
    states.forEach(row => {
      console.log(`${row.state.padEnd(12)}: ${row.count}`);
    });
  }

  console.log("\n--- Worker Status ---");
  try {
    const pids = fs.readdirSync(PID_DIR).map(f => f.replace('.pid', ''));
    if (pids.length > 0) {
      console.log(`Active workers (${pids.length}): ${pids.join(', ')}`);
    } else {
      console.log("No active workers.");
    }
  } catch (e) {
    console.log("No active workers.");
  }
}

async function listJobs(state) {
  const db = await getDb();
  let query = "SELECT id, state, command, attempts, updated_at, error FROM jobs";
  const params = [];

  if (state !== 'all') {
    query += " WHERE state = ?";
    params.push(state);
  }
  query += " ORDER BY updated_at DESC LIMIT 50";

  const jobs = await db.all(query, params);
  if (jobs.length === 0) {
    console.log(`No jobs found${state !== 'all' ? ` with state "${state}"` : ''}.`);
    return;
  }
  console.table(jobs);
}

async function listDlq() {
  await listJobs('dead');
}

async function retryDlqJob(jobId) {
  const db = await getDb();
  const now = new Date().toISOString();
  
  const result = await db.run(
    `UPDATE jobs 
     SET state = 'pending', attempts = 0, error = NULL, run_at = ?, updated_at = ?
     WHERE id = ? AND state = 'dead'`,
    [now, now, jobId]
  );

  if (result.changes > 0) {
    console.log(`Job ${jobId} re-queued from DLQ.`);
  } else {
    console.error(`Could not find job ${jobId} in DLQ.`);
  }
}

module.exports = { showStatus, listJobs, listDlq, retryDlqJob };