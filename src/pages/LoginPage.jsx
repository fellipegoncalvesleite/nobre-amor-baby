/**
 * LoginPage — local-only login form at /entrar.
 *
 * Access codes:
 *   "MANAGER-123" → role "manager"
 *   "DEBUG-123"   → role "debug"
 *   anything else → role "customer"
 *
 * Testing:
 *   1. Navigate to /checkout while logged out → redirected here
 *   2. Fill out name + email, submit → redirected back to /checkout
 *   3. Enter code "MANAGER-123" → gains manager role → can access /admin
 *   4. Enter code "DEBUG-123"   → gains debug role   → can access /admin + all
 */
import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { btnPrimary, focusRing } from '../lib/ui';

/** Resolve role from access code */
function resolveRole(code) {
  const trimmed = (code ?? '').trim().toUpperCase();
  if (trimmed === 'MANAGER-123') return 'manager';
  if (trimmed === 'DEBUG-123') return 'debug';
  return 'customer';
}

const inputCls = `w-full px-4 py-3 rounded-xl border border-baby-text/15 bg-surface
                  font-sans text-baby-text placeholder:text-baby-text/30
                  transition-colors hover:border-baby-accent/40
                  focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent`;

export default function LoginPage() {
  const { login, isAuthed } = useAuth();
  const { setUser, user: storeUser } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from ?? '/';

  // If already logged in, go back where they came from
  if (isAuthed) {
    return (
      <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
        <div className="max-w-md mx-auto px-4 text-center">
          <p className="font-sans text-baby-text/60 text-lg mb-6">Você já está conectado.</p>
          <Link to={from} className={btnPrimary}>
            Continuar
          </Link>
        </div>
      </section>
    );
  }

  return <LoginForm from={from} login={login} setUser={setUser} storeUser={storeUser} navigate={navigate} />;
}

/**
 * Separated into its own component so the parent can early-return without
 * breaking the rules of hooks (the form uses useState).
 */
function LoginForm({ from, login, setUser, storeUser, navigate }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      toast.error('Preencha nome e e-mail.');
      return;
    }

    const role = resolveRole(code);

    // 1. Auth context
    login({ name: trimmedName, email: trimmedEmail, role });

    // 2. Sync with StoreContext user info (prefill checkout)
    //    Preserve existing phone if set
    setUser({
      displayName: trimmedName,
      email: trimmedEmail,
      ...(storeUser?.phone ? {} : { phone: '' }),
    });

    // Role-specific welcome toast (fires once per submit)
    if (role === 'manager') {
      toast.success('Entrou como Gerente — Painel disponível no menu da conta.', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
        duration: 4000,
      });
    } else if (role === 'debug') {
      toast.success('Entrou como Dev — Ferramentas disponíveis no menu da conta.', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
        duration: 4000,
      });
    } else {
      toast.success(`Bem-vindo(a), ${trimmedName}! Você já pode finalizar seu pedido.`, {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
        duration: 3000,
      });
    }

    // Redirect to intended destination
    navigate(from, { replace: true });
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-md mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-baby-accent transition-colors">Início</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Entrar</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-surface rounded-2xl p-6 sm:p-8 shadow-soft"
        >
          <h1 className="font-serif text-2xl sm:text-3xl text-baby-text mb-2 text-center">
            Entrar
          </h1>
          <p className="font-sans text-baby-text/50 text-sm text-center mb-8">
            Conta usada para salvar seus dados e finalizar pedido.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label htmlFor="login-name" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                Nome
              </label>
              <input
                id="login-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
                className={`${inputCls} ${focusRing}`}
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                className={`${inputCls} ${focusRing}`}
              />
            </div>

            {/* Access code (optional) */}
            <div>
              <label htmlFor="login-code" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                Código de acesso <span className="text-baby-text/30">(opcional)</span>
              </label>
              <input
                id="login-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Deixe em branco para conta cliente"
                autoComplete="off"
                className={`${inputCls} ${focusRing}`}
              />
            </div>

            <button type="submit" className={`${btnPrimary} w-full justify-center`}>
              Entrar
            </button>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
