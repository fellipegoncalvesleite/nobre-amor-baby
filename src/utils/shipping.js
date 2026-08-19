/**
 * Shipping utilities — browser client.
 *
 * Final shipping authority lives on the server. The browser only sends the
 * destination CEP plus product IDs/quantities and displays the returned fee.
 */
import siteConfig from '../config/siteConfig.js';

export function normalizeCep(input) {
  return String(input).replace(/\D/g, '');
}

export function isValidCep(cep) {
  return /^\d{8}$/.test(cep);
}

let _lastShippingError = null;
export function getLastShippingError() { return _lastShippingError; }
export function clearLastShippingError() { _lastShippingError = null; }

function stripAccents(str) {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** UI/debug convenience only. The server independently derives locality from CEP. */
export function isLocalCity(city, uf) {
  return (
    stripAccents(uf).trim().toUpperCase() === stripAccents(siteConfig.STORE_UF).toUpperCase() &&
    stripAccents(city).trim().toLowerCase() === stripAccents(siteConfig.STORE_CITY).toLowerCase()
  );
}

const API_TIMEOUT_MS = 8000;

export async function quoteShippingFromApi({ toCep, items = [], debug = false }) {
  const url = debug ? '/api/shipping-quote?debug=1' : '/api/shipping-quote';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toCep: normalizeCep(toCep),
        items: items.map((item) => ({
          productId: String(item.productId ?? item.id ?? ''),
          qty: Number(item.qty || 1),
          size: item.size || '',
        })),
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok || !data || data.error) {
      const friendlyMsg = data?.message || data?.error || 'Serviço de frete indisponível. Tente novamente.';
      _lastShippingError = {
        timestamp: new Date().toISOString(),
        status: response.status,
        message: friendlyMsg,
        rawSnippet: (text || '').slice(0, 500),
      };
      throw new Error(friendlyMsg);
    }

    _lastShippingError = null;
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      _lastShippingError = {
        timestamp: new Date().toISOString(),
        status: 0,
        message: 'Tempo esgotado ao calcular frete. Tente novamente.',
        rawSnippet: '',
      };
      throw new Error('Tempo esgotado ao calcular frete. Tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function calculateShipping({ cep, cart = [], debug = false }) {
  const quote = await quoteShippingFromApi({
    toCep: cep,
    items: cart,
    debug,
  });

  return {
    feeCents: quote.feeCents,
    etaText: quote.etaText || siteConfig.DEFAULT_ETA_TEXT,
    source: quote.source || 'server',
    rawFeeCents: quote.debug?.rawFeeCents ?? quote.feeCents,
    surcharge: quote.debug?.surcharge ?? 0,
    pkg: quote.debug?.package || null,
    debug: quote.debug || null,
  };
}
