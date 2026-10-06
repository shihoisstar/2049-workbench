const portableSource = '^packages/(contracts|api-client|domain)/src/';
const tooling = '[.]test[.][cm]?[jt]sx?$';

module.exports = {
  forbidden: [
    {
      name: 'no-app-to-app', severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'no-client-to-server', severity: 'error',
      from: { path: '^(apps/(miniapp|admin)|packages/(api-client|contracts|domain))/' },
      to: { path: '^(apps/(api|api-next|worker|media-worker)|packages/(server|model-gateway))/|^@wb/(api|api-next|worker|media-worker|server|model-gateway)(/|$)' },
    },
    {
      name: 'portable-no-node', severity: 'error',
      from: { path: portableSource, pathNot: tooling },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'portable-no-platform-runtime', severity: 'error',
      from: { path: portableSource, pathNot: tooling },
      to: { path: '(^|/)(@nestjs/|@tarojs/|@temporalio/|@aws-sdk/|drizzle-orm/|pg/|postgres/|mysql2/|ioredis/|redis/|bullmq/|fastify/|express/|axios/|undici/|node-fetch/|react/|react-dom/)|^(drizzle-orm|pg|postgres|mysql2|ioredis|redis|bullmq|fastify|express|axios|undici|node-fetch|react|react-dom)$' },
    },
    {
      name: 'portable-no-tooling-import', severity: 'error',
      from: { path: portableSource, pathNot: tooling },
      to: { path: tooling },
    },
    {
      name: 'server-module-public-only', severity: 'error',
      from: { path: '^packages/server/src/modules/([^/]+)/' },
      to: {
        path: '^packages/server/src/modules/',
        pathNot: '^packages/server/src/modules/$1/|^packages/server/src/modules/[^/]+/public[.]ts$',
      },
    },
    {
      name: 'app-server-public-only', severity: 'error',
      from: { path: '^apps/' },
      to: {
        path: '^packages/server/',
        pathNot: '^packages/server/(?:src|dist)/(?:index(?:[.]d)?[.](?:ts|js)|modules/[^/]+/public(?:[.]d)?[.](?:ts|js))$',
      },
    },
  ],
  options: {
    // Keep dependency edges into dist/node_modules visible to the rules,
    // but never traverse generated output or vendor implementations.
    doNotFollow: { path: '(^|/)(node_modules|dist|figwright)/' },
    exclude: { path: '(^|/)figwright/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['types', 'import', 'require', 'node', 'default'],
    },
  },
};
