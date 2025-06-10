/**
 * Unified product catalogue.
 *
 * Every product has the fields the UI needs:
 *   id · name · slug · price · oldPrice · category · tag
 *   isNew · isPromo · images · description · details · sizes
 *   sizeGroup · ageMinMonths · ageMaxMonths · sizeOptions
 *   weightGrams · packGroup
 *
 * weightGrams: int — item weight in grams (default DEFAULT_WEIGHT_GRAMS)
 * packGroup: 'roupa' (clothing) — used for dimension tiers
 *
 * sizeGroup: one of "0-6m" | "6-12m" | "12-24m" | "24m-4a"
 * sizeOptions: array of { label, minMonths, maxMonths }
 *   Allowed exact ranges per group:
 *     0–6m:   0–1, 1–3, 3–6
 *     6–12m:  6–9, 9–12
 *     12–24m: 12–18, 18–24
 *     24m–4a: 24–30, 30–36, 36–42, 42–48
 */

/** Default weight per item (grams) when product has no weightGrams. */
export const DEFAULT_WEIGHT_GRAMS = 200;

const products = [
  {
    id: '1',
    slug: 'macacao-algodao-organico',
    name: 'Macacão Algodão Orgânico',
    price: 129.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 200,
    packGroup: 'roupa',
    oldPrice: null,
    category: 'recem-nascido',
    tag: 'Mais Vendido',
    isNew: false,
    isPromo: false,
    images: [
      'https://images.unsplash.com/photo-1522771930-78848d9293e8?w=600&h=750&fit=crop',
    ],
    description: 'Macacão de algodão orgânico macio, perfeito para recém-nascidos',
    details: [
      '100% algodão orgânico certificado',
      'Botões de pressão para fácil troca de fralda',
      'Lavável na máquina a 30 °C',
      'Forro interno ultra macio',
    ],
    sizes: ['0-1m', '1-3m', '3-6m'],
    sizeGroup: '0-6m',
    ageMinMonths: 0,
    ageMaxMonths: 6,
    sizeOptions: [
      { label: '0-1m', minMonths: 0, maxMonths: 1 },
      { label: '1-3m', minMonths: 1, maxMonths: 3 },
      { label: '3-6m', minMonths: 3, maxMonths: 6 },
    ],
  },
  {
    id: '2',
    slug: 'casaquinho-de-trico',
    name: 'Casaquinho de Tricô',
    price: 159.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 350,
    packGroup: 'roupa',
    oldPrice: null,
    category: '0-3m',
    tag: 'Novo',
    isNew: true,
    isPromo: false,
    images: [
      'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=600&h=750&fit=crop',
    ],
    description: 'Casaquinho de tricô aconchegante em cores pastéis suaves',
    details: [
      'Tricô macio de mistura algodão/poliamida',
      'Fechamento com botões de madrepérola',
      'Lavar à mão recomendado',
    ],
    sizes: ['1-3m', '3-6m'],
    sizeGroup: '0-6m',
    ageMinMonths: 1,
    ageMaxMonths: 6,
    sizeOptions: [
      { label: '1-3m', minMonths: 1, maxMonths: 3 },
      { label: '3-6m', minMonths: 3, maxMonths: 6 },
    ],
  },
  {
    id: '3',
    slug: 'vestido-floral',
    name: 'Vestido Floral',
    price: 139.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 180,
    packGroup: 'roupa',
    oldPrice: 169.9,
    category: '3-6m',
    tag: 'Popular',
    isNew: false,
    isPromo: true,
    images: [
      'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&h=750&fit=crop',
    ],
    description: 'Vestido floral adorável para ocasiões especiais',
    details: [
      'Tecido misto algodão/elastano',
      'Estampa floral exclusiva',
      'Lavável na máquina',
    ],
    sizes: ['3-6m'],
    sizeGroup: '0-6m',
    ageMinMonths: 3,
    ageMaxMonths: 6,
    sizeOptions: [
      { label: '3-6m', minMonths: 3, maxMonths: 6 },
    ],
  },
  {
    id: '4',
    slug: 'kit-body-3-pecas',
    name: 'Kit Body (3 peças)',
    price: 99.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 450,
    packGroup: 'roupa',
    oldPrice: null,
    category: 'recem-nascido',
    tag: null,
    isNew: false,
    isPromo: false,
    images: [
      'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&h=750&fit=crop',
    ],
    description: 'Conjunto com 3 bodies de algodão macio',
    details: [
      '100% algodão',
      'Gola envelope para vestir fácil',
      'Pacote com 3 cores sortidas',
    ],
    sizes: ['0-1m', '1-3m'],
    sizeGroup: '0-6m',
    ageMinMonths: 0,
    ageMaxMonths: 3,
    sizeOptions: [
      { label: '0-1m', minMonths: 0, maxMonths: 1 },
      { label: '1-3m', minMonths: 1, maxMonths: 3 },
    ],
  },
  {
    id: '5',
    slug: 'pijama-com-pezinho',
    name: 'Pijama com Pezinho',
    price: 119.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 220,
    packGroup: 'roupa',
    oldPrice: 149.9,
    category: '0-3m',
    tag: 'Mais Vendido',
    isNew: false,
    isPromo: true,
    images: [
      'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600&h=750&fit=crop',
    ],
    description: 'Pijama quentinho com pezinho para noites tranquilas',
    details: [
      'Malha flanelada 100% algodão',
      'Pezinho com antiderrapante',
      'Zíper frontal coberto',
    ],
    sizes: ['1-3m', '3-6m'],
    sizeGroup: '0-6m',
    ageMinMonths: 1,
    ageMaxMonths: 6,
    sizeOptions: [
      { label: '1-3m', minMonths: 1, maxMonths: 3 },
      { label: '3-6m', minMonths: 3, maxMonths: 6 },
    ],
  },
  {
    id: '6',
    slug: 'touca-com-renda',
    name: 'Touca com Renda',
    price: 69.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 80,
    packGroup: 'roupa',
    oldPrice: null,
    category: 'essenciais',
    tag: 'Novo',
    isNew: true,
    isPromo: false,
    images: [
      'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=600&h=750&fit=crop',
    ],
    description: 'Touca delicada com acabamento em renda',
    details: [
      'Algodão pima peruano',
      'Acabamento em renda artesanal',
    ],
    sizes: ['0-1m', '1-3m'],
    sizeGroup: '0-6m',
    ageMinMonths: 0,
    ageMaxMonths: 3,
    sizeOptions: [
      { label: '0-1m', minMonths: 0, maxMonths: 1 },
      { label: '1-3m', minMonths: 1, maxMonths: 3 },
    ],
  },
  {
    id: '7',
    slug: 'kit-presente-bem-vindo-bebe',
    name: 'Kit Presente — Bem-vindo Bebê',
    price: 299.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 500,
    packGroup: 'roupa',
    oldPrice: null,
    category: 'presentes',
    tag: 'Popular',
    isNew: false,
    isPromo: false,
    images: [
      'https://images.unsplash.com/photo-1504151932400-72d4384f04b3?w=600&h=750&fit=crop',
    ],
    description: 'Kit presente especial para recém-nascidos',
    details: [
      'Inclui macacão, touca e manta',
      'Caixa presente decorada',
      'Cartão personalizado incluso',
    ],
    sizes: ['0-1m'],
    sizeGroup: '0-6m',
    ageMinMonths: 0,
    ageMaxMonths: 1,
    sizeOptions: [
      { label: '0-1m', minMonths: 0, maxMonths: 1 },
    ],
  },
  {
    id: '8',
    slug: 'manta-de-bambu',
    name: 'Manta de Bambu',
    price: 89.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 250,
    packGroup: 'roupa',
    oldPrice: null,
    category: 'essenciais',
    tag: 'Mais Vendido',
    isNew: false,
    isPromo: false,
    images: [
      'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=600&h=750&fit=crop',
    ],
    description: 'Manta de musselina de bambu ultra macia',
    details: [
      '70% bambu / 30% algodão',
      '120 × 120 cm',
      'Hipoalergênica e antibacteriana',
    ],
    sizes: ['Único'],
    sizeGroup: '0-6m',
    ageMinMonths: 0,
    ageMaxMonths: 6,
    sizeOptions: [
      { label: 'Único', minMonths: 0, maxMonths: 6 },
    ],
  },
  {
    id: '9',
    slug: 'calcinha-com-babado',
    name: 'Calcinha com Babado',
    price: 79.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 100,
    packGroup: 'roupa',
    oldPrice: null,
    category: '6-12m',
    tag: null,
    isNew: false,
    isPromo: false,
    images: [
      'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=600&h=750&fit=crop',
    ],
    description: 'Calcinha adorável com babados para brincar',
    details: ['Algodão macio com elastano', 'Babado duplo com acabamento'],
    sizes: ['6-9m', '9-12m'],
    sizeGroup: '6-12m',
    ageMinMonths: 6,
    ageMaxMonths: 12,
    sizeOptions: [
      { label: '6-9m', minMonths: 6, maxMonths: 9 },
      { label: '9-12m', minMonths: 9, maxMonths: 12 },
    ],
  },
  {
    id: '10',
    slug: 'camisa-gola-peter-pan',
    name: 'Camisa Gola Peter Pan',
    price: 109.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 150,
    packGroup: 'roupa',
    oldPrice: 129.9,
    category: '6-12m',
    tag: 'Novo',
    isNew: true,
    isPromo: true,
    images: [
      'https://images.unsplash.com/photo-1522771930-78848d9293e8?w=600&h=750&fit=crop',
    ],
    description: 'Camisa clássica com gola Peter Pan',
    details: [
      'Tricoline 100% algodão',
      'Gola Peter Pan com bordado',
      'Botões de madrepérola',
    ],
    sizes: ['6-9m', '9-12m'],
    sizeGroup: '6-12m',
    ageMinMonths: 6,
    ageMaxMonths: 12,
    sizeOptions: [
      { label: '6-9m', minMonths: 6, maxMonths: 9 },
      { label: '9-12m', minMonths: 9, maxMonths: 12 },
    ],
  },
  {
    id: '11',
    slug: 'kit-sapatinhos-de-trico',
    name: 'Kit Sapatinhos de Tricô',
    price: 74.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 120,
    packGroup: 'roupa',
    oldPrice: null,
    category: 'essenciais',
    tag: 'Popular',
    isNew: false,
    isPromo: false,
    images: [
      'https://images.unsplash.com/photo-1522771930-78848d9293e8?w=600&h=750&fit=crop',
    ],
    description: 'Sapatinhos de tricô feitos à mão em várias cores',
    details: [
      'Tricô artesanal 100% algodão',
      'Sola antiderrapante',
      'Pacote com 2 pares',
    ],
    sizes: ['0-1m', '1-3m', '3-6m'],
    sizeGroup: '0-6m',
    ageMinMonths: 0,
    ageMaxMonths: 6,
    sizeOptions: [
      { label: '0-1m', minMonths: 0, maxMonths: 1 },
      { label: '1-3m', minMonths: 1, maxMonths: 3 },
      { label: '3-6m', minMonths: 3, maxMonths: 6 },
    ],
  },
  {
    id: '12',
    slug: 'kit-presente-primeiro-ano',
    name: 'Kit Presente — Primeiro Ano',
    price: 349.9,
    stockCount: 99,
    inStock: true,
    weightGrams: 600,
    packGroup: 'roupa',
    oldPrice: 399.9,
    category: 'presentes',
    tag: 'Mais Vendido',
    isNew: false,
    isPromo: true,
    images: [
      'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=600&h=750&fit=crop',
    ],
    description: 'Coleção completa de presentes para o primeiro ano',
    details: [
      'Inclui peças para 0-12 meses',
      'Caixa keepsake decorativa',
      'Acompanha álbum de fotos',
    ],
    sizes: ['0-1m', '1-3m', '3-6m', '6-9m', '9-12m'],
    sizeGroup: '6-12m',
    ageMinMonths: 0,
    ageMaxMonths: 12,
    sizeOptions: [
      { label: '0-1m', minMonths: 0, maxMonths: 1 },
      { label: '1-3m', minMonths: 1, maxMonths: 3 },
      { label: '3-6m', minMonths: 3, maxMonths: 6 },
      { label: '6-9m', minMonths: 6, maxMonths: 9 },
      { label: '9-12m', minMonths: 9, maxMonths: 12 },
    ],
  },
];

