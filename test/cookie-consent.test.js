import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function source(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

test('cookie consent is integrated with clear accept, reject and privacy controls', async () => {
  const consentLib = resolve(ROOT, 'src/lib/cookieConsent.js');
  const consentComponent = resolve(ROOT, 'src/components/CookieConsent.jsx');

  assert.equal(existsSync(consentLib), true, 'cookie consent storage helper must exist');
  assert.equal(existsSync(consentComponent), true, 'cookie consent banner must exist');

  const [app, component, footer, privacy] = await Promise.all([
    source('src/App.jsx'),
    source('src/components/CookieConsent.jsx'),
    source('src/components/Footer.jsx'),
    source('src/pages/StaticPage.jsx'),
  ]);

  assert.match(app, /<CookieConsent\s*\/>/);
  assert.match(component, /Recusar opcionais/);
  assert.match(component, /Aceitar opcionais/);
  assert.match(component, /to="\/privacidade"/);
  assert.match(component, /role="dialog"/);
  assert.match(footer, /Preferências de cookies/);
  assert.match(footer, /COOKIE_CONSENT_EVENT/);
  assert.match(privacy, /Cookies e tecnologias semelhantes/);
  assert.match(privacy, /Preferências de cookies/);
});

test('cookie consent preference persists only valid optional-consent choices', async () => {
  const consentLib = resolve(ROOT, 'src/lib/cookieConsent.js');
  assert.equal(existsSync(consentLib), true, 'cookie consent storage helper must exist');

  const {
    COOKIE_CONSENT_ACCEPTED,
    COOKIE_CONSENT_REJECTED,
    readCookieConsent,
    writeCookieConsent,
    hasOptionalCookieConsent,
  } = await import(`${pathToFileURL(consentLib).href}?test=${Date.now()}`);

  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };

  assert.equal(readCookieConsent(storage), null);
  assert.equal(hasOptionalCookieConsent(storage), false);

  writeCookieConsent(COOKIE_CONSENT_REJECTED, storage);
  assert.equal(readCookieConsent(storage), COOKIE_CONSENT_REJECTED);
  assert.equal(hasOptionalCookieConsent(storage), false);

  writeCookieConsent(COOKIE_CONSENT_ACCEPTED, storage);
  assert.equal(readCookieConsent(storage), COOKIE_CONSENT_ACCEPTED);
  assert.equal(hasOptionalCookieConsent(storage), true);

  assert.throws(() => writeCookieConsent('maybe', storage), /Invalid cookie consent choice/);
});

test('storefront does not load known third-party analytics or ad trackers by default', async () => {
  const files = [
    'index.html',
    'src/main.jsx',
    'src/App.jsx',
  ];
  const combined = (await Promise.all(files.map(source))).join('\n');

  assert.doesNotMatch(
    combined,
    /googletagmanager|google-analytics|\bgtag\s*\(|connect\.facebook\.net|\bfbq\s*\(|hotjar|clarity\.ms/i,
  );
});
