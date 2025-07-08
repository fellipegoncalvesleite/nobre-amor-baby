/**
 * AdminDashboardPage — manager dashboard with 2 cards: Pedidos & Catálogo.
 *
 * Route: /admin  (ProtectedRoute role="manager")
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiSettings, FiPackage, FiShoppingBag, FiMail } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { focusRing, btnSecondary } from '../lib/ui';

export default function AdminDashboardPage() {
  const { user } = useAuth();

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-baby-accent transition-colors">Início</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Painel</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
              <FiSettings className="text-baby-accent" size={22} />
            </div>
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">
                Painel do Gerente
              </h1>
              {user && (
                <p className="font-sans text-sm text-baby-accent">
                  {user.name} ({user.role})
                </p>
              )}
            </div>
          </div>

          {/* Dashboard cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Pedidos */}
            <Link
              to="/admin/pedidos"
              className={`bg-surface rounded-2xl p-8 shadow-soft hover:ring-2 hover:ring-baby-accent
                         transition-all group flex flex-col items-center text-center ${focusRing}`}
            >
              <FiPackage className="text-baby-accent mb-4" size={48} />
              <p className="font-serif text-xl text-baby-text group-hover:text-baby-accent transition-colors">
                Pedidos
              </p>
              <p className="font-sans text-sm text-baby-text/50 mt-2 leading-relaxed">
                Ver, confirmar ou rejeitar pedidos dos clientes
              </p>
            </Link>

            {/* Catálogo */}
            <Link
              to="/admin/catalogo"
              className={`bg-surface rounded-2xl p-8 shadow-soft hover:ring-2 hover:ring-baby-accent
                         transition-all group flex flex-col items-center text-center ${focusRing}`}
            >
              <FiShoppingBag className="text-baby-accent mb-4" size={48} />
              <p className="font-serif text-xl text-baby-text group-hover:text-baby-accent transition-colors">
                Catálogo
              </p>
              <p className="font-sans text-sm text-baby-text/50 mt-2 leading-relaxed">
                Produtos, coleções e configurações da página inicial
              </p>
            </Link>

            {/* Newsletter */}
            <Link
              to="/admin/newsletter"
              className={`bg-surface rounded-2xl p-8 shadow-soft hover:ring-2 hover:ring-baby-accent
                         transition-all group flex flex-col items-center text-center ${focusRing}`}
            >
              <FiMail className="text-baby-accent mb-4" size={48} />
              <p className="font-serif text-xl text-baby-text group-hover:text-baby-accent transition-colors">
                Newsletter
              </p>
              <p className="font-sans text-sm text-baby-text/50 mt-2 leading-relaxed">
                Ver e exportar os inscritos na lista de e-mails
              </p>
            </Link>
          </div>

          {/* Back link */}
          <div className="mt-10 text-center">
            <Link to="/" className={btnSecondary}>
              Voltar ao início
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
