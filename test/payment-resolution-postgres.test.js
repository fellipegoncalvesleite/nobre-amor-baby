import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = join(ROOT, 'supabase/migration_019_provider_payment_resolution.sql');
const SUPABASE_BOOTSTRAP = join(ROOT, 'test/fixtures/postgres-supabase-bootstrap.sql');
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

function sql(statement, database = 'payment_resolution_test') {
  return run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', database, '-c', statement]).trim();
}

function psqlAsync(statement) {
  return new Promise((resolvePromise) => {
    const child = spawn(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', 'payment_resolution_test', '-c', statement], {
      env: { ...process.env, ...pgEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolvePromise({ code, stdout: stdout.trim(), stderr }));
  });
}

function seedProduct(id, stock = 1) {
  sql(`insert into products (id, name, slug, price_cents, size_group, is_public, in_stock, stock_count, size_options)
       values ('${id}', 'Produto', 'produto-${id.slice(-4)}', 1000, 'roupa', true, ${stock > 0}, ${stock}, '{}');`);
}

function seedOrder({ id, code, paymentState = 'paid', status = 'new', inventoryState = 'reserved' }) {
  sql(`insert into orders (id, order_code, status, payment_state, checkout_finalization_state, inventory_state, total_cents)
       values ('${id}', '${code}', '${status}', '${paymentState}', 'finalized', '${inventoryState}', 1000);`);
}

function seedItem(orderId, productId) {
  sql(`insert into order_items (order_id, product_id, product_name, size, qty, unit_price_cents, line_total_cents)
       values ('${orderId}', '${productId}', 'Produto', '', 1, 1000, 1000);`);
}

function seedAttempt({ id, orderId, key, state = 'paid', providerPaymentId = 'pay-1', verified = true }) {
  const reported = state === 'paid' ? 'paid' : state;
  const amountState = verified && state === 'paid' ? 'verified' : 'not_applicable';
  const amount = verified && state === 'paid' ? '1000' : 'null';
  const providerIdSql = providerPaymentId == null ? 'null' : `'${providerPaymentId}'`;
  sql(`insert into payment_attempts (
        id, order_id, attempt_key, external_reference, payment_method, state, provider,
        provider_payment_id, provider_reported_state, provider_amount_cents, amount_verification_state
      ) values (
        '${id}', '${orderId}', '${key}', '${key}-${orderId}', 'pix', '${state}', 'asaas',
        ${providerIdSql}, '${reported}', ${amount}, '${amountState}'
      );`);
}

function requestClosure(orderId, target = 'cancelled', reason = 'Cliente desistiu') {
  return sql(`select id || '|' || state || '|' || target_status from request_order_closure('${orderId}', '${target}', '${reason}');`);
}

function ensureAction({ orderId, attemptId, closureId = null, kind = 'order_close_refund', providerAction = 'refund', providerPaymentId = 'pay-1' }) {
  const closureSql = closureId ? `'${closureId}'` : 'null';
  return sql(`select id || '|' || state || '|' || provider_marker from ensure_payment_resolution_action(
    '${orderId}', '${attemptId}', ${closureSql}, '${kind}', '${providerAction}', '${providerPaymentId}'
  );`);
}

before(() => {
  for (const path of Object.values(BIN)) assert.equal(existsSync(path), true, `missing PostgreSQL binary ${path}`);
  assert.equal(existsSync(MIGRATION), true, 'migration 019 must exist before provider-resolution PostgreSQL contracts can pass');

  clusterDir = mkdtempSync(join(tmpdir(), 'nobre-payment-resolution-'));
  dataDir = join(clusterDir, 'data');
  socketDir = join(clusterDir, 'socket');
  mkdirSync(socketDir);
  const port = String(36000 + (process.pid % 10000));
  pgEnv = { PGHOST: socketDir, PGPORT: port, PGUSER: 'postgres' };

  run(BIN.initdb, ['-A', 'trust', '-U', 'postgres', '-D', dataDir]);
  run(BIN.pg_ctl, ['-D', dataDir, '-l', join(clusterDir, 'postgres.log'), '-o', `-F -k ${socketDir} -p ${port}`, 'start']);
  run(BIN.createdb, ['payment_resolution_test']);
  run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'payment_resolution_test', '-f', SUPABASE_BOOTSTRAP]);

  for (let number = 1; number <= 19; number += 1) {
    const prefix = String(number).padStart(3, '0');
    const migration = readdirSync(join(ROOT, 'supabase'))
      .find((name) => name.startsWith(`migration_${prefix}_`) && name.endsWith('.sql'));
    assert.ok(migration, `missing migration ${prefix}`);
    const migrationPath = join(ROOT, 'supabase', migration);
    if (number === 5) {
      const compatibleSql = readFileSync(migrationPath, 'utf8')
        .replace('create policy if not exists "Users read own profile"', 'create policy "Users read own profile"');
      run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'payment_resolution_test', '-f', '-'], { input: compatibleSql });
    } else {
      run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'payment_resolution_test', '-f', migrationPath]);
    }
  }
});

