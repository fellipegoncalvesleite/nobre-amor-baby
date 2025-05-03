/**
 * LoginPage — /entrar
 *
 * Two tabs:
 *   1. "Entrar"      — email + password login (+ Google OAuth)
 *   2. "Criar conta"  — signup with name, email, password
 *
 * After OAuth redirect the Supabase client auto-detects the session params
 * in the URL hash and calls onAuthStateChange, so we just need to redirect.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLoader, FiUser, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';
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
  const {
    isAuthed, signInWithPassword, signUp, signInWithOAuth, loading: authLoading,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from ?? '/';

  const [tab, setTab] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // If user just authenticated, redirect
  useEffect(() => {
    if (isAuthed && !authLoading) {
      toast.success('Login realizado!', { style: toastStyle });
      navigate(from, { replace: true });
    }
  }, [isAuthed, authLoading, navigate, from]);

  /* ── Login with email + password ───────────────── */
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (err) {
      console.error('[LoginPage] login error:', err);
      const msg = err.message?.includes('Invalid login')
        ? 'E-mail ou senha incorretos.'
        : (err.message || 'Falha ao entrar.');
      toast.error(msg, { style: toastStyle });
    } finally {
      setBusy(false);
    }
  };

  /* ── Signup ────────────────────────────────────── */
  const handleSignup = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.', { style: toastStyle });
      return;
    }
    setBusy(true);
    try {
      await signUp(email.trim(), password, name.trim());
      setSignupDone(true);
      toast.success('Conta criada! Verifique seu e-mail para confirmar.', { style: toastStyle, duration: 5000 });
    } catch (err) {
      console.error('[LoginPage] signup error:', err);
      const msg = err.message?.includes('already registered')
        ? 'Este e-mail já está cadastrado. Tente entrar.'
        : (err.message || 'Falha ao criar conta.');
      toast.error(msg, { style: toastStyle });
    } finally {
      setBusy(false);
    }
  };

  /* ── OAuth ─────────────────────────────────────── */
  const handleOAuth = async (provider) => {
    setBusy(true);
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      console.error('[LoginPage] OAuth error:', err);
      toast.error(err.message || 'Falha ao iniciar login.', { style: toastStyle });
      setBusy(false);
    }
  };

  // Loading spinner
  if (authLoading) {
    return (
      <section className="pt-24 pb-16 bg-baby-cream min-h-screen flex items-center justify-center">
        <FiLoader size={28} className="animate-spin text-baby-accent" />
      </section>
    );
  }

  // Already authed
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

  const tabCls = (t) =>
    `flex-1 py-2.5 text-center font-sans text-sm font-medium transition-colors rounded-xl cursor-pointer ${
      tab === t
        ? 'bg-baby-accent text-white'
        : 'text-baby-text/50 hover:text-baby-text/80'
    }`;

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-md mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">{tab === 'login' ? 'Entrar' : 'Criar conta'}</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-surface rounded-2xl p-6 sm:p-8 shadow-soft"
        >
          {/* ─── Tabs ────────────────────────────────── */}
          <div className="flex gap-2 bg-baby-text/5 rounded-xl p-1 mb-6">
            <button type="button" onClick={() => { setTab('login'); setSignupDone(false); }} className={tabCls('login')}>
              Entrar
            </button>
            <button type="button" onClick={() => { setTab('signup'); setSignupDone(false); }} className={tabCls('signup')}>
              Criar conta
            </button>
          </div>

          {/* ═══════════════ LOGIN TAB ═══════════════ */}
          {tab === 'login' && (
            <>
              <p className="font-sans text-baby-text/50 text-sm text-center mb-6">
                Acesse sua conta para acompanhar pedidos.
              </p>

              <form onSubmit={handleLogin} className="space-y-4">
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

                <div>
                  <label htmlFor="login-password" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Sua senha"
                      autoComplete="current-password"
                      disabled={busy}
                      className={`${inputCls} pr-11 ${focusRing}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-baby-text/40 hover:text-baby-text/70 transition-colors"
                      tabIndex={-1}
                    >
                      {showPw ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || !email.trim() || !password}
                  className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full
                             bg-baby-accent text-white font-sans text-sm font-medium
                             hover:bg-baby-accent/90 transition-colors disabled:opacity-50 ${focusRing}`}
                >
                  {busy ? <FiLoader size={16} className="animate-spin" /> : <FiLock size={16} />}
                  Entrar
                </button>
              </form>

              <p className="text-center mt-3">
                <Link to="/redefinir-senha" className="font-sans text-xs text-baby-text/50 hover:text-baby-accent transition-colors">
                  Esqueceu sua senha?
                </Link>
              </p>

              {/* ─── Divider ─────────────────────────── */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-baby-text/10" />
                <span className="font-sans text-xs text-baby-text/40 uppercase tracking-wider">ou</span>
                <div className="flex-1 h-px bg-baby-text/10" />
              </div>

              {/* ─── Google OAuth ─────────────────────── */}
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
            </>
          )}

          {/* ═══════════════ SIGNUP TAB ══════════════ */}
          {tab === 'signup' && (
            <>
              {signupDone ? (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mx-auto flex items-center justify-center">
                    <FiMail size={28} className="text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="font-serif text-xl text-baby-text">Verifique seu e-mail</h2>
                  <p className="font-sans text-sm text-baby-text/60">
                    Enviamos um link de confirmação para <strong className="text-baby-text">{email}</strong>.
                    <br />Clique no link do e-mail para ativar sua conta.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setTab('login'); setSignupDone(false); }}
                    className="font-sans text-sm text-baby-accent hover:underline"
                  >
                    Ir para login
                  </button>
                </div>
              ) : (
                <>
                  <p className="font-sans text-baby-text/50 text-sm text-center mb-6">
                    Crie sua conta para acompanhar seus pedidos.
                  </p>

                  <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                      <label htmlFor="signup-name" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                        Nome
                      </label>
                      <input
                        id="signup-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Seu nome"
                        autoComplete="name"
                        disabled={busy}
                        className={`${inputCls} ${focusRing}`}
                      />
                    </div>

                    <div>
                      <label htmlFor="signup-email" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                        E-mail
                      </label>
                      <input
                        id="signup-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        autoComplete="email"
                        disabled={busy}
                        className={`${inputCls} ${focusRing}`}
                      />
                    </div>

                    <div>
                      <label htmlFor="signup-password" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                        Senha
                      </label>
                      <div className="relative">
                        <input
                          id="signup-password"
                          type={showPw ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          autoComplete="new-password"
                          disabled={busy}
                          className={`${inputCls} pr-11 ${focusRing}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(!showPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-baby-text/40 hover:text-baby-text/70 transition-colors"
                          tabIndex={-1}
                        >
                          {showPw ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={busy || !name.trim() || !email.trim() || password.length < 6}
                      className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full
                                 bg-baby-accent text-white font-sans text-sm font-medium
                                 hover:bg-baby-accent/90 transition-colors disabled:opacity-50 ${focusRing}`}
                    >
                      {busy ? <FiLoader size={16} className="animate-spin" /> : <FiUser size={16} />}
                      Criar minha conta
                    </button>
                  </form>

                  {/* ─── Divider ─────────────────────────── */}
                  <div className="flex items-center gap-4 my-6">
                    <div className="flex-1 h-px bg-baby-text/10" />
                    <span className="font-sans text-xs text-baby-text/40 uppercase tracking-wider">ou</span>
                    <div className="flex-1 h-px bg-baby-text/10" />
                  </div>

                  {/* ─── Google OAuth ─────────────────────── */}
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
                </>
              )}
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

