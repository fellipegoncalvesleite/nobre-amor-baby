import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiSend, FiChevronLeft, FiCheck, FiAlertTriangle, FiCreditCard } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCatalog } from '../context/CatalogContext';
import { useStore } from '../context/StoreContext';
import { formatPrice, btnPrimary, btnSecondary } from '../lib/ui';
import { buildManagerPaidMessage, generateOrderId, saveOrderId } from '../utils/orderMessage';
import { openWhatsApp, isWaTestMode } from '../utils/whatsapp';
import ShippingSelector from '../components/ShippingSelector';

export default function CheckoutPage() {
  const { products, decrementStock } = useCatalog();
  const {
    cart, clearCart,
    shipping, clearShipping,
    address, clearAddress,
    payment, setPayment, setPaymentCard, resetPayment,
  } = useStore();

  const items = cart
    .map((ci) => {
      const product = products.find((p) => p.id === ci.id);
      return product ? { ...ci, product } : null;
    })
    .filter(Boolean);

  const subtotalCents = useMemo(
    () => items.reduce((sum, i) => sum + Math.round(i.product.price * 100) * i.qty, 0),
    [items],
  );
  const shippingCents = shipping.feeCents ?? 0;
  const suggestedTotalCents = subtotalCents + shippingCents;

  // Track whether user has manually edited the paid total
  const [totalManuallyEdited, setTotalManuallyEdited] = useState(false);

  // Auto-sync paidTotalCents & paidShippingCents when subtotal/shipping change (unless manually edited)
  useEffect(() => {
    if (!totalManuallyEdited) {
      setPayment({
        paidTotalCents: suggestedTotalCents,
        paidShippingCents: shippingCents,
      });
    } else {
      setPayment({ paidShippingCents: shippingCents });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedTotalCents, shippingCents]);

  // Shipping validation — fee calculated + address number filled
  const shippingValid =
    shipping.feeCents != null &&
    !shipping.isLoading &&
    !shipping.error &&
    address.number.trim().length > 0;

  // Payment validation
  const paymentValid = useMemo(() => {
    if (!payment.confirmationChecked) return false;
    if (payment.paidTotalCents <= 0) return false;
    if (payment.method === 'cartao') {
      if (!payment.card?.name?.trim()) return false;
      if (!/^\d{4}$/.test(payment.card?.numberLast4 || '')) return false;
    }
    return true;
  }, [payment]);

  const canSubmit = shippingValid && paymentValid;

  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [lastOrderId, setLastOrderId] = useState('');

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  /* ── Card number handling — extract last 4 only ───── */
  const [cardNumberDisplay, setCardNumberDisplay] = useState('');
  const handleCardNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    // Format for display with spaces every 4 digits
    const display = raw.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumberDisplay(display);
    // Extract last 4 digits
    const last4 = raw.length >= 4 ? raw.slice(-4) : raw;
    setPaymentCard({ numberLast4: last4 });
  };

  /* ── Card expiry display ──────────────────────────── */
  const [cardExpiry, setCardExpiry] = useState('');
  const handleExpiryChange = (e) => {
    let raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (raw.length > 2) raw = raw.slice(0, 2) + '/' + raw.slice(2);
    setCardExpiry(raw);
  };

  /* ── CVV display ──────────────────────────────────── */
  const [cardCvv, setCardCvv] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canSubmit) {
      toast.error('Preencha todos os dados obrigatórios e marque a confirmação.', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
      });
      return;
    }

    // Stock validation
    const stockIssues = items.filter((i) => {
      const sc = i.product.stockCount ?? 99;
      return sc < i.qty;
    });
    if (stockIssues.length > 0) {
      toast.error('Estoque insuficiente para alguns itens. Volte ao carrinho e ajuste.', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
        duration: 4000,
      });
      return;
    }

    // Decrement stock
    for (const item of items) {
      decrementStock(item.id, item.qty);
    }

    // Finalize payment state
    const finalPayment = {
      ...payment,
      status: 'simulado_confirmado',
      paidAtISO: new Date().toISOString(),
      paidTotalCents: payment.paidTotalCents,
      paidShippingCents: payment.paidShippingCents,
    };
    setPayment(finalPayment);

    /* ── Persist order to Supabase ────────────────── */
    let orderId;
    try {
      const orderPayload = {
        customer: {
          name: form.name,
          phone: form.phone || '',
          email: form.email || '',
          message: form.message || '',
        },
        address: {
          cep: address.cep || '',
          street: address.street || '',
          number: address.number || '',
          complement: address.complement || '',
          neighborhood: address.neighborhood || '',
          city: address.city || '',
          uf: address.uf || '',
        },
        shipping: {
          feeCents: shippingCents,
          etaText: shipping.etaText || '',
          provider: shipping.provider || '',
        },
        payment: {
          method: finalPayment.method || 'pix',
          paidTotalCents: finalPayment.paidTotalCents,
          ref: finalPayment.card?.numberLast4
            ? `cartao_final_${finalPayment.card.numberLast4}`
            : `${finalPayment.method || 'pix'}_simulado`,
        },
        items: items.map((i) => ({
          productId: String(i.id),
          productName: i.product.name,
          size: i.size || '',
          qty: i.qty,
          unitPriceCents: Math.round(i.product.price * 100),
        })),
      };
      const apiRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });
      const apiData = await apiRes.json();
      if (apiRes.ok && apiData.orderCode) {
        orderId = apiData.orderCode;
      } else {
        console.warn('[checkout] API /api/orders error:', apiData);
        orderId = generateOrderId(); // fallback
      }
    } catch (err) {
      console.warn('[checkout] API /api/orders failed:', err);
      orderId = generateOrderId(); // fallback — keep WA flow
    }
    saveOrderId(orderId);
    setLastOrderId(orderId);

    // Build message
    const message = buildManagerPaidMessage({
      cart,
      products,
      user: { displayName: form.name },
      shipping,
      payment: finalPayment,
      address,
      customer: form,
      orderId,
    });

    // Open WhatsApp
    openWhatsApp(message);

    clearCart();
    clearShipping();
    clearAddress();
    resetPayment();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
        <div className="max-w-lg mx-auto px-4 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
            <div className="w-20 h-20 mx-auto mb-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <FiCheck size={36} className="text-green-600" />
            </div>
          </motion.div>
          <h1 className="font-serif text-3xl sm:text-4xl text-baby-text mb-4">
            Pedido Enviado!
          </h1>
          {lastOrderId && (
            <p className="font-mono text-sm text-baby-text/50 mb-2">Pedido {lastOrderId}</p>
          )}
          <p className="font-sans text-baby-text/60 text-lg mb-8 leading-relaxed">
            Seu pedido foi enviado via WhatsApp. A loja confirmará o envio em breve.
          </p>
          {isWaTestMode() && (
            <p className="font-sans text-xs text-amber-500 mb-4">(Modo teste WhatsApp ativo)</p>
          )}
          <Link to="/" className={btnPrimary}>
            Voltar à Loja
          </Link>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
        <div className="max-w-lg mx-auto px-4 text-center">
          <h1 className="font-serif text-3xl text-baby-text mb-4">Carrinho vazio</h1>
          <p className="font-sans text-baby-text/60 mb-8">Adicione produtos ao carrinho antes de finalizar.</p>
          <Link to="/" className={btnPrimary}>Explorar Produtos</Link>
        </div>
      </section>
    );
  }

  const inputCls = `w-full px-4 py-3 rounded-xl border border-baby-text/15 bg-surface
                    font-sans text-baby-text placeholder-baby-text/40
                    focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent
                    transition-colors`;

  const totalMismatch = payment.paidTotalCents !== suggestedTotalCents && totalManuallyEdited;

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/carrinho" className="hover:text-baby-accent transition-colors">Carrinho</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Finalizar Pedido</li>
          </ol>
        </nav>

        <h1 className="font-serif text-3xl sm:text-4xl text-baby-text mb-10 text-center">
          Finalizar Pedido
        </h1>

        <form onSubmit={handleSubmit}>
          <div className="grid lg:grid-cols-5 gap-8">
            {/* ═══ LEFT COLUMN — forms ═══ */}
            <div className="lg:col-span-3 space-y-5">
              {/* ── Customer data ──────────────────────── */}
              <h2 className="font-serif text-xl text-baby-text mb-2">Seus Dados</h2>

              <div>
                <label htmlFor="ck-name" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                  Nome completo *
                </label>
                <input id="ck-name" name="name" type="text" required value={form.name} onChange={handleChange}
                  placeholder="Maria Silva" className={inputCls} />
              </div>

              <div>
                <label htmlFor="ck-phone" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                  Telefone / WhatsApp *
                </label>
                <input id="ck-phone" name="phone" type="tel" required value={form.phone} onChange={handleChange}
                  placeholder="(37) 99999-9999" className={inputCls} />
              </div>

              <div>
                <label htmlFor="ck-email" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                  E-mail
                </label>
                <input id="ck-email" name="email" type="email" value={form.email} onChange={handleChange}
                  placeholder="maria@email.com" className={inputCls} />
              </div>

              <div>
                <label htmlFor="ck-msg" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                  Observações
                </label>
                <textarea id="ck-msg" name="message" rows={3} value={form.message} onChange={handleChange}
                  placeholder="Alguma observação para o pedido?" className={`${inputCls} resize-none`} />
              </div>

              {/* ── Shipping ───────────────────────────── */}
              <div className="pt-2">
                <ShippingSelector />
                {!shippingValid && (
                  <div className="flex items-center gap-2 mt-2 text-amber-600 dark:text-amber-400">
                    <FiAlertTriangle size={14} />
                    <p className="font-sans text-xs">Preencha o endereço e aguarde o cálculo do frete.</p>
                  </div>
                )}
              </div>

              {/* ═══ PAYMENT SECTION ═══════════════════ */}
              <div className="pt-4">
                <h2 className="font-serif text-xl text-baby-text mb-4 flex items-center gap-2">
                  <FiCreditCard size={20} className="text-baby-accent" />
                  Pagamento
                </h2>
                <p className="font-sans text-xs text-baby-text/40 mb-4">
                  (simulação) Seus dados de cartão não são processados nem armazenados por completo.
                </p>

                {/* Method selector */}
                <div className="flex gap-2 mb-5">
                  {[
                    { value: 'cartao', label: 'Cartão' },
                    { value: 'pix', label: 'Pix' },
                  ].map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setPayment({ method: m.value })}
                      className={`flex-1 py-2.5 rounded-xl font-sans text-sm font-medium transition-all border-2
                        ${payment.method === m.value
                          ? 'border-baby-accent bg-baby-accent/10 text-baby-accent'
                          : 'border-baby-text/15 bg-surface text-baby-text/60 hover:border-baby-text/30'
                        }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Card fields */}
                {payment.method === 'cartao' && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="ck-card-name" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                        Nome no cartão *
                      </label>
                      <input
                        id="ck-card-name"
                        type="text"
                        placeholder="MARIA S SILVA"
                        value={payment.card?.name || ''}
                        onChange={(e) => setPaymentCard({ name: e.target.value })}
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label htmlFor="ck-card-number" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                        Número do cartão *
                      </label>
                      <input
                        id="ck-card-number"
                        type="text"
                        inputMode="numeric"
                        placeholder="0000 0000 0000 0000"
                        value={cardNumberDisplay}
                        onChange={handleCardNumberChange}
                        maxLength={19}
                        className={inputCls}
                      />
                      {payment.card?.numberLast4 && (
                        <p className="font-sans text-[10px] text-baby-text/30 mt-1">
                          Armazenado apenas: final **** {payment.card.numberLast4}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="ck-card-exp" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                          Validade (MM/AA)
                        </label>
                        <input
                          id="ck-card-exp"
                          type="text"
                          inputMode="numeric"
                          placeholder="12/28"
                          value={cardExpiry}
                          onChange={handleExpiryChange}
                          maxLength={5}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label htmlFor="ck-card-cvv" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                          CVV
                        </label>
                        <input
                          id="ck-card-cvv"
                          type="text"
                          inputMode="numeric"
                          placeholder="123"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          maxLength={4}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="ck-installments" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                        Parcelas
                      </label>
                      <select
                        id="ck-installments"
                        value={payment.card?.installments || 1}
                        onChange={(e) => setPaymentCard({ installments: Number(e.target.value) })}
                        className={inputCls}
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}x de {formatPrice(suggestedTotalCents / 100 / n)} {n === 1 ? '(à vista)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Pix fields */}
                {payment.method === 'pix' && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="ck-pix-id" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                        ID / Comprovante Pix (opcional)
                      </label>
                      <input
                        id="ck-pix-id"
                        type="text"
                        placeholder="E12345678..."
                        value={payment.pixId || ''}
                        onChange={(e) => setPayment({ pixId: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}

                {/* Paid total (editable) */}
                <div className="mt-5">
                  <label htmlFor="ck-paid-total" className="block font-sans text-sm font-medium text-baby-text mb-1.5">
                    Valor pago (R$)
                  </label>
                  <input
                    id="ck-paid-total"
                    type="text"
                    inputMode="decimal"
                    value={(payment.paidTotalCents / 100).toFixed(2).replace('.', ',')}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                      const cents = Math.round(parseFloat(val || '0') * 100);
                      setPayment({ paidTotalCents: cents });
                      setTotalManuallyEdited(true);
                    }}
                    className={inputCls}
                  />
                  {totalMismatch && (
                    <p className="font-sans text-xs text-amber-500 mt-1">
                      Valor difere do calculado ({formatPrice(suggestedTotalCents / 100)}).
                    </p>
                  )}
                </div>

                {/* Confirmation checkbox */}
                <div className="mt-5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={payment.confirmationChecked}
                      onChange={(e) => setPayment({
                        confirmationChecked: e.target.checked,
                        status: e.target.checked ? 'simulado_confirmado' : 'simulado_pendente',
                      })}
                      className="mt-0.5 h-5 w-5 rounded border-baby-text/30 text-baby-accent focus:ring-baby-accent"
                    />
                    <span className="font-sans text-sm text-baby-text leading-snug">
                      Confirmo que os dados acima são apenas para simulação e que o pedido será tratado como <strong>PAGO</strong>.
                    </span>
                  </label>
                </div>
              </div>
              {/* end payment */}
            </div>

            {/* ═══ RIGHT COLUMN — summary ═══ */}
            <div className="lg:col-span-2">
              <div className="bg-surface rounded-2xl p-6 shadow-soft sticky top-24">
                <h2 className="font-serif text-xl text-baby-text mb-4">Resumo</h2>

                <ul className="space-y-3 mb-6">
                  {items.map((item) => (
                    <li key={`${item.id}-${item.size}`} className="flex gap-3 font-sans text-sm text-baby-text/70">
                      <img src={item.product.images[0]} alt="" className="w-12 h-14 rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-baby-text line-clamp-1">{item.product.name}</p>
                        <p className="text-baby-text/50">{item.size} &times; {item.qty}</p>
                      </div>
                      <p className="font-medium text-baby-accent whitespace-nowrap">
                        {formatPrice(item.product.price * item.qty)}
                      </p>
                    </li>
                  ))}
                </ul>

                <hr className="border-baby-pink mb-4" />

                {/* Subtotal */}
                <div className="flex justify-between font-sans text-sm text-baby-text/60 mb-2">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotalCents / 100)}</span>
                </div>

                {/* Shipping line */}
                <div className="flex justify-between font-sans text-sm text-baby-text/60 mb-2">
                  <span>Frete</span>
                  <span>
                    {shipping.isLoading
                      ? 'Calculando…'
                      : shipping.feeCents != null
                        ? formatPrice(shipping.feeCents / 100)
                        : '—'}
                  </span>
                </div>

                {shipping.etaText && !shipping.isLoading && (
                  <div className="flex justify-between font-sans text-xs text-baby-text/40 mb-2">
                    <span>Prazo</span>
                    <span>{shipping.etaText}</span>
                  </div>
                )}

                {/* Payment method */}
                <div className="flex justify-between font-sans text-xs text-baby-text/40 mb-2">
                  <span>Pagamento</span>
                  <span>{payment.method === 'cartao' ? `Cartão ${payment.card?.installments || 1}x` : 'Pix'}</span>
                </div>

                <hr className="border-baby-pink mb-4 mt-2" />

                <div className="flex justify-between font-sans font-semibold text-baby-text text-base mb-6">
                  <span>Total</span>
                  <span className="text-baby-accent">
                    {formatPrice(suggestedTotalCents / 100)}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={`${btnPrimary} w-full ${!canSubmit ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <FiSend size={18} />
                  Finalizar no WhatsApp
                </button>
                {!canSubmit && (
                  <p className="font-sans text-xs text-amber-600 dark:text-amber-400 text-center mt-2">
                    {!shippingValid
                      ? 'Preencha o endereço e aguarde o cálculo do frete.'
                      : !payment.confirmationChecked
                        ? 'Marque a confirmação de pagamento.'
                        : 'Preencha os dados de pagamento.'}
                  </p>
                )}

                {isWaTestMode() && (
                  <p className="font-sans text-[10px] text-amber-500 text-center mt-1">
                    (Modo teste WA ativo)
                  </p>
                )}

                <Link to="/carrinho" className={`${btnSecondary} w-full mt-3`}>
                  <FiChevronLeft size={16} />
                  Voltar ao Carrinho
                </Link>
              </div>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
