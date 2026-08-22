import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_BOOTSTRAP = join(ROOT, 'test/fixtures/postgres-supabase-bootstrap.sql');
const MIGRATION_020 = join(ROOT, 'supabase/migration_020_admin_auth_hardening.sql');
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

function run(binary, args, options = {}) {
  return execFileSync(binary, args, {
    encoding: 'utf8',
    stdio: options.stdio || [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    input: options.input,
    env: { ...process.env, ...pgEnv },
  });
}

function sql(statement, database = 'admin_auth_test') {
  return run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', database, '-c', statement]).trim();
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
    run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'admin_auth_test', '-f', '-'], { input: compatibleSql });
    return;
  }
  run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'admin_auth_test', '-f', migrationPath]);
}

function insertAuthUser(id, email) {
  sql(`insert into auth.users (id, email) values ('${id}', '${email}');`);
}

before(() => {
  for (const path of Object.values(BIN)) assert.equal(existsSync(path), true, `missing PostgreSQL binary ${path}`);
  assert.equal(existsSync(MIGRATION_020), true, 'migration 020 must exist');

  clusterDir = mkdtempSync(join(tmpdir(), 'nobre-admin-auth-'));
  dataDir = join(clusterDir, 'data');
  socketDir = join(clusterDir, 'socket');
  mkdirSync(socketDir);
  const port = String(37000 + (process.pid % 10000));
  pgEnv = { PGHOST: socketDir, PGPORT: port, PGUSER: 'postgres' };

  run(BIN.initdb, ['-A', 'trust', '-U', 'postgres', '-D', dataDir]);
  run(BIN.pg_ctl, ['-D', dataDir, '-l', join(clusterDir, 'postgres.log'), '-o', `-F -k ${socketDir} -p ${port}`, 'start']);
  run(BIN.createdb, ['admin_auth_test']);
  run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'admin_auth_test', '-f', SUPABASE_BOOTSTRAP]);
  sql('alter role service_role bypassrls;');

  for (let number = 1; number <= 19; number += 1) applyMigration(number);

  insertAuthUser('90000000-0000-0000-0000-000000000001', 'existing-manager@example.com');
  insertAuthUser('90000000-0000-0000-0000-000000000002', 'existing-debug@example.com');
  sql("update public.profiles set role='manager' where id='90000000-0000-0000-0000-000000000001';");
  sql("update public.profiles set role='debug' where id='90000000-0000-0000-0000-000000000002';");

  applyMigration(20);
});

after(() => {
  if (dataDir && existsSync(dataDir)) {
    try { run(BIN.pg_ctl, ['-D', dataDir, '-m', 'fast', 'stop']); } catch { /* failed test reports root cause */ }
  }
  if (clusterDir?.startsWith(`${tmpdir()}/nobre-admin-auth-`) && existsSync(clusterDir)) {
    rmSync(clusterDir, { recursive: true });
  }
});

test('migration 020 applies and installs SECURITY DEFINER handle_new_user with safe search_path', () => {
  assert.equal(sql("select prosecdef from pg_proc where oid='public.handle_new_user()'::regprocedure;"), 't');
  const config = sql("select coalesce(array_to_string(proconfig, ','), '') from pg_proc where oid='public.handle_new_user()'::regprocedure;");
  assert.match(config, /search_path=pg_catalog/);
});

test('installed handle_new_user contains no email-based privilege assignment and assigns customer', () => {
  const definition = sql("select pg_get_functiondef('public.handle_new_user()'::regprocedure);").toLowerCase();
  assert.doesNotMatch(definition, /lower\s*\(\s*new\.email\s*\)/);
  assert.doesNotMatch(definition, /nobreamorbaby@gmail\.com|nobreamor@gmail\.com|felipezzlx@icloud\.com/);
  assert.doesNotMatch(definition, /role\s*=\s*excluded\.role/);
  assert.match(definition, /'customer'/);
  assert.match(definition, /public\.profiles/);
});

test('new arbitrary signup receives customer role', () => {
  const id = '90000000-0000-0000-0000-000000000010';
  insertAuthUser(id, 'new-customer@example.com');
  assert.equal(sql(`select role from public.profiles where id='${id}';`), 'customer');
});

test('new signup using historical privileged email receives customer role', () => {
  const id = '90000000-0000-0000-0000-000000000011';
  insertAuthUser(id, 'nobreamor@gmail.com');
  assert.equal(sql(`select role from public.profiles where id='${id}';`), 'customer');
});

test('existing manager and debug roles survive migration 020', () => {
  assert.equal(sql("select role from public.profiles where id='90000000-0000-0000-0000-000000000001';"), 'manager');
  assert.equal(sql("select role from public.profiles where id='90000000-0000-0000-0000-000000000002';"), 'debug');
});

test('browser roles cannot mutate profiles while authenticated retains safe SELECT', () => {
  assert.equal(sql("select has_table_privilege('authenticated', 'public.profiles', 'SELECT');"), 't');
  assert.equal(sql("select has_table_privilege('authenticated', 'public.profiles', 'UPDATE');"), 'f');
  assert.equal(sql("select has_table_privilege('anon', 'public.profiles', 'UPDATE');"), 'f');
  assert.equal(sql("select has_table_privilege('authenticated', 'public.profiles', 'INSERT');"), 'f');
  assert.equal(sql("select has_table_privilege('authenticated', 'public.profiles', 'DELETE');"), 'f');

  assert.throws(
    () => sql("set role authenticated; update public.profiles set role='manager' where id='90000000-0000-0000-0000-000000000010';"),
    /permission denied/,
  );
  assert.throws(
    () => sql("set role anon; update public.profiles set role='manager' where id='90000000-0000-0000-0000-000000000010';"),
    /permission denied/,
  );
  assert.throws(
    () => sql("set role authenticated; insert into public.profiles (id,email,role) values ('90000000-0000-0000-0000-000000000099','evil@example.com','manager');"),
    /permission denied/,
  );
  assert.throws(
    () => sql("set role authenticated; delete from public.profiles where id='90000000-0000-0000-0000-000000000010';"),
    /permission denied/,
  );
});

test('browser roles cannot execute handle_new_user directly', () => {
  assert.equal(sql("select has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE');"), 'f');
  assert.equal(sql("select has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE');"), 'f');
  assert.equal(sql("select has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE');"), 'f');
});

test('service-role backend path retains trusted profile operations', () => {
  assert.equal(sql("select has_table_privilege('service_role', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE');"), 't');
  sql("set role service_role; update public.profiles set email='backend-updated@example.com' where id='90000000-0000-0000-0000-000000000010'; reset role;");
  assert.equal(sql("select email from public.profiles where id='90000000-0000-0000-0000-000000000010';"), 'backend-updated@example.com');
});
