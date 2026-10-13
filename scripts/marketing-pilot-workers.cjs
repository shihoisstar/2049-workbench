// Restart only worker processes; the caller keeps the same database, queue and spending journal.
function supervisePilotWorkers(entries, start, now = Date.now) {
  const workers = entries.map(entry => ({ entry, child: null, restarts: 0, retryAt: 0, error: null }));
  let closing = false;
  function launch(worker) {
    worker.error = null;
    worker.child = start(worker.entry, worker.restarts);
    worker.child.once('error', error => { worker.error = error; worker.retryAt = now() + 1000 * 2 ** worker.restarts; });
    worker.child.once('exit', () => { worker.retryAt = now() + 1000 * 2 ** worker.restarts; });
  }
  for (const worker of workers) launch(worker);
  return {
    children: () => workers.map(worker => worker.child),
    tick: () => {
      if (closing) return;
      for (const worker of workers) {
        if (!worker.error && worker.child.exitCode === null && worker.child.signalCode === null) continue;
        if (worker.restarts >= 3) throw new Error(`Pilot ${worker.entry[0]} worker repeatedly exited; data and quota retained`);
        if (now() < worker.retryAt) continue;
        worker.restarts++; launch(worker);
      }
    },
    close: () => { closing = true; },
  };
}
module.exports = { supervisePilotWorkers };
