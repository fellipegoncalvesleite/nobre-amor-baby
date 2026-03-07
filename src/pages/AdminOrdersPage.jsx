/**
 * AdminOrdersPage — list orders from the database with tab-based workflow.
 *
 * Tabs:
 *   Pendentes    — status: new
 *   Confirmados  — status: confirmed, packing
 *   Finalizados  — status: shipped, done
 *   Cancelados   — status: cancelled, rejected
 *
 * Route: /admin/pedidos  (ProtectedRoute role="manager")
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiPackage, FiSearch, FiRefreshCw, FiChevronRight, FiAlertTriangle,
  FiCheckCircle, FiClock, FiTruck, FiXCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { formatPrice, focusRing, btnSecondary } from '../lib/ui';

/* ── Status labels & colors ──────────────────────── */
const STATUS_LABELS = {
  new: 'Novo',
  confirmed: 'Confirmado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  packing: 'Embalando',
  shipped: 'Enviado',
  done: 'Entregue',
};

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  packing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  done: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300',
};

/* ── Tab definitions ─────────────────────────────── */
const TABS = [
  { key: 'pending',    label: 'Pendentes',    icon: FiClock,       statuses: ['new'] },
  { key: 'confirmed',  label: 'Confirmados',  icon: FiCheckCircle, statuses: ['confirmed', 'packing'] },
  { key: 'done',       label: 'Finalizados',  icon: FiTruck,       statuses: ['shipped', 'done'] },
  { key: 'cancelled',  label: 'Cancelados',   icon: FiXCircle,     statuses: ['cancelled', 'rejected'] },
];

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

