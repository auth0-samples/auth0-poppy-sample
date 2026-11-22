#!/usr/bin/env node
// Writes .env.local, which both apps read, from your tenant's values, so you don't copy and edit it by hand. The Poppy
// discovery document (apps/web/poppy.json) is written by `auth0 poppy setup` when you add Poppy.
//
//   AUTH0_CLIENT_SECRET=... node scripts/setup.mjs --domain your-tenant.auth0.com --client-id ...
//   node scripts/setup.mjs --domain your-tenant.auth0.com --client-id ... --client-secret-stdin < secret.txt
//
// The client secret comes from the AUTH0_CLIENT_SECRET environment variable or, with --client-secret-stdin, from
// standard input, or from an existing .env.local: never from a flag, which would land in your shell history and the
// process list.
//
// Options: --audience (default http://localhost:4000), --agent <cimd url> (repeatable), --force to overwrite, --dry-run
// to print without writing.
//
// It does not change your tenant. It prints the tenant-side steps at the end.

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let values;
try {
  ({ values } = parseArgs({
    options: {
      domain: { type: 'string' },
      'client-id': { type: 'string' },
      // Defined only to refuse it with a clear message.
      'client-secret': { type: 'string' },
      'client-secret-stdin': { type: 'boolean', default: false },
      audience: { type: 'string', default: 'http://localhost:4000' },
      agent: { type: 'string', multiple: true, default: ['https://poppyplayground.dev/agent.json'] },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  }));
} catch (error) {
  console.error(`${error.message.split('. To specify')[0]}. Run with --help for usage.`);
  process.exit(2);
}

if (values.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}

if (values['client-secret'] !== undefined) {
  console.error('--client-secret is not accepted: a secret on the command line lands in your shell history and the process list.');
  console.error('FIX: set AUTH0_CLIENT_SECRET in the environment, or pass --client-secret-stdin and pipe the secret in.');
  process.exit(2);
}

const envPath = join(root, '.env.local');
/** The secret, from stdin, the environment, or the existing .env.local. Never printed. */
function clientSecret() {
  if (values['client-secret-stdin']) return readFileSync(0, 'utf8').trim();
  if (process.env.AUTH0_CLIENT_SECRET?.trim()) return process.env.AUTH0_CLIENT_SECRET.trim();
  if (existsSync(envPath)) return (parseEnv(readFileSync(envPath, 'utf8')).AUTH0_CLIENT_SECRET ?? '').trim();
  return '';
}
const secret = clientSecret();
const missing = [
  !values.domain && '--domain',
  !values['client-id'] && '--client-id',
  !secret && (values['client-secret-stdin'] ? 'the client secret on standard input' : 'AUTH0_CLIENT_SECRET in the environment (or --client-secret-stdin)'),
].filter(Boolean);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}. Run with --help for usage.`);
  process.exit(1);
}

const domain = values.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
if (domain.includes('/') || domain.includes(' ')) {
  console.error('--domain is a host name, like your-tenant.auth0.com.');
  process.exit(1);
}
const clientId = values['client-id'];

const env = [
  `AUTH0_DOMAIN=${domain}`,
  `AUTH0_CLIENT_ID=${clientId}`,
  `AUTH0_CLIENT_SECRET=${secret}`,
  `AUTH0_SECRET=${randomBytes(32).toString('hex')}`,
  'APP_BASE_URL=http://localhost:3000',
  `AUTH0_AUDIENCE=${values.audience}`,
  'CARTS_API_URL=http://localhost:4001',
  `POPPY_AGENTS=${values.agent.join(',')}`,
  '',
].join('\n');

const files = [
  { path: join(root, '.env.local'), content: env, secret: true },
];

for (const file of files) {
  const shown = file.path.slice(root.length + 1);
  if (values['dry-run']) {
    console.log(`--- ${shown} (dry run, not written)`);
    console.log(file.secret ? file.content.replace(/^(AUTH0_CLIENT_SECRET|AUTH0_SECRET)=.*$/gm, '$1=<hidden>') : file.content);
    continue;
  }
  if (existsSync(file.path) && !values.force) {
    console.log(`skip  ${shown} (exists; pass --force to overwrite)`);
    continue;
  }
  writeFileSync(file.path, file.content, { mode: file.secret ? 0o600 : 0o644 });
  console.log(`wrote ${shown}`);
}

console.log(`
Tenant side (not done by this script):
  1. An API with identifier ${values.audience} and the scopes cart:write, orders:read, orders:write.
  2. A Regular Web App with client ID ${clientId}: callback http://localhost:3000/auth/callback,
     logout URL http://localhost:3000. Grant it the API above.
  3. Poppy enabled for the app and the API (auth0 poppy setup), and each agent registered: ${values.agent.join(', ')}.
  \`npm run tenant\` does 1 and 2 (and guest carts); \`auth0 poppy setup\` and \`auth0 agents register\` do 3, with https URLs.

Then:
  npm run dev
`);
