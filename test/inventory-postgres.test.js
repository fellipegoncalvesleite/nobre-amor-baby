import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = join(ROOT, 'supabase/migration_018_transactional_inventory.sql');
const SUPABASE_BOOTSTRAP = join(ROOT, 'test/fixtures/postgres-supabase-bootstrap.sql');
const PRE_018_FIXTURE = join(ROOT, 'test/fixtures/inventory-pre-018.sql');
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
let historicalInventoryState;
let normalizedCatalogState;

function run(binary, args, options = {}) {
  return execFileSync(binary, args, {
    encoding: 'utf8',
    stdio: options.stdio || [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    input: options.input,
    env: { ...process.env, ...pgEnv },
  });
}

function sql(statement) {
  return run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', 'inventory_test', '-c', statement]).trim();
}

function seedProduct({ id, stock = 5, sizes = '{}', isPublic = true }) {
  sql(`insert into products (id, name, slug, price_cents, size_group, is_public, in_stock, stock_count, size_options)
       values ('${id}', 'Produto ${id.slice(-4)}', 'produto-${id.slice(-4)}', 1000, 'roupa', ${isPublic}, ${stock > 0}, ${stock}, '${sizes}');`);
}

function seedOrder({ id, code, status = 'new', inventoryState = 'unreserved', finalization = 'in_progress', paymentState = 'pending' }) {
  sql(`insert into orders (id, order_code, status, payment_state, checkout_finalization_state, inventory_state, total_cents)
       values ('${id}', '${code}', '${status}', '${paymentState}', '${finalization}', '${inventoryState}', 1000);`);
}

function seedItem({ orderId, productId, qty = 1, size = '' }) {
  sql(`insert into order_items (order_id, product_id, product_name, size, qty, unit_price_cents, line_total_cents)
       values ('${orderId}', '${productId}', 'Produto', ${size === null ? 'null' : `'${size}'`}, ${qty}, 1000, ${qty * 1000});`);
}

function reserve(orderId) {
  return sql(`select inventory_state from reserve_order_inventory('${orderId}');`);
}

function transition(orderId, status, rejectedReason = null, cancelReason = null) {
  const rejected = rejectedReason === null ? 'null' : `'${rejectedReason}'`;
  const cancelled = cancelReason === null ? 'null' : `'${cancelReason}'`;
  return sql(`select status || '|' || inventory_state from transition_order_fulfillment('${orderId}', '${status}', ${rejected}, ${cancelled});`);
}

function psqlAsync(statement) {
  return new Promise((resolvePromise) => {
    const child = spawn(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-d', 'inventory_test', '-c', statement], {
      env: { ...process.env, ...pgEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

before(() => {
  for (const path of Object.values(BIN)) assert.equal(existsSync(path), true, `missing PostgreSQL binary ${path}`);
  assert.equal(existsSync(MIGRATION), true, 'migration 018 must exist before PostgreSQL contracts can pass');

  clusterDir = mkdtempSync(join(tmpdir(), 'nobre-inventory-'));
  dataDir = join(clusterDir, 'data');
  socketDir = join(clusterDir, 'socket');
  mkdirSync(socketDir);
  const port = String(30000 + (process.pid % 20000));
  pgEnv = { PGHOST: socketDir, PGPORT: port, PGUSER: 'postgres' };

  run(BIN.initdb, ['-A', 'trust', '-U', 'postgres', '-D', dataDir]);
  run(BIN.pg_ctl, ['-D', dataDir, '-l', join(clusterDir, 'postgres.log'), '-o', `-F -k ${socketDir} -p ${port}`, 'start']);
  run(BIN.createdb, ['inventory_test']);
  run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'inventory_test', '-f', SUPABASE_BOOTSTRAP]);
  for (let number = 1; number <= 17; number += 1) {
    const prefix = String(number).padStart(3, '0');
    const migration = readdirSync(join(ROOT, 'supabase'))
      .find((name) => name.startsWith(`migration_${prefix}_`) && name.endsWith('.sql'));
    assert.ok(migration, `missing migration ${prefix}`);
    const migrationPath = join(ROOT, 'supabase', migration);
    if (number === 5) {
      // Supabase accepts the idempotent policy form used by migration 005;
      // stock PostgreSQL 17 does not, and this disposable database is fresh.
      const compatibleSql = readFileSync(migrationPath, 'utf8')
        .replace('create policy if not exists "Users read own profile"', 'create policy "Users read own profile"');
      run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'inventory_test', '-f', '-'], { input: compatibleSql });
    } else {
      run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'inventory_test', '-f', migrationPath]);
    }
  }
  run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'inventory_test', '-f', PRE_018_FIXTURE]);
  run(BIN.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'inventory_test', '-f', MIGRATION]);
  historicalInventoryState = sql("select inventory_state from orders where order_code = 'NA-HISTORICAL';");
  normalizedCatalogState = sql("select string_agg(stock_count || '|' || in_stock || '|' || cardinality(size_options), ',' order by id) from products;");
});

