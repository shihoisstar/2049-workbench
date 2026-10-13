const path = require('node:path');
function pilotMediaEnvironment(root, env = process.env, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  return {
    MEDIA_FONT_FILE: env.MEDIA_FONT_FILE || (platform === 'win32' ? 'C:/Windows/Fonts/msyh.ttc' : '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'),
    NATIVE_ASR_PYTHON: env.NATIVE_ASR_PYTHON || paths.join(root, '.local/voice-analysis-env', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    NATIVE_ASR_SCRIPT: env.NATIVE_ASR_SCRIPT || paths.join(root, 'scripts/local-speech-transcribe.py'),
    NATIVE_ASR_MODEL_DIR: env.NATIVE_ASR_MODEL_DIR || paths.join(root, '.local/voice-models/faster-whisper-small'),
  };
}
module.exports = { pilotMediaEnvironment };
