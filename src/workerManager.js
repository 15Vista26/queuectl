const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PID_DIR = path.join(__dirname, '../.pids');
const WORKER_SCRIPT = path.join(__dirname, 'worker-process.js');
const LOG_DIR = path.join(__dirname, '../logs');

// Ensure directories exist
fs.mkdirSync(PID_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

function startWorkers(count) {
  console.log(`Starting ${count} worker(s)...`);
  for (let i = 0; i < count; i++) {
    const logFile = fs.openSync(path.join(LOG_DIR, `worker-${Date.now()}.log`), 'a');

    const worker = spawn(process.execPath, [WORKER_SCRIPT], {
      detached: true,
      stdio: ['ignore', logFile, logFile], // Pipe stdout/stderr to log file
      env: { ...process.env, WORKER_ID: `worker-${process.pid}-${i}` }
    });
    
    worker.unref(); // Allow parent process to exit
    
    const pid = worker.pid;
    fs.writeFileSync(path.join(PID_DIR, `${pid}.pid`), ''); // Create PID file
    console.log(`Started worker with PID: ${pid}`);
  }
}

function stopWorkers() {
  console.log("Stopping all workers...");
  try {
    const pids = fs.readdirSync(PID_DIR).map(f => f.replace('.pid', ''));

    if (pids.length === 0) {
      console.log("No workers to stop.");
      return;
    }

    pids.forEach(pid => {
      try {
        process.kill(pid, 'SIGTERM'); // Send graceful shutdown signal
        fs.unlinkSync(path.join(PID_DIR, `${pid}.pid`)); // Clean up PID file
        console.log(`Sent SIGTERM to worker ${pid}`);
      } catch (e) {
        console.warn(`Failed to stop worker ${pid} (may be stale): ${e.message}`);
        fs.unlinkSync(path.join(PID_DIR, `${pid}.pid`)); // Clean up stale file
      }
    });
  } catch (e) {
    console.log("No running workers found.");
  }
}

module.exports = { startWorkers, stopWorkers };