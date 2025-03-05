/**
 * Site-wide configuration.
 * Fill in values as they become available — components conditionally
 * render links / buttons only when the matching URL is set.
 */
const siteConfig = {
  brandName: 'Nobre Amor Baby',

  /** External store URL — leave empty if not yet configured */
  storeUrl: '',

  /** WhatsApp number with country code, e.g. "5511999999999" */
  whatsappNumber: '',

  /** Contact e-mail for order requests / mailto fallback */
  contactEmail: '',

  /** Full Instagram profile URL, e.g. "https://instagram.com/nobreamorbaby" */
  instagramUrl: '',

  /** Full Facebook profile URL */
  facebookUrl: '',

  /** Full Twitter / X profile URL */
  twitterUrl: '',

  /* ── Physical store / shipping ──────────────────────── */

  /** Store street address (shown in pickup option & footer) */
  storeAddressLine: 'Rua Cabo Maurício dos Santos, 102',

  /** City / state line */
  storeCityState: 'Divinópolis, MG 35502-825',

  /** Store origin CEP (digits only) — used as fromCep in shipping API */
  storeCep: '35502825',

  /* ── Shipping rules (internal — never expose to customer) ── */

  /** City name for local delivery detection (accent-insensitive) */
  STORE_CITY: 'Divinópolis',

  /** UF for local delivery detection */
  STORE_UF: 'MG',

  /** Fixed shipping fee in cents for local delivery (R$ 10,00) */
  LOCAL_FIXED_SHIPPING_CENTS: 1000,

  /** Surcharge in cents added on top of API-quoted fee for non-local (R$ 5,00) */
  NONLOCAL_SURCHARGE_CENTS: 500,

  /** ETA text shown when destination is local */
  LOCAL_ETA_TEXT: 'Entrega local (1–2 dias úteis)',

  /** Fallback ETA text when API returns nothing */
  DEFAULT_ETA_TEXT: '',
};

export default siteConfig;
