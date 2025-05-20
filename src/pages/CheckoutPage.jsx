import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronLeft,
  FiClock,
  FiCreditCard,
  FiLoader,
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

function paymentOptionClass(selected) {
  return `rounded-2xl border p-4 text-left transition-colors ${
    selected
      ? 'border-baby-accent bg-baby-accent/8'
      : 'border-baby-text/15 bg-surface hover:border-baby-accent/40'
  }`;
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
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || user?.name || '',
      email: prev.email || user?.email || '',
    }));
  }, [user]);

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
    form.phone.trim().length >= 8 &&
    form.email.trim().includes('@');

  const canSubmit = items.length > 0 && shippingValid && formValid && ['pix', 'cartao'].includes(payment.method);

  const handleField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || submitting) {
      toast.error('Preencha seus dados, confirme o endereço e escolha um pagamento.', { style: toastStyle });
      return;
    }

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
            phone: form.phone.trim(),
            email: form.email.trim(),
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

      if (data.warning) {
        toast('Pedido criado, mas a cobrança precisará ser refeita.', {
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
          <h1 className="font-serif text-2xl text-baby-text mb-3">Seu carrinho está vazio</h1>
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
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
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
                    Seus dados, entrega e forma de pagamento.
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
                      value={form.phone}
                      onChange={handleField('phone')}
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-4 py-3 font-sans text-sm ${focusRing}`}
                      placeholder="(00) 00000-0000"
                    />
                  </label>
                </div>

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
                  <span className="block font-sans text-xs font-medium text-baby-text/60 mb-1.5">Observações</span>
                  <textarea
                    rows={3}
                    value={form.message}
                    onChange={handleField('message')}
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-4 py-3 font-sans text-sm resize-y ${focusRing}`}
                    placeholder="Referência para entrega, presente, instruções especiais..."
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
                    Escolha como deseja concluir o pagamento.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setPayment({ method: 'pix' })}
                  className={paymentOptionClass(payment.method === 'pix')}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-4 w-4 rounded-full border ${payment.method === 'pix' ? 'border-baby-accent bg-baby-accent ring-4 ring-baby-accent/15' : 'border-baby-text/25'}`} />
                    <div>
                      <p className="font-sans text-sm font-semibold text-baby-text">Pix</p>
                      <p className="font-sans text-xs text-baby-text/55 mt-1 leading-relaxed">
                        O QR Code e o código copia e cola aparecem dentro do site logo após criar o pedido.
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPayment({ method: 'cartao' })}
                  className={paymentOptionClass(payment.method === 'cartao')}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-4 w-4 rounded-full border ${payment.method === 'cartao' ? 'border-baby-accent bg-baby-accent ring-4 ring-baby-accent/15' : 'border-baby-text/25'}`} />
                    <div>
                      <p className="font-sans text-sm font-semibold text-baby-text">Cartão</p>
                      <p className="font-sans text-xs text-baby-text/55 mt-1 leading-relaxed">
                        Você será direcionado para a página hospedada do Asaas para concluir o pagamento com segurança.
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-baby-pink/60 bg-baby-pink/12 p-4">
                <div className="flex items-start gap-3">
                  <FiClock className="text-baby-accent mt-0.5 shrink-0" size={16} />
                  <p className="font-sans text-sm text-baby-text/65 leading-relaxed">
                    O pedido será criado com status de separação independente do pagamento. O estoque só é baixado quando a gerente confirma o pedido no painel.
                  </p>
                </div>
              </div>
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
                        Tam. {item.size || 'Único'} · {item.qty}x
                      </p>
                      <p className="font-sans text-sm text-baby-accent mt-1">
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
                  value={shipping.feeCents != null ? formatPrice(shippingCents / 100) : 'Calcular endereço'}
                />
                <div className="flex items-center justify-between pt-2 border-t border-baby-pink/40">
                  <span className="font-sans text-sm font-semibold text-baby-text">Total</span>
                  <span className="font-sans text-lg font-bold text-baby-accent">
                    {formatPrice(totalCents / 100)}
                  </span>
                </div>
              </div>
            </section>

            <section className="bg-surface rounded-3xl shadow-soft p-6">
              <h3 className="font-serif text-lg text-baby-text mb-3">Depois do envio</h3>
              <ul className="space-y-3 font-sans text-sm text-baby-text/60">
                <li>Você verá o QR Code Pix ou o link do cartão na próxima tela.</li>
                <li>Os pedidos ficam disponíveis em “Meus Pedidos” e também em “Minha Conta”.</li>
                <li>Se a cobrança expirar ou falhar, você poderá gerar uma nova sem criar outro pedido.</li>
              </ul>
            </section>
          </aside>
        </motion.div>
      </div>
    </section>
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