after(() => {
  if (dataDir && existsSync(dataDir)) {
    try { run(BIN.pg_ctl, ['-D', dataDir, '-m', 'fast', 'stop']); } catch { /* failed test reports the cause */ }
  }
  if (clusterDir?.startsWith(`${tmpdir()}/nobre-payment-resolution-`) && existsSync(clusterDir)) {
    rmSync(clusterDir, { recursive: true });
  }
});

beforeEach(() => {
  sql('truncate payment_resolution_actions, order_closure_requests, payment_attempts, order_items, orders, products cascade;');
});

test('migration 019 creates financial tables with RLS and backend-only RPC privileges', () => {
  assert.equal(sql("select relrowsecurity from pg_class where oid = 'order_closure_requests'::regclass;"), 't');
  assert.equal(sql("select relrowsecurity from pg_class where oid = 'payment_resolution_actions'::regclass;"), 't');
  assert.equal(sql("select has_function_privilege('anon', 'request_order_closure(uuid,text,text)', 'EXECUTE');"), 'f');
  assert.equal(sql("select has_function_privilege('authenticated', 'claim_payment_resolution_execution(uuid)', 'EXECUTE');"), 'f');
  assert.equal(sql("select has_function_privilege('service_role', 'finalize_order_closure_if_resolved(uuid)', 'EXECUTE');"), 't');
});

test('anon and authenticated cannot mutate resolution tables while service role RPC works', () => {
  const orderId = '21000000-0000-0000-0000-000000000001';
  seedOrder({ id: orderId, code: 'NA-RLS', paymentState: 'failed', inventoryState: 'unreserved' });
  assert.throws(() => sql(`set role anon; insert into order_closure_requests (order_id,target_status,reason,state) values ('${orderId}','cancelled','x','pending'); reset role;`), /permission denied/);
  assert.throws(() => sql(`set role authenticated; insert into order_closure_requests (order_id,target_status,reason,state) values ('${orderId}','cancelled','x','pending'); reset role;`), /permission denied/);
  assert.match(sql(`set role service_role; select state from request_order_closure('${orderId}','cancelled','Cliente desistiu'); reset role;`), /pending/);
});

test('concurrent identical closure requests reuse one row and conflicting targets cannot coexist', async () => {
  const orderId = '21000000-0000-0000-0000-000000000002';
  seedOrder({ id: orderId, code: 'NA-CLOSURE-CONC', paymentState: 'paid' });
  const statement = `select id from request_order_closure('${orderId}','cancelled','Cliente desistiu');`;
  const [a, b] = await Promise.all([psqlAsync(statement), psqlAsync(statement)]);
  assert.deepEqual([a.code, b.code], [0, 0]);
  assert.equal(a.stdout, b.stdout);
  assert.equal(sql(`select count(*) from order_closure_requests where order_id='${orderId}' and state <> 'completed';`), '1');
  assert.throws(() => requestClosure(orderId, 'rejected', 'Fraude'), /order_closure_conflict/);
});

