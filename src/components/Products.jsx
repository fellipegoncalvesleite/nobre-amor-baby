import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';
import { useCatalog } from '../context/CatalogContext';
import ProductCard from './ProductCard';

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function Products() {
  const { products } = useCatalog();
  /* Show up to 8 featured products on the home page */
  const featured = products.slice(0, 8);

  return (
    <section id="produtos" className="py-20 lg:py-28 bg-baby-cream" aria-label="Produtos em destaque">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-12"
        >
          <div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-baby-text mb-2">
              Produtos em Destaque
            </h2>
            <p className="font-sans text-baby-text/60 text-lg">
              Peças selecionadas com muito carinho para o seu bebê
            </p>
          </div>

          <Link
            to="/novidades"
            className="inline-flex items-center gap-2 font-sans text-baby-accent
                       font-medium shrink-0 hover:gap-3 transition-all duration-200
                       focus:outline-none focus:ring-2 focus:ring-baby-accent rounded"
          >
            Ver Todos <FiArrowRight size={16} />
          </Link>
        </motion.div>

        {/* Product grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6"
        >
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </motion.div>

        {/* Bottom CTA */}
        <div className="text-center mt-14">
          <Link
            to="/novidades"
            className="inline-flex items-center gap-2 bg-baby-text text-white dark:text-baby-cream
                       px-8 py-4 rounded-full font-sans font-medium text-lg
                       shadow-soft-lg hover:shadow-xl hover:-translate-y-0.5
                       active:scale-[0.97] transition-all duration-300
                       focus:outline-none focus:ring-2 focus:ring-baby-accent
                       focus:ring-offset-2"
          >
            Explorar Toda a Coleção
            <FiArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}
