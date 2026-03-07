import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiSearch, FiX, FiArrowRight } from 'react-icons/fi';
import { useCatalog } from '../context/CatalogContext';
import { formatPrice } from '../lib/ui';

export default function SearchModal({ isOpen, onClose }) {
  const { products, collections } = useCatalog();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const modalRef = useRef(null);
  const navigate = useNavigate();

  // Reset query and close modal
  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, handleClose]);

  // Click outside
  const handleBackdrop = useCallback(
    (e) => { if (modalRef.current && !modalRef.current.contains(e.target)) handleClose(); },
    [handleClose]
  );

  // Normalise for accent-insensitive matching
  const normalise = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = normalise(query.trim());

  const results =
    q.length < 2
      ? []
      : products.filter((p) => {
          const coll = collections.find((c) => c.id === p.collection_id);
          const collName = coll ? normalise(coll.name) : '';
          return (
            normalise(p.name).includes(q) ||
            normalise(p.description).includes(q) ||
            collName.includes(q)
          );
        });

  const goToProduct = (id) => {
    handleClose();
    navigate(`/produto/${id}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-60 flex items-start justify-center pt-[10vh]
                     bg-baby-text/40 dark:bg-black/40 backdrop-blur-sm"
          onClick={handleBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Buscar produtos"
        >
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-[min(560px,calc(100vw-2rem))] bg-surface rounded-2xl shadow-xl
                       overflow-hidden max-h-[70vh] flex flex-col"
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-baby-pink/40">
              <FiSearch size={20} className="text-baby-accent shrink-0" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar roupas, categorias..."
                className="flex-1 font-sans text-baby-text placeholder-baby-accent/60
                           text-base outline-none bg-transparent"
                aria-label="Buscar produtos"
              />
              <button
                type="button"
                onClick={handleClose}
                className="p-2 min-w-11 min-h-11 flex items-center justify-center
                           rounded-full hover:bg-baby-pink/40 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-baby-accent"
                aria-label="Fechar busca"
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Results */}
            <div className="overflow-y-auto flex-1" role="listbox" aria-label="Resultados da busca">
              {q.length < 2 && (
                <div className="px-5 py-8 text-center">
                  <p className="font-sans text-baby-accent text-sm">
                    Digite ao menos 2 caracteres para buscar
                  </p>
                </div>
              )}

              {q.length >= 2 && results.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <p className="font-sans text-baby-text/70 text-sm">
                    Nenhum produto encontrado para &ldquo;{query}&rdquo;
                  </p>
                </div>
              )}

              {results.length > 0 && (
                <ul className="divide-y divide-baby-pink/30">
                  {results.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => goToProduct(product.id)}
                        className="w-full flex items-center gap-4 px-5 py-3
                                   hover:bg-baby-pink-light/60 active:bg-baby-pink/40
                                   transition-colors text-left
                                   focus:outline-none focus:bg-baby-pink-light/60"
                        role="option"
                        aria-selected="false"
                      >
                        <img
                          src={product.images[0]}
                          alt=""
                          className="w-12 h-12 rounded-xl object-cover shrink-0"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-serif text-baby-text text-sm font-medium truncate">
                            {product.name}
                          </p>
                          <p className="font-sans text-baby-accent text-xs truncate">
                            {product.description}
                          </p>
                        </div>
                        <span className="font-sans text-baby-accent font-medium text-sm whitespace-nowrap">
                          {formatPrice(product.price)}
                        </span>
                        <FiArrowRight size={16} className="text-baby-accent/60 shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-3 border-t border-baby-pink/30 bg-baby-cream/50">
              <p className="font-sans text-baby-accent/70 text-xs text-center">
                <kbd className="px-1.5 py-0.5 rounded bg-baby-pink/40 font-mono text-[10px]">ESC</kbd>
                {' '}para fechar
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