export default products;

/** Named export so CatalogContext can import the original array. */
export { products as defaultProducts };

/* ── Lookup helpers ────────────────────────────────────── */

/** @param {string} id */
export function getProductById(id) {
  return products.find((p) => p.id === String(id)) ?? null;
}

/** @param {string} slug */
export function getProductBySlug(slug) {
  return products.find((p) => p.slug === slug) ?? null;
}

/* ── Size-group metadata ──────────────────────────────── */

/** Ordered list of size-group types (matches DB schema). */
export const SIZE_GROUPS = [
  { value: 'roupa', label: 'Roupas' },
  { value: 'calçado', label: 'Calçados' },
  { value: 'acessório', label: 'Acessórios' },
];

/* ── Benefits ──────────────────────────────────────────── */

export const benefits = [
  {
    id: 1,
    title: 'Peças diferenciadas',
    description: 'Roupas clássicas e delicadas, com acabamento premium e toque macio.',
    icon: 'quality',
  },
  {
    id: 2,
    title: 'Envio rápido',
    description: 'Postamos em 1 dia útil e acompanhamos o trajeto até a sua casa.',
    icon: 'shipping',
  },
  {
    id: 3,
    title: 'Pós-venda próximo',
    description: 'Atendimento que entende a necessidade e resolve qualquer dúvida rápido.',
    icon: 'returns',
  },
  {
    id: 4,
    title: 'Embalagem presente',
    description: 'Embrulhamos para presente, sem custo adicional.',
    icon: 'gift',
  },
];
