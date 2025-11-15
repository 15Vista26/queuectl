# QueueCTL - A CLI Job Queue System

`queuectl` is a minimal, production-grade background job queue system built in Node.js and SQLite. It manages background jobs with worker processes, handles retries using exponential backoff, and maintains a Dead Letter Queue (DLQ).

This project was built as an internship assignment.

## Features

* **CLI Interface:** All operations managed via `queuectl`.
* **Persistent Storage:** Uses **SQLite** to ensure jobs persist across restarts.
* **Multiple Workers:** Run multiple background worker processes in parallel.
* **Atomic Jobs:** Workers use atomic database operations to prevent race conditions.
* **Retry & Backoff:** Failed jobs retry automatically with configurable exponential backoff.
* **Dead Letter Queue (DLQ):** Jobs that exhaust all retries are moved to the DLQ.
* **Graceful Shutdown:** Workers can be stopped gracefully, allowing them to finish their current job.

## Setup Instructions

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd queuectl
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Link the CLI:**
    This makes the `queuectl` command available in your shell for testing.
    ```bash
    npm link
    ```
    *(You may need `sudo npm link` depending on your permissions)*

## Usage Examples

### 1. Enqueue a Job
Jobs are enqueued using a JSON string.
```bash
# Add a job that completes successfully
queuectl enqueue '{"id":"job1","command":"echo Hello from job 1"}'

# Add a job that will fail (e.g., command not found)
queuectl enqueue '{"id":"job2","command":"exit 1"}'

# Add a job that takes time
queuectl enqueue '{"id":"job3","command":"sleep 3 && echo Job 3 finished"}'
```

### 2. Start Workers
You can start one or more background workers.
```bash
# Start 3 workers in the background
queuectl worker:start --count 3
```
*(Logs are piped to the `logs/` directory)*

### 3. Check Status
Get a summary of job states and active workers.
```bash
queuectl status

--- Job Status ---
pending       : 1
completed     : 1
failed        : 0
dead          : 1

--- Worker Status ---
Active workers (3): 12345, 12346, 12347
```

### 4. List Jobs
List jobs, optionally filtering by state.
```bash
# List all jobs
queuectl list

# List only pending jobs
queuectl list --state pending
```

### 5. Manage the Dead Letter Queue (DLQ)
View and retry failed jobs.
```bash
# List all jobs that have permanently failed
queuectl dlq:list

# Retry a specific job from the DLQ (resets attempts)
queuectl dlq:retry job2
```

### 6. Configure Settings
Manage retry behavior.
```bash
# Set max retries to 5 (default 3)
queuectl config:set max_retries 5

# Set backoff base to 3 (default 2)
# (delay = 3 ^ attempt)
queuectl config:set backoff_base 3
```

### 7. Stop Workers
Stop all running background workers gracefully.
```bash
queuectl worker:stop
```

## Architecture Overview

* **CLI (`src/cli.js`):** Uses `commander` to parse commands and calls business logic.
* **Database (`src/db.js`):** Uses `sqlite` and `sqlite3`. A single `queue.sqlite` file is created in the `db/` directory to store all job and config data.
* **Worker Management (`src/workerManager.js`):**
    * `worker:start` spawns detached Node.js processes running `src/worker-process.js`.
    * PIDs are stored in the `.pids/` directory.
    * `worker:stop` reads these PIDs and sends a `SIGTERM` signal for graceful shutdown.
* **Worker Process (`src/worker-process.js`):**
    * This is the background process. It runs an infinite loop, polling for jobs.
    * **Atomicity:** It uses an `UPDATE ... RETURNING` SQL query to fetch and lock a job in a single, atomic transaction. This is the core of the concurrency model.
    * **Execution:** Uses `child_process.exec` to run the job's `command`.
    * **Backoff:** On failure, it updates the job's `run_at` timestamp to a future time based on `base ^ attempts` and sets its state back to `pending`.

## Assumptions & Trade-offs

* **Persistence:** SQLite was chosen over a JSON file for its built-in transactional support, which is critical for preventing concurrency issues (race conditions) and avoids manual file locking.
* **Worker Polling:** Workers poll the database every 2 seconds. In a larger system, this would be replaced by a pub/sub mechanism (e.g., Redis) to avoid excess DB load, but polling is simpler and sufficient for this problem.
* **PID Files:** PID files are a simple, cross-platform-ish way to manage background processes. A more robust solution might use a dedicated process manager like `pm2`.

## Testing Instructions

1.  **Clear the database:**
    ```bash
    rm db/queue.sqlite
    ```
2.  **Stop any running workers:**
    ```bash
    queuectl worker:stop
    ```
3.  **Start workers:**
    ```bash
    queuectl worker:start -c 2
    ```
4.  **Test 1: Successful Job**
    ```bash
    queuectl enqueue '{"id":"test1","command":"echo test1 complete"}'
    sleep 3
    queuectl status
    # (Expect test1 to be 'completed')
    ```
5.  **Test 2: Failed Job -> DLQ**
    * Set retries to 2 for a fast test.
    ```bash
    queuectl config:set max_retries 2
    queuectl enqueue '{"id":"test2","command":"fakecommand-that-fails"}'
    ```
    * Watch the worker logs (`logs/`) or use `queuectl list --state pending`. You will see it retry with backoff and then move to the DLQ.
    ```bash
    # After ~10 seconds...
    queuectl dlq:list
    # (Expect to see test2)
    ```
6.  **Test 3: Concurrency**
    ```bash
    # Enqueue 10 fast jobs
    for i in {1..10}; do queuectl enqueue "{\"id\":\"con-test-$i\",\"command\":\"echo test $i\"}"; done
    # Check status, they should all move to 'completed' quickly
    sleep 5
    queuectl status
    ```
7.  **Test 4: Graceful Shutdown**
    ```bash
    # Enqueue a long-running job
    queuectl enqueue '{"id":"longjob","command":"sleep 10 && echo long job done"}'
    
    # Immediately after, stop workers
    queuectl worker:stop
    
    # The workers will shut down *after* the 10-second job finishes.
    # Check the logs or `queuectl status` after 15 seconds.
    # (Expect 'longjob' to be 'completed')
    ```
 ## Demo Video Link :- 
 https://drive.google.com/file/d/1DzwW60oXWIXVpyxTAB0Gc1g4zWavymff/view?usp=sharing
