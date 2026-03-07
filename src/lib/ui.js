/* ── Price formatting ─────────────────────────────────── */

/**
 * Formats a number as BRL currency string: "R$ 129,90"
 */
export function formatPrice(value) {
  return `R$\u00A0${value.toFixed(2).replace('.', ',')}`;
}

/* ── Navigation helpers ───────────────────────────────── */

export function scrollToSection(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ── Shared Tailwind class constants ──────────────────── */

/** Focus ring used on light backgrounds */
export const focusRing =
  'focus:outline-none focus:ring-2 focus:ring-baby-accent focus:ring-offset-2';

/** Focus ring used inside the dark footer */
export const focusRingDark =
  'focus:outline-none focus:ring-2 focus:ring-baby-pink';

/** Primary filled button (dark bg, white text) */
export const btnPrimary = `
  inline-flex items-center justify-center gap-2
  bg-baby-text text-white dark:text-baby-cream px-8 py-4 rounded-full
  font-sans font-medium text-lg shadow-soft-lg
  hover:shadow-xl active:scale-[0.97]
  transform hover:-translate-y-0.5
  transition-all duration-300
  ${focusRing}
`.replace(/\s+/g, ' ').trim();

/** Secondary / ghost button (outline) */
export const btnSecondary = `
  inline-flex items-center justify-center gap-2
  px-8 py-3 border-2 border-baby-text/20 text-baby-text
  rounded-full font-sans font-medium
  hover:border-baby-accent hover:text-baby-accent
  active:scale-[0.97]
  transition-all duration-300
  ${focusRing}
`.replace(/\s+/g, ' ').trim();

/** Icon button base (44×44 minimum tap target) */
export const btnIcon = `
  p-2.5 min-w-11 min-h-11
  flex items-center justify-center
  rounded-full transition-colors
  ${focusRing}
`.replace(/\s+/g, ' ').trim();

/** Section wrapper padding */
export const sectionPadding = 'py-20 lg:py-28';

/** Container max-width + horizontal padding */
export const container = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';

/** Card base styles */
export const card = `
  bg-surface rounded-2xl overflow-hidden
  shadow-soft hover:shadow-soft-lg
  transition-all duration-300
`.replace(/\s+/g, ' ').trim();

/**
 * Build the order text summary for clipboard / WhatsApp / email.
 * @param {{ items: { name: string; size: string; qty: number; price: number }[]; total: number; customer: { name: string; phone: string; email: string; message: string }; shipping?: { feeCents: number | null; etaText: string }; address?: { cep: string; street: string; number: string; complement: string; neighborhood: string; city: string; uf: string } }} order
 */
export function buildOrderText(order) {
  const lines = [
    `Pedido — Nobre Amor Baby`,
    ``,
    ...order.items.map(
      (i) =>
        `${i.qty}x ${i.name} (${i.size}) — ${formatPrice(i.price * i.qty)}`
    ),
    ``,
  ];

  // Shipping section
  if (order.shipping) {
    const s = order.shipping;
    if (s.feeCents != null) {
      lines.push(`Frete: ${formatPrice(s.feeCents / 100)}`);
    } else {
      lines.push(`Frete: a calcular`);
    }
    if (s.etaText) {
      lines.push(`Prazo: ${s.etaText}`);
    }
  }

  // Address section
  if (order.address) {
    const a = order.address;
    lines.push(``);
    lines.push(`ENDEREÇO DE ENTREGA:`);
    const streetLine = [a.street, a.number].filter(Boolean).join(', ');
    if (streetLine) lines.push(streetLine);
    if (a.complement) lines.push(`Complemento: ${a.complement}`);
    if (a.neighborhood) lines.push(`Bairro: ${a.neighborhood}`);
    if (a.city) lines.push(`${a.city}/${a.uf}`);
    if (a.cep) lines.push(`CEP: ${a.cep}`);
  }
  lines.push(``);

  // Subtotal (items only) and Total (with shipping when known)
  const itemsTotal = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shippingBRL = order.shipping?.feeCents != null ? order.shipping.feeCents / 100 : 0;
  if (shippingBRL > 0) {
    lines.push(`Subtotal: ${formatPrice(itemsTotal)}`);
  }
  lines.push(`Total: ${formatPrice(order.total)}`);
  lines.push(``);

  lines.push(`Nome: ${order.customer.name}`);
  lines.push(`Telefone: ${order.customer.phone}`);
  lines.push(`E-mail: ${order.customer.email}`);

  if (order.customer.message) {
    lines.push(`Mensagem: ${order.customer.message}`);
  }
  return lines.join('\n');
}
