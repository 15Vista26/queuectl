const { program } = require('commander');
const { initDb } = require('./db');
const { enqueueJob } = require('./queue');
const { startWorkers, stopWorkers } = require('./workerManager');
const { showStatus, listJobs, listDlq, retryDlqJob } = require('./status');
const { setConfig } = require('./config');

async function main() {
  // Ensure DB is initialized before any command runs
  await initDb();

  program.version('1.0.0').description('QueueCTL - A CLI Job Queue');

  // Enqueue Command
  program
    .command('enqueue <jobJson>')
    .description('Add a new job to the queue')
    .action(enqueueJob);

  // Worker Commands
  program
    .command('worker:start')
    .description('Start one or more workers')
    .option('-c, --count <number>', 'Number of workers', '1')
    .action((options) => startWorkers(parseInt(options.count, 10)));

  program
    .command('worker:stop')
    .description('Stop all running workers gracefully')
    .action(stopWorkers);

  // Status Command
  program
    .command('status')
    .description('Show summary of all job states & active workers')
    .action(showStatus);

  // List Jobs Command
  program
    .command('list')
    .description('List jobs by state')
    .option('-s, --state <state>', 'Filter by state (pending, completed, failed, dead)', 'all')
    .action((options) => listJobs(options.state));

  // DLQ Commands
  program
    .command('dlq:list')
    .description('View jobs in the Dead Letter Queue')
    .action(listDlq);

  program
    .command('dlq:retry <jobId>')
    .description('Retry a specific job from the DLQ')
    .action(retryDlqJob);

  // Config Command
  program
    .command('config:set <key> <value>')
    .description('Manage configuration (e.g., max_retries, backoff_base)')
    .action(setConfig);

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { main };

main();