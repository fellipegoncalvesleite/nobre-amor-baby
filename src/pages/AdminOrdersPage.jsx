import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiCheckCircle,
  FiChevronRight,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiTruck,
  FiXCircle,
  FiClock,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { btnSecondary, focusRing, formatPrice } from '../lib/ui';
import { getFulfillmentStatus, getPaymentStatus } from '../lib/orderStatus';

const TABS = [
  { key: 'pending', label: 'Pendentes', icon: FiClock, statuses: ['new'] },
  { key: 'confirmed', label: 'Confirmados', icon: FiCheckCircle, statuses: ['confirmed', 'packing'] },
  { key: 'done', label: 'Finalizados', icon: FiTruck, statuses: ['shipped', 'done'] },
  { key: 'cancelled', label: 'Cancelados', icon: FiXCircle, statuses: ['cancelled', 'rejected'] },
];

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

export default function AdminOrdersPage() {
  const navigate = useNavigate();
  const { user, accessToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ resource: 'orders', limit: '200' });
      if (search.trim()) params.set('q', search.trim());

      const response = await fetch(`/api/admin?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha ao carregar pedidos.');
      setOrders(data.orders || []);
    } catch (err) {
      console.error('[AdminOrdersPage] fetch error:', err);
      setError(err.message || 'Falha ao carregar pedidos.');
      toast.error('Falha ao carregar pedidos', { style: toastStyle });
    } finally {
      setLoading(false);
    }
  }, [accessToken, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const currentTab = TABS.find((tab) => tab.key === activeTab) || TABS[0];
  const filteredOrders = useMemo(
    () => orders.filter((order) => currentTab.statuses.includes(order.status)),
    [currentTab.statuses, orders],
  );

  const tabCounts = useMemo(
    () => Object.fromEntries(TABS.map((tab) => [tab.key, orders.filter((order) => tab.statuses.includes(order.status)).length])),
    [orders],
  );

  const markAsDone = async (event, orderCode) => {
    event.stopPropagation();
    try {
      const response = await fetch(`/api/admin?resource=orders&id=${encodeURIComponent(orderCode)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: 'done' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.message || 'Falha ao concluir pedido.');
      toast.success(`${orderCode} marcado como entregue`, { style: toastStyle });
      setOrders((prev) => prev.map((order) => (order.order_code === orderCode ? { ...order, status: 'done' } : order)));
    } catch (err) {
      toast.error(err.message || 'Falha ao concluir pedido.', { style: toastStyle });
    }
  };

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
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Pedidos</li>
          </ol>
        </nav>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
                <FiPackage className="text-baby-accent" size={22} />
              </div>
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">Pedidos</h1>
                {user && <p className="font-sans text-sm text-baby-accent">{orders.length} pedido{orders.length !== 1 ? 's' : ''} no total</p>}
              </div>
            </div>

            <button
              type="button"
              onClick={fetchOrders}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-baby-text/15 font-sans text-sm text-baby-text/60 hover:text-baby-accent hover:border-baby-accent transition-colors disabled:opacity-50 ${focusRing}`}
            >
              <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 whitespace-nowrap font-sans text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-baby-accent bg-baby-accent/10 text-baby-accent'
                      : 'border-transparent bg-surface text-baby-text/55 hover:text-baby-text hover:bg-baby-pink/20'
                  } ${focusRing}`}
                >
                  <TabIcon size={15} />
                  {tab.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-baby-accent text-white' : 'bg-baby-text/10 text-baby-text/55'}`}>
                    {tabCounts[tab.key] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-6 relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-baby-text/40" size={18} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código, nome ou telefone..."
              className={`w-full pl-11 pr-4 py-3 rounded-xl border border-baby-text/15 bg-surface font-sans text-sm text-baby-text placeholder-baby-text/40 ${focusRing}`}
            />
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 font-sans text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="bg-surface rounded-3xl shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-baby-pink">
                    <th className="px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50">Data</th>
                    <th className="px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50">Pedido</th>
                    <th className="px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50 hidden sm:table-cell">Cliente</th>
                    <th className="px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50 text-center">Status</th>
                    <th className="px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50 text-right hidden sm:table-cell">Total</th>
                    <th className="px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-baby-pink/40">
                  {loading && orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12">
                        <FiRefreshCw size={24} className="mx-auto animate-spin text-baby-accent mb-2" />
                        <p className="font-sans text-sm text-baby-text/50">Carregando pedidos...</p>
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 font-sans text-sm text-baby-text/40">
                        Nenhum pedido {currentTab.label.toLowerCase()} encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => {
                      const fulfillment = getFulfillmentStatus(order.status);
                      const payment = getPaymentStatus(order.payment_state);
                      return (
                        <tr
                          key={order.order_code}
                          onClick={() => navigate(`/admin/pedidos/${order.order_code}`)}
                          className="hover:bg-baby-pink/10 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 font-sans text-xs text-baby-text/60 whitespace-nowrap">{formatDate(order.created_at)}</td>
                          <td className="px-4 py-3">
                            <span className="font-sans text-sm font-medium text-baby-text">{order.order_code}</span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${payment.color}`}>
                                {payment.shortLabel}
                              </span>
                            </div>
                            <p className="font-sans text-xs text-baby-text/40 sm:hidden mt-1">{order.customer_name || '—'}</p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="font-sans text-sm text-baby-text/70 truncate max-w-40 block">
                              {order.customer_name || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${fulfillment.color}`}>
                              {fulfillment.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right hidden sm:table-cell">
                            <span className="font-sans text-sm text-baby-text/70">{formatPrice((order.total_cents || 0) / 100)}</span>
                          </td>
                          <td
                            className="px-4 py-3 text-center"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-center justify-center gap-1">
                              {['confirmed', 'packing', 'shipped'].includes(order.status) && (
                                <button
                                  type="button"
                                  onClick={(event) => markAsDone(event, order.order_code)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-sans text-xs font-medium ${focusRing}`}
                                  title="Marcar como entregue"
                                >
                                  <FiCheckCircle size={13} />
                                  <span className="hidden sm:inline">Entregue</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/pedidos/${order.order_code}`)}
                                className={`p-1.5 rounded-lg text-baby-text/30 hover:text-baby-accent hover:bg-baby-pink/20 transition-colors ${focusRing}`}
                                title="Ver detalhes"
                              >
                                <FiChevronRight size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/admin" className={btnSecondary}>Painel do Gerente</Link>
            <Link to="/" className={btnSecondary}>Voltar ao início</Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
