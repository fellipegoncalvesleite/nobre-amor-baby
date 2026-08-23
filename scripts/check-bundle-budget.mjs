import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const BASELINE_INITIAL_RAW = 929094;
const BASELINE_INITIAL_GZIP = 244881;
const MAX_INITIAL_RAW = 675000;
const MAX_INITIAL_GZIP = 195000;
const MAX_JS_CHUNK_RAW = 400000;
const MIN_RAW_REDUCTION_RATIO = 0.25;
const MIN_GZIP_REDUCTION_RATIO = 0.18;

const ROOT = process.cwd();
const DIST_DIR = resolve(ROOT, 'dist');
const MANIFEST_PATH = resolve(DIST_DIR, '.vite', 'manifest.json');

function fail(message) {
  throw new Error(message);
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function formatPercent(ratio) {
  return `${(ratio * 100).toFixed(2)}%`;
}

async function readManifest() {
  let raw;
  try {
    raw = await readFile(MANIFEST_PATH, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') fail(`missing manifest: ${relative(ROOT, MANIFEST_PATH)}`);
    throw error;
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    fail(`invalid manifest JSON: ${error.message}`);
  }

  assertRecord(manifest, 'manifest');
  return manifest;
}

function collectStaticManifestRecords(manifest) {
  const entries = Object.entries(manifest).filter(([, record]) => record?.isEntry === true);
  if (entries.length === 0) fail('missing manifest entry with isEntry === true');
  if (entries.length > 1) fail(`expected exactly one manifest entry, found ${entries.length}`);

  const visited = new Set();
  const stack = [entries[0][0]];
  const records = [];

  while (stack.length > 0) {
    const key = stack.pop();
    if (visited.has(key)) continue;
    visited.add(key);

    const record = manifest[key];
    assertRecord(record, `manifest record ${JSON.stringify(key)}`);
    if (typeof record.file !== 'string' || record.file.length === 0) {
      fail(`manifest record ${JSON.stringify(key)} is missing a valid file`);
    }
    if (record.imports !== undefined && !Array.isArray(record.imports)) {
      fail(`manifest record ${JSON.stringify(key)} has non-array imports`);
    }

    records.push(record);

    for (const importedKey of record.imports ?? []) {
      if (typeof importedKey !== 'string' || importedKey.length === 0) {
        fail(`manifest record ${JSON.stringify(key)} contains an invalid static import key`);
      }
      if (!Object.hasOwn(manifest, importedKey)) {
        fail(`manifest static import ${JSON.stringify(importedKey)} referenced by ${JSON.stringify(key)} is missing`);
      }
      stack.push(importedKey);
    }
  }

  return records;
}

async function measureStaticJs(records) {
  const files = [...new Set(records.map((record) => record.file).filter((file) => file.endsWith('.js')))].sort();
  if (files.length === 0) fail('initial static manifest graph contains no JavaScript files');

  const measured = [];
  for (const file of files) {
    const absolutePath = resolve(DIST_DIR, file);
    let bytes;
    try {
      bytes = await readFile(absolutePath);
    } catch (error) {
      if (error?.code === 'ENOENT') fail(`missing generated file referenced by manifest: ${file}`);
      throw error;
    }
    measured.push({
      file,
      raw: bytes.byteLength,
      gzip: gzipSync(bytes).byteLength,
    });
  }
  return measured;
}

async function listGeneratedJsFiles(directory, prefix = '') {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') fail(`missing build output directory: ${relative(ROOT, directory)}`);
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listGeneratedJsFiles(absolutePath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function measureLargestGeneratedJs() {
  const files = await listGeneratedJsFiles(DIST_DIR);
  if (files.length === 0) fail('build output contains no JavaScript chunks');

  let largest = null;
  for (const file of files) {
    const bytes = await readFile(resolve(DIST_DIR, file));
    const measurement = { file, raw: bytes.byteLength };
    if (!largest || measurement.raw > largest.raw || (measurement.raw === largest.raw && measurement.file < largest.file)) {
      largest = measurement;
    }
  }

  return { files, largest };
}

async function main() {
  const manifest = await readManifest();
  const staticRecords = collectStaticManifestRecords(manifest);
  const staticJs = await measureStaticJs(staticRecords);
  const { files: generatedJsFiles, largest } = await measureLargestGeneratedJs();

  const initialRaw = staticJs.reduce((sum, item) => sum + item.raw, 0);
  const initialGzip = staticJs.reduce((sum, item) => sum + item.gzip, 0);
  const rawReduction = 1 - (initialRaw / BASELINE_INITIAL_RAW);
  const gzipReduction = 1 - (initialGzip / BASELINE_INITIAL_GZIP);

  console.log(`Initial static JS raw bytes: ${initialRaw}`);
  console.log(`Initial static JS gzip bytes: ${initialGzip}`);
  console.log(`Raw reduction: ${formatPercent(rawReduction)}`);
  console.log(`Gzip reduction: ${formatPercent(gzipReduction)}`);
  console.log(`Largest JS chunk: ${largest.file} (${largest.raw} bytes)`);
  console.log(`Static initial JS chunks: ${staticJs.length}`);
  console.log(`Generated JS chunks: ${generatedJsFiles.length}`);
  console.log('Static initial chunk files:');
  for (const item of staticJs) {
    console.log(`  ${item.file}: raw=${item.raw} gzip=${item.gzip}`);
  }

  const failures = [];
  if (initialRaw > MAX_INITIAL_RAW) failures.push(`initial raw ${initialRaw} > ${MAX_INITIAL_RAW}`);
  if (initialGzip > MAX_INITIAL_GZIP) failures.push(`initial gzip ${initialGzip} > ${MAX_INITIAL_GZIP}`);
  if (largest.raw > MAX_JS_CHUNK_RAW) failures.push(`largest JS chunk ${largest.raw} > ${MAX_JS_CHUNK_RAW}`);
  if (rawReduction < MIN_RAW_REDUCTION_RATIO) failures.push(`raw reduction ${formatPercent(rawReduction)} < ${formatPercent(MIN_RAW_REDUCTION_RATIO)}`);
  if (gzipReduction < MIN_GZIP_REDUCTION_RATIO) failures.push(`gzip reduction ${formatPercent(gzipReduction)} < ${formatPercent(MIN_GZIP_REDUCTION_RATIO)}`);

  if (failures.length > 0) {
    console.error('BUNDLE BUDGET: FAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('BUNDLE BUDGET: PASS');
}

main().catch((error) => {
  console.error(`BUNDLE BUDGET: FAIL — ${error.message}`);
  process.exitCode = 1;
});
