import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const secretsPath = join(process.cwd(), '.dev.vars');
const action = process.argv[2];

function generateSecrets() {
  return {
    accessToken: randomBytes(32).toString('hex'),
    sessionSecret: randomBytes(32).toString('hex'),
  };
}

function writeSecrets({ accessToken, sessionSecret }) {
  writeFileSync(
    secretsPath,
    `ACCESS_TOKEN=${accessToken}\nSESSION_SECRET=${sessionSecret}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  chmodSync(secretsPath, 0o600);
}

function readAccessToken() {
  if (!existsSync(secretsPath)) {
    console.error('尚未生成本地访问 Token，请先运行 npm run auth:setup。');
    process.exit(1);
  }

  chmodSync(secretsPath, 0o600);

  const match = readFileSync(secretsPath, 'utf8').match(/^ACCESS_TOKEN=(.+)$/m);
  if (!match?.[1]) {
    console.error('.dev.vars 中缺少有效的 ACCESS_TOKEN。');
    process.exit(1);
  }
  return match[1].trim();
}

function printToken(token) {
  console.log('本地访问 Token：');
  console.log(token);
  console.log('请勿提交、截图或发送给不受信任的人。');
}

if (action === 'setup') {
  if (existsSync(secretsPath)) {
    chmodSync(secretsPath, 0o600);
    console.log('本地访问 Token 已存在，没有重新生成。使用 npm run auth:show 查看。');
    process.exit(0);
  }

  const secrets = generateSecrets();
  writeSecrets(secrets);
  console.log('本地访问 Token 已生成，并安全保存到被 Git 忽略的 .dev.vars。');
  printToken(secrets.accessToken);
} else if (action === 'show') {
  printToken(readAccessToken());
} else if (action === 'rotate') {
  const secrets = generateSecrets();
  writeSecrets(secrets);
  console.log('本地访问 Token 和会话密钥已重新生成，旧 Token 与现有会话将失效。');
  printToken(secrets.accessToken);
  console.log('请重新启动本地服务以应用新密钥。');
} else {
  console.error('用法：node scripts/manage-auth.mjs <setup|show|rotate>');
  process.exit(1);
}
