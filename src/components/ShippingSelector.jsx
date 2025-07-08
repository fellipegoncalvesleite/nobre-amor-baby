/**
 * ShippingSelector — unified address form with auto-calculated shipping.
 *
 *  1. User fills CEP → auto-fill address via ViaCEP
 *  2. Shipping cost is calculated automatically (local vs API)
 *  3. Shows only "Frete" and "Prazo" — no modes, no provider names
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { FiPlus, FiX, FiRefreshCw } from 'react-icons/fi';
import Spinner from './ui/Spinner';
import toast from 'react-hot-toast';
import { useStore } from '../context/StoreContext';
import { useCatalog } from '../context/CatalogContext';
import { normalizeCep, isValidCep, calculateShipping } from '../utils/shipping';
import { fetchCepInfo } from '../utils/viacep';
import { formatPrice, focusRing } from '../lib/ui';

export default function ShippingSelector() {
  const { shipping, setShipping, address, setAddress, cart } = useStore();
  const { products } = useCatalog();

  const [showComplement, setShowComplement] = useState(!!address.complement);
  const prevCepRef = useRef(address.cep || '');

  /* ── CEP display helper ─────────────────────────── */
  const formatCepDisplay = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  /* ── Calculate shipping after CEP lookup ────────── */
  const runShippingCalc = useCallback(async (cep, city, uf) => {
    setShipping({ cepDigits: cep, city, uf, isLoading: true, error: '', feeCents: null, etaText: '', source: '' });
    try {
      const result = await calculateShipping({ cep, city, uf, cart, products });
      setShipping({
        cepDigits: cep,
        city,
        uf,
        feeCents: result.feeCents,
        etaText: result.etaText,
        source: result.source,
        isLoading: false,
        error: '',
      });
    } catch (err) {
      setShipping({
        cepDigits: cep,
        city,
        uf,
        feeCents: null,
        etaText: '',
        source: '',
        isLoading: false,
        error: err.message || 'Não foi possível calcular o frete.',
      });
    }
  }, [setShipping, cart, products]);

  /* ── ViaCEP auto-lookup + shipping calc ─────────── */
  const lookupCep = useCallback(async (rawCep) => {
    const norm = normalizeCep(rawCep);
    if (!isValidCep(norm)) return;
    const hasAddressAutofill =
      address.street.trim() &&
      address.city.trim() &&
      address.uf.trim();
    if (norm === prevCepRef.current && hasAddressAutofill) return;
    prevCepRef.current = norm;

    setShipping({ isLoading: true, error: '' });
    try {
      const info = await fetchCepInfo(norm);
      if (!info) {
        toast('CEP não encontrado na base dos Correios.', {
          style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
        });
        setShipping({ isLoading: false });
        return;
      }

      // Auto-fill address fields from ViaCEP
      setAddress({
        cep: norm,
        street: info.logradouro || '',
        neighborhood: info.bairro || '',
        city: info.localidade || '',
        uf: String(info.uf || '').toUpperCase(),
      });

      // Calculate shipping
      await runShippingCalc(norm, info.localidade, String(info.uf || '').toUpperCase());
    } catch {
      toast.error('Erro ao consultar CEP. Tente novamente.', {
        style: { background: '#F0DAE8', color: '#373438', borderRadius: '12px' },
      });
      setShipping({ isLoading: false, error: 'Erro ao consultar CEP.' });
    }
  }, [address.city, address.street, address.uf, setAddress, setShipping, runShippingCalc]);

  /* ── Recalculate button handler ─────────────────── */
  const handleRecalculate = () => {
    const norm = normalizeCep(address.cep);
    if (isValidCep(norm) && address.city) {
      runShippingCalc(norm, address.city, address.uf);
    }
  };

  /* ── CEP change handler ─────────────────────────── */
  const handleCepChange = (e) => {
    const digits = normalizeCep(e.target.value).slice(0, 8);
    setAddress({ cep: digits });
  };

  /* ── Trigger lookup when 8 digits typed ─────────── */
  useEffect(() => {
    const norm = normalizeCep(address.cep);
    if (norm.length === 8 && norm !== prevCepRef.current) {
      lookupCep(norm);
    }
  }, [address.cep, lookupCep]);

  /* ── CEP blur handler ───────────────────────────── */
  const handleCepBlur = () => {
    const norm = normalizeCep(address.cep);
    if (norm.length === 8) lookupCep(norm);
  };

  /* ── Address field handler ──────────────────────── */
  const handleField = (field) => (e) => setAddress({ [field]: e.target.value });
  const handleUfChange = (e) => {
    const uf = String(e.target.value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    setAddress({ uf });
    const norm = normalizeCep(address.cep);
    if (uf.length === 2 && isValidCep(norm) && address.city.trim()) {
      runShippingCalc(norm, address.city, uf);
    }
  };

  /* ── Styling ────────────────────────────────────── */
  const inputCls = `w-full px-3.5 py-2.5 rounded-xl border border-baby-text/15 bg-surface
                    font-sans text-sm text-baby-text placeholder-baby-text/40
                    focus:outline-none focus:ring-2 focus:ring-baby-accent focus:border-transparent
                    transition-colors`;

  const labelCls = 'block font-sans text-xs font-medium text-baby-text/60 mb-1';

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-lg text-baby-text">Endereço de entrega</h3>

      {/* ── Address form ───────────────────────────── */}
      <div className="space-y-3">
        {/* CEP */}
        <div>
          <label htmlFor="ship-cep" className={labelCls}>CEP *</label>
          <div className="relative">
            <input
              id="ship-cep"
              type="text"
              inputMode="numeric"
              maxLength={9}
              value={formatCepDisplay(address.cep)}
              onChange={handleCepChange}
              onBlur={handleCepBlur}
              placeholder="00000-000"
              aria-label="CEP"
              className={`${inputCls} font-mono pr-10`}
            />
            {shipping.isLoading && (
              <Spinner size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-baby-accent" />
            )}
          </div>
        </div>

        {/* Rua + Número — 2-col on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="ship-street" className={labelCls}>Rua / Logradouro</label>
            <input
              id="ship-street"
              type="text"
              value={address.street}
              onChange={handleField('street')}
              placeholder="Rua, Av., Praça..."
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="ship-number" className={labelCls}>Número *</label>
            <input
              id="ship-number"
              type="text"
              value={address.number}
              onChange={handleField('number')}
              placeholder="Nº"
              className={inputCls}
            />
          </div>
        </div>

        {/* Complemento — hidden behind "+complemento" toggle */}
        {!showComplement ? (
          <button
            type="button"
            onClick={() => setShowComplement(true)}
            className="inline-flex items-center gap-1 font-sans text-xs text-baby-accent hover:text-baby-text transition-colors"
          >
            <FiPlus size={12} />
            complemento
          </button>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="ship-complement" className={labelCls + ' mb-0'}>Complemento</label>
              <button
                type="button"
                onClick={() => { setShowComplement(false); setAddress({ complement: '' }); }}
                className="text-baby-text/40 hover:text-baby-text transition-colors"
                aria-label="Remover complemento"
              >
                <FiX size={12} />
              </button>
            </div>
            <input
              id="ship-complement"
              type="text"
              value={address.complement}
              onChange={handleField('complement')}
              placeholder="Apto, bloco, casa..."
              className={inputCls}
            />
          </div>
        )}

        {/* Bairro */}
        <div>
          <label htmlFor="ship-neighborhood" className={labelCls}>Bairro</label>
          <input
            id="ship-neighborhood"
            type="text"
            value={address.neighborhood}
            onChange={handleField('neighborhood')}
            placeholder="Bairro"
            className={inputCls}
          />
        </div>

        {/* Cidade + UF */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label htmlFor="ship-city" className={labelCls}>Cidade</label>
            <input
              id="ship-city"
              type="text"
              value={address.city}
              onChange={handleField('city')}
              placeholder="Cidade"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="ship-uf" className={labelCls}>UF</label>
            <input
              id="ship-uf"
              type="text"
              value={address.uf}
              onChange={handleUfChange}
              placeholder="UF"
              maxLength={2}
              autoComplete="address-level1"
              className={`${inputCls} uppercase`}
            />
          </div>
        </div>
      </div>

      {/* ── Shipping result ────────────────────────── */}
      {(shipping.isLoading || shipping.feeCents != null || shipping.error) && (
        <div className="bg-baby-pink/10 dark:bg-baby-accent/5 border border-baby-pink rounded-xl p-3 font-sans text-sm space-y-1">
          {shipping.isLoading ? (
            <div className="flex items-center gap-2 text-baby-text/50">
              <Spinner size={14} />
              <span>Calculando frete…</span>
            </div>
          ) : shipping.error ? (
            <div className="space-y-2">
              <p className="text-red-500 dark:text-red-400 text-xs">{shipping.error}</p>
              <button
                type="button"
                onClick={handleRecalculate}
                className={`inline-flex items-center gap-1.5 text-xs font-medium text-baby-accent hover:text-baby-text transition-colors ${focusRing}`}
              >
                <FiRefreshCw size={12} />
                Recalcular frete
              </button>
            </div>
          ) : (
            <>
              <p className="text-baby-text">
                <span className="text-baby-text/50">Frete:</span>{' '}
                <span className="font-semibold">{formatPrice(shipping.feeCents / 100)}</span>
              </p>
              {shipping.etaText && (
                <p className="text-baby-text/60 text-xs">
                  <span className="text-baby-text/40">Prazo:</span>{' '}
                  {shipping.etaText}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
