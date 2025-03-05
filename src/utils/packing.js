/**
 * packing.js — clothing-packaging heuristic for Melhor Envio quotes.
 *
 * Builds a single "virtual box" from the cart contents.
 * Weight comes from each product's `weightGrams`; dimensions are
 * chosen from tier tables based on item count.
 */

import { DEFAULT_WEIGHT_GRAMS } from '../data/products';

/** Extra grams added for packaging material (box, tissue, etc.). */
export const PACKAGE_OVERHEAD_GRAMS = 50;

/**
 * Dimension-tier table.
 * Each entry: { maxPieces, lengthCm, widthCm, heightCm }
 * Sorted ascending — first match wins.
 */
export const DIMENSION_TIERS = [
  { maxPieces: 2, lengthCm: 25, widthCm: 20, heightCm: 4 },
  { maxPieces: 5, lengthCm: 30, widthCm: 25, heightCm: 8 },
  { maxPieces: 10, lengthCm: 35, widthCm: 30, heightCm: 12 },
  { maxPieces: Infinity, lengthCm: 40, widthCm: 35, heightCm: 16 },
];

/**
 * Build a shipping package descriptor from cart contents.
 *
 * @param {Array<{ id: string, qty: number }>} cartItems
 * @param {Array<{ id: string, weightGrams?: number, price: number }>} products
 * @returns {{
 *   weightKg: number,
 *   lengthCm: number,
 *   widthCm: number,
 *   heightCm: number,
 *   itemCount: number,
 *   totalWeightGrams: number,
 *   insuranceValueCents: number,
 * }}
 */
export function buildClothingPackage(cartItems, products) {
  const prodMap = new Map((products || []).map((p) => [String(p.id), p]));
  let totalWeightGrams = 0;
  let itemCount = 0;
  let insuranceValueCents = 0;

  for (const item of cartItems) {
    const qty = item.qty || 1;
    const product = prodMap.get(String(item.id));
    const wg = product?.weightGrams ?? DEFAULT_WEIGHT_GRAMS;
    const priceCents = product ? Math.round(product.price * 100) : 0;
    totalWeightGrams += wg * qty;
    insuranceValueCents += priceCents * qty;
    itemCount += qty;
  }

  // Add packaging overhead
  totalWeightGrams += PACKAGE_OVERHEAD_GRAMS;

  // Choose dimension tier
  const tier = DIMENSION_TIERS.find((t) => itemCount <= t.maxPieces) || DIMENSION_TIERS[DIMENSION_TIERS.length - 1];

  return {
    weightKg: parseFloat((totalWeightGrams / 1000).toFixed(3)),
    lengthCm: tier.lengthCm,
    widthCm: tier.widthCm,
    heightCm: tier.heightCm,
    itemCount,
    totalWeightGrams,
    insuranceValueCents,
  };
}
