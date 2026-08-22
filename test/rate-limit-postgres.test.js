import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_BOOTSTRAP = join(ROOT, 'test/fixtures/postgres-supabase-bootstrap.sql');
const MIGRATION_021 = join(ROOT, 'supabase/migration_021_api_rate_limits.sql');
const BIN = Object.fromEntries(['initdb', 'pg_ctl', 'createdb', 'psql'].map((name) => {
  const binary = String(process.env.PATH || '')
    .split(':')
    .map((directory) => join(directory, name))
    .find((candidate) => existsSync(candidate));
  return [name, binary || name];
}));

let clusterDir;
let dataDir;
let socketDir;
let pgEnv;
let migration021Applied = false;

function run(binary, args, options = {}) {
  return execFileSync(binary, args, {
    encoding: 'utf8',
    stdio: options.stdio || [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    input: options.input,
    env: { ...process.env, ...pgEnv },
  });
}

function sql(statement, database = 'rate_limit_test') {
  return run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', database, '-c', statement]).trim();
}

async function sqlAsync(statement, database = 'rate_limit_test') {
  const { stdout } = await execFileAsync(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', database, '-c', statement], {
    encoding: 'utf8',
    env: { ...process.env, ...pgEnv },
  });
  return stdout.trim();
}

function applyMigration(number) {
  const prefix = String(number).padStart(3, '0');
  const migration = readdirSync(join(ROOT, 'supabase'))
    .find((name) => name.startsWith(`migration_${prefix}_`) && name.endsWith('.sql'));
  assert.ok(migration, `missing migration ${prefix}`);
  const migrationPath = join(ROOT, 'supabase', migration);
  if (number === 5) {
    const compatibleSql = readFileSync(migrationPath, 'utf8')
      .replace('create policy if not exists "Users read own profile"', 'create policy "Users read own profile"');
    run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'rate_limit_test', '-f', '-'], { input: compatibleSql });
    return;
  }
  run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'rate_limit_test', '-f', migrationPath]);
}

function hash(kind, subject) {
  return createHash('sha256').update(`${kind}\0${subject}`).digest('hex');
}

function callSql({ scope = 'test:ip', subjectHash = hash('ip', '203.0.113.41'), limit = 3, window = 60, cost = 1 } = {}) {
  return `select allowed, limit_value, remaining, retry_after_seconds, reset_at is not null, request_count from public.consume_api_rate_limit('${scope}', '${subjectHash}', ${limit}, ${window}, ${cost});`;
}

function parseRow(row) {
  const [allowed, limitValue, remaining, retryAfter, hasReset, requestCount] = row.split('|');
  return {
    allowed: allowed === 't',
    limit: Number(limitValue),
    remaining: Number(remaining),
    retryAfterSeconds: Number(retryAfter),
    hasReset: hasReset === 't',
    requestCount: Number(requestCount),
  };
}

before(() => {
  for (const path of Object.values(BIN)) assert.equal(existsSync(path), true, `missing PostgreSQL binary ${path}`);
  clusterDir = mkdtempSync(join(tmpdir(), 'nobre-rate-limit-'));
  dataDir = join(clusterDir, 'data');
  socketDir = join(clusterDir, 'socket');
  mkdirSync(socketDir);
  const port = String(39000 + (process.pid % 10000));
  pgEnv = { PGHOST: socketDir, PGPORT: port, PGUSER: 'postgres' };

  run(BIN.initdb, ['-A', 'trust', '-U', 'postgres', '-D', dataDir]);
  run(BIN.pg_ctl, ['-D', dataDir, '-l', join(clusterDir, 'postgres.log'), '-o', `-F -k ${socketDir} -p ${port}`, 'start']);
  run(BIN.createdb, ['rate_limit_test']);
  run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'rate_limit_test', '-f', SUPABASE_BOOTSTRAP]);
  sql('alter role service_role bypassrls;');

  for (let number = 1; number <= 20; number += 1) applyMigration(number);
  if (existsSync(MIGRATION_021)) {
    applyMigration(21);
    migration021Applied = true;
  }
});