test('concurrent action execution claims produce exactly one provider-call winner', async () => {
  const orderId = '21000000-0000-0000-0000-000000000003';
  const attemptId = '31000000-0000-0000-0000-000000000003';
  seedOrder({ id: orderId, code: 'NA-ACTION-CLAIM' });
  seedAttempt({ id: attemptId, orderId, key: 'claim', providerPaymentId: 'pay-claim' });
  const closureId = requestClosure(orderId).split('|')[0];
  const actionId = ensureAction({ orderId, attemptId, closureId, providerPaymentId: 'pay-claim' }).split('|')[0];
  const statement = `select coalesce((claim_payment_resolution_execution('${actionId}')).state,'');`;
  const [a, b] = await Promise.all([psqlAsync(statement), psqlAsync(statement)]);
  assert.equal([a.stdout, b.stdout].filter((value) => value === 'provider_call_in_flight').length, 1);
  assert.equal([a.stdout, b.stdout].filter((value) => value === '').length, 1);
  assert.equal(sql(`select state from payment_resolution_actions where id='${actionId}';`), 'provider_call_in_flight');
});

test('duplicate-paid refund action uniqueness reuses one refund action', async () => {
  const orderId = '21000000-0000-0000-0000-000000000004';
  const attemptId = '31000000-0000-0000-0000-000000000004';
  seedOrder({ id: orderId, code: 'NA-DUP-ACTION' });
  seedAttempt({ id: attemptId, orderId, key: 'dup', providerPaymentId: 'pay-dup' });
  const statement = `select id from ensure_payment_resolution_action('${orderId}','${attemptId}',null,'duplicate_paid_refund','refund','pay-dup');`;
  const [a, b] = await Promise.all([psqlAsync(statement), psqlAsync(statement)]);
  assert.equal(a.code, 0);
  assert.equal(b.code, 0);
  assert.equal(a.stdout, b.stdout);
  assert.equal(sql(`select count(*) from payment_resolution_actions where payment_attempt_id='${attemptId}' and provider_action='refund';`), '1');
});

test('open cancellation closure blocks confirmed -> packing while refund resolution is provider pending', () => {
  const productId = '11000000-0000-0000-0000-000000000050';
  const orderId = '21000000-0000-0000-0000-000000000050';
  const attemptId = '31000000-0000-0000-0000-000000000050';
  seedProduct(productId, 0);
  seedOrder({ id: orderId, code: 'NA-FULFILLMENT-FREEZE', status: 'confirmed', paymentState: 'paid', inventoryState: 'reserved' });
  seedItem(orderId, productId);
  seedAttempt({ id: attemptId, orderId, key: 'fulfillment-freeze', state: 'paid', providerPaymentId: 'pay-fulfillment-freeze', verified: true });
  sql(`update orders set active_payment_attempt_id='${attemptId}' where id='${orderId}';`);
  const closureId = requestClosure(orderId).split('|')[0];
  const actionId = ensureAction({ orderId, attemptId, closureId, providerPaymentId: 'pay-fulfillment-freeze' }).split('|')[0];
  sql(`update payment_resolution_actions set state='provider_pending' where id='${actionId}';`);

  assert.throws(
    () => sql(`select status from transition_order_fulfillment('${orderId}', 'packing', null, null);`),
    /order_closure_in_progress/,
  );
  assert.equal(sql(`select status || '|' || payment_state || '|' || inventory_state from orders where id='${orderId}';`), 'confirmed|paid|reserved');
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '0');
  assert.equal(sql(`select state from order_closure_requests where id='${closureId}';`), 'pending');
});

test('open cancellation closure blocks packing -> shipped', () => {
  const orderId = '21000000-0000-0000-0000-000000000051';
  seedOrder({ id: orderId, code: 'NA-FREEZE-SHIPPING', status: 'packing', paymentState: 'paid', inventoryState: 'reserved' });
  const closureId = requestClosure(orderId).split('|')[0];
  sql(`update order_closure_requests set state='waiting_provider' where id='${closureId}';`);

  assert.throws(
    () => sql(`select status from transition_order_fulfillment('${orderId}', 'shipped', null, null);`),
    /order_closure_in_progress/,
  );
  assert.equal(sql(`select status from orders where id='${orderId}';`), 'packing');
});

