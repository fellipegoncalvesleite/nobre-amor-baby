import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiAlertCircle, FiCheckCircle, FiLoader, FiPackage, FiShoppingBag } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { getSupabaseConfigError, supabase } from '../lib/supabaseClient';
import { clearReturnPath, getReturnPath } from '../lib/authReturn';

const TIMEOUT_MS = 15_000;
const COUNTDOWN_SECONDS = 5;

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthed, loading: authLoading } = useAuth();
  const processedRef = useRef(false);
  const [status, setStatus] = useState('processing');
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  const returnPath = useMemo(() => getReturnPath(), []);
  const effectiveStatus = !authLoading && isAuthed && status === 'processing' ? 'success' : status;

  useEffect(() => {
    const info = {
      timestamp: new Date().toISOString(),
      hash: window.location.hash ? `${window.location.hash.substring(0, 50)}...` : '(empty)',
      searchParams: Object.fromEntries(searchParams.entries()),
      returnPath,
    };
    if (import.meta.env.DEV) console.log('[AuthCallback] init', info);
    try {
      sessionStorage.setItem('nobre_amor_callback_debug', JSON.stringify(info));
    } catch {
      /* ignore */
    }
  }, [returnPath, searchParams]);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const processAuth = async () => {
      const urlError = searchParams.get('error');
      if (urlError) {
        setStatus('error');
        setErrorMsg(searchParams.get('error_description') || urlError);
        return;
      }

      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');
      if (tokenHash && type) {
        if (!supabase) {
          setStatus('error');
          setErrorMsg(getSupabaseConfigError().message);
          return;
        }
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) {
          setStatus('error');
          setErrorMsg(
            error.message?.includes('expired')
              ? 'O link expirou. Solicite um novo e-mail de verificação.'
              : error.message || 'Não foi possível confirmar seu e-mail.',
          );
        }
        return;
      }

      const code = searchParams.get('code');
      if (code) {
        if (!supabase) {
          setStatus('error');
          setErrorMsg(getSupabaseConfigError().message);
          return;
        }
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus('error');
          setErrorMsg(error.message || 'Não foi possível completar a autenticação.');
        }
      }
    };

    processAuth();
  }, [searchParams]);

  useEffect(() => {
    if (effectiveStatus !== 'processing') return;
    const timer = setTimeout(() => {
      if (effectiveStatus === 'processing') {
        setStatus('error');
        setErrorMsg('Não foi possível confirmar seu e-mail. O link pode estar expirado ou inválido.');
      }
    }, TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [effectiveStatus]);

  useEffect(() => {
    if (effectiveStatus !== 'success') return;
    clearReturnPath();
    if (countdown <= 0) {
      navigate(returnPath, { replace: true });
      return;
    }
    const timer = setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, effectiveStatus, navigate, returnPath]);

  return (
    <section className="pt-24 pb-16 bg-baby-cream min-h-screen flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full mx-4 bg-surface rounded-2xl p-8 shadow-soft text-center space-y-5"
      >
        {effectiveStatus === 'processing' && (
          <>
            <FiLoader size={40} className="animate-spin text-baby-accent mx-auto" />
            <h2 className="font-serif text-xl text-baby-text">Verificando...</h2>
            <p className="font-sans text-sm text-baby-text/60">
              Estamos confirmando sua autenticação, aguarde um momento.
            </p>
          </>
        )}

        {effectiveStatus === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mx-auto flex items-center justify-center">
              <FiCheckCircle size={32} className="text-green-600 dark:text-green-400" />
            </div>
            <h2 className="font-serif text-xl text-baby-text">E-mail confirmado com sucesso!</h2>
            <p className="font-sans text-sm text-baby-text/60">
              Sua conta está ativa. Redirecionando em {countdown}s...
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link
                to={returnPath}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-baby-accent text-white font-sans text-sm font-medium hover:bg-baby-accent/90 transition-colors"
              >
                <FiShoppingBag size={16} />
                Voltar para a loja
              </Link>
              <Link
                to="/meus-pedidos"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-baby-text/20 text-baby-text font-sans text-sm font-medium hover:bg-baby-pink/30 transition-colors"
              >
                <FiPackage size={16} />
                Ver meus pedidos
              </Link>
            </div>
          </>
        )}

        {effectiveStatus === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mx-auto flex items-center justify-center">
              <FiAlertCircle size={32} className="text-red-600 dark:text-red-400" />
            </div>
            <h2 className="font-serif text-xl text-baby-text">Não foi possível confirmar seu e-mail</h2>
            <p className="font-sans text-sm text-baby-text/60">
              {errorMsg || 'O link pode estar expirado ou inválido.'}
            </p>
            <Link
              to="/entrar"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-baby-accent text-white font-sans text-sm font-medium hover:bg-baby-accent/90 transition-colors"
            >
              Voltar para entrar
            </Link>
          </>
        )}
      </motion.div>
    </section>
  );
}
