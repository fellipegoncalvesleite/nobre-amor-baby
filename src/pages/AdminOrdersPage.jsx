/**
 * AdminOrdersPage — list orders from the database.
 *
 * Route: /admin/pedidos  (ProtectedRoute role="manager")
 *
 * MVP: uses VITE_ADMIN_API_KEY in the header.
 * TODO: replace with real session-based auth before going public.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiPackage, FiSearch, FiRefreshCw, FiChevronRight, FiAlertTriangle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
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

/* ── helper: VITE_ADMIN_API_KEY (MVP — replace with real auth) ── */
const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY || '';

export default function AdminOrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ resource: 'orders' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      params.set('limit', '100');

      const res = await fetch(`/api/admin?${params}`, {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao buscar pedidos');
      setOrders(data.orders || []);
    } catch (err) {
      console.error('[AdminOrdersPage]', err);
      setError(err.message);
      toast.error('Falha ao carregar pedidos', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
            <li>
              <Link to="/" className="hover:text-baby-accent transition-colors">Início</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Pedidos</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Env var warning */}
          {!ADMIN_KEY && (
            <div className="mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
              <div className="flex items-center gap-2">
                <FiAlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0" size={18} />
                <p className="font-sans text-sm text-amber-800 dark:text-amber-200">
                  <strong>VITE_ADMIN_API_KEY</strong> não está configurada. Vá no painel do Vercel → Settings → Environment Variables e adicione <strong>ADMIN_API_KEY</strong> (para o servidor) e <strong>VITE_ADMIN_API_KEY</strong> (para o frontend) com o mesmo valor.
                </p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
                <FiPackage className="text-baby-accent" size={22} />
              </div>
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">
                  Pedidos
                </h1>
                {user && (
                  <p className="font-sans text-sm text-baby-accent">
                    {orders.length} pedido{orders.length !== 1 ? 's' : ''}
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

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`pl-4 pr-8 py-3 rounded-xl border border-baby-text/15 bg-surface
                         font-sans text-sm text-baby-text appearance-none
                         focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent
                         transition-shadow ${focusRing}`}
            >
              <option value="all">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            {/* Search */}
            <div className="relative flex-1">
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
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 flex items-center gap-3 font-sans text-sm text-red-700 dark:text-red-300">
              <FiAlertTriangle size={18} />
              {error}
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
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-center w-12">
                      <span className="sr-only">Ver</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-baby-pink/50">
                  {loading && orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12">
                        <FiRefreshCw size={24} className="mx-auto animate-spin text-baby-accent mb-2" />
                        <p className="font-sans text-sm text-baby-text/50">Carregando pedidos…</p>
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12">
                        <p className="font-sans text-sm text-baby-text/40">Nenhum pedido encontrado.</p>
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
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
                          {/* Show customer on mobile */}
                          <p className="font-sans text-xs text-baby-text/40 sm:hidden mt-0.5">
                            {o.customer_name || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="font-sans text-sm text-baby-text/70 truncate max-w-[160px] block">
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
                        <td className="px-4 py-3 text-center">
                          <FiChevronRight size={16} className="text-baby-text/30" />
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
