import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SIZE_GROUPS } from '../data/products';
import { useCatalog } from '../context/CatalogContext';
import { getCategoryBySlug } from '../data/categories';
import ProductCard from '../components/ProductCard';
import { btnSecondary, focusRing } from '../lib/ui';
import { formatSizeGroupLabel } from '../utils/sizeFormat';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const pageMeta = {
  new: { title: 'Novidades', subtitle: 'Os lançamentos mais recentes da nossa coleção.' },
  promo: { title: 'Promoções', subtitle: 'Ofertas especiais para vestir seu pequeno com carinho.' },
  category: { title: '', subtitle: '' },
};

/**
 * Build the list of exact-range options available for the selected sizeGroup
 * by scanning the products that match the current base filter.
 */
function collectExactRanges(productList, groupValue) {
  const rangeSet = new Map();
  for (const p of productList) {
    if (p.sizeGroup !== groupValue || !p.sizeOptions) continue;
    for (const opt of p.sizeOptions) {
      if (!rangeSet.has(opt.label)) {
        rangeSet.set(opt.label, { label: opt.label, minMonths: opt.minMonths, maxMonths: opt.maxMonths });
      }
    }
  }
  // sort by minMonths
  return [...rangeSet.values()].sort((a, b) => a.minMonths - b.minMonths);
}

export default function ProductListingPage({ filter }) {
  const { products } = useCatalog();
  const { slug } = useParams();
  const category = filter === 'category' ? getCategoryBySlug(slug) : null;

  // Filter state
  const [activeSizeGroup, setActiveSizeGroup] = useState('');
  const [activeExactRange, setActiveExactRange] = useState('');

  /* Base filter (page-level) */
  const baseFiltered = useMemo(() => {
    switch (filter) {
      case 'new':
        return products.filter((p) => p.isNew);
      case 'promo':
        return products.filter((p) => p.isPromo);
      case 'category':
        return products.filter((p) => p.category === slug);
      default:
        return products;
    }
  }, [filter, slug, products]);

  /* Only show size-group chips that have at least one product in the base set */
  const availableGroups = useMemo(
    () => SIZE_GROUPS.filter((g) => baseFiltered.some((p) => p.sizeGroup === g.value)),
    [baseFiltered],
  );

  /* Available exact ranges for selected group */
  const exactRanges = useMemo(
    () => (activeSizeGroup ? collectExactRanges(baseFiltered, activeSizeGroup) : []),
    [baseFiltered, activeSizeGroup],
  );

  /* Final filtered list */
  const filtered = useMemo(() => {
    let list = baseFiltered;

    if (activeSizeGroup) {
      list = list.filter((p) => p.sizeGroup === activeSizeGroup);
    }

    if (activeExactRange) {
      list = list.filter(
        (p) => p.sizeOptions?.some((o) => o.label === activeExactRange),
      );
    }

    return list;
  }, [baseFiltered, activeSizeGroup, activeExactRange]);

  const title =
    filter === 'category'
      ? (category?.name ?? 'Coleção')
      : pageMeta[filter]?.title ?? 'Produtos';

  const subtitle =
    filter === 'category'
      ? (category?.description ?? '')
      : pageMeta[filter]?.subtitle ?? '';

  const handleGroupClick = (value) => {
    if (activeSizeGroup === value) {
      setActiveSizeGroup('');
      setActiveExactRange('');
    } else {
      setActiveSizeGroup(value);
      setActiveExactRange('');
    }
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          className="mb-6 font-sans text-sm text-baby-text/60"
          aria-label="Navegação de caminho"
        >
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-baby-accent transition-colors">
                Início
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            {filter === 'category' && (
              <>
                <li>
                  <Link to="/colecoes" className="hover:text-baby-accent transition-colors">
                    Coleções
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
              </>
            )}
            <li className="text-baby-text font-medium">{title}</li>
          </ol>
        </nav>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-baby-text mb-3">
            {title}
          </h1>
          {subtitle && (
            <p className="font-sans text-baby-text/60 text-lg max-w-2xl mx-auto">
              {subtitle}
            </p>
          )}
        </motion.div>

        {/* ── Filters ── */}
        <div className="mb-10 space-y-4">
          {/* Size-group chips */}
          <fieldset className="flex flex-wrap items-center gap-2" aria-label="Filtrar por faixa etária">
            <span className="font-sans text-sm text-baby-text/60 mr-1">Faixa etária:</span>
            {availableGroups.map((g) => {
              const isActive = activeSizeGroup === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => handleGroupClick(g.value)}
                  className={`px-4 py-2 min-h-10 rounded-full font-sans text-sm font-medium
                              border transition-all duration-200
                              ${
                                isActive
                                  ? 'border-baby-text bg-baby-text text-white dark:text-baby-cream'
                                  : 'border-baby-text/20 text-baby-text hover:border-baby-accent hover:text-baby-accent'
                              }
                              ${focusRing}`}
                  aria-pressed={isActive}
                >
                  {formatSizeGroupLabel(g.value)}
                </button>
              );
            })}
            {activeSizeGroup && (
              <button
                type="button"
                onClick={() => {
                  setActiveSizeGroup('');
                  setActiveExactRange('');
                }}
                className="px-3 py-2 min-h-10 font-sans text-xs text-baby-text/50
                           hover:text-baby-text transition-colors"
              >
                Limpar
              </button>
            )}
          </fieldset>

          {/* Exact-range dropdown (visible only when a group is selected) */}
          {activeSizeGroup && exactRanges.length > 1 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="exact-range"
                className="font-sans text-sm text-baby-text/60 whitespace-nowrap"
              >
                Tamanho exato:
              </label>
              <select
                id="exact-range"
                value={activeExactRange}
                onChange={(e) => setActiveExactRange(e.target.value)}
                className={`px-4 py-2 min-h-10 rounded-full border border-baby-text/20
                           bg-surface text-baby-text font-sans text-sm
                           hover:border-baby-accent transition-colors
                           ${focusRing}`}
              >
                <option value="">Todos</option>
                {exactRanges.map((r) => (
                  <option key={r.label} value={r.label}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Count */}
        <p className="font-sans text-baby-text/40 text-sm mb-6 text-center">
          {filtered.length} {filtered.length === 1 ? 'produto' : 'produtos'}
        </p>

        {/* Grid */}
        {filtered.length > 0 ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6"
          >
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </motion.div>
        ) : (
          <div className="text-center py-20">
            <p className="font-sans text-baby-text/50 text-lg mb-6">
              Nenhum produto encontrado com esses filtros.
            </p>
            <Link to="/" className={btnSecondary}>
              Ver todos os produtos
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
