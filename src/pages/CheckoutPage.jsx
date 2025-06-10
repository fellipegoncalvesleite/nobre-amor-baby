import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronLeft,
  FiCreditCard,
  FiLoader,
  FiLock,
  FiSend,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import ShippingSelector from '../components/ShippingSelector';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { useStore } from '../context/StoreContext';
import { formatPrice, btnPrimary, btnSecondary, focusRing } from '../lib/ui';
import { saveOrderId } from '../utils/orderMessage';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhone(value) {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCpfCnpj(value) {
  const digits = digitsOnly(value).slice(0, 14);
  if (digits.length <= 11) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatCardNumber(value) {
  return digitsOnly(value)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .trim();
}

function formatExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function normalizeExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4);
  const month = digits.slice(0, 2);
  const year = digits.length === 4 ? `20${digits.slice(2)}` : '';
  return { month, year, raw: digits };
}

function isValidCpfCnpj(value) {
  const digits = digitsOnly(value);
  return digits.length === 11 || digits.length === 14;
}

function isValidCardExpiry(value) {
  const { month, year, raw } = normalizeExpiry(value);
  if (raw.length !== 4) return false;
  const monthNumber = Number(month);
  const yearNumber = Number(year);
  if (!monthNumber || monthNumber < 1 || monthNumber > 12 || !yearNumber) return false;

  const now = new Date();
  const expiry = new Date(yearNumber, monthNumber);
  return expiry > now;
}

function paymentOptionClass(selected) {
  return `rounded-3xl border p-4 text-left transition-colors ${
    selected
      ? 'border-baby-text bg-baby-text text-white shadow-soft'
      : 'border-baby-text/12 bg-surface hover:border-baby-text/30'
  }`;
}

