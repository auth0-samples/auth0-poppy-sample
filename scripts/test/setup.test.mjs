// Tests for scripts/setup.mjs in a scratch copy of the repository layout: the secret never comes from a flag, and it
// leaves apps/web/poppy.json to `auth0 poppy setup`.
//
//   node --test "scripts/test/*.test.mjs"

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const SECRET = 'setup-secret-do-not-print';
let tmp;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'setup-'));
  mkdirSync(join(tmp, 'scripts'));
  mkdirSync(join(tmp, 'apps/web/scripts'), { recursive: true });
  cpSync(join(repo, 'scripts/setup.mjs'), join(tmp, 'scripts/setup.mjs'));
  cpSync(join(repo, 'apps/web/poppy.example.json'), join(tmp, 'apps/web/poppy.example.json'));
  cpSync(join(repo, 'apps/web/scripts/poppy-file.mjs'), join(tmp, 'apps/web/scripts/poppy-file.mjs'));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const setup = (args, env = {}, input) =>
  spawnSync(process.execPath, [join(tmp, 'scripts/setup.mjs'), '--domain', 'tenant.example.com', '--client-id', 'CLIENT', ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
    input,
  });

test('--client-secret is refused, and nothing is written', () => {
  const r = setup(['--client-secret', SECRET]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /shell history[\s\S]*FIX: set AUTH0_CLIENT_SECRET/);
  assert.ok(!existsSync(join(tmp, '.env.local')));
});

test('reads the secret from AUTH0_CLIENT_SECRET or stdin, and writes no poppy.json', () => {
  for (const [args, env, input] of [[[], { AUTH0_CLIENT_SECRET: SECRET }], [['--client-secret-stdin'], {}, `${SECRET}\n`]]) {
    rmSync(join(tmp, '.env.local'), { force: true });
    const r = setup(args, env, input);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(SECRET));
    assert.match(readFileSync(join(tmp, '.env.local'), 'utf8'), new RegExp(`^AUTH0_CLIENT_SECRET=${SECRET}$`, 'm'));
    assert.ok(!existsSync(join(tmp, 'apps/web/poppy.json')), 'auth0 poppy setup writes it');
  }
});
