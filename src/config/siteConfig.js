/**
 * Site-wide configuration.
 * Valores de contato, endereço e regras de frete da Pequeno Encanto.
 * Preencha com os dados da sua loja antes de publicar.
 */
const siteConfig = {
  brandName: 'Pequeno Encanto',

  /** Slogan curto exibido no footer e outras áreas de branding. */
  tagline: 'Roupas que tornam momentos ainda mais especiais.',

  /** Data de fundação (dd/mm/aaaa). */
  foundedAt: '',

  /** URL externa da loja (se houver). */
  storeUrl: '',

  /** WhatsApp com código do país e DDD (somente dígitos). */
  whatsappNumber: '',

  /** Número formatado para exibição. */
  whatsappDisplay: '',

  /** E-mail de contato. */
  contactEmail: '',

  /** Instagram. */
  instagramUrl: '',
  instagramHandle: '',

  /** Facebook. */
  facebookUrl: '',

  /** Twitter / X (vazio — não utilizado). */
  twitterUrl: '',

  /* ── Loja física ──────────────────────────────────── */

  storeAddressLine: '',
  storeCityState: '',
  storeCep: '',
  pickupAvailable: false,

  /* ── Regras de frete (uso interno) ───────────────── */

  STORE_CITY: '',
  STORE_UF: '',
  LOCAL_FIXED_SHIPPING_CENTS: 1000,
  NONLOCAL_SURCHARGE_CENTS: 500,
  LOCAL_ETA_TEXT: 'Entrega local (1–2 dias úteis)',
  DEFAULT_ETA_TEXT: '',
};

export default siteConfig;