function PaymentMark({ type, selected }) {
  if (type === 'pix') {
    return (
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${selected ? 'bg-white/16' : 'bg-emerald-100'}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7.4 3.8a2.8 2.8 0 0 1 3.96 0l.64.64a2.8 2.8 0 0 0 3.96 0l.64-.64a2.8 2.8 0 0 1 3.96 0l1.6 1.6a2.8 2.8 0 0 1 0 3.96l-.64.64a2.8 2.8 0 0 0 0 3.96l.64.64a2.8 2.8 0 0 1 0 3.96l-1.6 1.6a2.8 2.8 0 0 1-3.96 0l-.64-.64a2.8 2.8 0 0 0-3.96 0l-.64.64a2.8 2.8 0 0 1-3.96 0l-1.6-1.6a2.8 2.8 0 0 1 0-3.96l.64-.64a2.8 2.8 0 0 0 0-3.96l-.64-.64a2.8 2.8 0 0 1 0-3.96l1.6-1.6Z"
            stroke={selected ? '#FFFFFF' : '#0F766E'}
            strokeWidth="1.7"
          />
          <path
            d="m9.1 12.05 2.95-2.95 2.85 2.85-2.95 2.95-2.85-2.85Z"
            fill={selected ? '#FFFFFF' : '#0F766E'}
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${selected ? 'bg-white/16' : 'bg-slate-200'}`}>
      <svg width="24" height="18" viewBox="0 0 24 18" fill="none" aria-hidden="true">
        <rect
          x="1.25"
          y="1.25"
          width="21.5"
          height="15.5"
          rx="3.75"
          stroke={selected ? '#FFFFFF' : '#334155'}
          strokeWidth="1.5"
        />
        <path d="M2.5 6.5h19" stroke={selected ? '#FFFFFF' : '#334155'} strokeWidth="1.5" />
        <path d="M6 12.25h4" stroke={selected ? '#FFFFFF' : '#334155'} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function PaymentOption({ type, title, badge, selected, onClick }) {
  return (
    <button type="button" onClick={onClick} className={paymentOptionClass(selected)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PaymentMark type={type} selected={selected} />
          <div>
            <p className={`font-sans text-sm font-semibold ${selected ? 'text-white' : 'text-baby-text'}`}>{title}</p>
            <p className={`font-sans text-xs ${selected ? 'text-white/70' : 'text-baby-text/45'}`}>{badge}</p>
          </div>
        </div>
        <span
          className={`h-4 w-4 rounded-full border ${
            selected ? 'border-white bg-white ring-4 ring-white/15' : 'border-baby-text/20'
          }`}
          aria-hidden="true"
        />
      </div>
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-sans text-sm text-baby-text/50">{label}</span>
      <span className="font-sans text-sm text-baby-text">{value}</span>
    </div>
  );
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const { products } = useCatalog();
  const {
    cart,
    clearCart,
    shipping,
    clearShipping,
    address,
    clearAddress,
    payment,
    setPayment,
    resetPayment,
  } = useStore();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    cpfCnpj: '',
    message: '',
  });
  const [cardForm, setCardForm] = useState({
    holderName: '',
    number: '',
    expiry: '',
    ccv: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || user?.name || '',
      email: prev.email || user?.email || '',
    }));
  }, [user]);

  useEffect(() => {
    setCardForm((prev) => (prev.holderName ? prev : { ...prev, holderName: form.name || '' }));
  }, [form.name]);

  const items = useMemo(
    () => cart
      .map((cartItem) => {
        const product = products.find((current) => String(current.id) === String(cartItem.id));
        return product ? { ...cartItem, product } : null;
      })
      .filter(Boolean),
    [cart, products],
  );

  const subtotalCents = useMemo(
    () => items.reduce((sum, item) => sum + Math.round(item.product.price * 100) * item.qty, 0),
    [items],
  );
  const shippingCents = shipping.feeCents ?? 0;
  const totalCents = subtotalCents + shippingCents;

  const shippingValid = Boolean(
    shipping.feeCents != null &&
    !shipping.isLoading &&
    !shipping.error &&
    address.number.trim(),
  );

  const formValid =
    form.name.trim().length >= 2 &&
    digitsOnly(form.phone).length >= 10 &&
    form.email.trim().includes('@') &&
    isValidCpfCnpj(form.cpfCnpj);

  const cardValid =
    cardForm.holderName.trim().length >= 3 &&
    digitsOnly(cardForm.number).length >= 13 &&
    digitsOnly(cardForm.number).length <= 19 &&
    isValidCardExpiry(cardForm.expiry) &&
    digitsOnly(cardForm.ccv).length >= 3 &&
    digitsOnly(cardForm.ccv).length <= 4;

  const canSubmit =
    items.length > 0 &&
    shippingValid &&
    formValid &&
    ['pix', 'cartao'].includes(payment.method) &&
    (payment.method === 'pix' || cardValid);

  const handleField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handlePhoneChange = (event) => {
    setForm((prev) => ({ ...prev, phone: formatPhone(event.target.value) }));
  };

  const handleCpfCnpjChange = (event) => {
    setForm((prev) => ({ ...prev, cpfCnpj: formatCpfCnpj(event.target.value) }));
  };

  const handleCardField = (field) => (event) => {
    setCardForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleCardNumberChange = (event) => {
    setCardForm((prev) => ({ ...prev, number: formatCardNumber(event.target.value) }));
  };

  const handleCardExpiryChange = (event) => {
    setCardForm((prev) => ({ ...prev, expiry: formatExpiry(event.target.value) }));
  };

  const handleCardCvvChange = (event) => {
    setCardForm((prev) => ({ ...prev, ccv: digitsOnly(event.target.value).slice(0, 4) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || submitting) {
      toast.error('Preencha os dados do cliente, endereço e pagamento para continuar.', { style: toastStyle });
      return;
    }

    const expiry = normalizeExpiry(cardForm.expiry);

    setSubmitting(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          customer: {
            name: form.name.trim(),
            phone: digitsOnly(form.phone),
            email: form.email.trim(),
            cpfCnpj: digitsOnly(form.cpfCnpj),
            message: form.message.trim(),
          },
          address,
          shipping: {
            feeCents: shipping.feeCents,
            etaText: shipping.etaText,
            provider: shipping.source,
          },
          payment: {
            method: payment.method,
            ...(payment.method === 'cartao'
              ? {
                  card: {
                    holderName: cardForm.holderName.trim(),
                    number: digitsOnly(cardForm.number),
                    expiryMonth: expiry.month,
                    expiryYear: expiry.year,
                    ccv: digitsOnly(cardForm.ccv),
                  },
                }
              : {}),
          },
          items: items.map((item) => ({
            productId: item.id,
            productName: item.product.name,
            size: item.size,
            qty: item.qty,
            unitPriceCents: Math.round(item.product.price * 100),
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Não foi possível criar seu pedido.');
      }

      saveOrderId(data.orderCode);

      clearCart();
      clearShipping();
      clearAddress();
      resetPayment();
      setCardForm({ holderName: '', number: '', expiry: '', ccv: '' });

      if (data.warning) {
        toast('Pedido criado, mas a cobranca precisara ser refeita.', {
          icon: '⚠️',
          style: toastStyle,
          duration: 4000,
        });
      }

      navigate(`/pedido-enviado?orderCode=${encodeURIComponent(data.orderCode)}`, {
        state: {
          orderCode: data.orderCode,
          payment: data.payment,
          warning: data.warning || null,
        },
      });
    } catch (err) {
      console.error('[CheckoutPage] submit error:', err);
      toast.error(err.message || 'Falha ao criar pedido.', { style: toastStyle });
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <FiAlertTriangle size={36} className="mx-auto text-amber-500 mb-4" />
          <h1 className="font-serif text-2xl text-baby-text mb-3">Seu carrinho esta vazio</h1>
          <p className="font-sans text-baby-text/60 mb-8">
            Adicione produtos antes de seguir para o checkout.
          </p>
          <Link to="/carrinho" className={btnPrimary}>Voltar ao carrinho</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegacao de caminho">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Inicio</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/carrinho" className="hover:text-baby-accent transition-colors">Carrinho</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Checkout</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="bg-surface rounded-3xl shadow-soft p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-full bg-baby-pink/40 flex items-center justify-center">
                  <FiCheckCircle className="text-baby-accent" size={20} />
                </div>
                <div>
                  <h1 className="font-serif text-2xl text-baby-text">Finalizar pedido</h1>
                  <p className="font-sans text-sm text-baby-text/50">
                    Dados do cliente e entrega.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">Nome *</span>
                    <input
                      type="text"
                      value={form.name}
                      onChange={handleField('name')}
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-4 py-3 font-sans text-sm ${focusRing}`}
                      placeholder="Seu nome"
                    />
                  </label>
                  <label className="block">
                    <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">Telefone *</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={handlePhoneChange}
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-4 py-3 font-sans text-sm ${focusRing}`}
                      placeholder="(00) 00000-0000"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">E-mail *</span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={handleField('email')}
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-4 py-3 font-sans text-sm ${focusRing}`}
                      placeholder="voce@email.com"
                    />
                  </label>
                  <label className="block">
                    <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">CPF ou CNPJ *</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.cpfCnpj}
                      onChange={handleCpfCnpjChange}
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-4 py-3 font-sans text-sm ${focusRing}`}
                      placeholder="000.000.000-00"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">Observacoes</span>
                  <textarea
                    rows={3}
                    value={form.message}
                    onChange={handleField('message')}
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-4 py-3 font-sans text-sm resize-y ${focusRing}`}
                    placeholder="Referencia para entrega, presente, instrucoes especiais..."
                  />
                </label>
              </div>
            </section>

            <section className="bg-surface rounded-3xl shadow-soft p-6 sm:p-8">
              <ShippingSelector />
            </section>

            <section className="bg-surface rounded-3xl shadow-soft p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-full bg-baby-pink/40 flex items-center justify-center">
                  <FiCreditCard className="text-baby-accent" size={20} />
                </div>
                <div>
                  <h2 className="font-serif text-xl text-baby-text">Pagamento</h2>
                  <p className="font-sans text-sm text-baby-text/50">
                    Escolha como deseja pagar.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PaymentOption
                  type="pix"
                  title="Pix"
                  badge="Instantaneo"
                  selected={payment.method === 'pix'}
                  onClick={() => setPayment({ method: 'pix' })}
                />
                <PaymentOption
                  type="cartao"
                  title="Cartao"
                  badge="1x no cartao"
                  selected={payment.method === 'cartao'}
                  onClick={() => setPayment({ method: 'cartao' })}
                />
              </div>

              {payment.method === 'cartao' && (
                <div className="mt-5 rounded-3xl border border-baby-text/10 bg-baby-cream/90 p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block sm:col-span-2">
                      <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">Nome no cartao *</span>
                      <input
                        type="text"
                        value={cardForm.holderName}
                        onChange={handleCardField('holderName')}
                        className={`w-full rounded-xl border border-baby-text/15 bg-white px-4 py-3 font-sans text-sm ${focusRing}`}
                        placeholder="Como esta no cartao"
                      />
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">Numero do cartao *</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={cardForm.number}
                        onChange={handleCardNumberChange}
                        className={`w-full rounded-xl border border-baby-text/15 bg-white px-4 py-3 font-sans text-sm ${focusRing}`}
                        placeholder="0000 0000 0000 0000"
                      />
                    </label>

                    <label className="block">
                      <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">Validade *</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={cardForm.expiry}
                        onChange={handleCardExpiryChange}
                        className={`w-full rounded-xl border border-baby-text/15 bg-white px-4 py-3 font-sans text-sm ${focusRing}`}
                        placeholder="MM/AA"
                      />
                    </label>

                    <label className="block">
                      <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">CVV *</span>
                      <input
                        type="password"
                        inputMode="numeric"
                        value={cardForm.ccv}
                        onChange={handleCardCvvChange}
                        className={`w-full rounded-xl border border-baby-text/15 bg-white px-4 py-3 font-sans text-sm ${focusRing}`}
                        placeholder="000"
                      />
                    </label>
                  </div>

                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-baby-text/55">
                    <FiLock size={12} />
                    Cartao em 1x
                  </div>
                </div>
              )}
            </section>

            <div className="flex flex-wrap gap-3">
              <Link to="/carrinho" className={btnSecondary}>
                <FiChevronLeft size={16} />
                Voltar ao carrinho
              </Link>
              <button type="submit" disabled={!canSubmit || submitting} className={`${btnPrimary} disabled:opacity-50`}>
                {submitting ? <FiLoader size={18} className="animate-spin" /> : <FiSend size={18} />}
                {submitting ? 'Criando pedido...' : 'Criar pedido'}
              </button>
            </div>
          </form>

          <aside className="space-y-6">
            <section className="bg-surface rounded-3xl shadow-soft p-6">
              <h2 className="font-serif text-xl text-baby-text mb-5">Resumo</h2>

              <div className="space-y-3">
                {items.map((item) => (
                  <div key={`${item.id}-${item.size}`} className="flex gap-3">
                    <img
                      src={item.product.images?.[0]}
                      alt=""
                      className="w-16 h-16 rounded-2xl object-cover bg-baby-pink/20"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-sans text-sm font-medium text-baby-text truncate">{item.product.name}</p>
                      <p className="font-sans text-xs text-baby-text/45 mt-0.5">
                        Tam. {item.size || 'Unico'} · {item.qty}x
                      </p>
                      <p className="font-sans text-sm text-baby-text mt-1">
                        {formatPrice(item.product.price * item.qty)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-2 border-t border-baby-pink/40 pt-4">
                <Row label="Subtotal" value={formatPrice(subtotalCents / 100)} />
                <Row
                  label="Frete"
                  value={shipping.feeCents != null ? formatPrice(shippingCents / 100) : 'Calcular endereco'}
                />
                <Row label="Pagamento" value={payment.method === 'cartao' ? 'Cartao' : 'Pix'} />
                <div className="flex items-center justify-between pt-2 border-t border-baby-pink/40">
                  <span className="font-sans text-sm font-semibold text-baby-text">Total</span>
                  <span className="font-sans text-lg font-bold text-baby-text">
                    {formatPrice(totalCents / 100)}
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </motion.div>
      </div>
    </section>
  );
}
