const { spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const type = process.argv[2];
if (!['h5', 'weapp'].includes(type)) throw new Error('Expected h5 or weapp');
const result = spawnSync(process.execPath, [require.resolve('@tarojs/cli/bin/taro'), 'build', '--type', type], {
  stdio: 'inherit',
  env: { ...process.env, TARO_APP_STUDIO_PREVIEW: '1' },
});
process.exitCode = result.status ?? 1;
if (result.status === 0 && type === 'weapp') {
  const config = JSON.parse(readFileSync(resolve(__dirname, '../project.config.json'), 'utf8'));
  config.miniprogramRoot = 'weapp/';
  config.srcMiniprogramRoot = 'weapp/';
  config.projectname = '2049-studio-integration';
  config.description = '2049 UI联调包，不用于上传发布';
  const path = resolve(__dirname, '../dist/studio/project.config.json');
  const content = JSON.stringify(config, null, 2) + '\n';
  writeFileSync(path, content);
  if (readFileSync(path, 'utf8') !== content) throw new Error('Project config readback mismatch');
}
