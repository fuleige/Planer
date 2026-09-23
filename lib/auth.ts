import { env } from 'cloudflare:workers';

const PRODUCTION_COOKIE_NAME = '__Host-xushi_session';
const DEVELOPMENT_COOKIE_NAME = 'xushi_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MINIMUM_SECRET_LENGTH = 32;

type AuthSecrets = {
  accessToken: string;
  sessionSecret: string;
};

function readSecrets(): AuthSecrets {
  const bindings = env as unknown as {
    ACCESS_TOKEN?: string;
    SESSION_SECRET?: string;
  };

  return {
    accessToken: bindings.ACCESS_TOKEN?.trim() ?? '',
    sessionSecret: bindings.SESSION_SECRET?.trim() ?? '',
  };
}

function hasValidSecretLengths(secrets: AuthSecrets) {
  return (
    secrets.accessToken.length >= MINIMUM_SECRET_LENGTH &&
    secrets.sessionSecret.length >= MINIMUM_SECRET_LENGTH
  );
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function importSessionKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) return rawValue.join('=') || null;
  }
  return null;
}

async function verifySession(value: string, sessionSecret: string) {
  const [encodedPayload, encodedSignature, extra] = value.split('.');
  if (!encodedPayload || !encodedSignature || extra) return false;

  try {
    const key = await importSessionKey(sessionSecret);
    const signature = decodeBase64Url(encodedSignature);
    const validSignature = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(encodedPayload),
    );
    if (!validSignature) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedPayload)),
    ) as { version?: number; expiresAt?: number; nonce?: string };

    return (
      payload.version === 1 &&
      typeof payload.expiresAt === 'number' &&
      payload.expiresAt > Math.floor(Date.now() / 1000) &&
      typeof payload.nonce === 'string' &&
      payload.nonce.length >= 16
    );
  } catch {
    return false;
  }
}

export async function getAuthStatus(cookieHeader: string | null) {
  const secrets = readSecrets();
  const configured = hasValidSecretLengths(secrets);
  if (!configured) return { configured: false, authenticated: false };

  const session =
    readCookie(cookieHeader, PRODUCTION_COOKIE_NAME) ??
    readCookie(cookieHeader, DEVELOPMENT_COOKIE_NAME);
  const authenticated = session
    ? await verifySession(session, secrets.sessionSecret)
    : false;

  return { configured: true, authenticated };
}

export async function validateAccessToken(candidate: string) {
  const secrets = readSecrets();
  if (!hasValidSecretLengths(secrets) || candidate.length > 512) return false;

  const [candidateDigest, expectedDigest] = await Promise.all([
    digest(candidate),
    digest(secrets.accessToken),
  ]);
  return constantTimeEqual(candidateDigest, expectedDigest);
}

export async function createSessionValue() {
  const secrets = readSecrets();
  if (!hasValidSecretLengths(secrets)) throw new Error('访问控制尚未配置');

  const nonce = crypto.getRandomValues(new Uint8Array(18));
  const payload = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      nonce: encodeBase64Url(nonce),
    }),
  );
  const encodedPayload = encodeBase64Url(payload);
  const key = await importSessionKey(secrets.sessionSecret);
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload)),
  );
  return `${encodedPayload}.${encodeBase64Url(signature)}`;
}

export function createSessionCookie(value: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === 'https:';
  const name = secure ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME;
  return [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearSessionCookies() {
  return [
    `${PRODUCTION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`,
    `${DEVELOPMENT_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`,
  ];
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function protectApi(
  request: Request,
  options: { mutation?: boolean } = {},
) {
  const auth = await getAuthStatus(request.headers.get('cookie'));
  if (!auth.configured) {
    return Response.json({ error: '访问控制尚未配置' }, { status: 503 });
  }
  if (!auth.authenticated) {
    return Response.json({ error: '请先登录' }, { status: 401 });
  }
  if (options.mutation && !isSameOrigin(request)) {
    return Response.json({ error: '请求来源无效' }, { status: 403 });
  }
  return null;
}
