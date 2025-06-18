import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiHeart, FiShoppingBag, FiArrowRight } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useStore } from '../context/StoreContext';
import { formatPrice, focusRing } from '../lib/ui';
import { formatAgeRange, formatSizeGroupLabel } from '../utils/sizeFormat';

const tagColors = {
  'Mais Vendido': 'bg-baby-text/90 text-white dark:text-baby-cream',
  'Novo': 'bg-[#624C73] text-white',
  'Popular': 'bg-baby-accent text-white dark:text-baby-cream',
  'Esgotado': 'bg-baby-text/50 text-white',
};

const defaultTagColor = 'bg-baby-accent text-white dark:text-baby-cream';

const itemVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

export default function ProductCard({ product }) {
  const { toggleWishlist, isInWishlist, addToCart } = useStore();
  const wishlisted = isInWishlist(product.id);
  const outOfStock = product.inStock === false;

  /* Effective tag: manual tag takes priority, otherwise auto "Novo" when within
     the new-product window (computed upstream in CatalogContext). */
  const effectiveTag = product.tag || (product.isNew ? 'Novo' : null);

  const handleFavorite = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product.id);
    toast(
      wishlisted
        ? `"${product.name}" removido dos favoritos`
        : `"${product.name}" adicionado aos favoritos`,
      {
        style: {
          background: '#F0DAE8',
          color: '#373438',
          borderRadius: '12px',
        },
      }
    );
  };

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    if (product.stockCount != null && product.stockCount <= 0) return;
    const defaultSize = product.sizeOptions?.[0]?.label ?? product.sizes?.[0] ?? '';
    addToCart(product.id, defaultSize);
    toast(`"${product.name}" adicionado ao carrinho`, {
      style: {
        background: '#F0DAE8',
        color: '#373438',
        borderRadius: '12px',
      },
    });
  };

  return (
    <motion.article variants={itemVariants} className="group">
      <div className="w-full bg-surface rounded-2xl overflow-hidden shadow-soft hover:shadow-soft-lg active:shadow-soft transition-all duration-300">
        {/* Image — links to PDP */}
        <Link
          to={`/produto/${product.id}`}
          className={`relative aspect-3/4 w-full overflow-hidden block ${focusRing} rounded-t-2xl`}
          aria-label={`${product.name} — ${formatPrice(product.price)}`}
        >
          <img
            src={product.images[0]}
            alt={product.description}
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500${outOfStock ? ' grayscale opacity-60' : ''}`}
            loading="lazy"
          />

          {/* Badges — stacked on the left so they never overlap each other
              or the right-side quick actions on narrow mobile cards. */}
          {(outOfStock || effectiveTag || (product.oldPrice && !outOfStock)) && (
            <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5 max-w-[calc(100%-3.75rem)]">
              {(outOfStock || effectiveTag) && (
                <span
                  className={`px-2.5 py-1 rounded-full font-sans text-[11px] sm:text-xs font-medium shadow-soft whitespace-nowrap ${outOfStock ? tagColors['Esgotado'] : (tagColors[effectiveTag] || defaultTagColor)}`}
                >
                  {outOfStock ? 'Esgotado' : effectiveTag}
                </span>
              )}
              {product.oldPrice && !outOfStock && (
                <span className="bg-[#8E5A73] text-white px-2 py-0.5 rounded-full font-sans text-[10px] sm:text-[11px] font-semibold shadow-soft whitespace-nowrap">
                  {Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}% OFF
                </span>
              )}
            </div>
          )}

          {/* Quick actions */}
          <div
            className="absolute top-3 right-3 flex flex-col gap-2
                       opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                       translate-x-0 sm:translate-x-4 sm:group-hover:translate-x-0
                       transition-all duration-300"
          >
            <button
              type="button"
              onClick={handleFavorite}
              className={`p-2.5 min-w-11 min-h-11 flex items-center justify-center
                         bg-surface/90 backdrop-blur-sm rounded-full
                         ${wishlisted ? 'text-red-500' : 'text-baby-text'} hover:text-red-500 hover:bg-surface
                         active:scale-90 transition-all shadow-soft
                         focus:outline-none focus:ring-2 focus:ring-baby-accent`}
              aria-label={wishlisted ? `Remover ${product.name} dos favoritos` : `Adicionar ${product.name} aos favoritos`}
            >
              <FiHeart size={18} fill={wishlisted ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={outOfStock}
              className={`p-2.5 min-w-11 min-h-11 flex items-center justify-center
                         bg-surface/90 backdrop-blur-sm rounded-full
                         ${outOfStock ? 'text-baby-text/30 cursor-not-allowed' : 'text-baby-text hover:text-baby-accent hover:bg-surface active:scale-90'}
                         transition-all shadow-soft
                         focus:outline-none focus:ring-2 focus:ring-baby-accent`}
              aria-label={outOfStock ? `${product.name} esgotado` : `Adicionar ${product.name} ao carrinho`}
            >
              <FiShoppingBag size={18} />
            </button>
          </div>

          {/* Overlay label */}
          <div
            className="absolute inset-x-0 bottom-0 bg-linear-to-t from-baby-text/60 dark:from-black/60 to-transparent p-4
                       opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                       translate-y-0 sm:translate-y-4 sm:group-hover:translate-y-0
                       transition-all duration-300 pointer-events-none"
            aria-hidden="true"
          >
            <span className="inline-flex items-center gap-2 text-white font-sans text-sm">
              Ver Detalhes <FiArrowRight size={16} />
            </span>
          </div>
        </Link>

        {/* Product info */}
        <div className="p-4">
          <h3 className="font-serif text-baby-text text-base lg:text-lg line-clamp-1 mb-1 group-hover:text-baby-accent transition-colors">
            {product.name}
          </h3>

          {/* Age range + size-group chip */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {product.ageMinMonths != null && product.ageMaxMonths != null && (
              <span className="font-sans text-baby-text/55 text-xs leading-tight">
                Idade recomendada: {formatAgeRange(product.ageMinMonths, product.ageMaxMonths)}
              </span>
            )}
            {product.sizeGroup && (
              <span className="inline-block px-2 py-0.5 rounded-full bg-baby-pink/40 text-baby-text/70 font-sans text-[10px] font-semibold leading-none whitespace-nowrap">
                {formatSizeGroupLabel(product.sizeGroup)}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <p className="font-sans text-baby-accent font-semibold">
                {formatPrice(product.price)}
              </p>
              {product.oldPrice && (
                <p className="font-sans text-baby-text/40 text-sm line-through">
                  {formatPrice(product.oldPrice)}
                </p>
              )}
            </div>
            {outOfStock ? (
              <span className="text-xs font-sans font-medium text-gray-400">Esgotado</span>
            ) : (
              <Link
                to={`/produto/${product.id}`}
                className="text-xs font-sans font-medium text-baby-text/70
                           hover:text-baby-accent active:text-baby-text
                           underline underline-offset-2 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-baby-accent rounded"
              >
                Comprar
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
