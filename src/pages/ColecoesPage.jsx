import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';
import { useCatalog } from '../context/CatalogContext';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

export default function ColecoesPage() {
  const { collections } = useCatalog();
  const categories = collections.filter((c) => c.is_active !== false);

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Coleções</li>
          </ol>
        </nav>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-baby-text mb-3">
            Nossas Coleções
          </h1>
          <p className="font-sans text-baby-text/60 text-lg max-w-2xl mx-auto">
            Navegue por faixa etária e encontre as peças perfeitas para o seu pequeno.
          </p>
        </motion.div>

        {/* Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6"
        >
          {categories.map((cat) => (
            <motion.div key={cat.id} variants={itemVariants}>
              <Link
                to={`/colecoes/${cat.slug}`}
                className="group relative aspect-3/4 rounded-2xl overflow-hidden shadow-soft
                           hover:shadow-soft-lg active:scale-[0.98] transition-all duration-300 block
                           focus:outline-none focus:ring-2 focus:ring-baby-accent focus:ring-offset-2"
                aria-label={`Ver coleção ${cat.name}`}
              >
                <img
                  src={cat.image}
                  alt={`Coleção ${cat.name}`}
                  className="absolute inset-0 w-full h-full object-cover
                             group-hover:scale-110 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-linear-to-t from-baby-text/80 dark:from-black/80 via-baby-text/20 dark:via-black/20 to-transparent" />
                <div className="absolute inset-0 p-4 sm:p-6 flex flex-col justify-end">
                  <h2 className="font-serif text-white text-lg lg:text-2xl mb-1">{cat.name}</h2>
                  <p className="font-sans text-white/80 text-xs lg:text-sm mb-3">{cat.description}</p>
                  <span className="inline-flex items-center gap-1 text-white/90 font-sans text-xs group-hover:text-white transition-colors">
                    Ver Coleção
                    <FiArrowRight className="group-hover:translate-x-1 transition-transform" size={14} />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
