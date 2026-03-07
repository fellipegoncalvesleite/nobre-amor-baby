/**
 * AdminOrderDetailPage — single order detail view.
 *
 * Route: /admin/pedidos/:orderCode  (ProtectedRoute role="manager")
 *
 * MVP: uses VITE_ADMIN_API_KEY in the header.
 * TODO: replace with real session-based auth before going public.
 */
import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiPackage, FiRefreshCw, FiMapPin, FiTruck, FiCreditCard, FiUser,
  FiAlertTriangle, FiArrowLeft,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { formatPrice, focusRing, btnSecondary } from '../lib/ui';

const STATUS_LABELS = {
  new: 'Novo',
  confirmed: 'Confirmado',
  rejected: 'Rejeitado',
  packing: 'Embalando',
  shipped: 'Enviado',
  done: 'Concluído',
};

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  packing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  done: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300',
};

const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY || '';

export default function AdminOrderDetailPage() {
  const { orderCode } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderCode}`, {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao buscar pedido');
      setOrder(data.order);
    } catch (err) {
      console.error('[AdminOrderDetailPage]', err);
      setError(err.message);
      toast.error('Falha ao carregar pedido', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  /* ── Loading / Error states ─────────────────────── */
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

  if (error || !order) {
    return (
      <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center py-20">
          <FiAlertTriangle size={28} className="mx-auto text-red-500 mb-3" />
          <p className="font-sans text-baby-text mb-4">{error || 'Pedido não encontrado'}</p>
          <Link to="/admin/pedidos" className={btnSecondary}>Voltar aos pedidos</Link>
        </div>
      </section>
    );
  }

  /* ── Render order ───────────────────────────────── */
  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li>
              <Link to="/" className="hover:text-baby-accent transition-colors">Início</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/admin/pedidos" className="hover:text-baby-accent transition-colors">Pedidos</Link>
            </li>
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
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || STATUS_COLORS.new}`}>
                    {STATUS_LABELS[order.status] || order.status}
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

          <div className="space-y-6">
            {/* ── Customer ───────────────────────────── */}
            <Card icon={FiUser} title="Cliente">
              <InfoRow label="Nome" value={order.customer_name} />
              <InfoRow label="Telefone" value={order.customer_phone} />
              <InfoRow label="E-mail" value={order.customer_email} />
              {order.customer_message && (
                <InfoRow label="Mensagem" value={order.customer_message} />
              )}
            </Card>

            {/* ── Address ────────────────────────────── */}
            <Card icon={FiMapPin} title="Endereço">
              <InfoRow label="CEP" value={order.address_cep} />
              <InfoRow
                label="Logradouro"
                value={[order.address_street, order.address_number, order.address_complement].filter(Boolean).join(', ')}
              />
              <InfoRow label="Bairro" value={order.address_neighborhood} />
              <InfoRow label="Cidade" value={`${order.address_city || ''}${order.address_uf ? ` / ${order.address_uf}` : ''}`} />
            </Card>

            {/* ── Shipping ───────────────────────────── */}
            <Card icon={FiTruck} title="Frete">
              <InfoRow label="Transportadora" value={order.shipping_provider} />
              <InfoRow label="Prazo" value={order.shipping_eta_text} />
              <InfoRow label="Frete" value={formatPrice((order.shipping_fee_cents || 0) / 100)} />
            </Card>

            {/* ── Payment ────────────────────────────── */}
            <Card icon={FiCreditCard} title="Pagamento">
              <InfoRow label="Método" value={order.payment_method?.toUpperCase()} />
              <InfoRow label="Referência" value={order.payment_ref} />
              <InfoRow label="Subtotal" value={formatPrice((order.subtotal_cents || 0) / 100)} />
              <InfoRow label="Frete" value={formatPrice((order.shipping_fee_cents || 0) / 100)} />
              <div className="flex justify-between pt-2 border-t border-baby-pink/40">
                <span className="font-sans text-sm font-semibold text-baby-text">Total</span>
                <span className="font-sans text-sm font-bold text-baby-accent">
                  {formatPrice((order.total_cents || 0) / 100)}
                </span>
              </div>
            </Card>

            {/* ── Items ──────────────────────────────── */}
            <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
              <div className="px-5 py-4 border-b border-baby-pink flex items-center gap-2">
                <FiPackage className="text-baby-accent" size={16} />
                <h2 className="font-serif text-lg text-baby-text">
                  Itens ({order.items?.length || 0})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-baby-pink/50">
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-2">
                        Produto
                      </th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-2 text-center">
                        Tam
                      </th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-2 text-center">
                        Qtd
                      </th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-2 text-right">
                        Unit.
                      </th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-2 text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-baby-pink/30">
                    {(order.items || []).map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-baby-pink/5">
                        <td className="px-4 py-2.5 font-sans text-sm text-baby-text">
                          {item.product_name}
                        </td>
                        <td className="px-4 py-2.5 font-sans text-xs text-baby-text/60 text-center">
                          {item.size || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-sans text-sm text-baby-text text-center">
                          {item.qty}
                        </td>
                        <td className="px-4 py-2.5 font-sans text-sm text-baby-text/70 text-right">
                          {formatPrice(item.unit_price_cents / 100)}
                        </td>
                        <td className="px-4 py-2.5 font-sans text-sm text-baby-text font-medium text-right">
                          {formatPrice(item.line_total_cents / 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(!order.items || order.items.length === 0) && (
                <p className="font-sans text-sm text-baby-text/40 text-center py-6">
                  Nenhum item registrado.
                </p>
              )}
            </div>

            {/* ── Manager notes ──────────────────────── */}
            {order.manager_notes && (
              <Card icon={FiPackage} title="Notas do Gerente">
                <p className="font-sans text-sm text-baby-text whitespace-pre-wrap">
                  {order.manager_notes}
                </p>
              </Card>
            )}
          </div>

          {/* Back links */}
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/admin/pedidos" className={btnSecondary}>
              <FiArrowLeft size={14} className="inline -mt-0.5 mr-1" />
              Voltar aos pedidos
            </Link>
            <Link to="/admin" className={btnSecondary}>
              Painel do Gerente
            </Link>
          </div>
        </motion.div>
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