test('open cancellation closure blocks new -> confirmed even with verified active payment', () => {
  const orderId = '21000000-0000-0000-0000-000000000052';
  const attemptId = '31000000-0000-0000-0000-000000000052';
  seedOrder({ id: orderId, code: 'NA-FREEZE-CONFIRM', status: 'new', paymentState: 'paid', inventoryState: 'reserved' });
  seedAttempt({ id: attemptId, orderId, key: 'freeze-confirm', state: 'paid', providerPaymentId: 'pay-freeze-confirm', verified: true });
  sql(`update orders set active_payment_attempt_id='${attemptId}' where id='${orderId}';`);
  requestClosure(orderId);

  assert.throws(
    () => sql(`select status from transition_order_fulfillment('${orderId}', 'confirmed', null, null);`),
    /order_closure_in_progress/,
  );
  assert.equal(sql(`select status from orders where id='${orderId}';`), 'new');
});

test('open cancellation closure blocks shipped -> done in defensive legacy state', () => {
  const orderId = '21000000-0000-0000-0000-000000000053';
  seedOrder({ id: orderId, code: 'NA-FREEZE-DONE', status: 'shipped', paymentState: 'paid', inventoryState: 'reserved' });
  requestClosure(orderId);

  assert.throws(
    () => sql(`select status from transition_order_fulfillment('${orderId}', 'done', null, null);`),
    /order_closure_in_progress/,
  );
  assert.equal(sql(`select status from orders where id='${orderId}';`), 'shipped');
});

test('open closure blocks direct cancellation bypass even when inventory release would otherwise be safe', () => {
  const orderId = '21000000-0000-0000-0000-000000000054';
  seedOrder({ id: orderId, code: 'NA-FREEZE-CANCEL', status: 'new', paymentState: 'failed', inventoryState: 'reserved' });
  const closureId = requestClosure(orderId).split('|')[0];
  sql(`update order_closure_requests set state='waiting_provider' where id='${closureId}';`);

  assert.throws(
    () => sql(`select status from transition_order_fulfillment('${orderId}', 'cancelled', null, 'Cliente desistiu');`),
    /order_closure_in_progress/,
  );
  assert.equal(sql(`select status || '|' || inventory_state from orders where id='${orderId}';`), 'new|reserved');
});

test('ready_to_finalize closure allows only its exact target status', () => {
  const orderId = '21000000-0000-0000-0000-000000000055';
  seedOrder({ id: orderId, code: 'NA-FREEZE-READY', status: 'confirmed', paymentState: 'paid', inventoryState: 'reserved' });
  const closureId = requestClosure(orderId).split('|')[0];
  sql(`update order_closure_requests set state='ready_to_finalize' where id='${closureId}';`);

  assert.throws(
    () => sql(`select status from transition_order_fulfillment('${orderId}', 'packing', null, null);`),
    /order_closure_in_progress/,
  );
  assert.equal(sql(`select status from orders where id='${orderId}';`), 'confirmed');
});

test('closure finalizer can cancel a confirmed tracked order and release stock exactly once', () => {
  const productId = '11000000-0000-0000-0000-000000000056';
  const orderId = '21000000-0000-0000-0000-000000000056';
  const attemptId = '31000000-0000-0000-0000-000000000056';
  seedProduct(productId, 0);
  seedOrder({ id: orderId, code: 'NA-FINALIZE-CANCEL', status: 'confirmed', paymentState: 'refunded', inventoryState: 'reserved' });
  seedItem(orderId, productId);
  seedAttempt({ id: attemptId, orderId, key: 'finalize-cancel', state: 'refunded', providerPaymentId: 'pay-finalize-cancel', verified: false });
  const closureId = requestClosure(orderId).split('|')[0];

  assert.match(sql(`select status || '|' || payment_state || '|' || inventory_state from finalize_order_closure_if_resolved('${closureId}');`), /cancelled\|refunded\|released/);
  assert.equal(sql(`select state from order_closure_requests where id='${closureId}';`), 'completed');
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '1');

  assert.match(sql(`select status || '|' || inventory_state from finalize_order_closure_if_resolved('${closureId}');`), /cancelled\|released/);
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '1');
});