after(() => {
  if (dataDir && existsSync(dataDir)) {
    try { run(BIN.pg_ctl, ['-D', dataDir, '-m', 'fast', 'stop']); } catch { /* report comes from the failed test */ }
  }
  if (clusterDir?.startsWith(`${tmpdir()}/nobre-inventory-`) && existsSync(clusterDir)) rmSync(clusterDir, { recursive: true });
});

beforeEach(() => {
  sql("truncate payment_attempts, order_items, orders, products cascade;");
});

test('migration backfills historical orders without mutating stock and defaults new orders to unreserved', () => {
  assert.equal(historicalInventoryState, 'legacy_untracked');
  assert.equal(normalizedCatalogState, '0|false|0,0|false|0');
  sql("insert into orders (order_code, status, payment_state, checkout_finalization_state) values ('NA-NEW-DEFAULT', 'new', 'pending', 'in_progress');");
  assert.equal(sql("select inventory_state from orders where order_code = 'NA-NEW-DEFAULT';"), 'unreserved');
});

test('normal reservation decrements stock once and marks the order reserved', () => {
  seedProduct({ id: '10000000-0000-0000-0000-000000000001', stock: 5 });
  seedOrder({ id: '20000000-0000-0000-0000-000000000001', code: 'NA-NORMAL' });
  seedItem({ orderId: '20000000-0000-0000-0000-000000000001', productId: '10000000-0000-0000-0000-000000000001', qty: 2 });
  assert.equal(reserve('20000000-0000-0000-0000-000000000001'), 'reserved');
  assert.equal(sql("select stock_count || '|' || in_stock from products where id = '10000000-0000-0000-0000-000000000001';"), '3|true');
});

test('same order reservation is idempotent', () => {
  seedProduct({ id: '10000000-0000-0000-0000-000000000002', stock: 5 });
  seedOrder({ id: '20000000-0000-0000-0000-000000000002', code: 'NA-IDEMPOTENT' });
  seedItem({ orderId: '20000000-0000-0000-0000-000000000002', productId: '10000000-0000-0000-0000-000000000002', qty: 2 });
  reserve('20000000-0000-0000-0000-000000000002');
  assert.equal(reserve('20000000-0000-0000-0000-000000000002'), 'reserved');
  assert.equal(sql("select stock_count from products where id = '10000000-0000-0000-0000-000000000002';"), '3');
});

test('insufficient stock leaves quantity and reservation state unchanged', () => {
  const productId = '10000000-0000-0000-0000-000000000017';
  const orderId = '20000000-0000-0000-0000-000000000016';
  seedProduct({ id: productId, stock: 2 });
  seedOrder({ id: orderId, code: 'NA-INSUFFICIENT' });
  seedItem({ orderId, productId, qty: 3 });
  assert.throws(() => reserve(orderId), /insufficient_inventory/);
  assert.equal(sql(`select stock_count from products where id = '${productId}';`), '2');
  assert.equal(sql(`select inventory_state from orders where id = '${orderId}';`), 'unreserved');
});

