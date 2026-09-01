import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  COOKIE_CONSENT_ACCEPTED,
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_REJECTED,
  readCookieConsent,
  writeCookieConsent,
} from '../lib/cookieConsent';

export default function CookieConsent() {
  const [choice, setChoice] = useState(() => readCookieConsent());

  useEffect(() => {
    const openPreferences = () => setChoice(null);
    window.addEventListener(COOKIE_CONSENT_EVENT, openPreferences);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, openPreferences);
  }, []);

  if (choice) return null;

  function choose(nextChoice) {
    try {
      writeCookieConsent(nextChoice);
    } catch {
      // If browser storage is unavailable, respect the choice for this page load.
    }
    setChoice(nextChoice);
  }

  return (
    <aside
      role="dialog"
      aria-label="Preferências de cookies"
      aria-modal="false"
      className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-4xl rounded-2xl border border-baby-text/10 bg-surface p-5 shadow-2xl sm:inset-x-6 sm:p-6"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl font-sans">
          <h2 className="font-serif text-xl font-semibold text-baby-text sm:text-2xl">
            Sua privacidade importa
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-baby-text/75 sm:text-[15px]">
            Usamos armazenamento essencial para manter preferências e recursos da loja funcionando.
            Recursos opcionais de análise ou marketing ficam desativados até você permitir. Veja os
            detalhes na{' '}
            <Link
              to="/privacidade"
              className="font-medium text-baby-text underline decoration-baby-accent/60 underline-offset-2"
            >
              Política de Privacidade
            </Link>.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => choose(COOKIE_CONSENT_REJECTED)}
            className="min-h-11 rounded-full border border-baby-text/25 px-5 py-2.5 font-sans text-sm font-semibold text-baby-text transition-colors hover:bg-baby-pink-light"
          >
            Recusar opcionais
          </button>
          <button
            type="button"
            onClick={() => choose(COOKIE_CONSENT_ACCEPTED)}
            className="min-h-11 rounded-full bg-baby-text px-5 py-2.5 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:text-baby-cream"
          >
            Aceitar opcionais
          </button>
        </div>
      </div>
    </aside>
  );
}
