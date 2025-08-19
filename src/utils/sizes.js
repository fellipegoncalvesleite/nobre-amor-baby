/**
 * SIZE_PRESETS — predefined size options per size_group.
 *
 * Keys match the `value` property of SIZE_GROUPS in AdminProductsPage:
 *   roupa, calçado, acessório
 *
 * Used by the chip/tag selector in the product creation modal.
 */

export const SIZE_PRESETS = {
  roupa: [
    'RN', 'P', 'M', 'G', 'GG',
    '0-1m', '1-3m', '3-6m', '6-9m', '9-12m',
    '12-18m', '18-24m',
    '1 ano', '2 anos', '3 anos', '4 anos',
  ],
  'calçado': [
    '13', '14', '15', '16', '17', '18', '19',
    '20', '21', '22', '23', '24', '25', '26',
  ],
  'acessório': [
    'Único',
  ],
};

/**
 * Default size groups (type of sizing). The manager can override these from
 * the admin "Tamanhos" tab; these are the fallback when the DB has none.
 */
export const DEFAULT_SIZE_GROUPS = [
  { value: 'roupa', label: 'Roupa' },
  { value: 'calçado', label: 'Calçado' },
  { value: 'acessório', label: 'Acessório' },
];

export const DEFAULT_SIZE_PRESETS = SIZE_PRESETS;

/** Slugify a group label into a stable `value` key. */
export function slugifySizeGroup(label) {
  return String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