test('closure finalizer can reject a new tracked order and release stock exactly once', () => {
  const productId = '11000000-0000-0000-0000-000000000057';
  const orderId = '21000000-0000-0000-0000-000000000057';
  const attemptId = '31000000-0000-0000-0000-000000000057';
  seedProduct(productId, 0);
  seedOrder({ id: orderId, code: 'NA-FINALIZE-REJECT', status: 'new', paymentState: 'refunded', inventoryState: 'reserved' });
  seedItem(orderId, productId);
  seedAttempt({ id: attemptId, orderId, key: 'finalize-reject', state: 'refunded', providerPaymentId: 'pay-finalize-reject', verified: false });
  const closureId = requestClosure(orderId, 'rejected', 'Pagamento recusado').split('|')[0];

  assert.match(sql(`select status || '|' || inventory_state from finalize_order_closure_if_resolved('${closureId}');`), /rejected\|released/);
  assert.equal(sql(`select state from order_closure_requests where id='${closureId}';`), 'completed');
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '1');
});

for (const [state, suffix] of [['manual_review', '058'], ['failed', '059']]) {
  test(`${state} non-completed closure freezes ordinary fulfillment`, () => {
    const orderId = `21000000-0000-0000-0000-000000000${suffix}`;
    seedOrder({ id: orderId, code: `NA-FREEZE-${state.toUpperCase()}`, status: 'confirmed', paymentState: 'paid', inventoryState: 'reserved' });
    const closureId = requestClosure(orderId).split('|')[0];
    sql(`update order_closure_requests set state='${state}' where id='${closureId}';`);

    assert.throws(
      () => sql(`select status from transition_order_fulfillment('${orderId}', 'packing', null, null);`),
      /order_closure_in_progress/,
    );
    assert.equal(sql(`select status from orders where id='${orderId}';`), 'confirmed');
  });
}

test('direct orders.status update cannot bypass an open closure', () => {
  const orderId = '21000000-0000-0000-0000-000000000060';
  seedOrder({ id: orderId, code: 'NA-FREEZE-DIRECT', status: 'confirmed', paymentState: 'paid', inventoryState: 'reserved' });
  requestClosure(orderId);

  assert.throws(
    () => sql(`update orders set status='packing' where id='${orderId}';`),
    /order_closure_in_progress/,
  );
  assert.equal(sql(`select status from orders where id='${orderId}';`), 'confirmed');
});

test('closure refuses paid, provider-uncertain, pending-refund, partial/manual-review, and unresolved action states', () => {
  const states = [
    ['paid', 'paid'],
    ['provider_uncertain', 'provider_uncertain'],
    ['pending', 'pending'],
  ];
  states.forEach(([suffix, state], index) => {
    const suffixId = String(100 + index).padStart(12, '0');
    const orderId = `21000000-0000-0000-0000-${suffixId}`;
    const attemptId = `31000000-0000-0000-0000-${suffixId}`;
    seedOrder({ id: orderId, code: `NA-UNSAFE-${suffix.toUpperCase()}`, paymentState: state === 'paid' ? 'paid' : 'pending' });
    seedAttempt({ id: attemptId, orderId, key: `unsafe-${index}`, state, providerPaymentId: `pay-unsafe-${index}`, verified: state === 'paid' });
    const closureId = requestClosure(orderId).split('|')[0];
    assert.throws(() => sql(`select finalize_order_closure_if_resolved('${closureId}');`), /payment_resolution_incomplete/);
  });

  const orderId = '21000000-0000-0000-0000-000000000120';
  const attemptId = '31000000-0000-0000-0000-000000000120';
  seedOrder({ id: orderId, code: 'NA-ACTION-PENDING' });
  seedAttempt({ id: attemptId, orderId, key: 'pending-action', state: 'refunded', providerPaymentId: 'pay-pending-action', verified: false });
  const closureId = requestClosure(orderId).split('|')[0];
  const actionId = ensureAction({ orderId, attemptId, closureId, providerPaymentId: 'pay-pending-action' }).split('|')[0];
  sql(`update payment_resolution_actions set state='provider_pending' where id='${actionId}';`);
  assert.throws(() => sql(`select finalize_order_closure_if_resolved('${closureId}');`), /payment_resolution_incomplete/);
  sql(`update payment_resolution_actions set state='manual_review' where id='${actionId}';`);
  assert.throws(() => sql(`select finalize_order_closure_if_resolved('${closureId}');`), /payment_resolution_incomplete/);
});

