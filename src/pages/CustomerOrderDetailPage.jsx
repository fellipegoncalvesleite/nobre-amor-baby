/**
 * CustomerOrderDetailPage — public order detail for customers.
 *
 * Route: /meus-pedidos/:orderCode
 * Fetches from GET /api/public?resource=order&orderCode=xxx
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPackage, FiRefreshCw, FiMapPin, FiTruck, FiCreditCard,
  FiAlertTriangle, FiArrowLeft, FiCheck, FiX, FiClock, FiSlash,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { formatPrice, focusRing, btnSecondary } from '../lib/ui';

const STATUS_MAP = {
  new: { label: 'Pendente', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: FiClock },
  confirmed: { label: 'Confirmado', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: FiCheck },
  rejected: { label: 'Recusado', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: FiX },
  cancelled: { label: 'Cancelado', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: FiSlash },
  packing: { label: 'Embalando', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', icon: FiPackage },
  shipped: { label: 'Enviado', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: FiTruck },
  done: { label: 'Concluído', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300', icon: FiCheck },
};

export default function CustomerOrderDetailPage() {
  const { orderCode } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public?resource=order&orderCode=${encodeURIComponent(orderCode)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Pedido não encontrado');
      setOrder(data.order);
    } catch (err) {
      console.error('[CustomerOrderDetail]', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orderCode]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  /* ── Cancel order ──────────────────────────────── */
  const handleCancel = async () => {
    if (!cancelReason.trim() || cancelReason.trim().length < 3) {
      toast.error('Informe o motivo do cancelamento.', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
      });
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch('/api/public?resource=cancel-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderCode, reason: cancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Erro ao cancelar pedido.');
      }
      toast.success('Pedido cancelado com sucesso.', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
      });
      setCancelModalOpen(false);
      setCancelReason('');
      fetchOrder(); // refresh
    } catch (err) {
      console.error('[CustomerOrderDetail] cancel error:', err);
      toast.error(err.message, {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
      });
    } finally {
      setCancelling(false);
    }
  };

  /* ── Loading ────────────────────────────────────── */
  if (loading) {
    return (
      <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center py-20">
          <FiRefreshCw size={28} className="mx-auto animate-spin text-baby-accent mb-3" />
          <p className="font-sans text-baby-text/50">Carregando pedido…</p>
        </div>
      </section>
    );
  }

  /* ── Error ──────────────────────────────────────── */
  if (error || !order) {
    return (
      <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center py-20">
          <FiAlertTriangle size={28} className="mx-auto text-red-500 mb-3" />
          <p className="font-sans text-baby-text mb-4">{error || 'Pedido não encontrado'}</p>
          <Link to="/meus-pedidos" className={btnSecondary}>
            <FiArrowLeft size={14} className="inline -mt-0.5 mr-1" />
            Voltar aos meus pedidos
          </Link>
        </div>
      </section>
    );
  }

  const st = STATUS_MAP[order.status] || STATUS_MAP.new;
  const StatusIcon = st.icon;

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/meus-pedidos" className="hover:text-baby-accent transition-colors">Meus Pedidos</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">{order.order_code}</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
                <FiPackage className="text-baby-accent" size={22} />
              </div>
              <div>
                <h1 className="font-serif text-xl sm:text-2xl text-baby-text">
                  {order.order_code}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                    <StatusIcon size={12} />
                    {st.label}
                  </span>
                  <span className="font-sans text-xs text-baby-text/50">
                    {formatDate(order.created_at)}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchOrder}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-sans text-sm
                         border border-baby-text/15 text-baby-text/60 hover:text-baby-accent
                         hover:border-baby-accent transition-colors ${focusRing}`}
            >
              <FiRefreshCw size={14} />
              Atualizar
            </button>
          </div>

          {/* Status banner */}
          {order.status === 'rejected' && order.rejected_reason && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
              <p className="font-sans text-xs font-medium text-red-600 dark:text-red-400 mb-1">Motivo da recusa:</p>
              <p className="font-sans text-sm text-red-700 dark:text-red-300">{order.rejected_reason}</p>
            </div>
          )}

          {order.status === 'cancelled' && order.cancel_reason && (
            <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
              <p className="font-sans text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">Pedido cancelado pelo cliente:</p>
              <p className="font-sans text-sm text-orange-700 dark:text-orange-300">{order.cancel_reason}</p>
              {order.cancelled_at && (
                <p className="font-sans text-xs text-orange-500 mt-1">Em {formatDate(order.cancelled_at)}</p>
              )}
            </div>
          )}

          <div className="space-y-6">
            {/* ── Shipping ──────────────────────────── */}
            <Card icon={FiTruck} title="Entrega">
              <InfoRow label="Prazo" value={order.shipping_eta_text} />
              <InfoRow label="Frete" value={formatPrice((order.shipping_fee_cents || 0) / 100)} />
              {order.address_city && (
                <InfoRow
                  label="Destino"
                  value={`${order.address_city}${order.address_uf ? ` / ${order.address_uf}` : ''}`}
                />
              )}
            </Card>

            {/* ── Address ───────────────────────────── */}
            <Card icon={FiMapPin} title="Endereço">
              <InfoRow label="CEP" value={order.address_cep} />
              <InfoRow
                label="Logradouro"
                value={[order.address_street, order.address_number, order.address_complement].filter(Boolean).join(', ')}
              />
              <InfoRow label="Bairro" value={order.address_neighborhood} />
            </Card>

            {/* ── Payment ───────────────────────────── */}
            <Card icon={FiCreditCard} title="Pagamento">
              <InfoRow label="Método" value={order.payment_method === 'cartao' ? 'Cartão' : order.payment_method === 'pix' ? 'Pix' : order.payment_method} />
              <InfoRow label="Subtotal" value={formatPrice((order.subtotal_cents || 0) / 100)} />
              <InfoRow label="Frete" value={formatPrice((order.shipping_fee_cents || 0) / 100)} />
              <div className="flex justify-between pt-2 border-t border-baby-pink/40">
                <span className="font-sans text-sm font-semibold text-baby-text">Total</span>
                <span className="font-sans text-sm font-bold text-baby-accent">
                  {formatPrice((order.total_cents || 0) / 100)}
                </span>
              </div>
            </Card>

            {/* ── Items ─────────────────────────────── */}
            <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
              <div className="px-5 py-4 border-b border-baby-pink flex items-center gap-2">
                <FiPackage className="text-baby-accent" size={16} />
                <h2 className="font-serif text-lg text-baby-text">
                  Itens ({order.items?.length || 0})
                </h2>
              </div>
              {(order.items || []).length > 0 ? (
                <ul className="divide-y divide-baby-pink/30">
                  {order.items.map((item, i) => (
                    <li key={item.id || i} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-sans text-sm text-baby-text font-medium truncate">{item.product_name}</p>
                        <p className="font-sans text-xs text-baby-text/50">
                          {item.size ? `Tam. ${item.size} · ` : ''}{item.qty}x {formatPrice(item.unit_price_cents / 100)}
                        </p>
                      </div>
                      <span className="font-sans text-sm font-medium text-baby-accent whitespace-nowrap">
                        {formatPrice(item.line_total_cents / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-sans text-sm text-baby-text/40 text-center py-6">
                  Nenhum item registrado.
                </p>
              )}
            </div>
          </div>

          {/* Cancel button — only for pending orders */}
          {order.status === 'new' && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-sans text-sm font-medium
                           transition-colors bg-orange-100 text-orange-700 hover:bg-orange-200
                           dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 ${focusRing}`}
              >
                <FiSlash size={15} />
                Cancelar Pedido
              </button>
            </div>
          )}

          {/* Back */}
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/meus-pedidos" className={btnSecondary}>
              <FiArrowLeft size={14} className="inline -mt-0.5 mr-1" />
              Meus Pedidos
            </Link>
            <Link to="/" className={btnSecondary}>
              Voltar ao início
            </Link>
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════════
            CANCEL MODAL
            ══════════════════════════════════════════════ */}
        <AnimatePresence>
          {cancelModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
              onClick={() => setCancelModalOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6"
              >
                <h3 className="font-serif text-lg text-baby-text mb-1">Cancelar pedido</h3>
                <p className="font-sans text-sm text-baby-text/60 mb-4">
                  Informe o motivo do cancelamento do pedido <strong>{order.order_code}</strong>.
                </p>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Ex: comprei errado, mudei de ideia, encontrei outro produto…"
                  className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream p-3
                             font-sans text-sm text-baby-text placeholder-baby-text/40
                             focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent
                             resize-y ${focusRing}`}
                />
                <div className="flex gap-2 justify-end mt-4">
                  <button
                    type="button"
                    onClick={() => setCancelModalOpen(false)}
                    className={`px-4 py-2 rounded-full font-sans text-sm border border-baby-text/15
                               text-baby-text/60 hover:text-baby-accent hover:border-baby-accent
                               transition-colors ${focusRing}`}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={cancelling || cancelReason.trim().length < 3}
                    onClick={handleCancel}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm font-medium
                               transition-colors disabled:opacity-40
                               bg-orange-600 text-white hover:bg-orange-700 ${focusRing}`}
                  >
                    <FiSlash size={14} />
                    {cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ── Reusable sub-components ──────────────────────── */

// eslint-disable-next-line no-unused-vars
function Card({ icon: Icon, title, children }) {
  return (
    <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-baby-pink flex items-center gap-2">
        <Icon className="text-baby-accent" size={16} />
        <h2 className="font-serif text-lg text-baby-text">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="font-sans text-sm text-baby-text/50 shrink-0">{label}</span>
      <span className="font-sans text-sm text-baby-text text-right">{value || '—'}</span>
    </div>
  );
}
