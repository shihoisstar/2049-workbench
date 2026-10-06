const { rmSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '..');
// Only this package's compiler output; deleted source files must not survive in dist.
rmSync(resolve(root, 'dist'), { recursive: true, force: true });
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
