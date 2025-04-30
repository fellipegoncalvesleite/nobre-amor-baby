/**
 * LoginPage — /entrar
 *
 * Supabase Auth login with:
 *   - Email OTP (magic link / code)
 *   - Google OAuth
 *
 * After OAuth redirect the Supabase client auto-detects the session params
 * in the URL hash and calls onAuthStateChange, so we just need to redirect.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLoader } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { focusRing } from '../lib/ui';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

const inputCls = `w-full px-4 py-3 rounded-xl border border-baby-text/15 bg-surface
                  font-sans text-baby-text placeholder:text-baby-text/30
                  transition-colors hover:border-baby-accent/40
                  focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent`;

const oauthBtnCls = `w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl
                     font-sans text-sm font-medium transition-colors border
                     focus:outline-none focus:ring-2 focus:ring-baby-accent`;

export default function LoginPage() {
  const { isAuthed, signInWithOtp, signInWithOAuth, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from ?? '/';

  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // If user just authenticated (OAuth redirect or session restore), redirect
  useEffect(() => {
    if (isAuthed && !authLoading) {
      toast.success('Login realizado!', { style: toastStyle });
      navigate(from, { replace: true });
    }
  }, [isAuthed, authLoading, navigate, from]);

  /* ── Submit email OTP ──────────────────────────── */
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) { toast.error('Informe seu e-mail.', { style: toastStyle }); return; }
    setBusy(true);
    try {
      await signInWithOtp(trimmed);
      setOtpSent(true);
      toast.success('Link de acesso enviado para seu e-mail!', { style: toastStyle, duration: 5000 });
    } catch (err) {
      console.error('[LoginPage] OTP error:', err);
      toast.error(err.message || 'Falha ao enviar e-mail.', { style: toastStyle });
    } finally {
      setBusy(false);
    }
  };

  /* ── OAuth buttons ─────────────────────────────── */
  const handleOAuth = async (provider) => {
    setBusy(true);
    try {
      await signInWithOAuth(provider);
      // Browser will redirect — no further code runs
    } catch (err) {
      console.error('[LoginPage] OAuth error:', err);
      toast.error(err.message || 'Falha ao iniciar login.', { style: toastStyle });
      setBusy(false);
    }
  };

  // While auth is loading, show spinner
  if (authLoading) {
    return (
      <section className="pt-24 pb-16 bg-baby-cream min-h-screen flex items-center justify-center">
        <FiLoader size={28} className="animate-spin text-baby-accent" />
      </section>
    );
  }

  // Already authed → handled in useEffect above, show brief message
  if (isAuthed) {
    return (
      <section className="pt-24 pb-16 bg-baby-cream min-h-screen">
        <div className="max-w-md mx-auto px-4 text-center">
          <p className="font-sans text-baby-text/60 text-lg mb-6">Você já está conectado.</p>
          <Link
            to={from}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-baby-accent text-white
                       font-sans text-sm font-medium hover:bg-baby-accent/90 transition-colors"
          >
            Continuar
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-md mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
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
            Acesse sua conta para acompanhar pedidos em qualquer dispositivo.
          </p>

          {/* ─── OTP Sent confirmation ──────────────── */}
          {otpSent ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mx-auto flex items-center justify-center">
                <FiMail size={28} className="text-green-600 dark:text-green-400" />
              </div>
              <h2 className="font-serif text-xl text-baby-text">Verifique seu e-mail</h2>
              <p className="font-sans text-sm text-baby-text/60">
                Enviamos um link de acesso para <strong className="text-baby-text">{email}</strong>.
                <br />Clique no link do e-mail para entrar.
              </p>
              <button
                type="button"
                onClick={() => setOtpSent(false)}
                className="font-sans text-sm text-baby-accent hover:underline"
              >
                Usar outro e-mail
              </button>
            </div>
          ) : (
            <>
              {/* ─── Email OTP form ───────────────────── */}
              <form onSubmit={handleEmailSubmit} className="space-y-4">
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
                    disabled={busy}
                    className={`${inputCls} ${focusRing}`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || !email.trim()}
                  className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full
                             bg-baby-accent text-white font-sans text-sm font-medium
                             hover:bg-baby-accent/90 transition-colors disabled:opacity-50 ${focusRing}`}
                >
                  {busy ? <FiLoader size={16} className="animate-spin" /> : <FiMail size={16} />}
                  Enviar link de acesso
                </button>
              </form>

              {/* ─── Divider ─────────────────────────── */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-baby-text/10" />
                <span className="font-sans text-xs text-baby-text/40 uppercase tracking-wider">ou</span>
                <div className="flex-1 h-px bg-baby-text/10" />
              </div>

              {/* ─── OAuth buttons ───────────────────── */}
              <div className="space-y-3">
                {/* Google */}
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  disabled={busy}
                  className={`${oauthBtnCls} bg-white dark:bg-gray-800 border-baby-text/15
                             text-baby-text hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continuar com Google
                </button>


              </div>
            </>
          )}
        </motion.div>

        {/* Help text */}
        <p className="font-sans text-xs text-baby-text/40 text-center mt-6 max-w-sm mx-auto">
          Ao entrar, você concorda com nossos{' '}
          <Link to="/termos" className="underline hover:text-baby-accent">Termos de Uso</Link> e{' '}
          <Link to="/privacidade" className="underline hover:text-baby-accent">Política de Privacidade</Link>.
        </p>
      </div>
    </section>
  );
}

