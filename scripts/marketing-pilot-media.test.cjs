const { test } = require('node:test'); const assert = require('node:assert/strict');
const { pilotMediaEnvironment } = require('./marketing-pilot-media.cjs');
test('Windows keeps its installed font and Scripts interpreter while Linux uses bin and Noto', () => {
  const windows = pilotMediaEnvironment('D:/2049-workbench', {}, 'win32');
  assert.equal(windows.MEDIA_FONT_FILE, 'C:/Windows/Fonts/msyh.ttc');
  assert.equal(windows.NATIVE_ASR_PYTHON, 'D:\\2049-workbench\\.local\\voice-analysis-env\\Scripts\\python.exe');
  const linux = pilotMediaEnvironment('/srv/workbench', {}, 'linux');
  assert.equal(linux.NATIVE_ASR_PYTHON, '/srv/workbench/.local/voice-analysis-env/bin/python');
  assert.equal(linux.MEDIA_FONT_FILE, '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');
  assert.equal(linux.NATIVE_ASR_MODEL_DIR, '/srv/workbench/.local/voice-models/faster-whisper-small');
  assert.equal(linux.NATIVE_ASR_SCRIPT, '/srv/workbench/scripts/local-speech-transcribe.py');
});
test('deployment paths supplied to the existing worker environment are preserved', () => {
  const env = { MEDIA_FONT_FILE: '/opt/fonts/cjk.ttc', NATIVE_ASR_PYTHON: '/opt/asr/bin/python', NATIVE_ASR_SCRIPT: '/opt/asr/transcribe.py', NATIVE_ASR_MODEL_DIR: '/opt/models/small' };
  assert.deepEqual(pilotMediaEnvironment('/srv/workbench', env, 'linux'), env);
});