export default function AdminOrdersPage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ resource: 'orders', limit: '200' });
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/admin?${params}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (res.status === 401 || res.status === 403) {
        setError('Não autorizado. Faça login novamente.');
        setLoading(false);
        return;
      }
      if (res.status === 404) {
        setError('Endpoint não encontrado (404). Verifique /api/admin.');
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Erro ${res.status}`);
      setAllOrders(data.orders || []);
    } catch (err) {
      console.error('[AdminOrdersPage]', err);
      const msg = err.message || 'Erro desconhecido';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setError('Falha de rede. Verifique sua conexão.');
      } else {
        setError(msg);
      }
      toast.error('Falha ao carregar pedidos', { style: toastStyle });
    } finally {
      setLoading(false);
    }
  }, [search, accessToken]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  /* ── Mark order as delivered (done) ────────────── */
  const handleMarkDone = async (e, orderCode) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/admin?resource=orders&id=${encodeURIComponent(orderCode)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ status: 'done' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || 'Erro ao finalizar');
      toast.success(`${orderCode} marcado como entregue`, { style: toastStyle });
      setAllOrders((prev) =>
        prev.map((o) => (o.order_code === orderCode ? { ...o, status: 'done' } : o))
      );
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    }
  };

  /* ── Filter orders by active tab ───────────────── */
  const currentTabDef = TABS.find((t) => t.key === activeTab) || TABS[0];
  const filteredOrders = useMemo(
    () => allOrders.filter((o) => currentTabDef.statuses.includes(o.status)),
    [allOrders, currentTabDef],
  );

  /* ── Tab counts ────────────────────────────────── */
  const tabCounts = useMemo(() => {
    const counts = {};
    for (const tab of TABS) {
      counts[tab.key] = allOrders.filter((o) => tab.statuses.includes(o.status)).length;
    }
    return counts;
  }, [allOrders]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
      + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Pedidos</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
                <FiPackage className="text-baby-accent" size={22} />
              </div>
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">Pedidos</h1>
                {user && (
                  <p className="font-sans text-sm text-baby-accent">
                    {allOrders.length} pedido{allOrders.length !== 1 ? 's' : ''} no total
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={fetchOrders}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-sans text-sm
                         border border-baby-text/15 text-baby-text/60 hover:text-baby-accent
                         hover:border-baby-accent transition-colors disabled:opacity-40 ${focusRing}`}
            >
              <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>

          {/* ═══ TABS ════════════════════════════════ */}
          <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
            {TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.key;
              const count = tabCounts[tab.key] || 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-sans text-sm font-medium
                             transition-all whitespace-nowrap border-2
                             ${isActive
                               ? 'border-baby-accent bg-baby-accent/10 text-baby-accent shadow-sm'
                               : 'border-transparent bg-surface text-baby-text/50 hover:text-baby-text hover:bg-baby-pink/20'
                             } ${focusRing}`}
                >
                  <TabIcon size={15} />
                  {tab.label}
                  {count > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold
                      ${isActive
                        ? 'bg-baby-accent text-white'
                        : 'bg-baby-text/10 text-baby-text/50'
                      }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-baby-text/40" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código, nome ou telefone..."
                className={`w-full pl-11 pr-4 py-3 rounded-xl border border-baby-text/15 bg-surface
                           font-sans text-sm text-baby-text placeholder-baby-text/40
                           focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent
                           transition-shadow ${focusRing}`}
              />
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 font-sans text-sm text-red-700 dark:text-red-300">
              <div className="flex items-start gap-3">
                <FiAlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">{error}</p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70">
                    Verifique se você está logado com uma conta de gerente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Orders table */}
          <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-baby-pink">
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3">
                      Data
                    </th>
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3">
                      Pedido
                    </th>
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                      Cliente
                    </th>
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-center">
                      Status
                    </th>
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-right hidden sm:table-cell">
                      Total
                    </th>
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-center w-32">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-baby-pink/50">
                  {loading && allOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12">
                        <FiRefreshCw size={24} className="mx-auto animate-spin text-baby-accent mb-2" />
                        <p className="font-sans text-sm text-baby-text/50">Carregando pedidos…</p>
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12">
                        <p className="font-sans text-sm text-baby-text/40">
                          Nenhum pedido {currentTabDef.label.toLowerCase()} encontrado.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((o) => (
                      <tr
                        key={o.order_code}
                        onClick={() => navigate(`/admin/pedidos/${o.order_code}`)}
                        className="hover:bg-baby-pink/10 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 font-sans text-xs text-baby-text/60 whitespace-nowrap">
                          {formatDate(o.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-sans text-sm font-medium text-baby-text">
                            {o.order_code}
                          </span>
                          <p className="font-sans text-xs text-baby-text/40 sm:hidden mt-0.5">
                            {o.customer_name || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="font-sans text-sm text-baby-text/70 truncate max-w-40 block">
                            {o.customer_name || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || STATUS_COLORS.new}`}>
                            {STATUS_LABELS[o.status] || o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span className="font-sans text-sm text-baby-text/70">
                            {formatPrice(o.total_cents / 100)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {/* Mark as delivered — only for confirmed/packing/shipped */}
                            {['confirmed', 'packing', 'shipped'].includes(o.status) && (
                              <button
                                type="button"
                                onClick={(e) => handleMarkDone(e, o.order_code)}
                                title="Marcar como entregue"
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-sans text-xs font-medium
                                           transition-colors bg-green-100 text-green-700 hover:bg-green-200
                                           dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 ${focusRing}`}
                              >
                                <FiCheckCircle size={13} />
                                <span className="hidden sm:inline">Entregue</span>
                              </button>
                            )}
                            {/* View detail */}
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/pedidos/${o.order_code}`)}
                              title="Ver detalhes"
                              className={`p-1.5 rounded-lg text-baby-text/30 hover:text-baby-accent hover:bg-baby-pink/20 transition-colors ${focusRing}`}
                            >
                              <FiChevronRight size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Back links */}
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/admin" className={btnSecondary}>
              Painel do Gerente
            </Link>
            <Link to="/" className={btnSecondary}>
              Voltar ao início
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
