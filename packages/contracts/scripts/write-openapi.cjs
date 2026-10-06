#!/usr/bin/env node
/** 写 openapi.json(从 dist 调 buildOpenApiDocument;原 openapi.ts CLI 分支拆出——保持契约包前端可打包,无 node 依赖)。 */
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { buildOpenApiDocument } = require(join(process.cwd(), 'dist', 'openapi.js'));
const file = join(process.cwd(), 'openapi.json');
const NL = '\n';
writeFileSync(file, JSON.stringify(buildOpenApiDocument(), null, 2) + NL, 'utf8');
console.log('openapi written:', file);
