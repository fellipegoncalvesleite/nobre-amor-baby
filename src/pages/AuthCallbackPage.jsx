/**
 * AuthCallbackPage — /auth/callback
 *
 * Handles Supabase auth redirects: email confirmation, magic link, OAuth.
 *
 * Flow:
 *   1. Supabase redirects here after verifying email token or OAuth
 *   2. The Supabase JS client auto-detects the session from the URL
 *   3. This page waits for the session, shows a success message
 *   4. Auto-redirects to the saved return path after a countdown
 *
 * URL formats handled:
 *   #access_token=...&type=signup|magiclink  (implicit flow)
 *   ?code=AUTH_CODE                          (PKCE flow)
 *   ?error=...&error_description=...         (auth errors)
 */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheckCircle, FiAlertCircle, FiLoader } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { getReturnPath, clearReturnPath } from '../lib/authReturn';

const TIMEOUT_MS = 10_000;
const COUNTDOWN_SECONDS = 3;

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthed, loading: authLoading } = useAuth();

  const [status, setStatus] = useState('processing'); // 'processing' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  const returnPath = useMemo(() => getReturnPath(), []);

  /* ── Debug: log callback info to console + sessionStorage ── */
  useEffect(() => {
    const info = {
      timestamp: new Date().toISOString(),
      hash: window.location.hash ? 'present' : 'empty',
      searchParams: Object.fromEntries(searchParams.entries()),
      returnPath,
    };
    if (import.meta.env.DEV) console.log('[AuthCallback]', info);
    try {
      sessionStorage.setItem('nobre_amor_callback_debug', JSON.stringify(info));
    } catch { /* ok */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Check for error in URL ─────────────────────── */
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      setStatus('error');
      setErrorMsg(searchParams.get('error_description') || error);
    }
  }, [searchParams]);

  /* ── Detect successful session ──────────────────── */
  useEffect(() => {
    if (!authLoading && isAuthed && status === 'processing') {
      setStatus('success');
    }
  }, [isAuthed, authLoading, status]);

  /* ── Timeout fallback ───────────────────────────── */
  useEffect(() => {
    if (status !== 'processing') return;
    const timer = setTimeout(() => {
      setStatus('error');
      setErrorMsg(
        'Não foi possível completar a autenticação. Tente fazer login novamente.',
      );
    }, TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  /* ── Countdown + auto-redirect on success ───────── */
  useEffect(() => {
    if (status !== 'success') return;
    clearReturnPath();
    if (countdown <= 0) {
      navigate(returnPath, { replace: true });
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown, navigate, returnPath]);

  return (
    <section className="pt-24 pb-16 bg-baby-cream min-h-screen flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full mx-4 bg-surface rounded-2xl p-8 shadow-soft text-center space-y-4"
      >
        {/* ── Processing ─────────────────────────── */}
        {status === 'processing' && (
          <>
            <FiLoader size={40} className="animate-spin text-baby-accent mx-auto" />
            <h2 className="font-serif text-xl text-baby-text">Processando...</h2>
            <p className="font-sans text-sm text-baby-text/60">
              Verificando sua autenticação, aguarde um momento.
            </p>
          </>
        )}

        {/* ── Success ────────────────────────────── */}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mx-auto flex items-center justify-center">
              <FiCheckCircle size={32} className="text-green-600 dark:text-green-400" />
            </div>
            <h2 className="font-serif text-xl text-baby-text">
              Autenticação realizada com sucesso!
            </h2>
            <p className="font-sans text-sm text-baby-text/60">
              Redirecionando em {countdown}s...
            </p>
            <button
              type="button"
              onClick={() => navigate(returnPath, { replace: true })}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-baby-accent text-white
                         font-sans text-sm font-medium hover:bg-baby-accent/90 transition-colors"
            >
              Continuar agora
            </button>
          </>
        )}

        {/* ── Error ──────────────────────────────── */}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mx-auto flex items-center justify-center">
              <FiAlertCircle size={32} className="text-red-600 dark:text-red-400" />
            </div>
            <h2 className="font-serif text-xl text-baby-text">Erro na autenticação</h2>
            <p className="font-sans text-sm text-baby-text/60">{errorMsg}</p>
            <Link
              to="/entrar"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-baby-accent text-white
                         font-sans text-sm font-medium hover:bg-baby-accent/90 transition-colors"
            >
              Tentar novamente
            </Link>
          </>
        )}
      </motion.div>
    </section>
  );
}
