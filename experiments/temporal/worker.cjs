const { Worker, NativeConnection } = require('@temporalio/worker');

async function main() {
  const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection, namespace: 'default', taskQueue: process.env.TEMPORAL_TASK_QUEUE,
    workflowsPath: require.resolve('./workflows.cjs'), activities: require('./activities.cjs'),
    maxConcurrentActivityTaskExecutions: 8, maxConcurrentWorkflowTaskExecutions: 8,
    shutdownGraceTime: '2 seconds',
  });
  console.log(`WORKER_READY ${process.pid}`);
  try { await worker.run(); } finally { await connection.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