test('two concurrent reservations for the last unit produce one winner', async () => {
  const productId = '10000000-0000-0000-0000-000000000003';
  const firstOrder = '20000000-0000-0000-0000-000000000003';
  const secondOrder = '20000000-0000-0000-0000-000000000004';
  seedProduct({ id: productId, stock: 1 });
  seedOrder({ id: firstOrder, code: 'NA-CONCURRENT-A' });
  seedOrder({ id: secondOrder, code: 'NA-CONCURRENT-B' });
  seedItem({ orderId: firstOrder, productId });
  seedItem({ orderId: secondOrder, productId });

  const results = await Promise.all([
    psqlAsync(`select inventory_state from reserve_order_inventory('${firstOrder}');`),
    psqlAsync(`select inventory_state from reserve_order_inventory('${secondOrder}');`),
  ]);

  assert.deepEqual(results.map((result) => result.code).sort(), [0, 1]);
  assert.equal(results.filter((result) => result.stderr.includes('insufficient_inventory')).length, 1);
  assert.equal(sql(`select stock_count || '|' || in_stock from products where id = '${productId}';`), '0|false');
  assert.equal(sql("select count(*) from orders where inventory_state = 'reserved';"), '1');
});

test('insufficient and duplicate-line inventory failures leave stock and order unchanged', () => {
  const productId = '10000000-0000-0000-0000-000000000004';
  const orderId = '20000000-0000-0000-0000-000000000005';
  seedProduct({ id: productId, stock: 4, sizes: '{P,M}' });
  seedOrder({ id: orderId, code: 'NA-AGGREGATE' });
  seedItem({ orderId, productId, qty: 2, size: 'P' });
  seedItem({ orderId, productId, qty: 3, size: 'M' });
  assert.throws(() => reserve(orderId), /insufficient_inventory/);
  assert.equal(sql(`select stock_count from products where id = '${productId}';`), '4');
  assert.equal(sql(`select inventory_state from orders where id = '${orderId}';`), 'unreserved');
});

test('invalid size and unavailable product fail without stock mutation', () => {
  const productId = '10000000-0000-0000-0000-000000000005';
  const orderId = '20000000-0000-0000-0000-000000000006';
  seedProduct({ id: productId, stock: 2, sizes: '{P,M}' });
  seedOrder({ id: orderId, code: 'NA-SIZE' });
  seedItem({ orderId, productId, size: 'G' });
  assert.throws(() => reserve(orderId), /invalid_product_size/);
  assert.equal(sql(`select stock_count from products where id = '${productId}';`), '2');
  sql(`update products set stock_count = 0 where id = '${productId}'; update order_items set size = 'P' where order_id = '${orderId}';`);
  assert.throws(() => reserve(orderId), /product_out_of_stock|insufficient_inventory/);
});

test('multi-product reservation failure rolls back every product', () => {
  const orderId = '20000000-0000-0000-0000-000000000007';
  seedProduct({ id: '10000000-0000-0000-0000-000000000006', stock: 5 });
  seedProduct({ id: '10000000-0000-0000-0000-000000000007', stock: 0 });
  seedOrder({ id: orderId, code: 'NA-MULTI-ROLLBACK' });
  seedItem({ orderId, productId: '10000000-0000-0000-0000-000000000006', qty: 2 });
  seedItem({ orderId, productId: '10000000-0000-0000-0000-000000000007', qty: 1 });
  assert.throws(() => reserve(orderId), /product_out_of_stock|insufficient_inventory/);
  assert.equal(sql("select string_agg(stock_count::text, ',' order by id) from products;"), '5,0');
});

