import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiTrash2, FiMinus, FiPlus, FiShoppingBag, FiAlertTriangle } from 'react-icons/fi';
import { useCatalog } from '../context/CatalogContext';
import { useStore } from '../context/StoreContext';
import { formatPrice, focusRing, btnPrimary, btnSecondary } from '../lib/ui';
import ShippingSelector from '../components/ShippingSelector';
import { STORE_DISABLED } from '../config/storeStatus';

export default function CartPage() {
  const { products } = useCatalog();
  const { cart, removeFromCart, setCartQty, cartCount, shipping } = useStore();
  const navigate = useNavigate();

  // Resolve product data for each cart item
  const items = cart
    .map((ci) => {
      const product = products.find((p) => p.id === ci.id);
      return product ? { ...ci, product } : null;
    })
    .filter(Boolean);

  const hasOOS = items.some((i) => i.product.inStock === false);
  const hasOverStock = items.some((i) => i.product.stockCount != null && i.qty > i.product.stockCount && i.product.stockCount > 0);
  const hasIssues = hasOOS || hasOverStock;
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);

  const handleRemoveOOS = () => {
    for (const item of items) {
      if (item.product.inStock === false) {
        removeFromCart(item.id, item.size);
      }
    }
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Carrinho</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-baby-text mb-2 text-center">
            Seu Carrinho
          </h1>
          <p className="font-sans text-baby-text/50 text-center mb-10">
            {cartCount === 0
              ? 'Seu carrinho está vazio.'
              : `${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`}
          </p>
        </motion.div>

        {items.length > 0 ? (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Cart items */}
            <div className="lg:col-span-2 space-y-4">
              {/* OOS / stock warning banner */}
              {hasOOS && (
                <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
                  <FiAlertTriangle className="text-amber-500 shrink-0" size={18} />
                  <p className="font-sans text-sm text-amber-700 dark:text-amber-300 flex-1">
                    Alguns itens estão esgotados. Remova-os para finalizar o pedido.
                  </p>
                  <button
                    type="button"
                    onClick={handleRemoveOOS}
                    className="font-sans text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline shrink-0"
                  >
                    Remover esgotados
                  </button>
                </div>
              )}
              {hasOverStock && (
                <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
                  <FiAlertTriangle className="text-amber-500 shrink-0" size={18} />
                  <p className="font-sans text-sm text-amber-700 dark:text-amber-300 flex-1">
                    Alguns itens excedem o estoque disponível. Ajuste a quantidade.
                  </p>
                </div>
              )}

              {items.map((item) => {
                const oos = item.product.inStock === false;
                const sc = item.product.stockCount ?? 99;
                const overStock = !oos && item.qty > sc;
                return (
                <motion.div
                  key={`${item.id}-${item.size}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-4 bg-surface rounded-2xl p-4 shadow-soft${oos ? ' ring-2 ring-amber-300 dark:ring-amber-600' : ''}${overStock ? ' ring-2 ring-amber-300 dark:ring-amber-600' : ''}`}
                >
                  {/* Thumbnail */}
                  <Link
                    to={`/produto/${item.id}`}
                    className="shrink-0 w-24 h-28 sm:w-28 sm:h-32 rounded-xl overflow-hidden"
                  >
                    <img
                      src={item.product.images[0]}
                      alt={item.product.name}
                      className={`w-full h-full object-cover${oos ? ' grayscale opacity-60' : ''}`}
                    />
                  </Link>

                  {/* Details */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <Link
                      to={`/produto/${item.id}`}
                      className="font-serif text-baby-text text-base lg:text-lg line-clamp-1 hover:text-baby-accent transition-colors"
                    >
                      {item.product.name}
                    </Link>
                    <p className="font-sans text-baby-text/50 text-sm mt-0.5">
                      Tamanho: {item.size}
                    </p>
                    {oos && (
                      <p className="font-sans text-amber-600 dark:text-amber-400 text-xs font-medium mt-1">
                        Esgotado
                      </p>
                    )}
                    {overStock && (
                      <p className="font-sans text-amber-600 dark:text-amber-400 text-xs font-medium mt-1">
                        Estoque: {sc} — ajuste a quantidade
                      </p>
                    )}

                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      {/* Qty controls */}
                      <div className="inline-flex items-center border border-baby-text/15 rounded-full">
                        <button
                          type="button"
                          onClick={() => setCartQty(item.id, item.size, item.qty - 1)}
                          className={`p-2 min-w-9 min-h-9 flex items-center justify-center rounded-l-full
                                      hover:bg-baby-pink/30 transition-colors ${focusRing}`}
                          aria-label="Diminuir quantidade"
                        >
                          <FiMinus size={14} />
                        </button>
                        <span className="px-3 font-sans text-sm text-baby-text font-medium text-center min-w-8">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCartQty(item.id, item.size, Math.min(item.qty + 1, sc))}
                          disabled={oos || item.qty >= sc}
                          className={`p-2 min-w-9 min-h-9 flex items-center justify-center rounded-r-full
                                      hover:bg-baby-pink/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${focusRing}`}
                          aria-label="Aumentar quantidade"
                        >
                          <FiPlus size={14} />
                        </button>
                      </div>

                      <p className={`font-sans font-semibold text-sm sm:text-base ${oos ? 'text-baby-text/40 line-through' : 'text-baby-accent'}`}>
                        {formatPrice(item.product.price * item.qty)}
                      </p>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id, item.size)}
                        className={`p-2 min-w-9 min-h-9 flex items-center justify-center rounded-full
                                    text-baby-text/40 hover:text-red-500 hover:bg-red-50
                                    transition-colors ${focusRing}`}
                        aria-label={`Remover ${item.product.name} do carrinho`}
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
                );
              })}
            </div>

            {/* Summary sidebar */}
            <div className="lg:col-span-1 space-y-4">
              {/* Shipping selector */}
              <div className="bg-surface rounded-2xl p-5 shadow-soft">
                <ShippingSelector />
              </div>

              {/* Order summary */}
              <div className="bg-surface rounded-2xl p-6 shadow-soft sticky top-24">
                <h2 className="font-serif text-xl text-baby-text mb-6">Resumo do Pedido</h2>

                <div className="space-y-3 mb-6 font-sans text-sm">
                  <div className="flex justify-between text-baby-text/60">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-baby-text/60">
                    <span>Frete</span>
                    <span>
                      {shipping.isLoading
                        ? 'Calculando…'
                        : shipping.feeCents != null
                          ? formatPrice(shipping.feeCents / 100)
                          : '—'}
                    </span>
                  </div>
                  {shipping.etaText && !shipping.isLoading && (
                    <div className="flex justify-between text-baby-text/40 text-xs">
                      <span>Prazo</span>
                      <span>{shipping.etaText}</span>
                    </div>
                  )}
                  <hr className="border-baby-pink" />
                  <div className="flex justify-between font-semibold text-baby-text text-base">
                    <span>Total</span>
                    <span className="text-baby-accent">
                      {formatPrice(subtotal + ((shipping.feeCents ?? 0) / 100))}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { if (!STORE_DISABLED) navigate('/checkout'); }}
                  disabled={hasIssues || STORE_DISABLED}
                  className={`${btnPrimary} w-full ${(hasIssues || STORE_DISABLED) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <FiShoppingBag size={20} />
                  {STORE_DISABLED ? 'Compras indisponíveis' : 'Finalizar Pedido'}
                </button>
                {STORE_DISABLED ? (
                  <p className="font-sans text-xs text-amber-600 dark:text-amber-400 text-center mt-2">
                    Não estamos aceitando novos pedidos no momento.
                  </p>
                ) : hasIssues && (
                  <p className="font-sans text-xs text-amber-600 dark:text-amber-400 text-center mt-2">
                    {hasOOS ? 'Remova os itens esgotados para continuar.' : 'Ajuste as quantidades para continuar.'}
                  </p>
                )}
                <Link to="/" className={`${btnSecondary} w-full mt-3`}>
                  Continuar Comprando
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <FiShoppingBag size={48} className="mx-auto text-baby-text/20 mb-6" />
            <Link to="/" className={btnPrimary}>
              Explorar Produtos
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
