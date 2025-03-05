/**
 * Shipping utilities — Nobre Amor Baby.
 *
 * Logic (internal — never shown to the customer):
 *   1. If destination is store city/UF → fixed fee (LOCAL_FIXED_SHIPPING_CENTS)
 *   2. Otherwise → call /api/shipping-quote (Melhor Envio proxy) + surcharge
 *
 * The customer only sees "Frete" and "Prazo", nothing else.
 */

import siteConfig from '../config/siteConfig.js';
import { buildClothingPackage } from './packing.js';

/* ── Normalisation & validation ──────────────────────── */

/** Strip anything that isn't a digit. */
export function normalizeCep(input) {
  return String(input).replace(/\D/g, '');
}

/** A valid CEP has exactly 8 digits. */
export function isValidCep(cep) {
  return /^\d{8}$/.test(cep);
}

/* ── Helpers ─────────────────────────────────────────── */

/** Strip accents for accent-insensitive comparison. */
function stripAccents(str) {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Check if a city / UF pair qualifies for local delivery.
 * Uses STORE_CITY / STORE_UF from siteConfig (accent-insensitive).
 */
export function isLocalCity(city, uf) {
  return (
    stripAccents(uf).trim().toUpperCase() === stripAccents(siteConfig.STORE_UF).toUpperCase() &&
    stripAccents(city).trim().toLowerCase() === stripAccents(siteConfig.STORE_CITY).toLowerCase()
  );
}

/* ── API call ────────────────────────────────────────── */

/**
 * Call the /api/shipping-quote serverless endpoint.
 *
 * @param {{
 *   toCep: string,
 *   pkg?: { weightKg: number, lengthCm: number, widthCm: number, heightCm: number },
 *   items?: Array<{ id: string, qty: number, priceCents: number }>,
 *   debug?: boolean,
 * }} params
 * @returns {Promise<{ feeCents: number, etaText: string, debug?: object }>}
 * @throws {Error} on network / server errors
 */
export async function quoteShippingFromApi({ toCep, pkg, items = [], debug = false }) {
  const url = debug ? '/api/shipping-quote?debug=1' : '/api/shipping-quote';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCep: normalizeCep(toCep),
      fromCep: siteConfig.storeCep || undefined,
      package: pkg || undefined,
      items,
    }),
  });

  const data = await res.json();

  if (data.error) throw new Error(data.error);
  if (data.feeCents == null) throw new Error('Resposta inválida do servidor de frete.');

  return {
    feeCents: data.feeCents,
    etaText: data.etaText || '',
    debug: data.debug || null,
  };
}

/* ── Orchestrator ────────────────────────────────────── */

/**
 * Calculate shipping for a given destination.
 *
 * @param {{
 *   cep: string, city: string, uf: string,
 *   cart?: object[], products?: object[],
 *   debug?: boolean,
 * }} params
 * @returns {Promise<{
 *   feeCents: number, etaText: string, source: string,
 *   rawFeeCents?: number, surcharge?: number,
 *   pkg?: object, debug?: object,
 * }>}
 */
export async function calculateShipping({ cep, city, uf, cart = [], products = [], debug = false }) {
  if (isLocalCity(city, uf)) {
    return {
      feeCents: siteConfig.LOCAL_FIXED_SHIPPING_CENTS,
      etaText: siteConfig.LOCAL_ETA_TEXT,
      source: 'local_fixed',
      rawFeeCents: siteConfig.LOCAL_FIXED_SHIPPING_CENTS,
      surcharge: 0,
    };
  }

  // Build package from cart + product weights
  const pkg = buildClothingPackage(cart, products);

  // Build items payload with price info
  const items = cart.map((item) => ({
    id: String(item.id),
    qty: item.qty || 1,
    priceCents: Math.round(
      ((products.find((p) => String(p.id) === String(item.id))?.price) || 0) * 100,
    ),
  }));

  const quote = await quoteShippingFromApi({ toCep: cep, pkg, items, debug });

  const surcharge = siteConfig.NONLOCAL_SURCHARGE_CENTS;
  return {
    feeCents: quote.feeCents + surcharge,
    etaText: quote.etaText || siteConfig.DEFAULT_ETA_TEXT,
    source: 'melhorenvio',
    rawFeeCents: quote.feeCents,
    surcharge,
    pkg,
    debug: quote.debug || null,
  };
}
