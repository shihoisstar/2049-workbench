const { test } = require('node:test'); const assert = require('node:assert/strict'); const { EventEmitter, once } = require('node:events');
const { spawn } = require('node:child_process'); const { setTimeout: delay } = require('node:timers/promises');
const { supervisePilotWorkers } = require('./marketing-pilot-workers.cjs');
test('real worker termination restarts the same entry and stop prevents resurrection', async () => {
  let launches = 0, time = 0;
  const entry = ['generation', 'same-entry'];
  const supervisor = supervisePilotWorkers([entry], current => {
    assert.equal(current, entry); launches++;
    return spawn(process.execPath, ['-e', launches === 1 ? 'process.exit(7)' : 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  }, () => time);
  try {
    await once(supervisor.children()[0], 'exit'); supervisor.tick(); assert.equal(launches, 1);
    time = 1000; supervisor.tick(); assert.equal(launches, 2);
    const child = supervisor.children()[0]; await once(child, 'spawn');
    const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended;
    time = 4000; supervisor.tick(); assert.equal(launches, 3);
    supervisor.close(); const last = supervisor.children()[0]; const stopped = once(last, 'exit'); last.kill('SIGTERM'); await stopped;
    time = 10000; supervisor.tick(); assert.equal(launches, 3);
  } finally { supervisor.close(); for (const child of supervisor.children()) child.kill(); }
});
test('persistent startup errors stop after three retries with data retained', async () => {
  let time = 0, launches = 0;
  const supervisor = supervisePilotWorkers([['media', 'fixture']], () => {
    const child = new EventEmitter(); child.exitCode = null; child.signalCode = null; launches++;
    queueMicrotask(() => child.emit('error', new Error('start failed'))); return child;
  }, () => time);
  await delay(0);
  for (const next of [1000, 3000, 7000]) { time = next; supervisor.tick(); await delay(0); }
  assert.equal(launches, 4); assert.throws(() => supervisor.tick(), /data and quota retained/); supervisor.close();
});
