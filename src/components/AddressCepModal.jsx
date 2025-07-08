/**
 * AddressCepModal — search CEP by address via ViaCEP.
 *
 * Props:
 *   isOpen      — controls visibility
 *   onClose     — called to close the modal
 *   onSelectCep — (cepDigits: string) => void
 *
 * Test cases:
 *   - UF=SP, Cidade="São Paulo", Rua="Praça da Sé" → list results
 *   - non-existent street → "Nenhum CEP encontrado"
 *   - offline → toast "Não foi possível buscar o CEP agora."
 */
import { useState, useEffect, useRef } from 'react';
import { FiX, FiSearch, FiMapPin } from 'react-icons/fi';
import Spinner from './ui/Spinner';
import toast from 'react-hot-toast';
import { searchCepByAddress, formatCep } from '../utils/viacep';
import { focusRing } from '../lib/ui';

/* ── Brazilian states for <select> ───────────────────── */
const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

export default function AddressCepModal({ isOpen, onClose, onSelectCep }) {
  const [uf, setUf] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null); // null = not searched yet, [] = no results
  const firstInputRef = useRef(null);
  const overlayRef = useRef(null);

  /* ── Focus first input on open ──────────────────────── */
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => firstInputRef.current?.focus(), 80);
    } else {
      // Reset on close
      setResults(null);
    }
  }, [isOpen]);

  /* ── Close on Escape ────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /* ── Search ─────────────────────────────────────────── */
  const handleSearch = async () => {
    const trimUf = uf.trim().toUpperCase();
    const trimCity = city.trim();
    const trimStreet = street.trim();

    if (trimUf.length !== 2 || trimCity.length < 2 || trimStreet.length < 3) {
      toast('Preencha UF (2 letras), cidade e rua (mín. 3 letras).', { style: toastStyle });
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const { results } = await searchCepByAddress({ uf: trimUf, city: trimCity, street: trimStreet });
      setResults(results);
      if (results.length === 0) {
        toast('Nenhum CEP encontrado para esse endereço.', { style: toastStyle });
      }
    } catch {
      toast.error('Não foi possível buscar o CEP agora. Tente novamente.', { style: toastStyle });
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (cepDigits) => {
    onSelectCep(cepDigits);
    onClose();
  };

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  /* ── Shared input class ─────────────────────────────── */
  const inputCls = `w-full px-3 py-2.5 rounded-xl border border-baby-text/15 bg-surface
                    font-sans text-sm text-baby-text placeholder-baby-text/40
                    focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent
                    transition-colors`;

  return (
    /* Overlay */
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar CEP pelo endereço"
    >
      {/* Dialog */}
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-baby-pink">
          <h2 className="font-serif text-lg text-baby-text flex items-center gap-2">
            <FiMapPin size={18} className="text-baby-accent" />
            Buscar CEP pelo endereço
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-full hover:bg-baby-pink/30 transition-colors ${focusRing}`}
            aria-label="Fechar"
          >
            <FiX size={18} className="text-baby-text/60" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
          {/* UF */}
          <div>
            <label htmlFor="addr-uf" className="block font-sans text-xs font-medium text-baby-text/60 mb-1">
              Estado (UF) *
            </label>
            <select
              id="addr-uf"
              ref={firstInputRef}
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione...</option>
              {UF_LIST.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {/* City */}
          <div>
            <label htmlFor="addr-city" className="block font-sans text-xs font-medium text-baby-text/60 mb-1">
              Cidade *
            </label>
            <input
              id="addr-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="São Paulo"
              className={inputCls}
            />
          </div>

          {/* Street */}
          <div>
            <label htmlFor="addr-street" className="block font-sans text-xs font-medium text-baby-text/60 mb-1">
              Rua / Logradouro *
            </label>
            <input
              id="addr-street"
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Praça da Sé"
              className={inputCls}
            />
          </div>

          {/* Search button */}
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                       bg-baby-text text-white dark:text-baby-cream font-sans text-sm font-medium
                       hover:bg-baby-accent transition-colors
                       disabled:opacity-60 disabled:cursor-wait ${focusRing}`}
          >
            {loading ? (
              <Spinner size={16} />
            ) : (
              <FiSearch size={16} />
            )}
            {loading ? 'Buscando...' : 'Buscar'}
          </button>

          {/* Results list */}
          {results !== null && results.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="font-sans text-xs text-baby-text/50">
                {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
              </p>
              <ul className="space-y-1.5 max-h-52 overflow-y-auto">
                {results.map((item, idx) => (
                  <li key={`${item.cep}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item.cep)}
                      className={`w-full text-left p-3 rounded-xl border border-baby-text/10
                                 hover:border-baby-accent hover:bg-baby-pink/10
                                 transition-colors ${focusRing}`}
                    >
                      <span className="block font-sans text-sm font-medium text-baby-text">
                        {item.logradouro}
                        {item.complemento && (
                          <span className="text-baby-text/40 font-normal"> — {item.complemento}</span>
                        )}
                      </span>
                      <span className="block font-sans text-xs text-baby-text/50 mt-0.5">
                        {item.bairro && `${item.bairro} · `}{item.localidade}/{item.uf}
                      </span>
                      <span className="block font-mono text-xs text-baby-accent font-semibold mt-1">
                        CEP {formatCep(item.cep)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* No results */}
          {results !== null && results.length === 0 && !loading && (
            <p className="font-sans text-sm text-baby-text/40 text-center py-3">
              Nenhum CEP encontrado para esse endereço.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
