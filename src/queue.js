const { getDb } = require('./db');
const { getConfig } = require('./config');

async function enqueueJob(jobJson) {
  try {
    const job = JSON.parse(jobJson);
    if (!job.id || !job.command) {
      throw new Error('Job must have "id" and "command"');
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const maxRetries = job.max_retries || (await getConfig('max_retries', 3));

    const params = {
      $id: job.id,
      $command: job.command,
      $state: 'pending',
      $attempts: 0,
      $max_retries: maxRetries,
      $created_at: now,
      $updated_at: now,
      $run_at: now, // Ready to run immediately
      $error: null,
      $worker_id: null
    };

    await db.run(
      `INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at, run_at, error, worker_id)
       VALUES ($id, $command, $state, $attempts, $max_retries, $created_at, $updated_at, $run_at, $error, $worker_id)`,
      params
    );

    console.log(`Job enqueued: ${job.id}`);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      console.error(`Error: A job with ID "${job.id}" already exists.`);
    } else {
      console.error(`Error enqueuing job: ${error.message}`);
    }
  }
}

module.exports = { enqueueJob };