test('tracked fulfillment advances only through the forward graph without changing reserved stock', () => {
  const productId = '10000000-0000-0000-0000-000000000008';
  const orderId = '20000000-0000-0000-0000-000000000008';
  seedProduct({ id: productId, stock: 3 });
  seedOrder({ id: orderId, code: 'NA-FORWARD', inventoryState: 'reserved', finalization: 'finalized', paymentState: 'paid' });
  seedItem({ orderId, productId, qty: 2 });
  sql(`insert into payment_attempts (order_id, attempt_key, external_reference, payment_method, state, provider_payment_id, amount_verification_state)
       values ('${orderId}', 'original', 'NA-FORWARD', 'pix', 'paid', 'pay-forward', 'verified');`);
  assert.equal(transition(orderId, 'confirmed'), 'confirmed|reserved');
  assert.equal(transition(orderId, 'packing'), 'packing|reserved');
  assert.equal(transition(orderId, 'shipped'), 'shipped|reserved');
  assert.equal(transition(orderId, 'done'), 'done|consumed');
  assert.equal(sql(`select stock_count from products where id = '${productId}';`), '3');
});

test('direct completion and backward reset are rejected atomically', () => {
  const productId = '10000000-0000-0000-0000-000000000009';
  const orderId = '20000000-0000-0000-0000-000000000009';
  seedProduct({ id: productId, stock: 3 });
  seedOrder({ id: orderId, code: 'NA-INVALID', status: 'confirmed', inventoryState: 'reserved', finalization: 'finalized', paymentState: 'paid' });
  seedItem({ orderId, productId });
  assert.throws(() => transition(orderId, 'done'), /invalid_fulfillment_transition/);
  assert.throws(() => transition(orderId, 'new'), /invalid_fulfillment_transition/);
  assert.equal(sql(`select status || '|' || inventory_state from orders where id = '${orderId}';`), 'confirmed|reserved');
  assert.equal(sql(`select stock_count from products where id = '${productId}';`), '3');
});

test('confirmation requires verified paid ownership for tracked orders', () => {
  const orderId = '20000000-0000-0000-0000-000000000010';
  seedOrder({ id: orderId, code: 'NA-PAYMENT', inventoryState: 'reserved', finalization: 'finalized', paymentState: 'paid' });
  assert.throws(() => transition(orderId, 'confirmed'), /verified_payment_required/);
  sql(`insert into payment_attempts (order_id, attempt_key, external_reference, payment_method, state, provider_payment_id, amount_verification_state)
       values ('${orderId}', 'original', 'NA-PAYMENT', 'pix', 'paid', 'pay-verified', 'verified');`);
  assert.equal(transition(orderId, 'confirmed'), 'confirmed|reserved');
});

test('safe cancellation releases inventory exactly once', () => {
  const productId = '10000000-0000-0000-0000-000000000010';
  const orderId = '20000000-0000-0000-0000-000000000011';
  seedProduct({ id: productId, stock: 3 });
  seedOrder({ id: orderId, code: 'NA-CANCEL-SAFE', inventoryState: 'reserved', finalization: 'finalized', paymentState: 'failed' });
  seedItem({ orderId, productId, qty: 2 });
  sql(`insert into payment_attempts (order_id, attempt_key, external_reference, payment_method, state, amount_verification_state)
       values ('${orderId}', 'original', 'NA-CANCEL-SAFE', 'pix', 'failed', 'not_applicable');`);
  assert.equal(transition(orderId, 'cancelled', null, 'Cliente desistiu'), 'cancelled|released');
  assert.equal(transition(orderId, 'cancelled', null, 'Cliente desistiu'), 'cancelled|released');
  assert.equal(sql(`select stock_count from products where id = '${productId}';`), '5');
});

test('unsafe cancellation leaves fulfillment and inventory untouched', () => {
  const productId = '10000000-0000-0000-0000-000000000011';
  const orderId = '20000000-0000-0000-0000-000000000012';
  seedProduct({ id: productId, stock: 3 });
  seedOrder({ id: orderId, code: 'NA-CANCEL-UNSAFE', inventoryState: 'reserved', finalization: 'finalized', paymentState: 'pending' });
  seedItem({ orderId, productId, qty: 2 });
  sql(`insert into payment_attempts (order_id, attempt_key, external_reference, payment_method, state, provider_payment_id, amount_verification_state)
       values ('${orderId}', 'original', 'NA-CANCEL-UNSAFE', 'pix', 'pending', 'pay-pending', 'not_applicable');`);
  assert.throws(() => transition(orderId, 'cancelled', null, 'Cliente desistiu'), /inventory_release_requires_payment_resolution/);
  assert.equal(sql(`select status || '|' || inventory_state from orders where id = '${orderId}';`), 'new|reserved');
  assert.equal(sql(`select stock_count from products where id = '${productId}';`), '3');
});