test('closure finalizes only after all attempts are cancelled/refunded and releases inventory exactly once', () => {
  const productId = '11000000-0000-0000-0000-000000000001';
  const orderId = '21000000-0000-0000-0000-000000000200';
  const firstAttempt = '31000000-0000-0000-0000-000000000200';
  const secondAttempt = '41000000-0000-0000-0000-000000000200';
  seedProduct(productId, 0);
  seedOrder({ id: orderId, code: 'NA-TWO-PAID', paymentState: 'refunded' });
  seedItem(orderId, productId);
  seedAttempt({ id: firstAttempt, orderId, key: 'first', state: 'refunded', providerPaymentId: 'pay-first', verified: false });
  seedAttempt({ id: secondAttempt, orderId, key: 'second', state: 'paid', providerPaymentId: 'pay-second', verified: true });
  const closureId = requestClosure(orderId).split('|')[0];
  assert.throws(() => sql(`select finalize_order_closure_if_resolved('${closureId}');`), /payment_resolution_incomplete/);
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '0');
  sql(`update payment_attempts set state='refunded', provider_reported_state='refunded' where id='${secondAttempt}';`);
  assert.match(sql(`select status || '|' || inventory_state from finalize_order_closure_if_resolved('${closureId}');`), /cancelled\|released/);
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '1');
  assert.match(sql(`select status || '|' || inventory_state from finalize_order_closure_if_resolved('${closureId}');`), /cancelled\|released/);
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '1');
});

test('closure completion and inventory release roll back together on forced stock restoration failure', () => {
  const productId = '11000000-0000-0000-0000-000000000002';
  const orderId = '21000000-0000-0000-0000-000000000201';
  const attemptId = '31000000-0000-0000-0000-000000000201';
  seedProduct(productId, 0);
  seedOrder({ id: orderId, code: 'NA-ROLLBACK', paymentState: 'refunded' });
  seedItem(orderId, productId);
  seedAttempt({ id: attemptId, orderId, key: 'rollback', state: 'refunded', providerPaymentId: 'pay-rollback', verified: false });
  const closureId = requestClosure(orderId).split('|')[0];
  sql(`create or replace function fail_stock_restore() returns trigger language plpgsql as $$ begin raise exception 'forced_stock_restore_failure'; end $$;
       create trigger trg_fail_stock_restore before update on products for each row execute function fail_stock_restore();`);
  assert.throws(() => sql(`select finalize_order_closure_if_resolved('${closureId}');`), /forced_stock_restore_failure/);
  assert.equal(sql(`select status || '|' || inventory_state from orders where id='${orderId}';`), 'new|reserved');
  assert.equal(sql(`select state from order_closure_requests where id='${closureId}';`), 'pending');
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '0');
  sql('drop trigger trg_fail_stock_restore on products; drop function fail_stock_restore();');
  assert.match(sql(`select status || '|' || inventory_state from finalize_order_closure_if_resolved('${closureId}');`), /cancelled\|released/);
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '1');
});

test('open closure blocks any newly inserted retry/original payment attempt', () => {
  const orderId = '21000000-0000-0000-0000-000000000300';
  seedOrder({ id: orderId, code: 'NA-CLOSURE-GUARD', paymentState: 'failed' });
  requestClosure(orderId);
  assert.throws(() => seedAttempt({ id: '31000000-0000-0000-0000-000000000300', orderId, key: 'blocked', state: 'failed', providerPaymentId: null, verified: false }), /order_closure_in_progress/);
});

