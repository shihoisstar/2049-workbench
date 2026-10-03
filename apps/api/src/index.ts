import { buildApp } from './app';
import { loadServerEnv, numEnv } from './env';

loadServerEnv();

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
if (!databaseUrl || !jwtSecret) {
  console.error('缺少必需环境变量:DATABASE_URL / JWT_SECRET(参考 apps/api/.env.example)');
  process.exit(1);
}

const app = buildApp({ databaseUrl, jwtSecret });

const port = numEnv('PORT', 3000);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`@wb/api listening on :${port}`);
});
