/**
 * Site-wide configuration.
 * Valores de contato, endereço e regras de frete da Nobre Amor Baby.
 */
const siteConfig = {
  brandName: 'Nobre Amor Baby',

  /** Slogan curto exibido no footer e outras áreas de branding. */
  tagline: 'Roupas que tornam momentos ainda mais especiais.',

  /** Data de fundação (dd/mm/aaaa). */
  foundedAt: '07/05/2023',

  /** URL externa da loja (se houver). */
  storeUrl: '',

  /** WhatsApp com código do país e DDD (somente dígitos). */
  whatsappNumber: '5537999622045',

  /** Número formatado para exibição. */
  whatsappDisplay: '(37) 99962-2045',

  /** E-mail de contato. */
  contactEmail: 'nobreamorbaby@gmail.com',

  /** Instagram. */
  instagramUrl: 'https://instagram.com/nobreamorbaby',
  instagramHandle: '@nobreamorbaby',

  /** Facebook. */
  facebookUrl: 'https://www.facebook.com/nobreamorbaby',

  /** Twitter / X (vazio — não utilizado). */
  twitterUrl: '',

  /* ── Loja física ──────────────────────────────────── */

  storeAddressLine: 'Rua Cabo Maurício dos Santos, 102 — Serra Verde',
  storeCityState: 'Divinópolis, MG — CEP 35502-825',
  storeCep: '35502825',
  pickupAvailable: true,

  /* ── Regras de frete (uso interno) ───────────────── */

  STORE_CITY: 'Divinópolis',
  STORE_UF: 'MG',
  LOCAL_FIXED_SHIPPING_CENTS: 1000,
  NONLOCAL_SURCHARGE_CENTS: 500,
  LOCAL_ETA_TEXT: 'Entrega local (1–2 dias úteis)',
  DEFAULT_ETA_TEXT: '',
};

export default siteConfig;
