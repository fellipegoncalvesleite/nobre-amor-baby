/**
 * DebugPage — dev tools for the DEBUG role.
 *
 * Gated by ProtectedRoute with role="debug".
 * Provides quick stock manipulation, cart seeding, and inventory overview.
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiTerminal,
  FiSearch,
  FiRotateCcw,
  FiShoppingBag,
  FiTrash2,
  FiZap,
  FiTruck,
  FiMapPin,
  FiLoader,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { useStore } from '../context/StoreContext';
import { formatPrice, focusRing, btnSecondary } from '../lib/ui';
import { normalizeCep, isValidCep, calculateShipping, isLocalCity, getLastShippingError, clearLastShippingError } from '../utils/shipping';
import { buildClothingPackage, DIMENSION_TIERS, PACKAGE_OVERHEAD_GRAMS } from '../utils/packing';
import { searchCepByAddress, fetchCepInfo, formatCep } from '../utils/viacep';
import { buildManagerPaidMessage, generateOrderId } from '../utils/orderMessage';
import { openWhatsApp, isWaTestMode, getMaskedTargetNumber } from '../utils/whatsapp';
import siteConfig from '../config/siteConfig';
import StockControl from '../components/StockControl';

const miniBtn = `px-2.5 py-1 rounded-full font-sans text-xs font-medium transition-colors ${focusRing}`;

const normalise = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function DebugPage() {
  const { user } = useAuth();
  const { products, setStock, resetCatalog } = useCatalog();
  const { cart, addToCart, clearCart, cartCount, shipping, setShipping, clearShipping, address, setAddress, clearAddress, payment, setPayment, setPaymentCard, resetPayment } = useStore();

  const [search, setSearch] = useState('');

  /* ── Frete test state ───────────────────────────── */
  const [testCep, setTestCep] = useState('');
  const [testDetecting, setTestDetecting] = useState(false);

  /* ── Packing debug state ────────────────────────── */
  const [lastApiDebug, setLastApiDebug] = useState(null);
  const [weightCheckResult, setWeightCheckResult] = useState(null);

  /* ── Payment / WhatsApp debug state ─────────────── */
  const [waPreview, setWaPreview] = useState('');

  /* ── API frete debug state ──────────────────────── */
  const [apiTestLoading, setApiTestLoading] = useState(false);
  const [apiTestResult, setApiTestResult] = useState(null);
  const [weightChecking, setWeightChecking] = useState(false);

  /* ── Orders API debug state ─────────────────────── */
  const [orderSeedLoading, setOrderSeedLoading] = useState(false);
  const [orderSeedResult, setOrderSeedResult] = useState(null);
  const [orderListLoading, setOrderListLoading] = useState(false);
  const [orderListResult, setOrderListResult] = useState(null);

  // Current packing calculation (reactive)
  const currentPkg = useMemo(
    () => buildClothingPackage(cart, products),
    [cart, products],
  );

  /* ── CEP-by-address search state ─────────────── */
  const [addrUf, setAddrUf] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrResults, setAddrResults] = useState(null);
  const [addrUrl, setAddrUrl] = useState('');
  const [addrStatus, setAddrStatus] = useState(null);

  const filtered = useMemo(() => {
    const q = normalise(search.trim());
    if (q.length < 2) return products;
    return products.filter(
      (p) => normalise(p.name).includes(q) || normalise(p.id).includes(q),
    );
  }, [products, search]);

  const oosCount = products.filter((p) => p.stockCount === 0).length;
  const lowCount = products.filter((p) => p.stockCount > 0 && p.stockCount <= 5).length;

  /* ── Quick actions ─────────────────────────────── */

  const handleZeroAll = () => {
    for (const p of products) setStock(p.id, 0);
    toast('Estoque zerado para todos os produtos', {
      style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
    });
  };

  const handleRestockAll = () => {
    for (const p of products) setStock(p.id, 99);
    toast('Todos os produtos reabastecidos (99)', {
      style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
    });
  };

  const handleSeedCart = () => {
    // Add 3 random products with different sizes
    const shuffled = [...products].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const p of shuffled) {
      const size = p.sizeOptions?.[0]?.label ?? p.sizes?.[0] ?? 'Único';
      addToCart(p.id, size, 2);
    }
    toast('3 produtos adicionados ao carrinho (qty 2)', {
      style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
    });
  };

  const handleSeedOosPurchase = () => {
    // Add items to cart, then zero their stock to simulate OOS scenario
    const picks = products.filter((p) => p.stockCount > 0).slice(0, 2);
    for (const p of picks) {
      const size = p.sizeOptions?.[0]?.label ?? p.sizes?.[0] ?? 'Único';
      addToCart(p.id, size, 3);
    }
    // Delay stock zero so cart items are added first
    setTimeout(() => {
      for (const p of picks) setStock(p.id, 0);
      toast('Itens adicionados ao carrinho e estoque zerado (cenário OOS)', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
        duration: 3000,
      });
    }, 100);
  };

  const handleSetLowStock = () => {
    for (const p of products) setStock(p.id, 2);
    toast('Todos os produtos com estoque baixo (2)', {
      style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
    });
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
            <li className="text-baby-text font-medium">Dev Tools</li>
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
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <FiTerminal className="text-purple-600 dark:text-purple-400" size={22} />
              </div>
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">
                  Dev Tools
                </h1>
                {user && (
                  <p className="font-sans text-sm text-purple-600 dark:text-purple-400">
                    {user.name} ({user.role})
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => { resetCatalog(); toast('Catálogo restaurado ao padrão', { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } }); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-sans text-sm
                         border border-baby-text/15 text-baby-text/60 hover:text-baby-accent
                         hover:border-baby-accent transition-colors ${focusRing}`}
            >
              <FiRotateCcw size={14} />
              Reset catálogo
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-surface rounded-xl p-4 shadow-soft text-center">
              <p className="font-sans text-2xl font-bold text-baby-text">{products.length}</p>
              <p className="font-sans text-xs text-baby-text/50">Total</p>
            </div>
            <div className="bg-surface rounded-xl p-4 shadow-soft text-center">
              <p className="font-sans text-2xl font-bold text-green-600">{products.length - oosCount}</p>
              <p className="font-sans text-xs text-baby-text/50">Em estoque</p>
            </div>
            <div className="bg-surface rounded-xl p-4 shadow-soft text-center">
              <p className="font-sans text-2xl font-bold text-amber-500">{oosCount}</p>
              <p className="font-sans text-xs text-baby-text/50">Esgotados</p>
            </div>
            <div className="bg-surface rounded-xl p-4 shadow-soft text-center">
              <p className="font-sans text-2xl font-bold text-orange-500">{lowCount}</p>
              <p className="font-sans text-xs text-baby-text/50">Baixo (&le;5)</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-surface rounded-2xl p-5 shadow-soft mb-8">
            <h2 className="font-serif text-lg text-baby-text mb-4 flex items-center gap-2">
              <FiZap size={18} className="text-purple-500" />
              Ações Rápidas
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRestockAll}
                className={`${miniBtn} bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50`}
              >
                Reabastecer todos (99)
              </button>
              <button
                type="button"
                onClick={handleZeroAll}
                className={`${miniBtn} bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50`}
              >
                Zerar todo estoque
              </button>
              <button
                type="button"
                onClick={handleSetLowStock}
                className={`${miniBtn} bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50`}
              >
                Estoque baixo (2)
              </button>
              <span className="w-px h-6 bg-baby-text/10 self-center mx-1" aria-hidden="true" />
              <button
                type="button"
                onClick={handleSeedCart}
                className={`${miniBtn} bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50`}
              >
                <span className="inline-flex items-center gap-1"><FiShoppingBag size={12} /> Seed carrinho</span>
              </button>
              <button
                type="button"
                onClick={handleSeedOosPurchase}
                className={`${miniBtn} bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50`}
              >
                Cenário OOS
              </button>
              <button
                type="button"
                onClick={() => { clearCart(); toast('Carrinho limpo', { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } }); }}
                className={`${miniBtn} bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`}
              >
                <span className="inline-flex items-center gap-1"><FiTrash2 size={12} /> Limpar carrinho</span>
              </button>
            </div>

            {/* Cart summary */}
            {cartCount > 0 && (
              <div className="mt-4 p-3 bg-baby-pink/20 rounded-xl">
                <p className="font-sans text-sm font-medium text-baby-text mb-1">
                  Carrinho ({cartCount} {cartCount === 1 ? 'item' : 'itens'})
                </p>
                <ul className="font-sans text-xs text-baby-text/60 space-y-0.5">
                  {cart.map((ci) => {
                    const p = products.find((pr) => pr.id === ci.id);
                    return (
                      <li key={`${ci.id}-${ci.size}`}>
                        #{ci.id} {p?.name ?? '?'} ({ci.size}) × {ci.qty}
                        {p && <span className="text-baby-text/40 ml-1">estoque: {p.stockCount}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-baby-text/40" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou ID..."
              className={`w-full pl-11 pr-4 py-3 rounded-xl border border-baby-text/15 bg-surface
                         font-sans text-baby-text placeholder-baby-text/40
                         focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent
                         transition-shadow ${focusRing}`}
            />
          </div>

          {/* Product stock table */}
          <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-baby-pink">
                    <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3">
                      ID
                    </th>
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
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-baby-pink/50">
                  {filtered.map((product) => (
                    <tr key={product.id} className="hover:bg-baby-pink/10 transition-colors">
                      {/* ID */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-baby-text/50">#{product.id}</span>
                      </td>
                      {/* Product info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={product.images[0]}
                            alt=""
                            className={`w-8 h-8 rounded-lg object-cover shrink-0${product.stockCount === 0 ? ' grayscale opacity-60' : ''}`}
                          />
                          <span className="font-sans text-sm text-baby-text truncate max-w-40">
                            {product.name}
                          </span>
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
                          size="sm"
                        />
                      </td>
                      {/* Quick set buttons */}
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => setStock(product.id, 0)}
                            className={`${miniBtn} bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40`}
                          >
                            0
                          </button>
                          <button
                            type="button"
                            onClick={() => setStock(product.id, 1)}
                            className={`${miniBtn} bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40`}
                          >
                            1
                          </button>
                          <button
                            type="button"
                            onClick={() => setStock(product.id, 5)}
                            className={`${miniBtn} bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/40`}
                          >
                            5
                          </button>
                          <button
                            type="button"
                            onClick={() => setStock(product.id, 99)}
                            className={`${miniBtn} bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40`}
                          >
                            99
                          </button>
                        </div>
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

          {/* ── Frete (teste) ────────────────────────────── */}
          <div className="bg-surface rounded-2xl p-5 shadow-soft mb-8 mt-8">
            <h2 className="font-serif text-lg text-baby-text mb-4 flex items-center gap-2">
              <FiTruck size={18} className="text-purple-500" />
              Frete (teste)
            </h2>

            {/* CEP detection test */}
            <div className="mb-4">
              <label htmlFor="test-cep-dbg" className="block font-sans text-xs font-medium text-baby-text/60 mb-1">Testar CEP</label>
              <div className="flex gap-2">
                <input
                  id="test-cep-dbg"
                  type="text"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="00000-000"
                  value={testCep}
                  onChange={(e) => setTestCep(normalizeCep(e.target.value).slice(0, 8))}
                  className={`flex-1 px-3 py-2 rounded-xl border border-baby-text/15 bg-surface
                             font-mono text-sm text-baby-text placeholder-baby-text/40
                             focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent transition-colors`}
                />
                <button
                  type="button"
                  disabled={testDetecting}
                  onClick={async () => {
                    const norm = normalizeCep(testCep);
                    if (!isValidCep(norm)) {
                      toast('CEP inválido.', { icon: '⚠️', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                      return;
                    }
                    setTestDetecting(true);
                    try {
                      const info = await fetchCepInfo(norm);
                      if (!info) {
                        toast('CEP não encontrado.', { icon: '⚠️', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                        return;
                      }
                      setShipping({ cepDigits: norm, city: info.localidade, uf: info.uf, isLoading: true, error: '' });
                      const result = await calculateShipping({ cep: norm, city: info.localidade, uf: info.uf, cart, products });
                      setShipping({
                        cepDigits: norm, city: info.localidade, uf: info.uf,
                        feeCents: result.feeCents, etaText: result.etaText, source: result.source,
                        isLoading: false, error: '',
                      });
                      toast(`${info.localidade}/${info.uf} → ${result.source} (${result.feeCents}¢)`, { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                    } catch (err) {
                      setShipping({ isLoading: false, error: err.message || 'Erro' });
                      toast('Erro ao calcular frete.', { icon: '❌', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                    } finally {
                      setTestDetecting(false);
                    }
                  }}
                  className={`${miniBtn} bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 inline-flex items-center gap-1`}
                >
                  {testDetecting ? <FiLoader size={12} className="animate-spin" /> : <FiSearch size={12} />}
                  Detectar
                </button>
              </div>
            </div>

            {/* Quick force buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={async () => {
                  setAddress({ cep: '35500000', street: 'Rua Goiás', number: '100', complement: '', neighborhood: 'Centro', city: 'Divinópolis', uf: 'MG' });
                  setShipping({ cepDigits: '35500000', city: 'Divinópolis', uf: 'MG', isLoading: true, error: '' });
                  try {
                    const result = await calculateShipping({ cep: '35500000', city: 'Divinópolis', uf: 'MG', cart, products });
                    setShipping({ cepDigits: '35500000', city: 'Divinópolis', uf: 'MG', feeCents: result.feeCents, etaText: result.etaText, source: result.source, isLoading: false, error: '' });
                    toast(`Divinópolis → ${result.source} (R$ ${(result.feeCents/100).toFixed(2)})`, { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  } catch {
                    setShipping({ cepDigits: '35500000', city: 'Divinópolis', uf: 'MG', feeCents: siteConfig.LOCAL_FIXED_SHIPPING_CENTS, etaText: siteConfig.LOCAL_ETA_TEXT, source: 'local_fixed', isLoading: false, error: '' });
                    toast('Fallback: local_fixed', { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  }
                }}
                className={`${miniBtn} bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50`}
              >
                Preencher CEP Divinópolis (teste)
              </button>
              <button
                type="button"
                onClick={async () => {
                  setAddress({ cep: '01001000', street: 'Praça da Sé', number: '250', complement: 'Sala 3', neighborhood: 'Sé', city: 'São Paulo', uf: 'SP' });
                  setShipping({ cepDigits: '01001000', city: 'São Paulo', uf: 'SP', isLoading: true, error: '' });
                  try {
                    const result = await calculateShipping({ cep: '01001000', city: 'São Paulo', uf: 'SP', cart, products, debug: true });
                    setShipping({ cepDigits: '01001000', city: 'São Paulo', uf: 'SP', feeCents: result.feeCents, etaText: result.etaText, source: result.source, isLoading: false, error: '' });
                    if (result.debug) setLastApiDebug(result.debug);
                    toast(`São Paulo → ${result.source} (R$ ${(result.feeCents/100).toFixed(2)})`, { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  } catch (err) {
                    setShipping({ cepDigits: '01001000', city: 'São Paulo', uf: 'SP', isLoading: false, error: err.message || 'Erro API' });
                    toast('Erro ao calcular frete (API)', { icon: '❌', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  }
                }}
                className={`${miniBtn} bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50`}
              >
                Preencher CEP São Paulo (teste)
              </button>
              <button
                type="button"
                onClick={async () => {
                  const cep = shipping.cepDigits || address.cep;
                  const city = shipping.city || address.city;
                  const uf = shipping.uf || address.uf;
                  if (!cep || !city) { toast('Preencha CEP e cidade primeiro.', { icon: '⚠️', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } }); return; }
                  setShipping({ isLoading: true, error: '' });
                  try {
                    const result = await calculateShipping({ cep, city, uf, cart, products, debug: true });
                    setShipping({ cepDigits: cep, city, uf, feeCents: result.feeCents, etaText: result.etaText, source: result.source, isLoading: false, error: '' });
                    if (result.debug) setLastApiDebug(result.debug);
                    toast(`Recalculado: ${result.source} (R$ ${(result.feeCents/100).toFixed(2)})`, { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  } catch (err) {
                    setShipping({ isLoading: false, error: err.message || 'Erro' });
                    toast('Erro ao recalcular frete.', { icon: '❌', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  }
                }}
                className={`${miniBtn} bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50`}
              >
                Recalcular frete
              </button>
              <button
                type="button"
                onClick={() => {
                  clearShipping();
                  setTestCep('');
                  toast('Frete limpo.', { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                }}
                className={`${miniBtn} bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`}
              >
                Limpar frete
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAddress();
                  toast('Endereço limpo.', { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                }}
                className={`${miniBtn} bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`}
              >
                Limpar endereço
              </button>
            </div>

            {/* Current shipping state */}
            <div className="bg-baby-pink/10 dark:bg-baby-accent/5 border border-baby-pink rounded-xl p-4 space-y-1.5 font-sans text-sm">
              <div className="flex justify-between">
                <span className="text-baby-text/60">Source</span>
                <span className="font-mono text-baby-text">{shipping.source || '(não calculado)'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">CEP</span>
                <span className="font-mono text-baby-text">{shipping.cepDigits ? formatCep(shipping.cepDigits) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">Cidade</span>
                <span className="text-baby-text">{shipping.city ? `${shipping.city}/${shipping.uf}` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">isLocal</span>
                <span className="text-baby-text">{shipping.city ? String(isLocalCity(shipping.city, shipping.uf)) : '—'}</span>
              </div>
              <hr className="border-baby-pink/50" />
              <div className="flex justify-between">
                <span className="text-baby-text/60">feeCents (final)</span>
                <span className={`font-medium ${shipping.feeCents != null ? 'text-baby-text' : 'text-baby-accent'}`}>
                  {shipping.feeCents != null ? `${formatPrice(shipping.feeCents / 100)} (${shipping.feeCents}¢)` : 'null'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">etaText</span>
                <span className="text-baby-text">{shipping.etaText || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">isLoading</span>
                <span className={`font-mono ${shipping.isLoading ? 'text-amber-500' : 'text-baby-text/40'}`}>{String(shipping.isLoading)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">error</span>
                <span className={`${shipping.error ? 'text-red-500' : 'text-baby-text/40'} truncate max-w-[60%] text-right`}>{shipping.error || '—'}</span>
              </div>
              <hr className="border-baby-pink/50" />
              <p className="text-baby-text/30 text-[10px] font-mono">LOCAL_FIXED: {siteConfig.LOCAL_FIXED_SHIPPING_CENTS}¢ · SURCHARGE: {siteConfig.NONLOCAL_SURCHARGE_CENTS}¢</p>
            </div>

            {/* Current address state */}
            <div className="bg-baby-pink/10 dark:bg-baby-accent/5 border border-baby-pink rounded-xl p-4 space-y-1.5 font-sans text-sm mt-4">
              <p className="text-baby-text/40 text-xs font-medium uppercase tracking-wider mb-1">Endereço</p>
              <div className="flex justify-between">
                <span className="text-baby-text/60">CEP</span>
                <span className="font-mono text-baby-text">{address.cep || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">Rua</span>
                <span className="text-baby-text truncate max-w-[60%] text-right">{address.street || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">Número</span>
                <span className="text-baby-text">{address.number || '—'}</span>
              </div>
              {address.complement && (
                <div className="flex justify-between">
                  <span className="text-baby-text/60">Complemento</span>
                  <span className="text-baby-text">{address.complement}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-baby-text/60">Bairro</span>
                <span className="text-baby-text">{address.neighborhood || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">Cidade/UF</span>
                <span className="text-baby-text">{address.city ? `${address.city}/${address.uf}` : '—'}</span>
              </div>
            </div>
          </div>

          {/* ═══════ Packing (roupas) ═══════════════════════ */}
          <div className="bg-surface rounded-2xl p-5 shadow-soft mb-8 mt-8">
            <h2 className="font-serif text-lg text-baby-text mb-4 flex items-center gap-2">
              <FiShoppingBag size={18} className="text-orange-500" />
              Packing (roupas)
            </h2>

            {/* Current packing calculation */}
            <div className="bg-baby-pink/10 dark:bg-baby-accent/5 border border-baby-pink rounded-xl p-4 space-y-1.5 font-sans text-sm mb-4">
              <p className="text-baby-text/40 text-xs font-medium uppercase tracking-wider mb-1">buildClothingPackage(cart, products)</p>
              <div className="flex justify-between">
                <span className="text-baby-text/60">itemCount</span>
                <span className="font-mono text-baby-text">{currentPkg.itemCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">totalWeightGrams</span>
                <span className="font-mono text-baby-text">{currentPkg.totalWeightGrams} g (incl. {PACKAGE_OVERHEAD_GRAMS}g embalagem)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">weightKg</span>
                <span className="font-mono text-baby-text font-semibold">{currentPkg.weightKg} kg</span>
              </div>
              <hr className="border-baby-pink/50" />
              <div className="flex justify-between">
                <span className="text-baby-text/60">Dimensões (L×W×H)</span>
                <span className="font-mono text-baby-text">{currentPkg.lengthCm}×{currentPkg.widthCm}×{currentPkg.heightCm} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-baby-text/60">insuranceValueCents</span>
                <span className="font-mono text-baby-text">{currentPkg.insuranceValueCents}¢ ({formatPrice(currentPkg.insuranceValueCents / 100)})</span>
              </div>
              <hr className="border-baby-pink/50" />
              <p className="text-baby-text/30 text-[10px] font-mono">
                Tiers: {DIMENSION_TIERS.map((t) => `≤${t.maxPieces === Infinity ? '∞' : t.maxPieces}pç→${t.lengthCm}×${t.widthCm}×${t.heightCm}`).join(' | ')}
              </p>
            </div>

            {/* Seed buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { label: 'Simular 1 peça', qty: 1 },
                { label: 'Simular 3 peças', qty: 3 },
                { label: 'Simular 8 peças', qty: 8 },
              ].map(({ label, qty }) => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => {
                    clearCart();
                    const p = products[0];
                    if (p) {
                      const size = p.sizes?.[0] || 'Único';
                      for (let i = 0; i < qty; i++) addToCart({ id: p.id, qty: 1, size });
                    }
                    toast(`Carrinho: ${qty}× ${products[0]?.name || 'produto'}`, { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  }}
                  className={`${miniBtn} bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* API payload preview */}
            <details className="mb-4">
              <summary className="text-xs text-baby-text/50 cursor-pointer hover:text-baby-text/70 font-mono">
                Payload → /api/shipping-quote
              </summary>
              <pre className="mt-2 p-3 rounded-xl bg-baby-text/5 dark:bg-baby-text/10 text-[11px] font-mono text-baby-text/70 overflow-x-auto max-h-48">
                {JSON.stringify({
                  toCep: shipping.cepDigits || '(nenhum)',
                  fromCep: siteConfig.storeCep,
                  package: {
                    weightKg: currentPkg.weightKg,
                    lengthCm: currentPkg.lengthCm,
                    widthCm: currentPkg.widthCm,
                    heightCm: currentPkg.heightCm,
                  },
                  items: cart.map((item) => ({
                    id: item.id,
                    qty: item.qty || 1,
                    priceCents: Math.round((products.find((p) => String(p.id) === String(item.id))?.price || 0) * 100),
                  })),
                }, null, 2)}
              </pre>
            </details>

            {/* Last API debug response */}
            {lastApiDebug && (
              <details className="mb-4" open>
                <summary className="text-xs text-baby-text/50 cursor-pointer hover:text-baby-text/70 font-mono">
                  API debug response
                </summary>
                <pre className="mt-2 p-3 rounded-xl bg-baby-text/5 dark:bg-baby-text/10 text-[11px] font-mono text-baby-text/70 overflow-x-auto max-h-48">
                  {JSON.stringify(lastApiDebug, null, 2)}
                </pre>
              </details>
            )}

            {/* Weight-affects-price check */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={weightChecking}
                onClick={async () => {
                  const cep = shipping.cepDigits || '01001000';
                  const city = shipping.city || 'São Paulo';
                  const uf = shipping.uf || 'SP';
                  if (!cep) { toast('Defina um CEP primeiro.', { icon: '⚠️', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } }); return; }

                  setWeightChecking(true);
                  setWeightCheckResult(null);
                  try {
                    // Quote with 1 item
                    const r1 = await calculateShipping({
                      cep, city, uf,
                      cart: [{ id: products[0]?.id || '1', qty: 1 }],
                      products,
                      debug: true,
                    });
                    // Quote with 8 items
                    const r8 = await calculateShipping({
                      cep, city, uf,
                      cart: [{ id: products[0]?.id || '1', qty: 8 }],
                      products,
                      debug: true,
                    });
                    const pass = r1.feeCents !== r8.feeCents;
                    setWeightCheckResult({
                      pass,
                      fee1: r1.feeCents,
                      fee8: r8.feeCents,
                      debug1: r1.debug,
                      debug8: r8.debug,
                    });
                    setLastApiDebug(r8.debug);
                    toast(pass ? 'PASS — peso altera o preço' : 'WARNING — preço idêntico', {
                      icon: pass ? '✅' : '⚠️',
                      style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
                    });
                  } catch (err) {
                    toast(`Erro: ${err.message}`, { icon: '❌', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  } finally {
                    setWeightChecking(false);
                  }
                }}
                className={`${miniBtn} bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 inline-flex items-center gap-1`}
              >
                {weightChecking ? <FiLoader size={12} className="animate-spin" /> : <FiZap size={12} />}
                Testar peso ≠ preço
              </button>
              {weightCheckResult && (
                <span className={`font-mono text-xs font-medium ${weightCheckResult.pass ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {weightCheckResult.pass ? 'PASS' : 'WARNING'} — 1pç: {weightCheckResult.fee1}¢ vs 8pç: {weightCheckResult.fee8}¢
                  {!weightCheckResult.pass && ' — API pode não usar peso/dimensões'}
                </span>
              )}
            </div>
          </div>

          <div className="bg-surface rounded-2xl p-5 shadow-soft mb-8 mt-8">
            <h2 className="font-serif text-lg text-baby-text mb-4 flex items-center gap-2">
              <FiMapPin size={18} className="text-purple-500" />
              Buscar CEP por Endereço (teste)
            </h2>

            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              {/* UF */}
              <div>
                <label htmlFor="addr-uf-dbg" className="block font-sans text-xs font-medium text-baby-text/60 mb-1">UF</label>
                <input
                  id="addr-uf-dbg"
                  type="text"
                  maxLength={2}
                  placeholder="SP"
                  value={addrUf}
                  onChange={(e) => setAddrUf(e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 rounded-xl border border-baby-text/15 bg-surface
                             font-mono text-sm text-baby-text placeholder-baby-text/40
                             focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent transition-colors`}
                />
              </div>
              {/* City */}
              <div>
                <label htmlFor="addr-city-dbg" className="block font-sans text-xs font-medium text-baby-text/60 mb-1">Cidade</label>
                <input
                  id="addr-city-dbg"
                  type="text"
                  placeholder="São Paulo"
                  value={addrCity}
                  onChange={(e) => setAddrCity(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border border-baby-text/15 bg-surface
                             font-sans text-sm text-baby-text placeholder-baby-text/40
                             focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent transition-colors`}
                />
              </div>
              {/* Street */}
              <div>
                <label htmlFor="addr-street-dbg" className="block font-sans text-xs font-medium text-baby-text/60 mb-1">Rua / Logradouro</label>
                <input
                  id="addr-street-dbg"
                  type="text"
                  placeholder="Praça da Sé"
                  value={addrStreet}
                  onChange={(e) => setAddrStreet(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border border-baby-text/15 bg-surface
                             font-sans text-sm text-baby-text placeholder-baby-text/40
                             focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent transition-colors`}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                disabled={addrLoading}
                onClick={async () => {
                  const trimUf = addrUf.trim();
                  const trimCity = addrCity.trim();
                  const trimStreet = addrStreet.trim();
                  if (trimUf.length !== 2 || trimCity.length < 2 || trimStreet.length < 3) {
                    toast('Preencha UF (2 letras), cidade e rua (mín. 3 letras).', { icon: '⚠️', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                    return;
                  }
                  setAddrLoading(true);
                  setAddrResults(null);
                  setAddrStatus(null);
                  try {
                    const { results: data, url: actualUrl, status: httpStatus } = await searchCepByAddress({ uf: trimUf, city: trimCity, street: trimStreet });
                    setAddrUrl(actualUrl);
                    setAddrStatus(httpStatus);
                    setAddrResults(data);
                    if (data.length === 0) {
                      toast('Nenhum CEP encontrado.', { icon: '📭', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                    }
                  } catch {
                    toast('Erro ao buscar ViaCEP.', { icon: '❌', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                    setAddrResults([]);
                  } finally {
                    setAddrLoading(false);
                  }
                }}
                className={`${miniBtn} bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 inline-flex items-center gap-1`}
              >
                {addrLoading ? <FiLoader size={12} className="animate-spin" /> : <FiSearch size={12} />}
                {addrLoading ? 'Buscando...' : 'Buscar'}
              </button>
              <button
                type="button"
                onClick={() => { setAddrUf(''); setAddrCity(''); setAddrStreet(''); setAddrResults(null); setAddrUrl(''); setAddrStatus(null); }}
                className={`${miniBtn} bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`}
              >
                Limpar
              </button>
            </div>

            {/* Debug info */}
            {addrUrl && (
              <div className="font-mono text-[10px] text-baby-text/30 break-all mb-3 space-y-0.5">
                <p>URL: {addrUrl}</p>
                {addrStatus != null && <p>HTTP status: {addrStatus}</p>}
                {addrResults != null && <p>Resultados: {addrResults.length}</p>}
              </div>
            )}

            {/* Results */}
            {addrResults !== null && addrResults.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                <p className="font-sans text-xs text-baby-text/50 mb-1">
                  {addrResults.length} {addrResults.length === 1 ? 'resultado' : 'resultados'}
                </p>
                {addrResults.map((item, idx) => (
                  <div
                    key={`${item.cep}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-baby-text/10 hover:border-baby-accent hover:bg-baby-pink/10 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block font-sans text-sm text-baby-text truncate">
                        {item.logradouro}
                        {item.complemento && (
                          <span className="text-baby-text/40"> — {item.complemento}</span>
                        )}
                      </span>
                      <span className="block font-sans text-xs text-baby-text/50">
                        {item.bairro && `${item.bairro} · `}{item.localidade}/{item.uf}
                      </span>
                      <span className="block font-mono text-xs text-baby-accent font-semibold mt-0.5">
                        CEP {formatCep(item.cep)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setShipping({ cepDigits: item.cep, city: item.localidade, uf: item.uf, isLoading: true, error: '' });
                        try {
                          const result = await calculateShipping({ cep: item.cep, city: item.localidade, uf: item.uf, cart, products });
                          setShipping({ cepDigits: item.cep, city: item.localidade, uf: item.uf, feeCents: result.feeCents, etaText: result.etaText, source: result.source, isLoading: false, error: '' });
                          toast(`CEP ${formatCep(item.cep)} → ${result.source} (R$ ${(result.feeCents/100).toFixed(2)})`, { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                        } catch (err) {
                          setShipping({ cepDigits: item.cep, city: item.localidade, uf: item.uf, isLoading: false, error: err.message || 'Erro' });
                          toast('Erro ao calcular frete.', { icon: '❌', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                        }
                      }}
                      className={`${miniBtn} bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 shrink-0 ml-3`}
                    >
                      Aplicar frete
                    </button>
                  </div>
                ))}
              </div>
            )}

            {addrResults !== null && addrResults.length === 0 && !addrLoading && (
              <p className="font-sans text-sm text-baby-text/40 text-center py-3">
                Nenhum CEP encontrado para esse endereço.
              </p>
            )}
          </div>

          {/* ═══════════════════════════════════════════════
              API FRETE (TESTE)
              ═══════════════════════════════════════════════ */}
          <div className="bg-surface rounded-2xl p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-serif text-xl text-baby-text mb-4">
              <span className="text-baby-accent">🌐</span> API Frete (teste)
            </h2>

            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                disabled={apiTestLoading}
                onClick={async () => {
                  setApiTestLoading(true);
                  setApiTestResult(null);
                  try {
                    const r = await fetch('/api/shipping-quote', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        toCep: '01001000',
                        package: { weightKg: 0.3, lengthCm: 20, widthCm: 15, heightCm: 5 },
                        items: [{ id: '1', qty: 1, priceCents: 5990 }],
                      }),
                    });
                    const text = await r.text();
                    let json = null;
                    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
                    setApiTestResult({ status: r.status, text: text.slice(0, 500), json });
                    toast(r.ok ? `API OK (${r.status})` : `API erro (${r.status})`, {
                      icon: r.ok ? '✅' : '❌',
                      style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
                    });
                  } catch (err) {
                    setApiTestResult({ status: 0, text: err.message, json: null });
                    toast('Falha na requisição', { icon: '❌', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  } finally {
                    setApiTestLoading(false);
                  }
                }}
                className={`${miniBtn} bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400`}
              >
                {apiTestLoading ? 'Testando…' : 'Testar API (POST válido)'}
              </button>
              <button
                type="button"
                disabled={apiTestLoading}
                onClick={async () => {
                  setApiTestLoading(true);
                  setApiTestResult(null);
                  try {
                    const r = await fetch('/api/shipping-quote');
                    const text = await r.text();
                    let json = null;
                    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
                    setApiTestResult({ status: r.status, text: text.slice(0, 500), json });
                    toast(`GET → ${r.status}`, { icon: r.status === 405 ? '✅' : '⚠️', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  } catch (err) {
                    setApiTestResult({ status: 0, text: err.message, json: null });
                  } finally {
                    setApiTestLoading(false);
                  }
                }}
                className={`${miniBtn} bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400`}
              >
                Testar GET (deve dar 405)
              </button>
              <button
                type="button"
                disabled={apiTestLoading}
                onClick={async () => {
                  setApiTestLoading(true);
                  setApiTestResult(null);
                  try {
                    const r = await fetch('/api/shipping-quote', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ toCep: 'INVALIDO' }),
                    });
                    const text = await r.text();
                    let json = null;
                    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
                    setApiTestResult({ status: r.status, text: text.slice(0, 500), json });
                    toast(`POST inválido → ${r.status}`, { icon: r.status === 400 ? '✅' : '⚠️', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                  } catch (err) {
                    setApiTestResult({ status: 0, text: err.message, json: null });
                  } finally {
                    setApiTestLoading(false);
                  }
                }}
                className={`${miniBtn} bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400`}
              >
                Testar POST inválido (400)
              </button>
            </div>

            {apiTestResult && (
              <div className="space-y-2 mb-4">
                <p className="font-sans text-xs text-baby-text/60">
                  Status: <span className={`font-mono font-semibold ${apiTestResult.status >= 200 && apiTestResult.status < 300 ? 'text-green-600' : apiTestResult.status >= 400 ? 'text-red-500' : 'text-amber-500'}`}>{apiTestResult.status || 'N/A'}</span>
                </p>
                <details>
                  <summary className="cursor-pointer font-sans text-xs text-baby-text/50 hover:text-baby-text/70 transition-colors">Response text</summary>
                  <pre className="mt-1 bg-baby-cream rounded-xl p-3 font-mono text-[11px] text-baby-text/60 overflow-auto max-h-40 whitespace-pre-wrap">{apiTestResult.text || '(vazio)'}</pre>
                </details>
                {apiTestResult.json && (
                  <details>
                    <summary className="cursor-pointer font-sans text-xs text-baby-text/50 hover:text-baby-text/70 transition-colors">Parsed JSON</summary>
                    <pre className="mt-1 bg-baby-cream rounded-xl p-3 font-mono text-[11px] text-baby-text/60 overflow-auto max-h-40">{JSON.stringify(apiTestResult.json, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}

            {/* Last shipping error captured by frontend */}
            <div className="border-t border-baby-text/10 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-sans text-xs font-medium text-baby-text/50">Último erro de frete (frontend)</p>
                <button
                  type="button"
                  onClick={() => { clearLastShippingError(); toast('Erro limpo', { icon: '🧹', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } }); }}
                  className={`${miniBtn} bg-baby-pink/30 text-baby-text/50 hover:text-baby-text`}
                >
                  Limpar
                </button>
              </div>
              {(() => {
                const lastErr = getLastShippingError();
                if (!lastErr) return <p className="font-sans text-xs text-green-600">Nenhum erro registrado ✓</p>;
                return (
                  <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-3 space-y-1">
                    <p className="font-sans text-xs text-red-600"><strong>Status:</strong> {lastErr.status || 'N/A'}</p>
                    <p className="font-sans text-xs text-red-600"><strong>Mensagem:</strong> {lastErr.message}</p>
                    {lastErr.mockFallback && <p className="font-sans text-xs text-amber-500 font-semibold">⚠ Mock fallback ativo</p>}
                    <p className="font-sans text-xs text-baby-text/30">{lastErr.timestamp}</p>
                    {lastErr.rawSnippet && (
                      <details>
                        <summary className="cursor-pointer font-sans text-[10px] text-baby-text/40">Raw snippet</summary>
                        <pre className="mt-1 font-mono text-[10px] text-baby-text/40 overflow-auto max-h-24 whitespace-pre-wrap">{lastErr.rawSnippet}</pre>
                      </details>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════
              PAGAMENTO (TESTE)
              ═══════════════════════════════════════════════ */}
          <div className="bg-surface rounded-2xl p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-serif text-xl text-baby-text mb-4">
              <span className="text-baby-accent">💳</span> Pagamento (teste)
            </h2>

            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setPayment({ method: 'cartao' });
                  setPaymentCard({ name: 'Teste Silva', numberLast4: '1234', brand: 'visa', installments: 3 });
                  toast('Cartão fake preenchido', { icon: '💳', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                }}
                className={`${miniBtn} bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400`}
              >
                Preencher cartão fake
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayment({ method: 'pix', pixId: 'PIX-TEST-' + Date.now() });
                  toast('Pix fake preenchido', { icon: '📱', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                }}
                className={`${miniBtn} bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400`}
              >
                Preencher pix fake
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayment({ confirmationChecked: true, status: 'simulado_confirmado' });
                  toast('Confirmação marcada', { icon: '✅', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                }}
                className={`${miniBtn} bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400`}
              >
                Marcar confirmação
              </button>
              <button
                type="button"
                onClick={() => {
                  resetPayment();
                  toast('Pagamento resetado', { icon: '🔄', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                }}
                className={`${miniBtn} bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400`}
              >
                Reset pagamento
              </button>
            </div>

            <details className="mb-2">
              <summary className="cursor-pointer font-sans text-xs text-baby-text/50 hover:text-baby-text/70 transition-colors">payment state (JSON)</summary>
              <pre className="mt-2 bg-baby-cream rounded-xl p-3 font-mono text-[11px] text-baby-text/60 overflow-auto max-h-48">
                {JSON.stringify(payment, null, 2)}
              </pre>
            </details>
          </div>

          {/* ═══════════════════════════════════════════════
              WHATSAPP (TESTE)
              ═══════════════════════════════════════════════ */}
          <div className="bg-surface rounded-2xl p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-serif text-xl text-baby-text mb-4">
              <span className="text-baby-accent">📱</span> WhatsApp (teste)
            </h2>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="font-sans text-xs text-baby-text/50">
                Destino: <span className="font-mono">{getMaskedTargetNumber()}</span>
              </span>
              {isWaTestMode() && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-sans text-[10px] font-semibold">
                  MODO TESTE
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  const orderId = generateOrderId();
                  const msg = buildManagerPaidMessage({
                    cart,
                    products,
                    user: { displayName: 'Teste Debug' },
                    shipping,
                    payment: { ...payment, status: 'simulado_confirmado', paidAtISO: new Date().toISOString() },
                    address,
                    customer: { name: 'Teste Debug', phone: '(37) 99999-0000', email: 'teste@debug.com', message: 'Debug preview' },
                    orderId,
                  });
                  setWaPreview(msg);
                  toast('Preview gerado', { icon: '👀', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                }}
                className={`${miniBtn} bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400`}
              >
                Gerar mensagem (preview)
              </button>
              <button
                type="button"
                onClick={() => {
                  const orderId = generateOrderId();
                  const msg = buildManagerPaidMessage({
                    cart,
                    products,
                    user: { displayName: 'Teste Debug' },
                    shipping,
                    payment: { ...payment, status: 'simulado_confirmado', paidAtISO: new Date().toISOString() },
                    address,
                    customer: { name: 'Teste Debug', phone: '(37) 99999-0000', email: 'teste@debug.com', message: '' },
                    orderId,
                  });
                  openWhatsApp(msg);
                  toast('WhatsApp aberto', { icon: '📤', style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } });
                }}
                className={`${miniBtn} bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400`}
              >
                Abrir WhatsApp (teste)
              </button>
            </div>

            {waPreview && (
              <details open>
                <summary className="cursor-pointer font-sans text-xs text-baby-text/50 hover:text-baby-text/70 transition-colors">Preview da mensagem</summary>
                <pre className="mt-2 bg-baby-cream rounded-xl p-3 font-mono text-[11px] text-baby-text/60 overflow-auto max-h-64 whitespace-pre-wrap">
                  {waPreview}
                </pre>
              </details>
            )}
          </div>

          {/* ═══════════════════════════════════════════════
              PEDIDOS (ORDERS API)
              ═══════════════════════════════════════════════ */}
          <div className="bg-surface rounded-2xl p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-serif text-xl text-baby-text mb-4">
              <span className="text-baby-accent">📦</span> Pedidos (Orders API)
            </h2>

            <div className="flex flex-wrap gap-2 mb-4">
              {/* Seed fake order */}
              <button
                type="button"
                disabled={orderSeedLoading}
                onClick={async () => {
                  setOrderSeedLoading(true);
                  setOrderSeedResult(null);
                  try {
                    const res = await fetch('/api/orders', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        customer: { name: 'Teste Debug', phone: '5500999999999', email: 'debug@test.com', message: 'Pedido de teste via DebugPage' },
                        address: { cep: '35502825', street: 'Rua Teste', number: '123', complement: '', neighborhood: 'Centro', city: 'Divinópolis', uf: 'MG' },
                        shipping: { feeCents: 1500, etaText: '3-5 dias úteis', provider: 'PAC' },
                        payment: { method: 'pix', paidTotalCents: 11500, ref: 'pix_debug_seed' },
                        items: [
                          { productId: 'debug-1', productName: 'Body Floral P (teste)', size: 'P', qty: 1, unitPriceCents: 5000 },
                          { productId: 'debug-2', productName: 'Sapatinho Rosa RN (teste)', size: 'RN', qty: 2, unitPriceCents: 2500 },
                        ],
                      }),
                    });
                    const data = await res.json();
                    setOrderSeedResult({ ok: res.ok, status: res.status, data });
                  } catch (err) {
                    setOrderSeedResult({ ok: false, error: err.message });
                  } finally {
                    setOrderSeedLoading(false);
                  }
                }}
                className={`${miniBtn} bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400`}
              >
                {orderSeedLoading ? 'Enviando…' : 'Seed pedido (fake)'}
              </button>

              {/* List orders */}
              <button
                type="button"
                disabled={orderListLoading}
                onClick={async () => {
                  setOrderListLoading(true);
                  setOrderListResult(null);
                  try {
                    const adminKey = import.meta.env.VITE_ADMIN_API_KEY || '';
                    const res = await fetch('/api/admin/orders?limit=5', {
                      headers: { 'x-admin-key': adminKey },
                    });
                    const data = await res.json();
                    setOrderListResult({ ok: res.ok, status: res.status, data });
                  } catch (err) {
                    setOrderListResult({ ok: false, error: err.message });
                  } finally {
                    setOrderListLoading(false);
                  }
                }}
                className={`${miniBtn} bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400`}
              >
                {orderListLoading ? 'Buscando…' : 'Listar pedidos (admin)'}
              </button>

              {/* Link to Admin Orders */}
              <Link
                to="/admin/pedidos"
                className={`${miniBtn} bg-baby-pink/60 text-baby-accent hover:bg-baby-pink`}
              >
                Abrir painel de pedidos →
              </Link>
            </div>

            {/* Seed result */}
            {orderSeedResult && (
              <details open className="mb-3">
                <summary className="cursor-pointer font-sans text-xs text-baby-text/50 hover:text-baby-text/70 transition-colors">
                  Resultado seed ({orderSeedResult.ok ? '✅ OK' : '❌ Erro'})
                </summary>
                <pre className="mt-2 bg-baby-cream rounded-xl p-3 font-mono text-[11px] text-baby-text/60 overflow-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(orderSeedResult, null, 2)}
                </pre>
              </details>
            )}

            {/* List result */}
            {orderListResult && (
              <details open>
                <summary className="cursor-pointer font-sans text-xs text-baby-text/50 hover:text-baby-text/70 transition-colors">
                  Resultado listagem ({orderListResult.ok ? `✅ ${orderListResult.data?.orders?.length ?? 0} pedido(s)` : '❌ Erro'})
                </summary>
                <pre className="mt-2 bg-baby-cream rounded-xl p-3 font-mono text-[11px] text-baby-text/60 overflow-auto max-h-64 whitespace-pre-wrap">
                  {JSON.stringify(orderListResult, null, 2)}
                </pre>
              </details>
            )}
          </div>

          {/* Note */}
          <p className="font-sans text-xs text-baby-text/30 text-center mt-6 italic">
            Dev Tools — alterações persistem em localStorage. Use &ldquo;Reset catálogo&rdquo; para restaurar tudo.
          </p>

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