test('legacy fulfillment never mutates product inventory', () => {
  const productId = '10000000-0000-0000-0000-000000000012';
  const orderId = '20000000-0000-0000-0000-000000000013';
  seedProduct({ id: productId, stock: 4 });
  seedOrder({ id: orderId, code: 'NA-LEGACY', status: 'confirmed', inventoryState: 'legacy_untracked', finalization: 'finalized', paymentState: 'paid' });
  seedItem({ orderId, productId, qty: 2 });
  assert.equal(transition(orderId, 'packing'), 'packing|legacy_untracked');
  assert.equal(sql(`select stock_count from products where id = '${productId}';`), '4');
});

test('reservation product-update failure rolls back every stock row and the order state', () => {
  const orderId = '20000000-0000-0000-0000-000000000015';
  const firstProduct = '10000000-0000-0000-0000-000000000015';
  const secondProduct = '10000000-0000-0000-0000-000000000016';
  seedProduct({ id: firstProduct, stock: 5 });
  seedProduct({ id: secondProduct, stock: 5 });
  seedOrder({ id: orderId, code: 'NA-RESERVE-ROLLBACK' });
  seedItem({ orderId, productId: firstProduct, qty: 2 });
  seedItem({ orderId, productId: secondProduct, qty: 2 });
  sql(`create function fail_reservation_product_update() returns trigger language plpgsql as $$
       begin if new.id = '${secondProduct}'::uuid then raise exception 'forced_reservation_failure'; end if; return new; end $$;
       create trigger force_reservation_product_failure before update on products for each row execute function fail_reservation_product_update();`);
  assert.throws(() => reserve(orderId), /forced_reservation_failure/);
  assert.equal(sql("select string_agg(stock_count::text, ',' order by id) from products;"), '5,5');
  assert.equal(sql(`select inventory_state from orders where id = '${orderId}';`), 'unreserved');
});

test('release failure rolls back prior product updates and order state', () => {
  const orderId = '20000000-0000-0000-0000-000000000014';
  const firstProduct = '10000000-0000-0000-0000-000000000013';
  const secondProduct = '10000000-0000-0000-0000-000000000014';
  seedProduct({ id: firstProduct, stock: 3 });
  seedProduct({ id: secondProduct, stock: 3 });
  seedOrder({ id: orderId, code: 'NA-RELEASE-ROLLBACK', inventoryState: 'reserved', finalization: 'finalized', paymentState: 'failed' });
  seedItem({ orderId, productId: firstProduct, qty: 2 });
  seedItem({ orderId, productId: secondProduct, qty: 2 });
  sql(`insert into payment_attempts (order_id, attempt_key, external_reference, payment_method, state, amount_verification_state)
       values ('${orderId}', 'original', 'NA-RELEASE-ROLLBACK', 'pix', 'failed', 'not_applicable');
       create function fail_second_product_update() returns trigger language plpgsql as $$
       begin if new.id = '${secondProduct}'::uuid then raise exception 'forced_product_failure'; end if; return new; end $$;
       create trigger force_second_product_failure before update on products for each row execute function fail_second_product_update();`);
  assert.throws(() => transition(orderId, 'cancelled', null, 'Falha forçada'), /forced_product_failure/);
  assert.equal(sql("select string_agg(stock_count::text, ',' order by id) from products;"), '3,3');
  assert.equal(sql(`select status || '|' || inventory_state from orders where id = '${orderId}';`), 'new|reserved');
});
