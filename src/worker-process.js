const { getDb, initDb } = require('./db');
const { getConfig } = require('./config');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;
const PID_DIR = path.join(__dirname, '../.pids');

let isShuttingDown = false;
let isProcessing = false;

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${WORKER_ID}] Received SIGTERM. Shutting down gracefully...`);
  isShuttingDown = true;
  
  // If not busy, exit immediately.
  // Otherwise, the main loop will exit after the current job.
  if (!isProcessing) {
    cleanupAndExit();
  }
});

function cleanupAndExit() {
  // Clean up its own PID file
  try {
    const pidFile = path.join(PID_DIR, `${process.pid}.pid`);
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch (e) {
    console.error(`[${WORKER_ID}] Could not clean up PID file: ${e.message}`);
  }
  console.log(`[${WORKER_ID}] Shutdown complete.`);
  process.exit(0);
}

// Helper to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJob() {
  if (isShuttingDown) return null;

  const db = await getDb();
  const now = new Date().toISOString();
  
  // This is the core atomic operation.
  // It finds a job, updates it to 'processing', and returns it.
  // The 'RETURNING *' and 'LIMIT 1' ensure only one worker
  // can get this job, all in one transaction.
  try {
    const job = await db.get(
      `UPDATE jobs
       SET state = 'processing', updated_at = ?, worker_id = ?
       WHERE id = (
         SELECT id
         FROM jobs
         WHERE state = 'pending' AND run_at <= ?
         ORDER BY created_at ASC
         LIMIT 1
       )
       RETURNING *`,
      [now, WORKER_ID, now]
    );
    return job; // Will be undefined if no job was found
  } catch (error) {
    console.error(`[${WORKER_ID}] Error fetching job: ${error.message}`);
    return null;
  }
}

async function processJob(job) {
  isProcessing = true;
  console.log(`[${WORKER_ID}] Processing job: ${job.id} (${job.command})`);
  const db = await getDb();
  const now = new Date().toISOString();

  try {
    // Execute the command
    const { stdout, stderr } = await execPromise(job.command);

    if (stderr) {
      console.warn(`[${WORKER_ID}] Job ${job.id} produced stderr: ${stderr}`);
    }

    // Success
    await db.run(
      `UPDATE jobs SET state = 'completed', updated_at = ?, error = NULL WHERE id = ?`,
      [now, job.id]
    );
    console.log(`[${WORKER_ID}] Completed job: ${job.id}`);

  } catch (error) {
    // Failure
    console.error(`[${WORKER_ID}] Failed job: ${job.id}. Error: ${error.message}`);
    
    const newAttempts = job.attempts + 1;
    const maxRetries = job.max_retries;

    if (newAttempts >= maxRetries) {
      // Move to DLQ
      await db.run(
        `UPDATE jobs SET state = 'dead', updated_at = ?, attempts = ?, error = ? WHERE id = ?`,
        [now, newAttempts, error.message, job.id]
      );
      console.log(`[${WORKER_ID}] Job ${job.id} moved to DLQ.`);
    } else {
      // Retry with exponential backoff
      const backoffBase = parseInt(await getConfig('backoff_base', '2'), 10);
      // delay = base ^ attempts (in seconds)
      const delayInSeconds = Math.pow(backoffBase, newAttempts);
      const run_at = new Date(Date.now() + delayInSeconds * 1000).toISOString();

      await db.run(
        `UPDATE jobs SET state = 'pending', updated_at = ?, attempts = ?, run_at = ?, error = ? WHERE id = ?`,
        [now, newAttempts, run_at, error.message, job.id]
      );
      console.log(`[${WORKER_ID}] Job ${job.id} will retry in ${delayInSeconds}s at ${run_at}`);
    }
  }
  isProcessing = false;
  
  // If a shutdown was requested during processing, exit now.
  if (isShuttingDown) {
    cleanupAndExit();
  }
}

async function mainLoop() {
  await initDb();
  console.log(`[${WORKER_ID}] Worker started. Listening for jobs...`);
  
  while (true) {
    if (isShuttingDown) break;

    const job = await fetchJob();
    
    if (job) {
      await processJob(job);
    } else {
      // No job found, poll every 2 seconds
      if (isShuttingDown) break;
      await sleep(2000);
    }
  }
  
  // Loop broke, which means we are shutting down
  if (isShuttingDown) {
    cleanupAndExit();
  }
}

mainLoop();