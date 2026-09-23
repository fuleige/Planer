import { chmodSync, copyFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const projectRoot = process.cwd();
const sourceSecrets = join(projectRoot, '.dev.vars');
const workerDirectory = join(projectRoot, 'dist', 'server');
const workerConfig = join(workerDirectory, 'wrangler.json');
const workerSecrets = join(workerDirectory, '.dev.vars');
const wranglerBinary = join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
);

if (!existsSync(workerConfig)) {
  console.error('尚未生成生产构建，请先运行 npm run build。');
  process.exit(1);
}

if (!existsSync(sourceSecrets)) {
  console.error('缺少本地访问密钥，请先运行 npm run auth:setup。');
  process.exit(1);
}

copyFileSync(sourceSecrets, workerSecrets);
chmodSync(workerSecrets, 0o600);

const args = [
  'dev',
  '--config',
  workerConfig,
  '--persist-to',
  join(projectRoot, '.wrangler', 'state'),
];

if (process.argv.includes('--lan')) {
  args.push('--ip', '0.0.0.0', '--port', '3000');
}

const child = spawn(wranglerBinary, args, {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
