import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCatalog } from '../context/CatalogContext';
import ProductCard from '../components/ProductCard';
import { focusRing } from '../lib/ui';
import { formatSizeGroupLabel } from '../utils/sizeFormat';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

/**
 * Build the list of exact-range options available for the selected sizeGroup.
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
  return [...rangeSet.values()].sort((a, b) => (a.minMonths ?? 999) - (b.minMonths ?? 999));
}

/** Group label shown as each section header */
const GROUP_LABELS = {
  'roupa': 'Roupas',
  'cal\u00e7ado': 'Cal\u00e7ados',
  'acess\u00f3rio': 'Acess\u00f3rios',
};

export default function AllProductsPage() {
  const { products, sizeGroups: SIZE_GROUPS } = useCatalog();
  const [activeSizeGroup, setActiveSizeGroup] = useState('');
  const [activeExactRange, setActiveExactRange] = useState('');

  /* Available exact ranges for selected group */
  const exactRanges = useMemo(
    () => (activeSizeGroup ? collectExactRanges(products, activeSizeGroup) : []),
    [activeSizeGroup, products],
  );

  /* Only show size-group chips that have at least one product */
  const availableGroups = useMemo(
    () => SIZE_GROUPS.filter((g) => products.some((p) => p.sizeGroup === g.value)),
    [products, SIZE_GROUPS],
  );

  /* Build filtered + alphabetically-sorted product list */
  const filtered = useMemo(() => {
    let list = [...products];

    if (activeSizeGroup) {
      list = list.filter((p) => p.sizeGroup === activeSizeGroup);
    }

    if (activeExactRange) {
      list = list.filter(
        (p) => p.sizeOptions?.some((o) => o.label === activeExactRange),
      );
    }

    // Sort alphabetically by name
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return list;
  }, [activeSizeGroup, activeExactRange, products]);

  /* Group products by sizeGroup, preserving SIZE_GROUPS order */
  const grouped = useMemo(() => {
    const groups = [];
    for (const sg of SIZE_GROUPS) {
      const items = filtered.filter((p) => p.sizeGroup === sg.value);
      if (items.length > 0) {
        groups.push({ key: sg.value, label: sg.label || GROUP_LABELS[sg.value] || sg.value, items });
      }
    }
    return groups;
  }, [filtered, SIZE_GROUPS]);

  const handleGroupClick = (value) => {
    if (activeSizeGroup === value) {
      setActiveSizeGroup('');
      setActiveExactRange('');
    } else {
      setActiveSizeGroup(value);
      setActiveExactRange('');
    }
  };

  const totalCount = filtered.length;

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
            <li className="text-baby-text font-medium">Todos os Produtos</li>
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
            Todos os Produtos
          </h1>
          <p className="font-sans text-baby-text/60 text-lg max-w-2xl mx-auto">
            Explore toda a nossa coleção, organizada por faixa etária.
          </p>
        </motion.div>

        {/* ── Filters ── */}
        <div className="mb-10 space-y-4">
          {/* Size-group chips */}
          <fieldset className="flex flex-wrap items-center gap-2" aria-label="Filtrar por faixa etária">
            <span className="font-sans text-sm text-baby-text/60 mr-1">Categoria:</span>
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
                  {g.label || formatSizeGroupLabel(g.value)}
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

          {/* Exact-range dropdown */}
          {activeSizeGroup && exactRanges.length > 1 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="exact-range-all"
                className="font-sans text-sm text-baby-text/60 whitespace-nowrap"
              >
                Tamanho exato:
              </label>
              <select
                id="exact-range-all"
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
        <p className="font-sans text-baby-text/40 text-sm mb-8 text-center">
          {totalCount} {totalCount === 1 ? 'produto' : 'produtos'}
        </p>

        {/* Grouped sections */}
        {grouped.length > 0 ? (
          <div className="space-y-14">
            {grouped.map((group) => (
              <div key={group.key}>
                {/* Section heading */}
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="font-serif text-2xl sm:text-3xl text-baby-text whitespace-nowrap">
                    {group.label}
                  </h2>
                  <div className="flex-1 h-px bg-baby-pink" />
                  <span className="font-sans text-sm text-baby-text/40 whitespace-nowrap">
                    {group.items.length} {group.items.length === 1 ? 'produto' : 'produtos'}
                  </span>
                </div>

                {/* Product grid */}
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6"
                >
                  {group.items.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </motion.div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="font-sans text-baby-text/50 text-lg mb-6">
              Nenhum produto encontrado com esses filtros.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveSizeGroup('');
                setActiveExactRange('');
              }}
              className={`px-6 py-3 rounded-full font-sans text-sm border border-baby-text/20
                         text-baby-text hover:border-baby-accent hover:text-baby-accent
                         transition-colors ${focusRing}`}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
