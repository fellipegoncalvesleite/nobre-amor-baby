/**
 * AdminPage — manager/debug dashboard with stock management.
 *
 * Gated by ProtectedRoute with role="manager".
 * The "debug" role also has access (debug can access everything).
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiSettings, FiSearch, FiRotateCcw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { formatPrice, focusRing, btnSecondary } from '../lib/ui';
import StockControl from '../components/StockControl';

const normalise = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function AdminPage() {
  const { user } = useAuth();
  const { products, setStock, resetCatalog } = useCatalog();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = normalise(search.trim());
    if (q.length < 2) return products;
    return products.filter(
      (p) => normalise(p.name).includes(q) || normalise(p.description).includes(q),
    );
  }, [products, search]);

  const oosCount = products.filter((p) => p.stockCount === 0).length;

  const handleToggle = (id, currentInStock) => {
    const next = !currentInStock;
    setStock(id, next ? 99 : 0);
    const product = products.find((p) => p.id === id);
    toast(
      next
        ? `"${product?.name}" marcado como em estoque (99)`
        : `"${product?.name}" marcado como esgotado (0)`,
      { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } },
    );
  };

  const handleReset = () => {
    resetCatalog();
    toast('Catálogo restaurado ao padrão', {
      style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
    });
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-baby-accent transition-colors">Início</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Painel</li>
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
                <FiSettings className="text-baby-accent" size={22} />
              </div>
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">
                  Painel do Gerente
                </h1>
                {user && (
                  <p className="font-sans text-sm text-baby-accent">
                    {user.name} ({user.role})
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-sans text-sm
                         border border-baby-text/15 text-baby-text/60 hover:text-baby-accent
                         hover:border-baby-accent transition-colors ${focusRing}`}
            >
              <FiRotateCcw size={14} />
              Restaurar padrão
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-surface rounded-xl p-4 shadow-soft text-center">
              <p className="font-sans text-2xl font-bold text-baby-text">{products.length}</p>
              <p className="font-sans text-xs text-baby-text/50">Total produtos</p>
            </div>
            <div className="bg-surface rounded-xl p-4 shadow-soft text-center">
              <p className="font-sans text-2xl font-bold text-green-600">{products.length - oosCount}</p>
              <p className="font-sans text-xs text-baby-text/50">Em estoque</p>
            </div>
            <div className="bg-surface rounded-xl p-4 shadow-soft text-center">
              <p className="font-sans text-2xl font-bold text-amber-500">{oosCount}</p>
              <p className="font-sans text-xs text-baby-text/50">Esgotados</p>
            </div>
          </div>

          {/* ── Gerenciamento ─────────────────────────── */}
          <h2 className="font-serif text-lg text-baby-text mb-3">Gerenciamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <Link to="/admin/pedidos"
              className="bg-surface rounded-2xl p-5 shadow-soft hover:ring-2 hover:ring-baby-accent transition-all group">
              <p className="text-3xl mb-2">📦</p>
              <p className="font-sans text-sm font-semibold text-baby-text group-hover:text-baby-accent transition-colors">Pedidos</p>
              <p className="font-sans text-xs text-baby-text/50 mt-1">Ver, confirmar ou rejeitar pedidos dos clientes</p>
            </Link>
            <Link to="/admin/produtos"
              className="bg-surface rounded-2xl p-5 shadow-soft hover:ring-2 hover:ring-baby-accent transition-all group">
              <p className="text-3xl mb-2">🛍️</p>
              <p className="font-sans text-sm font-semibold text-baby-text group-hover:text-baby-accent transition-colors">Produtos</p>
              <p className="font-sans text-xs text-baby-text/50 mt-1">Criar, editar, publicar e excluir produtos</p>
            </Link>
            <Link to="/admin/colecoes-gerenciar"
              className="bg-surface rounded-2xl p-5 shadow-soft hover:ring-2 hover:ring-baby-accent transition-all group">
              <p className="text-3xl mb-2">📁</p>
              <p className="font-sans text-sm font-semibold text-baby-text group-hover:text-baby-accent transition-colors">Coleções</p>
              <p className="font-sans text-xs text-baby-text/50 mt-1">Criar e gerenciar coleções de produtos</p>
            </Link>
            <Link to="/admin/inicio"
              className="bg-surface rounded-2xl p-5 shadow-soft hover:ring-2 hover:ring-baby-accent transition-all group">
              <p className="text-3xl mb-2">🏠</p>
              <p className="font-sans text-sm font-semibold text-baby-text group-hover:text-baby-accent transition-colors">Página Inicial</p>
              <p className="font-sans text-xs text-baby-text/50 mt-1">Configurar seções da home (coleções e destaques)</p>
            </Link>
            <Link to="/debug"
              className="bg-surface rounded-2xl p-5 shadow-soft hover:ring-2 hover:ring-baby-accent transition-all group">
              <p className="text-3xl mb-2">🐛</p>
              <p className="font-sans text-sm font-semibold text-baby-text group-hover:text-baby-accent transition-colors">Debug</p>
              <p className="font-sans text-xs text-baby-text/50 mt-1">Ferramentas de diagnóstico e testes</p>
            </Link>
          </div>

          <h2 className="font-serif text-lg text-baby-text mb-3">Controle de Estoque Rápido</h2>

          {/* Search */}
          <div className="relative mb-6">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-baby-text/40" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto..."
              className={`w-full pl-11 pr-4 py-3 rounded-xl border border-baby-text/15 bg-surface
                         font-sans text-baby-text placeholder-baby-text/40
                         focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent
                         transition-shadow ${focusRing}`}
            />
          </div>

          {/* Product table */}
          <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-baby-pink">
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3">
                      Produto
                    </th>
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-right hidden sm:table-cell">
                      Preço
                    </th>
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-center">
                      Estoque
                    </th>
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-center">
                      Em Estoque
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-baby-pink/50">
                  {filtered.map((product) => (
                    <tr key={product.id} className="hover:bg-baby-pink/10 transition-colors">
                      {/* Product info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={product.images[0]}
                            alt=""
                            className={`w-10 h-10 rounded-lg object-cover shrink-0${product.stockCount === 0 ? ' grayscale opacity-60' : ''}`}
                          />
                          <div className="min-w-0">
                            <p className="font-sans text-sm font-medium text-baby-text truncate">
                              {product.name}
                            </p>
                            <p className="font-sans text-xs text-baby-text/40 truncate sm:hidden">
                              {formatPrice(product.price)}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Price */}
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="font-sans text-sm text-baby-text/70">
                          {formatPrice(product.price)}
                        </span>
                      </td>
                      {/* Stock count — editable + hold-to-accelerate */}
                      <td className="px-4 py-3 text-center">
                        <StockControl
                          value={product.stockCount}
                          onChange={(v) => setStock(product.id, v)}
                        />
                      </td>
                      {/* Stock toggle */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={product.stockCount > 0}
                          aria-label={`${product.name}: ${product.stockCount > 0 ? 'em estoque' : 'esgotado'}`}
                          onClick={() => handleToggle(product.id, product.stockCount > 0)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full
                                     transition-colors duration-200 ${focusRing}
                                     ${product.stockCount > 0
                                       ? 'bg-green-500'
                                       : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm
                                       transform transition-transform duration-200
                                       ${product.stockCount > 0 ? 'translate-x-6' : 'translate-x-1'}`}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <p className="font-sans text-baby-text/40 text-sm text-center py-8">
                Nenhum produto encontrado.
              </p>
            )}
          </div>

          {/* Back link */}
          <div className="mt-8 text-center">
            <Link to="/" className={btnSecondary}>
              Voltar ao início
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
