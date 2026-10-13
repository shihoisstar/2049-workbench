const assert = require('node:assert/strict'); const {createHash} = require('node:crypto');
function reserveSampleCall(plan, report, step, operation, payload) {
  assert.ok(Array.isArray(report.attempts) && report.attempts.length < plan.callsLimit, 'Sample call limit exhausted');
  assert.ok(!report.attempts.some(item => ['pending','unknown'].includes(item.status)), 'Unknown acceptance blocks new paid requests');
  assert.ok(!report.attempts.some(item => item.step === step && item.operation === operation), 'Never repeat a sample POST');
  const frame = plan.frames.find(item => item.id === step); assert.ok(frame); assert.ok(['image','video','speech'].includes(operation));
  assert.equal(payload.model, operation === 'speech' ? plan.speechModel : operation === 'video' ? plan.videoModel : frame.imageModel);
  if (operation === 'speech') { assert.equal(payload.text, frame.narration); assert.equal(payload.voice, plan.speechVoice); assert.equal(payload.language_boost, 'Chinese'); assert.equal(payload.speed, 1); assert.equal(payload.format, 'wav'); }
  else { assert.equal(payload.prompt, operation === 'image' ? frame.imagePrompt : frame.videoPrompt); assert.equal(payload.aspect_ratio, '9:16');
    if (operation === 'image') { assert.equal(payload.resolution, '1k'); assert.equal(payload.output_format, 'png'); assert.ok(payload.num_images === undefined || payload.num_images === 1); if (frame.reference) assert.ok(Array.isArray(payload.images) && payload.images.length === 1); }
    else { assert.equal(payload.duration, 5); assert.equal(payload.resolution, '720p'); assert.equal(payload.image, report.outputs[step].image.url); }
  }
  const maximumUsd = plan.reservationUsd[operation]; const reserved = report.attempts.reduce((sum,item) => sum + Math.round(item.maximumUsd * 1e6), 0);
  assert.ok(Number.isSafeInteger(reserved) && reserved + Math.round(maximumUsd * 1e6) <= Math.round(plan.conservativeUsdCap * 1e6), 'Sample USD budget exceeded');
  const attempt = { step, operation, status: 'pending', maximumUsd, payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), startedAt: new Date().toISOString() };
  report.attempts.push(attempt); return attempt;
}
module.exports = {reserveSampleCall};