after(() => {
  if (dataDir && existsSync(dataDir)) {
    try { run(BIN.pg_ctl, ['-D', dataDir, '-m', 'fast', 'stop']); } catch { /* root failure is reported by the test */ }
  }
  if (clusterDir?.startsWith(`${tmpdir()}/nobre-rate-limit-`) && existsSync(clusterDir)) rmSync(clusterDir, { recursive: true });
});

test('migration 021 applies and creates the durable rate-limit table', () => {
  assert.equal(migration021Applied, true, 'migration 021 must exist and apply');
  assert.equal(sql("select to_regclass('public.api_rate_limits') is not null;"), 't');
});

test('rate-limit table has RLS enabled and browser roles have no table access', () => {
  assert.equal(sql("select relrowsecurity from pg_class where oid='public.api_rate_limits'::regclass;"), 't');
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert.equal(sql(`select has_table_privilege('${role}', 'public.api_rate_limits', '${privilege}');`), 'f');
    }
    assert.throws(
      () => sql(`set role ${role}; select * from public.api_rate_limits;`),
      /permission denied/,
    );
    assert.throws(
      () => sql(`set role ${role}; insert into public.api_rate_limits(scope,subject_hash,window_started_at,request_count,updated_at) values ('x:ip','${'a'.repeat(64)}',now(),1,now());`),
      /permission denied/,
    );
  }
});

