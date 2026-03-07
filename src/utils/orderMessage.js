/**
 * orderMessage.js — builds the "PEDIDO PAGO" manager message for WhatsApp.
 */

import { formatPrice } from '../lib/ui';

/**
 * Generate a simple order ID from a timestamp.
 * Format: NA-YYYYMMDD-HHmmss
 */
export function generateOrderId() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `NA-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Persist and retrieve the last order id. */
const ORDER_KEY = 'nobre_amor_v1_last_order_id';

export function saveOrderId(id) {
  try { localStorage.setItem(ORDER_KEY, id); } catch { /* ignore */ }
}

export function getLastOrderId() {
  try { return localStorage.getItem(ORDER_KEY) || ''; } catch { return ''; }
}

/**
 * Payment method display label.
 */
function methodLabel(method) {
  if (method === 'cartao') return 'Cartão';
  if (method === 'pix') return 'Pix';
  return method;
}

/**
 * Build the full manager message for a paid order.
 *
 * @param {{
 *   cart: Array<{ id: string, qty: number, size: string }>,
 *   products: Array<{ id: string, name: string, price: number }>,
 *   user: { displayName?: string },
 *   shipping: { feeCents?: number|null, etaText?: string },
 *   payment: {
 *     method: string,
 *     status: string,
 *     card?: { name: string, numberLast4: string, brand: string, installments: number }|null,
 *     pixId?: string,
 *     paidTotalCents: number,
 *     paidShippingCents: number,
 *     paidAtISO: string,
 *   },
 *   address: { cep: string, street: string, number: string, complement: string, neighborhood: string, city: string, uf: string },
 *   customer: { name: string, phone: string, email: string, message: string },
 *   orderId: string,
 * }} params
 * @returns {string}
 */
export function buildManagerPaidMessage({ cart, products, user, shipping, payment, address, customer, orderId }) {
  const lines = [];
  const prodMap = new Map((products || []).map((p) => [String(p.id), p]));

  // ── Title
  lines.push(`🧸 Nobre Amor Baby — PEDIDO PAGO ${orderId}`);
  lines.push('');

  // ── Payment confirmed
  lines.push('💳 PAGAMENTO CONFIRMADO');
  lines.push(`• Método: ${methodLabel(payment.method)}`);
  lines.push(`• Valor pago: ${formatPrice(payment.paidTotalCents / 100)}`);
  lines.push(`• Frete pago: ${formatPrice(payment.paidShippingCents / 100)}`);
  if (payment.method === 'cartao' && payment.card) {
    if (payment.card.installments > 1) {
      lines.push(`• Parcelas: ${payment.card.installments}x`);
    }
    if (payment.card.numberLast4) {
      lines.push(`• Cartão: final **** ${payment.card.numberLast4}`);
    }
  }
  if (payment.method === 'pix' && payment.pixId) {
    lines.push(`• Comprovante Pix: ${payment.pixId}`);
  }
  if (payment.paidAtISO) {
    try {
      lines.push(`• Data/hora: ${new Date(payment.paidAtISO).toLocaleString('pt-BR')}`);
    } catch {
      lines.push(`• Data/hora: ${payment.paidAtISO}`);
    }
  }
  lines.push('');

  // ── Customer
  lines.push('👤 CLIENTE');
  const cName = customer?.name || user?.displayName || '';
  if (cName) lines.push(`• Nome: ${cName}`);
  if (customer?.phone) lines.push(`• WhatsApp: ${customer.phone}`);
  if (customer?.email) lines.push(`• E-mail: ${customer.email}`);
  lines.push('');

  // ── Address
  lines.push('📍 ENDEREÇO DE ENTREGA');
  if (address.cep) lines.push(`• CEP: ${address.cep}`);
  const streetLine = [address.street, address.number].filter(Boolean).join(', ');
  if (streetLine) lines.push(`• ${streetLine}`);
  if (address.complement) lines.push(`• Complemento: ${address.complement}`);
  if (address.neighborhood) lines.push(`• Bairro: ${address.neighborhood}`);
  if (address.city) lines.push(`• ${address.city}/${address.uf}`);
  lines.push('');

  // ── Shipping
  lines.push('🚚 FRETE');
  if (shipping.feeCents != null) {
    lines.push(`• Valor: ${formatPrice(shipping.feeCents / 100)}`);
  }
  if (shipping.etaText) {
    lines.push(`• Prazo: ${shipping.etaText}`);
  }
  lines.push('');

  // ── Items
  lines.push('📋 ITENS');
  const enriched = cart.map((ci) => {
    const p = prodMap.get(String(ci.id));
    return p ? { ...ci, product: p } : null;
  }).filter(Boolean);

  enriched.forEach((item, idx) => {
    const unitPrice = item.product.price;
    const lineTotal = unitPrice * item.qty;
    lines.push(`${idx + 1}) ${item.product.name}`);
    lines.push(`   • Tamanho: ${item.size}`);
    lines.push(`   • Qtd: ${item.qty}`);
    lines.push(`   • Unit: ${formatPrice(unitPrice)}`);
    lines.push(`   • Total: ${formatPrice(lineTotal)}`);
  });
  lines.push('');

  // ── Totals
  const subtotalCents = enriched.reduce(
    (sum, i) => sum + Math.round(i.product.price * 100) * i.qty, 0,
  );
  const shippingCents = payment.paidShippingCents || shipping.feeCents || 0;
  lines.push('💰 TOTAIS');
  lines.push(`• Subtotal: ${formatPrice(subtotalCents / 100)}`);
  lines.push(`• Frete: ${formatPrice(shippingCents / 100)}`);
  lines.push(`• Total pago: ${formatPrice(payment.paidTotalCents / 100)}`);

  // Mismatch warning
  const expectedCents = subtotalCents + shippingCents;
  if (payment.paidTotalCents !== expectedCents) {
    lines.push(`⚠️ Valor informado difere do calculado (${formatPrice(expectedCents / 100)})`);
  }
  lines.push('');

  // ── Notes
  if (customer?.message) {
    lines.push(`📝 Observações: ${customer.message}`);
    lines.push('');
  }

  // ── Footer
  lines.push('📦 Por favor, confirme o envio e envie o rastreio quando postar.');

  return lines.join('\n');
}
