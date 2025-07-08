import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';
import { useCatalog } from '../context/CatalogContext';

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Categories() {
  const { collections, homeSettings } = useCatalog();
  const {
    collections_enabled: collectionsEnabled = true,
    collections_title: collectionsTitle = 'Nossas Coleções',
    collections_order: collectionsOrder = [],
  } = homeSettings || {};

  const categories = useMemo(() => {
    const active = collections.filter((c) => c.is_active !== false);
    if (!collectionsOrder.length) return active;
    const byId = new Map(active.map((c) => [String(c.id), c]));
    const picked = collectionsOrder
      .map((id) => byId.get(String(id)))
      .filter(Boolean);
    return picked.length ? picked : active;
  }, [collections, collectionsOrder]);

  if (!collectionsEnabled) return null;
  if (categories.length === 0) return null;

  return (
    <section id="colecoes" className="py-20 lg:py-28 bg-surface" aria-label="Coleções">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-baby-text mb-4">
            {collectionsTitle}
          </h2>
          <p className="font-sans text-baby-text/60 text-lg max-w-2xl mx-auto">
            Encontre peças encantadoras para cada fase do crescimento do seu bebê
          </p>
        </motion.div>

        {/* Category grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-6"
        >
          {categories.map((cat) => (
            <motion.div key={cat.id} variants={cardVariants}>
              <Link
                to={`/colecoes/${cat.slug}`}
                className="group block relative overflow-hidden rounded-2xl aspect-3/4
                           ring-1 ring-baby-pink/20
                           focus:outline-none focus:ring-2 focus:ring-baby-accent
                           focus:ring-offset-2"
              >
                <img
                  src={cat.image}
                  alt={`Coleção ${cat.name}`}
                  className="w-full h-full object-cover group-hover:scale-105
                             transition-transform duration-500"
                  loading="lazy"
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-linear-to-t from-baby-text/70 dark:from-black/70 via-baby-text/20 dark:via-black/20 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-4">
                  <p className="font-serif text-white text-base sm:text-lg leading-tight">
                    {cat.label}
                  </p>
                  <p className="font-sans text-white/70 text-xs mt-1">{cat.description}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* View All button */}
        <div className="text-center mt-12">
          <Link
            to="/colecoes"
            className="inline-flex items-center gap-2 bg-baby-cream text-baby-text
                       px-6 py-3 rounded-full font-sans font-medium
                       hover:bg-baby-pink-light active:scale-[0.97]
                       transition-all duration-200
                       focus:outline-none focus:ring-2 focus:ring-baby-accent
                       focus:ring-offset-2"
          >
            Ver Todas as Coleções
            <FiArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
