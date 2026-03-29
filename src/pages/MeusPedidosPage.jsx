import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiChevronRight, FiList, FiLogIn, FiPackage, FiRefreshCw } from 'react-icons/fi';
import { btnPrimary, btnSecondary, focusRing, formatPrice } from '../lib/ui';
import { getMyOrderCodes } from '../utils/orderMessage';
import { useAuth } from '../context/AuthContext';
import { getFulfillmentStatus, getPaymentStatus } from '../lib/orderStatus';

export default function MeusPedidosPage() {
  const { isAuthed, accessToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMyOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isAuthed && accessToken) {
        const response = await fetch('/api/public?resource=my-orders', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Erro ao buscar pedidos.');
        setOrders(data.orders || []);
      } else {
        const codes = getMyOrderCodes();
        if (codes.length === 0) {
          setOrders([]);
          return;
        }

        const results = await Promise.allSettled(
          codes.map(async (code) => {
            const response = await fetch(`/api/public?resource=order&orderCode=${encodeURIComponent(code)}`);
            if (!response.ok) return null;
            const data = await response.json();
            return data.order || null;
          }),
        );

        const loadedOrders = results
          .filter((result) => result.status === 'fulfilled' && result.value)
          .map((result) => result.value);

        setOrders(loadedOrders);
      }
    } catch (err) {
      console.error('[MeusPedidosPage] fetch error:', err);
      setError(err.message || 'Falha ao carregar pedidos.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAuthed]);

  useEffect(() => {
    fetchMyOrders();
  }, [fetchMyOrders]);

  const trackedCodes = useMemo(() => getMyOrderCodes(), []);
  const hasSource = isAuthed || trackedCodes.length > 0;

  const formatDate = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Meus Pedidos</li>
          </ol>
        </nav>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
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
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-baby-text/15 font-sans text-sm text-baby-text/60 hover:text-baby-accent hover:border-baby-accent transition-colors disabled:opacity-50 ${focusRing}`}
            >
              <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>

          {!isAuthed && (
            <div className="mb-6 rounded-2xl border border-baby-pink/50 bg-baby-pink/15 p-4">
              <div className="flex items-center gap-3">
                <FiLogIn size={18} className="text-baby-accent shrink-0" />
                <p className="font-sans text-sm text-baby-text">
                  <Link to="/entrar" state={{ from: '/meus-pedidos' }} className="font-medium text-baby-accent hover:underline">
                    Faça login
                  </Link>{' '}
                  para acompanhar seus pedidos em qualquer dispositivo.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 font-sans text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !hasSource && (
            <div className="text-center py-16">
              <FiPackage size={40} className="mx-auto text-baby-text/20 mb-4" />
              <p className="font-sans text-baby-text/50 mb-6">Você ainda não fez nenhum pedido.</p>
              <Link to="/" className={btnPrimary}>Explorar produtos</Link>
            </div>
          )}

          {loading && hasSource && (
            <div className="text-center py-16">
              <FiRefreshCw size={24} className="mx-auto animate-spin text-baby-accent mb-2" />
              <p className="font-sans text-sm text-baby-text/50">Carregando pedidos...</p>
            </div>
          )}

          {!loading && orders.length > 0 && (
            <div className="space-y-3">
              {orders.map((order) => {
                const fulfillment = getFulfillmentStatus(order.status);
                const paymentStatus = getPaymentStatus(order.payment_state || order.payment?.state);
                return (
                  <Link
                    key={order.order_code}
                    to={`/meus-pedidos/${order.order_code}`}
                    className="block bg-surface rounded-3xl shadow-soft p-4 hover:shadow-md transition-shadow group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-mono text-sm font-bold text-baby-text">{order.order_code}</span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${fulfillment.color}`}>
                            {fulfillment.customerLabel || fulfillment.label}
                          </span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${paymentStatus.color}`}>
                            {paymentStatus.shortLabel}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 font-sans text-xs text-baby-text/50">
                          <span>{formatDate(order.created_at)}</span>
                          <span className="font-medium text-baby-accent">{formatPrice((order.total_cents || 0) / 100)}</span>
                          {order.items_count != null && <span>{order.items_count} ite{order.items_count !== 1 ? 'ns' : 'm'}</span>}
                        </div>
                      </div>

                      <FiChevronRight size={18} className="text-baby-text/30 group-hover:text-baby-accent transition-colors shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {!loading && hasSource && orders.length === 0 && !error && (
            <div className="text-center py-16">
              <FiPackage size={40} className="mx-auto text-baby-text/20 mb-4" />
              <p className="font-sans text-baby-text/50 mb-2">Não encontramos pedidos neste ambiente.</p>
              <p className="font-sans text-xs text-baby-text/40">
                Se você trocou de projeto, banco ou ambiente, os códigos antigos podem não estar disponíveis aqui.
              </p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link to="/" className={btnSecondary}>Voltar ao início</Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
