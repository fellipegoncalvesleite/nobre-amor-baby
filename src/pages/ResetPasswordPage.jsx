/**
 * ResetPasswordPage — /redefinir-senha
 *
 * Two modes:
 *   1. "request" — user enters email to receive a reset link
 *   2. "update"  — user arrived via the reset link and sets a new password
 *
 * Supabase puts a recovery session in the URL hash after the user clicks
 * the reset email link, so we detect that via onAuthStateChange('PASSWORD_RECOVERY').
 */
import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiLoader, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { focusRing } from '../lib/ui';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

const inputCls = `w-full px-4 py-3 rounded-xl border border-baby-text/15 bg-surface
                  font-sans text-baby-text placeholder:text-baby-text/30
                  transition-colors hover:border-baby-accent/40
                  focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent`;

export default function ResetPasswordPage() {
  const { resetPassword, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasRecoveryParams = Boolean(
    searchParams.get('code') ||
    searchParams.get('type') === 'recovery' ||
    window.location.hash.includes('type=recovery'),
  );

  const [mode, setMode] = useState('request'); // 'request' | 'update' | 'sent' | 'done'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Detect recovery session from Supabase redirect (implicit flow fallback)
  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        (event === 'PASSWORD_RECOVERY' ||
          (hasRecoveryParams && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION'))) &&
        session
      ) {
        setMode('update');
      }
    });

    if (hasRecoveryParams) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (active && session) setMode('update');
      });
    }

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hasRecoveryParams]);

  /* ── Request reset email ───────────────────────── */
  const handleRequest = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await resetPassword(trimmed);
      setMode('sent');
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar e-mail.', { style: toastStyle });
    } finally {
      setBusy(false);
    }
  };

  /* ── Set new password ──────────────────────────── */
  const handleUpdate = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.', { style: toastStyle });
      return;
    }
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem.', { style: toastStyle });
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setMode('done');
      toast.success('Senha atualizada!', { style: toastStyle });
      setTimeout(() => navigate('/entrar', { replace: true }), 2000);
    } catch (err) {
      toast.error(err.message || 'Erro ao atualizar senha.', { style: toastStyle });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-md mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/entrar" className="hover:text-baby-accent transition-colors">Entrar</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Redefinir senha</li>
          </ol>
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-surface rounded-2xl p-6 sm:p-8 shadow-soft"
        >
          {/* ─── Mode: request ─────────────────────── */}
          {mode === 'request' && (
            <>
              <h1 className="font-serif text-2xl sm:text-3xl text-baby-text mb-2 text-center">
                Redefinir senha
              </h1>
              <p className="font-sans text-baby-text/50 text-sm text-center mb-8">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
              <form onSubmit={handleRequest} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                    E-mail
                  </label>
                  <input
                    id="reset-email"
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
                  disabled={busy || !email.trim() || !isSupabaseConfigured}
                  className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full
                             bg-baby-accent text-white font-sans text-sm font-medium
                             hover:bg-baby-accent/90 transition-colors disabled:opacity-50 ${focusRing}`}
                >
                  {busy ? <FiLoader size={16} className="animate-spin" /> : <FiMail size={16} />}
                  Enviar link de redefinição
                </button>
              </form>
              <p className="text-center mt-4">
                <Link to="/entrar" className="font-sans text-sm text-baby-accent hover:underline">
                  Voltar para login
                </Link>
              </p>
            </>
          )}

          {/* ─── Mode: sent ────────────────────────── */}
          {mode === 'sent' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mx-auto flex items-center justify-center">
                <FiMail size={28} className="text-green-600 dark:text-green-400" />
              </div>
              <h2 className="font-serif text-xl text-baby-text">Verifique seu e-mail</h2>
              <p className="font-sans text-sm text-baby-text/60">
                Enviamos um link de redefinição para <strong className="text-baby-text">{email}</strong>.
                <br />Clique no link do e-mail para criar uma nova senha.
              </p>
              <Link to="/entrar" className="inline-block font-sans text-sm text-baby-accent hover:underline">
                Voltar para login
              </Link>
            </div>
          )}

          {/* ─── Mode: update (new password form) ──── */}
          {mode === 'update' && (
            <>
              <h1 className="font-serif text-2xl sm:text-3xl text-baby-text mb-2 text-center">
                Nova senha
              </h1>
              <p className="font-sans text-baby-text/50 text-sm text-center mb-8">
                Escolha uma nova senha para sua conta.
              </p>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                    Nova senha
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                    disabled={busy}
                    className={`${inputCls} ${focusRing}`}
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block font-sans text-sm text-baby-text/70 mb-1.5">
                    Confirmar senha
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    disabled={busy}
                    className={`${inputCls} ${focusRing}`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || password.length < 6 || password !== confirmPassword}
                  className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full
                             bg-baby-accent text-white font-sans text-sm font-medium
                             hover:bg-baby-accent/90 transition-colors disabled:opacity-50 ${focusRing}`}
                >
                  {busy ? <FiLoader size={16} className="animate-spin" /> : <FiLock size={16} />}
                  Salvar nova senha
                </button>
              </form>
            </>
          )}

          {/* ─── Mode: done ────────────────────────── */}
          {mode === 'done' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mx-auto flex items-center justify-center">
                <FiCheck size={28} className="text-green-600 dark:text-green-400" />
              </div>
              <h2 className="font-serif text-xl text-baby-text">Senha atualizada!</h2>
              <p className="font-sans text-sm text-baby-text/60">
                Redirecionando para o login...
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
