/**
 * Site-wide configuration.
 * Valores de contato, endereço e regras de frete da Pequeno Encanto.
 * Os valores abaixo são PLACEHOLDERS — troque pelos dados reais da sua loja
 * antes de publicar.
 */
const siteConfig = {
  brandName: 'Pequeno Encanto',

  /** Slogan curto exibido no footer e outras áreas de branding. */
  tagline: 'Roupas que tornam momentos ainda mais especiais.',

  /** Data de fundação (dd/mm/aaaa). */
  foundedAt: '01/01/2024',

  /** URL externa da loja (se houver). */
  storeUrl: '',

  /** WhatsApp com código do país e DDD (somente dígitos). */
  whatsappNumber: '5511999999999',

  /** Número formatado para exibição. */
  whatsappDisplay: '(11) 99999-9999',

  /** E-mail de contato. */
  contactEmail: 'contato@exemplo.com',

  /** Instagram. */
  instagramUrl: 'https://instagram.com/sua_loja',
  instagramHandle: '@sua_loja',

  /** Facebook. */
  facebookUrl: 'https://facebook.com/sua_loja',

  /** Twitter / X (vazio — não utilizado). */
  twitterUrl: '',

  /* ── Loja física ──────────────────────────────────── */

  storeAddressLine: 'Rua Exemplo, 123 — Centro',
  storeCityState: 'Sua Cidade, UF — CEP 00000-000',
  storeCep: '00000000',
  pickupAvailable: false,

  /* ── Regras de frete (uso interno) ───────────────── */

  STORE_CITY: 'Sua Cidade',
  STORE_UF: 'UF',
  LOCAL_FIXED_SHIPPING_CENTS: 1000,
  NONLOCAL_SURCHARGE_CENTS: 500,
  LOCAL_ETA_TEXT: 'Entrega local (1–2 dias úteis)',
  DEFAULT_ETA_TEXT: '',
};

export default siteConfig;
