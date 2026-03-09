/**
 * AuthCallbackPage — /auth/callback
 *
 * Handles ALL Supabase auth redirects: email confirmation, magic link, OAuth.
 *
 * Supabase can redirect here with different URL formats:
 *   ?token_hash=xxx&type=signup|magiclink   → call verifyOtp()
 *   ?code=AUTH_CODE                          → PKCE: call exchangeCodeForSession()
 *   #access_token=...&type=signup|magiclink  → implicit: auto-detected by client
 *   ?error=...&error_description=...         → auth error
 *
 * After successful verification the auth session is established and
 * the user sees a Portuguese success screen before being redirected.
 */
import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiShoppingBag, FiPackage } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getReturnPath, clearReturnPath } from '../lib/authReturn';

const TIMEOUT_MS = 15_000;
const COUNTDOWN_SECONDS = 5;

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthed, loading: authLoading } = useAuth();
  const processedRef = useRef(false);

  const [status, setStatus] = useState('processing'); // 'processing' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  const returnPath = useMemo(() => getReturnPath(), []);

  /* ── Debug: log callback info ───────────────────── */
  useEffect(() => {
    const info = {
      timestamp: new Date().toISOString(),
      hash: window.location.hash ? window.location.hash.substring(0, 50) + '…' : '(empty)',
      searchParams: Object.fromEntries(searchParams.entries()),
      returnPath,
    };
    if (import.meta.env.DEV) console.log('[AuthCallback] init', info);
    try {
      sessionStorage.setItem('nobre_amor_callback_debug', JSON.stringify(info));
    } catch { /* ok */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Actively process auth tokens from URL ──────── */
  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const processAuth = async () => {
      // 1) Check for explicit error from Supabase
      const urlError = searchParams.get('error');
      if (urlError) {
        const desc = searchParams.get('error_description') || urlError;
        setStatus('error');
        setErrorMsg(desc);
        return;
      }

      // 2) token_hash flow — email confirmation / magic link via token_hash
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');
      if (tokenHash && type) {
        if (import.meta.env.DEV) console.log('[AuthCallback] verifyOtp', { type });
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });
        if (verifyErr) {
          setStatus('error');
          setErrorMsg(
            verifyErr.message?.includes('expired')
              ? 'O link expirou. Solicite um novo e-mail de verificação.'
              : (verifyErr.message || 'Não foi possível confirmar seu e-mail.'),
          );
        }
        // If success, onAuthStateChange will fire → isAuthed becomes true
        return;
      }

      // 3) PKCE flow — auth code exchange
      const code = searchParams.get('code');
      if (code) {
        if (import.meta.env.DEV) console.log('[AuthCallback] exchangeCodeForSession');
        const { error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (codeErr) {
          setStatus('error');
          setErrorMsg(codeErr.message || 'Não foi possível completar a autenticação.');
        }
        return;
      }

      // 4) Implicit flow — #access_token in hash is auto-detected by Supabase client
      // via detectSessionInUrl: true. Just wait for onAuthStateChange → isAuthed.
      if (window.location.hash && window.location.hash.includes('access_token')) {
        if (import.meta.env.DEV) console.log('[AuthCallback] implicit flow, waiting for session from hash');
        return;
      }

      // 5) No recognizable params — if user is already authed, show success;
      //    otherwise wait for the timeout to catch stale/empty callbacks
      if (import.meta.env.DEV) console.log('[AuthCallback] no auth params found, waiting for session');
    };

    processAuth();
  }, [searchParams]);

  /* ── React to session state ─────────────────────── */
  useEffect(() => {
    if (!authLoading && isAuthed && status === 'processing') {
      setStatus('success');
    }
  }, [isAuthed, authLoading, status]);

  /* ── Timeout fallback ───────────────────────────── */
  useEffect(() => {
    if (status !== 'processing') return;
    const timer = setTimeout(() => {
      if (status === 'processing') {
        setStatus('error');
        setErrorMsg(
          'Não foi possível confirmar seu e-mail. O link pode estar expirado ou inválido.',
        );
      }
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
        className="max-w-md w-full mx-4 bg-surface rounded-2xl p-8 shadow-soft text-center space-y-5"
      >
        {/* ── Processing ─────────────────────────── */}
        {status === 'processing' && (
          <>
            <FiLoader size={40} className="animate-spin text-baby-accent mx-auto" />
            <h2 className="font-serif text-xl text-baby-text">Verificando...</h2>
            <p className="font-sans text-sm text-baby-text/60">
              Estamos confirmando sua autenticação, aguarde um momento.
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
              E-mail confirmado com sucesso!
            </h2>
            <p className="font-sans text-sm text-baby-text/60">
              Sua conta está ativa. Redirecionando em {countdown}s...
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link
                to={returnPath}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-baby-accent text-white
                           font-sans text-sm font-medium hover:bg-baby-accent/90 transition-colors"
              >
                <FiShoppingBag size={16} />
                Voltar para a loja
              </Link>
              <Link
                to="/meus-pedidos"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-baby-text/20
                           text-baby-text font-sans text-sm font-medium hover:bg-baby-pink/30 transition-colors"
              >
                <FiPackage size={16} />
                Ver meus pedidos
              </Link>
            </div>
          </>
        )}

        {/* ── Error ──────────────────────────────── */}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mx-auto flex items-center justify-center">
              <FiAlertCircle size={32} className="text-red-600 dark:text-red-400" />
            </div>
            <h2 className="font-serif text-xl text-baby-text">
              Não foi possível confirmar seu e-mail
            </h2>
            <p className="font-sans text-sm text-baby-text/60">
              {errorMsg || 'O link pode estar expirado ou inválido.'}
            </p>
            <Link
              to="/entrar"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-baby-accent text-white
                         font-sans text-sm font-medium hover:bg-baby-accent/90 transition-colors"
            >
              Voltar para entrar
            </Link>
          </>
        )}
      </motion.div>
    </section>
  );
}
