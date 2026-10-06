const {
  defineSignal, defineQuery, setHandler, condition, executeChild,
  proxyActivities, workflowInfo,
} = require('@temporalio/workflow');

const approve = defineSignal('approve');
const retryShot = defineSignal('retryShot');
const state = defineQuery('state');
const { renderShot } = proxyActivities({
  startToCloseTimeout: '5 seconds', scheduleToCloseTimeout: '15 seconds',
  retry: { maximumAttempts: 1 },
});

async function shotWorkflow(shot, generation) {
  return renderShot(shot, generation);
}

async function episodeWorkflow() {
  let approved = false;
  const requestedRetries = new Set();
  let stage = 'waiting-approval';
  const completed = {};
  const failed = [];
  setHandler(approve, () => { approved = true; });
  setHandler(retryShot, (shot) => { requestedRetries.add(shot); });
  setHandler(state, () => ({ stage, completed, failed }));
  await condition(() => approved);
  stage = 'rendering';
  const shots = ['shot-a', 'shot-b', 'shot-c'];
  const render = (shot, generation) => executeChild(shotWorkflow, {
    workflowId: `${workflowInfo().workflowId}/${shot}/${generation}`,
    args: [shot, generation],
  });
  await Promise.all(shots.map(async (shot) => {
    try { completed[shot] = await render(shot, 1); }
    catch { failed.push(shot); }
  }));
  stage = 'waiting-retry';
  for (const shot of failed) {
    await condition(() => requestedRetries.has(shot));
    completed[shot] = await render(shot, 2);
  }
  stage = 'completed';
  return completed;
}

async function failureWorkflow(mode) {
  const { fault } = proxyActivities({
    startToCloseTimeout: '1 second', scheduleToCloseTimeout: '8 seconds',
    retry: { maximumAttempts: 2, initialInterval: '100 milliseconds', backoffCoefficient: 1 },
  });
  return fault(mode);
}

module.exports = { episodeWorkflow, shotWorkflow, failureWorkflow };
