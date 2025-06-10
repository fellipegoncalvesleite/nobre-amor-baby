import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiHeart,
  FiShoppingBag,
  FiChevronLeft,
  FiMinus,
  FiPlus,
  FiCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCatalog } from '../context/CatalogContext';
import { useStore } from '../context/StoreContext';
import { formatPrice, focusRing, btnPrimary, btnSecondary } from '../lib/ui';
import {
  formatAgeRange,
  formatAgeRangeWithYears,
  formatSizeGroupLabel,
} from '../utils/sizeFormat';

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getProductById } = useCatalog();
  const product = getProductById(id);
  const { addToCart, toggleWishlist, isInWishlist } = useStore();

  const defaultSizeLabel = product?.sizeOptions?.[0]?.label ?? product?.sizes?.[0] ?? '';
  const [selectedSize, setSelectedSize] = useState(defaultSizeLabel);
  const [qty, setQty] = useState(1);

  if (!product) {
    return (
      <section className="py-20 lg:py-28 bg-baby-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-serif text-3xl text-baby-text mb-4">Produto não encontrado</h1>
          <Link to="/" className={btnSecondary}>
            Voltar à loja
          </Link>
        </div>
      </section>
    );
  }

  const wishlisted = isInWishlist(product.id);
  const outOfStock = product.inStock === false;
  const stockCount = product.stockCount ?? 99;
  const hasSizeOptions = product.sizeOptions && product.sizeOptions.length > 0;
  const multipleSizes = hasSizeOptions && product.sizeOptions.length > 1;

  const handleAddToCart = () => {
    if (outOfStock || stockCount <= 0) return;
    const clampedQty = Math.min(qty, stockCount);
    if (clampedQty < qty) {
      toast(`Quantidade ajustada: estoque disponível ${stockCount}.`, {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
      });
    }
    addToCart(product.id, selectedSize, clampedQty);
    toast(`"${product.name}" adicionado ao carrinho`, {
      style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
    });
  };

  const handleBuyNow = () => {
    if (outOfStock || stockCount <= 0) return;
    const clampedQty = Math.min(qty, stockCount);
    addToCart(product.id, selectedSize, clampedQty);
    navigate('/carrinho');
  };

  const handleToggleWishlist = () => {
    toggleWishlist(product.id);
    toast(
      wishlisted
        ? `"${product.name}" removido dos favoritos`
        : `"${product.name}" adicionado aos favoritos`,
      { style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' } },
    );
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          className="mb-6 font-sans text-sm text-baby-text/60"
          aria-label="Navegação de caminho"
        >
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li>
              <Link to="/" className="hover:text-baby-accent transition-colors">
                Início
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/novidades" className="hover:text-baby-accent transition-colors">
                Produtos
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium truncate max-w-50">
              {product.name}
            </li>
          </ol>
        </nav>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="relative aspect-4/5 rounded-2xl overflow-hidden bg-surface shadow-soft-lg">
              <img
                src={product.images[0]}
                alt={product.description}
                className={`w-full h-full object-cover${outOfStock ? ' grayscale opacity-60' : ''}`}
              />
              {/* Tag — Esgotado overrides normal tag */}
              {(outOfStock || product.tag) && (
                <span className={`absolute top-4 left-4 px-4 py-1.5 rounded-full font-sans text-sm font-medium ${outOfStock ? 'bg-gray-500 text-white' : 'bg-baby-text/80 text-white dark:text-baby-cream'}`}>
                  {outOfStock ? 'Esgotado' : product.tag}
                </span>
              )}
              {product.oldPrice && (
                <span className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full font-sans text-sm font-semibold">
                  {Math.round(
                    ((product.oldPrice - product.price) / product.oldPrice) * 100,
                  )}
                  % OFF
                </span>
              )}
            </div>
          </motion.div>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col"
          >
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-baby-text mb-3">
              {product.name}
            </h1>

            <p className="font-sans text-baby-text/60 text-lg mb-6 leading-relaxed">
              {product.description}
            </p>

            {/* Price */}
            <div className="flex items-baseline gap-3 mb-6">
              <span className="font-sans text-3xl font-bold text-baby-accent">
                {formatPrice(product.price)}
              </span>
              {product.oldPrice && (
                <span className="font-sans text-lg text-baby-text/40 line-through">
                  {formatPrice(product.oldPrice)}
                </span>
              )}
            </div>

            {/* ── Idade recomendada ── */}
            {product.ageMinMonths != null && product.ageMaxMonths != null && (
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <div>
                  <p className="font-sans text-sm font-medium text-baby-text mb-1">
                    Idade recomendada
                  </p>
                  <p className="font-sans text-baby-accent text-base font-semibold">
                    {formatAgeRangeWithYears(product.ageMinMonths, product.ageMaxMonths)}
                  </p>
                </div>
                {product.sizeGroup && (
                  <span className="self-end px-3 py-1 rounded-full bg-baby-pink/40 text-baby-text/70 font-sans text-xs font-semibold whitespace-nowrap">
                    {formatSizeGroupLabel(product.sizeGroup)}
                  </span>
                )}
              </div>
            )}

            {/* ── Size selector ── */}
            {hasSizeOptions && (
              <div className="mb-8">
                <p className="font-sans text-sm font-medium text-baby-text mb-3">
                  {multipleSizes ? 'Tamanho' : `Tamanho: ${selectedSize}`}
                </p>

                {multipleSizes ? (
                  <fieldset className="flex flex-wrap gap-2" aria-label="Selecionar tamanho">
                    <legend className="sr-only">Selecionar tamanho</legend>
                    {product.sizeOptions.map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        aria-pressed={selectedSize === opt.label}
                        onClick={() => setSelectedSize(opt.label)}
                        className={`min-w-12 min-h-11 px-4 py-2 rounded-full font-sans text-sm font-medium
                                    border-2 transition-all duration-200
                                    ${
                                      selectedSize === opt.label
                                        ? 'border-baby-text bg-baby-text text-white dark:text-baby-cream'
                                        : 'border-baby-text/20 text-baby-text hover:border-baby-accent hover:text-baby-accent'
                                    }
                                    ${focusRing}`}
                      >
                        {opt.label}
                        <span className="sr-only">
                          {' '}
                          ({formatAgeRange(opt.minMonths, opt.maxMonths)})
                        </span>
                      </button>
                    ))}
                  </fieldset>
                ) : null}
              </div>
            )}

            {/* Qty picker */}
            <div className="mb-8">
              <p className="font-sans text-sm font-medium text-baby-text mb-3">
                Quantidade
                {!outOfStock && stockCount < 10 && (
                  <span className="text-amber-500 font-normal ml-2">
                    ({stockCount} disponíve{stockCount === 1 ? 'l' : 'is'})
                  </span>
                )}
              </p>
              <div className="inline-flex items-center border-2 border-baby-text/20 rounded-full">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className={`p-3 min-w-11 min-h-11 flex items-center justify-center rounded-l-full
                              hover:bg-baby-pink/30 transition-colors ${focusRing}`}
                  aria-label="Diminuir quantidade"
                >
                  <FiMinus size={16} />
                </button>
                <span className="px-5 font-sans text-baby-text font-medium min-w-12 text-center">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => outOfStock ? q : Math.min(q + 1, stockCount))}
                  disabled={outOfStock || qty >= stockCount}
                  className={`p-3 min-w-11 min-h-11 flex items-center justify-center rounded-r-full
                              hover:bg-baby-pink/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${focusRing}`}
                  aria-label="Aumentar quantidade"
                >
                  <FiPlus size={16} />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              {outOfStock ? (
                <p className="font-sans text-gray-500 font-semibold text-lg py-3">
                  Produto esgotado
                </p>
              ) : (
                <>
                  <button type="button" onClick={handleAddToCart} className={btnPrimary}>
                    <FiShoppingBag size={20} />
                    Adicionar ao Carrinho
                  </button>
                  <button type="button" onClick={handleBuyNow} className={btnSecondary}>
                    Comprar Agora
                  </button>
                </>
              )}
            </div>

            {/* Wishlist toggle */}
            <button
              type="button"
              onClick={handleToggleWishlist}
              className={`inline-flex items-center gap-2 font-sans text-sm
                         ${wishlisted ? 'text-red-500' : 'text-baby-text/60'}
                         hover:text-red-500 transition-colors mb-10 ${focusRing} rounded w-fit`}
            >
              <FiHeart size={18} fill={wishlisted ? 'currentColor' : 'none'} />
              {wishlisted ? 'Nos seus favoritos' : 'Adicionar aos favoritos'}
            </button>

            {/* Product details */}
            {product.details && product.details.length > 0 && (
              <div className="border-t border-baby-pink pt-6">
                <h2 className="font-serif text-xl text-baby-text mb-4">Detalhes do Produto</h2>
                <ul className="space-y-2">
                  {product.details.map((detail) => (
                    <li
                      key={detail}
                      className="flex items-start gap-2 font-sans text-baby-text/70 text-sm"
                    >
                      <FiCheck size={16} className="text-green-500 mt-0.5 shrink-0" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Disclaimer */}
            <p className="mt-6 font-sans text-xs text-baby-text/40 italic">
              As idades são aproximadas e podem variar conforme o bebê e o caimento da peça.
            </p>

            {/* Back link */}
            <Link
              to="/"
              className="mt-8 inline-flex items-center gap-1 font-sans text-sm text-baby-text/50
                         hover:text-baby-accent transition-colors"
            >
              <FiChevronLeft size={16} /> Voltar à loja
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
