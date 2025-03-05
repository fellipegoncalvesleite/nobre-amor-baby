import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiHeart } from 'react-icons/fi';
import { useCatalog } from '../context/CatalogContext';
import { useStore } from '../context/StoreContext';
import ProductCard from '../components/ProductCard';
import { btnPrimary } from '../lib/ui';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

export default function WishlistPage() {
  const { products } = useCatalog();
  const { wishlist } = useStore();
  const items = products.filter((p) => wishlist.includes(p.id));

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Favoritos</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-baby-text mb-3 flex items-center justify-center gap-3">
            <FiHeart className="text-red-400" />
            Favoritos
          </h1>
          <p className="font-sans text-baby-text/60 text-lg">
            {items.length === 0
              ? 'Sua lista de favoritos está vazia.'
              : `${items.length} ${items.length === 1 ? 'item' : 'itens'} salvos`}
          </p>
        </motion.div>

        {items.length > 0 ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6"
          >
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </motion.div>
        ) : (
          <div className="text-center py-12">
            <Link to="/" className={btnPrimary}>
              Explorar Produtos
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
