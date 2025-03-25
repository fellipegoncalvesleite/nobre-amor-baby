/**
 * AdminDashboardPage — manager dashboard with 2 cards: Pedidos & Catálogo.
 *
 * Route: /admin  (ProtectedRoute role="manager")
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiSettings, FiAlertTriangle } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { focusRing, btnSecondary } from '../lib/ui';

const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY || '';

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

          {/* Env var warning */}
          {!ADMIN_KEY && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
              <div className="flex items-start gap-2">
                <FiAlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-sans text-sm text-amber-800 dark:text-amber-200">
                    <strong>Chave de admin não configurada.</strong> Para que Pedidos e Catálogo funcionem, vá no <strong>Vercel → Settings → Environment Variables</strong> e adicione:
                  </p>
                  <ul className="font-sans text-xs text-amber-700 dark:text-amber-300 mt-2 list-disc pl-5 space-y-1">
                    <li><code>ADMIN_API_KEY</code> — chave secreta qualquer (ex: minha-chave-secreta-123)</li>
                    <li><code>VITE_ADMIN_API_KEY</code> — mesma chave (para o frontend enviar nos headers)</li>
                    <li><code>SUPABASE_URL</code> — URL do projeto Supabase</li>
                    <li><code>SUPABASE_SERVICE_ROLE_KEY</code> — service role key do Supabase</li>
                  </ul>
                  <p className="font-sans text-xs text-amber-600 dark:text-amber-400 mt-2">Após adicionar, faça redeploy no Vercel.</p>
                </div>
              </div>
            </div>
          )}

          {/* Dashboard cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Pedidos */}
            <Link
              to="/admin/pedidos"
              className={`bg-surface rounded-2xl p-8 shadow-soft hover:ring-2 hover:ring-baby-accent
                         transition-all group flex flex-col items-center text-center ${focusRing}`}
            >
              <span className="text-5xl mb-4">📦</span>
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
              <span className="text-5xl mb-4">🛍️</span>
              <p className="font-serif text-xl text-baby-text group-hover:text-baby-accent transition-colors">
                Catálogo
              </p>
              <p className="font-sans text-sm text-baby-text/50 mt-2 leading-relaxed">
                Produtos, coleções e configurações da página inicial
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