test('migration 019 lets the existing atomic payment authority apply provider deletion to expired and failed owned attempts', () => {
  for (const [index, startingState] of ['expired', 'failed'].entries()) {
    const suffix = String(400 + index).padStart(12, '0');
    const orderId = `21000000-0000-0000-0000-${suffix}`;
    const attemptId = `31000000-0000-0000-0000-${suffix}`;
    const providerId = `pay-delete-terminal-${index}`;
    seedOrder({ id: orderId, code: `NA-DELETE-${startingState.toUpperCase()}`, paymentState: startingState });
    seedAttempt({ id: attemptId, orderId, key: `delete-${startingState}`, state: startingState, providerPaymentId: providerId, verified: false });
    sql(`update orders set active_payment_attempt_id='${attemptId}', payment_external_id='${providerId}', payment_provider='asaas' where id='${orderId}';`);

    const result = sql(`select apply_asaas_payment_webhook(
      '${orderId}', '${attemptId}', 'evt-delete-${startingState}', '${providerId}', 'cancelled',
      null, false, 'pix', null, null, null
    )->>'result';`);

    assert.equal(result, 'applied');
    assert.equal(sql(`select state from payment_attempts where id='${attemptId}';`), 'cancelled');
    assert.equal(sql(`select payment_state from orders where id='${orderId}';`), 'cancelled');
  }
});


test('completed order closure is terminal against stale service-role state regressions', () => {
  const orderId = '21000000-0000-0000-0000-000000000500';
  const attemptId = '31000000-0000-0000-0000-000000000500';
  seedOrder({ id: orderId, code: 'NA-CLOSURE-TERMINAL', paymentState: 'refunded' });
  seedAttempt({ id: attemptId, orderId, key: 'closure-terminal', state: 'refunded', providerPaymentId: 'pay-closure-terminal', verified: false });
  const closureId = requestClosure(orderId).split('|')[0];
  sql(`select finalize_order_closure_if_resolved('${closureId}');`);
  assert.equal(sql(`select state from order_closure_requests where id='${closureId}';`), 'completed');

  try { sql(`update order_closure_requests set state='waiting_provider' where id='${closureId}';`); } catch { /* rejection is acceptable */ }
  assert.equal(sql(`select state from order_closure_requests where id='${closureId}';`), 'completed');

  try { sql(`update order_closure_requests set state='manual_review' where id='${closureId}';`); } catch { /* rejection is acceptable */ }
  assert.equal(sql(`select state from order_closure_requests where id='${closureId}';`), 'completed');
});


test('unverified ambiguous delete 404 remains nonterminal and cannot release inventory', () => {
  const productId = '11000000-0000-0000-0000-000000000501';
  const orderId = '21000000-0000-0000-0000-000000000501';
  const attemptId = '31000000-0000-0000-0000-000000000501';
  seedProduct(productId, 0);
  seedOrder({ id: orderId, code: 'NA-DELETE-404-UNVERIFIED', paymentState: 'pending' });
  seedItem(orderId, productId);
  seedAttempt({ id: attemptId, orderId, key: 'delete-404-unverified', state: 'pending', providerPaymentId: 'pay-delete-404-unverified', verified: false });
  const closureId = requestClosure(orderId).split('|')[0];
  const actionId = ensureAction({
    orderId,
    attemptId,
    closureId,
    kind: 'order_close_delete',
    providerAction: 'delete',
    providerPaymentId: 'pay-delete-404-unverified',
  }).split('|')[0];

  sql(`update payment_resolution_actions
       set state='provider_uncertain', provider_accepted_at=null, last_error_code='provider_delete_404_unverified'
       where id='${actionId}';`);

  assert.throws(() => sql(`select finalize_order_closure_if_resolved('${closureId}');`), /payment_resolution_incomplete/);
  assert.equal(sql(`select state from payment_attempts where id='${attemptId}';`), 'pending');
  assert.equal(sql(`select payment_state from orders where id='${orderId}';`), 'pending');
  assert.equal(sql(`select state from order_closure_requests where id='${closureId}';`), 'pending');
  assert.equal(sql(`select stock_count from products where id='${productId}';`), '0');
});