test('browser roles cannot execute consume RPC while service_role can', () => {
  const signature = 'public.consume_api_rate_limit(text,text,integer,integer,integer)';
  assert.equal(sql(`select has_function_privilege('public', '${signature}', 'EXECUTE');`), 'f');
  assert.equal(sql(`select has_function_privilege('anon', '${signature}', 'EXECUTE');`), 'f');
  assert.equal(sql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`), 'f');
  assert.equal(sql(`select has_function_privilege('service_role', '${signature}', 'EXECUTE');`), 't');
  const serviceOutput = sql(`set role service_role; ${callSql({ scope: 'service:role' })}`);
  const row = parseRow(serviceOutput.split('\n').at(-1));
  assert.equal(row.allowed, true);
});

test('first request and exact limit are allowed, next request is denied without negative remaining', () => {
  const subjectHash = hash('ip', '203.0.113.42');
  const first = parseRow(sql(callSql({ scope: 'boundary:ip', subjectHash, limit: 3, window: 120 })));
  const second = parseRow(sql(callSql({ scope: 'boundary:ip', subjectHash, limit: 3, window: 120 })));
  const third = parseRow(sql(callSql({ scope: 'boundary:ip', subjectHash, limit: 3, window: 120 })));
  const fourth = parseRow(sql(callSql({ scope: 'boundary:ip', subjectHash, limit: 3, window: 120 })));
  assert.equal(first.allowed, true);
  assert.equal(third.allowed, true);
  assert.equal(third.requestCount, 3);
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.remaining, 0);
  assert.ok(fourth.retryAfterSeconds >= 1);
  assert.equal(fourth.hasReset, true);
  assert.equal(second.requestCount, 2);
});

test('expired window resets count to cost and reuses the same table row', () => {
  const subjectHash = hash('user', '11111111-2222-3333-4444-555555555555');
  parseRow(sql(callSql({ scope: 'reset:user', subjectHash, limit: 2, window: 10 })));
  parseRow(sql(callSql({ scope: 'reset:user', subjectHash, limit: 2, window: 10 })));
  sql(`update public.api_rate_limits set window_started_at=now()-interval '11 seconds' where scope='reset:user' and subject_hash='${subjectHash}';`);
  const reset = parseRow(sql(callSql({ scope: 'reset:user', subjectHash, limit: 2, window: 10 })));
  assert.equal(reset.allowed, true);
  assert.equal(reset.requestCount, 1);
  assert.equal(sql(`select count(*) from public.api_rate_limits where scope='reset:user' and subject_hash='${subjectHash}';`), '1');
});

test('different subject hashes and scopes have independent counters', () => {
  const a = hash('ip', '203.0.113.50');
  const b = hash('ip', '203.0.113.51');
  parseRow(sql(callSql({ scope: 'independent:ip', subjectHash: a, limit: 1 })));
  const blockedA = parseRow(sql(callSql({ scope: 'independent:ip', subjectHash: a, limit: 1 })));
  const allowedB = parseRow(sql(callSql({ scope: 'independent:ip', subjectHash: b, limit: 1 })));
  const allowedOtherScope = parseRow(sql(callSql({ scope: 'independent:global', subjectHash: a, limit: 1 })));
  assert.equal(blockedA.allowed, false);
  assert.equal(allowedB.allowed, true);
  assert.equal(allowedOtherScope.allowed, true);
});

test('invalid RPC arguments are rejected before state mutation', () => {
  const validHash = 'a'.repeat(64);
  const invalidCalls = [
    `select * from public.consume_api_rate_limit('', '${validHash}', 1, 60, 1);`,
    `select * from public.consume_api_rate_limit('bad scope!', '${validHash}', 1, 60, 1);`,
    `select * from public.consume_api_rate_limit('x:ip', 'RAW-IP-203.0.113.41', 1, 60, 1);`,
    `select * from public.consume_api_rate_limit('x:ip', '${validHash}', 0, 60, 1);`,
    `select * from public.consume_api_rate_limit('x:ip', '${validHash}', 100001, 60, 1);`,
    `select * from public.consume_api_rate_limit('x:ip', '${validHash}', 1, 0, 1);`,
    `select * from public.consume_api_rate_limit('x:ip', '${validHash}', 1, 86401, 1);`,
    `select * from public.consume_api_rate_limit('x:ip', '${validHash}', 1, 60, 0);`,
    `select * from public.consume_api_rate_limit('x:ip', '${validHash}', 1, 60, 2);`,
  ];
  for (const statement of invalidCalls) {
    assert.throws(() => sql(statement), /invalid_rate_limit_argument/);
  }
  assert.equal(sql("select count(*) from public.api_rate_limits where scope in ('x:ip','bad scope!');"), '0');
});

test('table constraints reject invalid hash/scope/count values fail-closed', () => {
  const validHash = 'b'.repeat(64);
  assert.throws(() => sql(`insert into public.api_rate_limits values ('', '${validHash}', now(), 0, now());`), /check constraint/);
  assert.throws(() => sql(`insert into public.api_rate_limits values ('x:ip', 'ABC', now(), 0, now());`), /check constraint/);
  assert.throws(() => sql(`insert into public.api_rate_limits values ('x:ip', '${validHash}', now(), -1, now());`), /check constraint/);
});

test('privacy fixtures are never stored raw; only 64-character subject hashes are persisted', () => {
  const fixtures = [
    ['ip', '203.0.113.41', 'privacy:ip'],
    ['email', 'rate-limit-test@example.com', 'privacy:email'],
    ['user', '11111111-2222-3333-4444-555555555555', 'privacy:user'],
  ];
  for (const [kind, raw, scope] of fixtures) parseRow(sql(callSql({ scope, subjectHash: hash(kind, raw), limit: 5 })));
  const dump = sql("select coalesce(string_agg(row_to_json(t)::text, E'\\n'), '') from public.api_rate_limits t;");
  for (const [, raw] of fixtures) assert.equal(dump.includes(raw), false);
  assert.equal(sql("select bool_and(subject_hash ~ '^[0-9a-f]{64}$') from public.api_rate_limits;"), 't');
});

test('concurrent calls on one row lose no increments and allow exactly the configured limit', async () => {
  for (let round = 0; round < 3; round += 1) {
    const subjectHash = hash('ip', `203.0.113.${100 + round}`);
    const scope = `concurrency:${round}`;
    const statements = Array.from({ length: 25 }, () => callSql({ scope, subjectHash, limit: 7, window: 60 }));
    const rows = await Promise.all(statements.map((statement) => sqlAsync(statement)));
    const parsed = rows.map(parseRow);
    assert.equal(parsed.filter((row) => row.allowed).length, 7, `round ${round} allowed count`);
    assert.equal(parsed.filter((row) => !row.allowed).length, 18, `round ${round} denied count`);
    assert.equal(sql(`select count(*) from public.api_rate_limits where scope='${scope}' and subject_hash='${subjectHash}';`), '1');
    assert.equal(sql(`select request_count from public.api_rate_limits where scope='${scope}' and subject_hash='${subjectHash}';`), '25');
  }
});
