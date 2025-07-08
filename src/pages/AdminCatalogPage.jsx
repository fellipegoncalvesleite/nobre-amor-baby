/**
 * AdminCatalogPage — tabbed view for Produtos / Coleções / Página Inicial.
 *
 * Route: /admin/catalogo  (ProtectedRoute role="manager")
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiShoppingBag, FiFolder, FiHome } from 'react-icons/fi';
import { focusRing, btnSecondary } from '../lib/ui';
import AdminProductsPage from './AdminProductsPage';
import AdminCollectionsPage from './AdminCollectionsPage';
import AdminHomePage from './AdminHomePage';

const TABS = [
  { key: 'produtos', label: 'Produtos', Icon: FiShoppingBag },
  { key: 'colecoes', label: 'Coleções', Icon: FiFolder },
  { key: 'inicio', label: 'Página Inicial', Icon: FiHome },
];

export default function AdminCatalogPage() {
  const [activeTab, setActiveTab] = useState('produtos');

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-baby-accent transition-colors">Início</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Catálogo</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
              <FiShoppingBag className="text-baby-accent" size={22} />
            </div>
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">
                Catálogo
              </h1>
              <p className="font-sans text-sm text-baby-accent">
                Gerencie produtos, coleções e página inicial
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-surface rounded-xl p-1 shadow-soft mb-6 overflow-x-auto">
            {TABS.map((tab) => {
              const TabIcon = tab.Icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-sans text-sm
                             whitespace-nowrap transition-all ${focusRing}
                             ${activeTab === tab.key
                               ? 'bg-baby-pink/50 text-baby-text font-semibold shadow-sm'
                               : 'text-baby-text/50 hover:text-baby-text hover:bg-baby-pink/20'}`}
                >
                  <TabIcon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content — render inline without section wrapper */}
          <div>
            {activeTab === 'produtos' && <AdminProductsContent />}
            {activeTab === 'colecoes' && <AdminCollectionsContent />}
            {activeTab === 'inicio' && <AdminHomeContent />}
          </div>

          {/* Back links */}
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/admin" className={btnSecondary}>
              Painel do Gerente
            </Link>
            <Link to="/" className={btnSecondary}>
              Voltar ao início
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Wrapper components that render the existing pages as embedded content.
 * They pass embedded=true so the child pages skip their own section wrapper,
 * breadcrumb, and back links.
 */
function AdminProductsContent() {
  return <AdminProductsPage embedded />;
}

function AdminCollectionsContent() {
  return <AdminCollectionsPage embedded />;
}

function AdminHomeContent() {
  return <AdminHomePage embedded />;
}
