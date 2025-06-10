/**
 * Size / age formatting helpers — PT-BR.
 *
 * Centralised here so product cards, PDP and listing pages
 * all produce consistent copy.
 */

/**
 * Format an age range in months to a human-readable PT-BR string.
 *
 * Examples:
 *   formatAgeRange(0, 1)  → "0–1 mês"
 *   formatAgeRange(1, 3)  → "1–3 meses"
 *   formatAgeRange(36, 42) → "36–42 meses"
 *
 * @param {number} minMonths
 * @param {number} maxMonths
 * @returns {string}
 */
export function formatAgeRange(minMonths, maxMonths) {
  if (minMonths == null || maxMonths == null) return '';
  const unit = maxMonths <= 1 ? 'mês' : 'meses';
  return `${minMonths}\u2013${maxMonths} ${unit}`;
}

/**
 * Format an age range with a parenthetical year conversion (PDP only).
 *
 * Examples:
 *   formatAgeRangeWithYears(36, 42) → "36–42 meses (3–3,5 anos)"
 *   formatAgeRangeWithYears(1, 3)   → "1–3 meses"  (< 12 m → no year suffix)
 *
 * @param {number} minMonths
 * @param {number} maxMonths
 * @returns {string}
 */
export function formatAgeRangeWithYears(minMonths, maxMonths) {
  const base = formatAgeRange(minMonths, maxMonths);
  if (!base || maxMonths < 12) return base;

  const fmtYear = (m) => {
    const y = m / 12;
    if (Number.isInteger(y)) return String(y);
    // Show one decimal using comma (PT-BR)
    return y.toFixed(1).replace('.', ',');
  };

  const minY = fmtYear(minMonths);
  const maxY = fmtYear(maxMonths);
  const yearLabel = minY === maxY ? `${minY} ano${minY === '1' ? '' : 's'}` : `${minY}\u2013${maxY} anos`;
  return `${base} (${yearLabel})`;
}

/**
 * Produce a short human-readable label for a sizeGroup key.
 *
 * @param {string} group  e.g. "0-6m", "24m-4a"
 * @returns {string}       e.g. "0–6 m", "24 m–4 a"
 */
export function formatSizeGroupLabel(group) {
  const map = {
    'roupa': 'Roupas',
    'calçado': 'Calçados',
    'acessório': 'Acessórios',
    /* legacy age-based keys (backwards compat) */
    '0-6m': '0\u20136 m',
    '6-12m': '6\u201312 m',
    '12-24m': '12\u201324 m',
    '24m-4a': '24 m\u20134 a',
  };
  return map[group] ?? group;
}
