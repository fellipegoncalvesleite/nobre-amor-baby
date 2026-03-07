/**
 * MeusPedidosPage — customer order tracking page.
 *
 * Route: /meus-pedidos
 * If logged in: fetches orders from /api/public?resource=my-orders (by user_id/email).
 * If not logged in: reads order codes from localStorage as fallback.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiList, FiRefreshCw, FiChevronRight, FiPackage, FiAlertTriangle, FiLogIn } from 'react-icons/fi';
import { formatPrice, focusRing, btnPrimary, btnSecondary } from '../lib/ui';
import { getMyOrderCodes } from '../utils/orderMessage';
import { useAuth } from '../context/AuthContext';

const STATUS_MAP = {
  new: { label: 'Pendente', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  confirmed: { label: 'Confirmado', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  rejected: { label: 'Recusado', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled: { label: 'Cancelado', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  packing: { label: 'Embalando', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  shipped: { label: 'Enviado', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  done: { label: 'Concluído', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300' },
};

export default function MeusPedidosPage() {
  const { isAuthed, accessToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMyOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isAuthed && accessToken) {
        // Fetch from authenticated endpoint
        const res = await fetch('/api/public?resource=my-orders', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error('Erro ao buscar pedidos.');
        const data = await res.json();
        setOrders(data.orders || []);
      } else {
        // Fallback: localStorage order codes
        const codes = getMyOrderCodes();
        if (codes.length === 0) {
          setOrders([]);
          setLoading(false);
          return;
        }

        const results = await Promise.allSettled(
          codes.map(async (code) => {
            const res = await fetch(`/api/public?resource=order&orderCode=${encodeURIComponent(code)}`);
            if (!res.ok) return null;
            const data = await res.json();
            return data.order || null;
          }),
        );
        const fetched = results
          .filter((r) => r.status === 'fulfilled' && r.value)
          .map((r) => r.value);
        setOrders(fetched);
      }
    } catch (err) {
      console.error('[MeusPedidosPage]', err);
      setError('Falha ao carregar pedidos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [isAuthed, accessToken]);

  useEffect(() => {
    fetchMyOrders();
  }, [fetchMyOrders]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
      + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const codes = getMyOrderCodes();
  const hasSource = isAuthed || codes.length > 0;

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Meus Pedidos</li>
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
                <FiList className="text-baby-accent" size={22} />
              </div>
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">Meus Pedidos</h1>
                <p className="font-sans text-sm text-baby-text/50">
                  {orders.length} pedido{orders.length !== 1 ? 's' : ''} encontrado{orders.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchMyOrders}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-sans text-sm
                         border border-baby-text/15 text-baby-text/60 hover:text-baby-accent
                         hover:border-baby-accent transition-colors disabled:opacity-40 ${focusRing}`}
            >
              <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>

          {/* Login CTA when not authed */}
          {!isAuthed && (
            <div className="mb-6 p-4 rounded-xl bg-baby-pink/20 border border-baby-pink/40">
              <div className="flex items-center gap-3">
                <FiLogIn size={18} className="text-baby-accent shrink-0" />
                <div>
                  <p className="font-sans text-sm text-baby-text">
                    <Link to="/entrar" state={{ from: '/meus-pedidos' }} className="text-baby-accent font-medium hover:underline">
                      Faça login
                    </Link>{' '}
                    para ver seus pedidos em qualquer dispositivo.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 flex items-center gap-3 font-sans text-sm text-red-700 dark:text-red-300">
              <FiAlertTriangle size={18} />
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && !hasSource && (
            <div className="text-center py-16">
              <FiPackage size={40} className="mx-auto text-baby-text/20 mb-4" />
              <p className="font-sans text-baby-text/50 mb-6">
                Você ainda não fez nenhum pedido.
              </p>
              <Link to="/" className={btnPrimary}>Explorar Produtos</Link>
            </div>
          )}

          {/* Loading */}
          {loading && hasSource && (
            <div className="text-center py-16">
              <FiRefreshCw size={24} className="mx-auto animate-spin text-baby-accent mb-2" />
              <p className="font-sans text-sm text-baby-text/50">Carregando pedidos…</p>
            </div>
          )}

          {/* Orders list */}
          {!loading && orders.length > 0 && (
            <div className="space-y-3">
              {orders.map((o) => {
                const st = STATUS_MAP[o.status] || STATUS_MAP.new;
                return (
                  <Link
                    key={o.order_code}
                    to={`/meus-pedidos/${o.order_code}`}
                    className="block bg-surface rounded-2xl shadow-soft p-4 hover:shadow-md transition-shadow group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-sm font-bold text-baby-text">{o.order_code}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 font-sans text-xs text-baby-text/50">
                          <span>{formatDate(o.created_at)}</span>
                          {o.total_cents != null && (
                            <span className="font-medium text-baby-accent">{formatPrice(o.total_cents / 100)}</span>
                          )}
                          {o.items_count != null && (
                            <span>{o.items_count} ite{o.items_count !== 1 ? 'ns' : 'm'}</span>
                          )}
                        </div>
                      </div>
                      <FiChevronRight size={18} className="text-baby-text/30 group-hover:text-baby-accent transition-colors shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* No results but had source */}
          {!loading && hasSource && orders.length === 0 && !error && (
            <div className="text-center py-16">
              <FiPackage size={40} className="mx-auto text-baby-text/20 mb-4" />
              <p className="font-sans text-baby-text/50 mb-2">
                Não foi possível encontrar seus pedidos no servidor.
              </p>
              <p className="font-sans text-xs text-baby-text/40">
                Isso pode acontecer se os pedidos foram feitos em outro ambiente.
              </p>
            </div>
          )}

          {/* Back */}
          <div className="mt-8 text-center">
            <Link to="/" className={btnSecondary}>Voltar ao início</Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
