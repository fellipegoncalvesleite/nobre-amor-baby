import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSearch,
  FiUser,
  FiHeart,
  FiShoppingBag,
  FiMenu,
  FiX,
  FiLogOut,
  FiPackage,
  FiTerminal,
  FiSettings,
} from 'react-icons/fi';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { btnIcon, focusRing } from '../lib/ui';
import SearchModal from './SearchModal';
import DarkModeToggle from './DarkModeToggle';

const navLinks = [
  { name: 'Início', to: '/', end: true },
  { name: 'Produtos', to: '/produtos' },
  { name: 'Coleções', to: '/colecoes' },
  { name: 'Novidades', to: '/novidades' },
  { name: 'Promoções', to: '/promocoes' },
  { name: 'Sobre', to: '/sobre' },
];

const linkBase =
  'px-3 py-2 min-h-11 flex items-center text-baby-text/80 hover:text-baby-text font-sans text-sm tracking-wide rounded-lg transition-colors hover:bg-baby-pink/40 active:bg-baby-pink/60 focus:outline-none focus:ring-2 focus:ring-baby-accent';

const linkActive = 'text-baby-accent font-semibold';

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const { cartCount, wishlist } = useStore();
  const { isAuthed, user: authUser, logout } = useAuth();
  const location = useLocation();
  const accountRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close account dropdown on outside click, Escape, or browser navigation
  useEffect(() => {
    if (!isAccountOpen) return;
    const onMouseDown = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setIsAccountOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsAccountOpen(false);
    };
    const onPopState = () => setIsAccountOpen(false);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
    };
  }, [isAccountOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const closeMobile = useCallback(() => setIsMobileMenuOpen(false), []);
  const openSearch = useCallback(() => {
    setIsMobileMenuOpen(false);
    setIsSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-surface/95 backdrop-blur-md shadow-soft'
            : 'bg-baby-cream'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((o) => !o)}
              className={`md:hidden ${btnIcon} text-baby-text hover:bg-baby-pink/50`}
              aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav"
            >
              {isMobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
            </button>

            {/* Logo */}
            <Link
              to="/"
              onClick={closeMobile}
              className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-baby-accent rounded-lg"
              aria-label="Nobre Amor Baby — Início"
            >
              <img
                src="/logo.png"
                alt=""
                className="h-10 md:h-12 w-auto object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                }}
              />
              <span
                className="hidden font-serif text-xl md:text-2xl text-baby-text font-medium"
                style={{ display: 'none' }}
              >
                Nobre Amor Baby
              </span>
              <span className="sr-only">Nobre Amor Baby</span>
            </Link>

            {/* Desktop nav */}
            <nav
              className="hidden md:flex items-center gap-1 lg:gap-2"
              aria-label="Navegação principal"
            >
              {navLinks.map((link) => (
                <NavLink
                  key={link.name}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `${linkBase} ${isActive ? linkActive : ''}`
                  }
                >
                  {link.name}
                </NavLink>
              ))}
            </nav>

            {/* Right-side icons */}
            <div className="flex items-center gap-1">
              {/* Dark mode */}
              <DarkModeToggle />

              {/* Search */}
              <button
                type="button"
                onClick={openSearch}
                className={`${btnIcon} text-baby-text/80 hover:text-baby-text hover:bg-baby-pink/50`}
                aria-label="Buscar produtos"
              >
                <FiSearch size={20} />
              </button>

              {/* Account dropdown */}
              <div className="hidden sm:block relative" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (!isAuthed) return;
                    setIsAccountOpen((o) => !o);
                  }}
                  className={`${btnIcon} text-baby-text/80 hover:text-baby-text hover:bg-baby-pink/50
                              ${isAccountOpen ? 'bg-baby-pink/40' : ''}`}
                  aria-label={isAuthed ? `Conta de ${authUser?.name ?? 'usuário'}` : 'Entrar na conta'}
                  aria-expanded={isAuthed ? isAccountOpen : undefined}
                  aria-haspopup={isAuthed ? 'menu' : undefined}
                >
                  <FiUser size={20} />
                </button>

                {/* Subtle role badge next to account icon (manager/debug only) */}
                {isAuthed && authUser?.role === 'manager' && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded bg-baby-accent/90
                                   text-white font-sans text-[8px] font-bold uppercase leading-tight tracking-wide
                                   pointer-events-none select-none">
                    Gerente
                  </span>
                )}
                {isAuthed && authUser?.role === 'debug' && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded bg-purple-500/90
                                   text-white font-sans text-[8px] font-bold uppercase leading-tight tracking-wide
                                   pointer-events-none select-none">
                    Dev
                  </span>
                )}

                {/* If not authed, overlay a Link so click navigates to /entrar */}
                {!isAuthed && (
                  <Link
                    to="/entrar"
                    state={{ from: location.pathname }}
                    className="absolute inset-0"
                    aria-label="Entrar na conta"
                    tabIndex={-1}
                  />
                )}

                {/* Dropdown menu (authed only) */}
                <AnimatePresence>
                  {isAuthed && isAccountOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      role="menu"
                      className="absolute right-0 top-full mt-2 w-60 bg-surface border border-baby-pink
                                 rounded-xl shadow-soft-lg py-2 z-50"
                    >
                      {/* Greeting + role badge */}
                      <div className="px-4 py-2.5 border-b border-baby-pink/50">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-sans text-sm font-medium text-baby-text truncate">
                            {authUser?.name ? `Olá, ${authUser.name}` : 'Minha conta'}
                          </p>
                          {authUser?.role === 'customer' && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-baby-pink/50 text-baby-text/60
                                             font-sans text-[10px] font-semibold uppercase tracking-wide">
                              Cliente
                            </span>
                          )}
                          {authUser?.role === 'manager' && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-baby-accent/15 text-baby-accent
                                             font-sans text-[10px] font-semibold uppercase tracking-wide">
                              Gerente
                            </span>
                          )}
                          {authUser?.role === 'debug' && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40
                                             text-purple-700 dark:text-purple-300
                                             font-sans text-[10px] font-semibold uppercase tracking-wide">
                              Dev
                            </span>
                          )}
                        </div>
                        {authUser?.email && (
                          <p className="font-sans text-xs text-baby-text/40 truncate mt-0.5">{authUser.email}</p>
                        )}
                      </div>

                      {/* Standard menu items */}
                      <div className="py-1">
                        <Link
                          to="/entrar"
                          role="menuitem"
                          onClick={() => setIsAccountOpen(false)}
                          className={`flex items-center gap-3 px-4 py-2.5 font-sans text-sm text-baby-text/70
                                     hover:bg-baby-pink/30 hover:text-baby-text transition-colors
                                     ${focusRing}`}
                        >
                          <FiUser size={16} aria-hidden="true" />
                          Meu perfil
                        </Link>
                        <Link
                          to="/meus-pedidos"
                          role="menuitem"
                          onClick={() => setIsAccountOpen(false)}
                          className={`flex items-center gap-3 px-4 py-2.5 font-sans text-sm text-baby-text/70
                                     hover:bg-baby-pink/30 hover:text-baby-text transition-colors
                                     ${focusRing}`}
                        >
                          <FiPackage size={16} aria-hidden="true" />
                          Meus Pedidos
                        </Link>
                      </div>

                      {/* Role-specific items */}
                      {(authUser?.role === 'manager' || authUser?.role === 'debug') && (
                        <div className="border-t border-baby-pink/50 py-1">
                          <Link
                            to="/admin"
                            role="menuitem"
                            onClick={() => setIsAccountOpen(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 font-sans text-sm text-baby-text/70
                                       hover:bg-baby-pink/30 hover:text-baby-text transition-colors
                                       ${focusRing}`}
                          >
                            <FiSettings size={16} aria-hidden="true" />
                            Painel (Admin)
                          </Link>
                          <Link
                            to="/admin/pedidos"
                            role="menuitem"
                            onClick={() => setIsAccountOpen(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 font-sans text-xs text-baby-text/55
                                       hover:bg-baby-pink/30 hover:text-baby-text transition-colors pl-10
                                       ${focusRing}`}
                          >
                            Pedidos
                          </Link>
                          <Link
                            to="/admin/catalogo"
                            role="menuitem"
                            onClick={() => setIsAccountOpen(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 font-sans text-xs text-baby-text/55
                                       hover:bg-baby-pink/30 hover:text-baby-text transition-colors pl-10
                                       ${focusRing}`}
                          >
                            Catálogo
                          </Link>
                          {authUser?.role === 'debug' && (
                            <Link
                              to="/debug"
                              role="menuitem"
                              onClick={() => setIsAccountOpen(false)}
                              className={`flex items-center gap-3 px-4 py-2.5 font-sans text-sm text-purple-600 dark:text-purple-400
                                         hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-700 dark:hover:text-purple-300 transition-colors
                                         ${focusRing}`}
                            >
                              <FiTerminal size={16} aria-hidden="true" />
                              Ferramentas (Debug)
                            </Link>
                          )}
                        </div>
                      )}

                      {/* Logout — danger style */}
                      <div className="border-t border-baby-pink/50 pt-1 mt-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { logout(); setIsAccountOpen(false); }}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 font-sans text-sm
                                     text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/15
                                     hover:text-red-600 dark:hover:text-red-300 transition-colors text-left
                                     ${focusRing}`}
                        >
                          <FiLogOut size={16} aria-hidden="true" />
                          Sair
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Wishlist */}
              <Link
                to="/favoritos"
                className={`hidden sm:flex relative ${btnIcon} text-baby-text/80 hover:text-baby-text hover:bg-baby-pink/50`}
                aria-label={`Favoritos — ${wishlist.length} itens`}
              >
                <FiHeart size={20} />
                {wishlist.length > 0 && (
                  <span
                    className="absolute top-0.5 right-0.5 bg-red-400 text-white text-[10px] leading-none
                               w-4 h-4 rounded-full flex items-center justify-center font-sans"
                    aria-hidden="true"
                  >
                    {wishlist.length}
                  </span>
                )}
              </Link>

              {/* Cart */}
              <Link
                to="/carrinho"
                className={`relative ${btnIcon} text-baby-text/80 hover:text-baby-text hover:bg-baby-pink/50`}
                aria-label={`Carrinho — ${cartCount} itens`}
              >
                <FiShoppingBag size={20} />
                {cartCount > 0 && (
                  <span
                    className="absolute top-0.5 right-0.5 bg-baby-accent text-white dark:text-baby-cream text-[10px] leading-none
                               w-4 h-4 rounded-full flex items-center justify-center font-sans"
                    aria-hidden="true"
                  >
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile nav drawer */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.nav
              id="mobile-nav"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="md:hidden bg-surface border-t border-baby-pink overflow-hidden"
              aria-label="Navegação móvel"
            >
              <div className="px-4 py-4 space-y-1">
                {navLinks.map((link) => (
                  <NavLink
                    key={link.name}
                    to={link.to}
                    end={link.end}
                    onClick={closeMobile}
                    className={({ isActive }) =>
                      `flex items-center min-h-12 px-4 py-3 rounded-xl
                       font-sans transition-colors
                       hover:bg-baby-pink/30 active:bg-baby-pink/50
                       focus:outline-none focus:ring-2 focus:ring-baby-accent
                       ${isActive ? 'text-baby-accent font-semibold bg-baby-pink/20' : 'text-baby-text/80 hover:text-baby-text'}`
                    }
                  >
                    {link.name}
                  </NavLink>
                ))}

                {/* Account / Auth section */}
                <div className="flex flex-col gap-1 pt-4 border-t border-baby-pink/50">
                  {isAuthed ? (
                    <>
                      {/* Greeting + role */}
                      <div className="flex items-center gap-2 px-4 py-2 mb-1">
                        <FiUser size={18} className="text-baby-text/60 shrink-0" aria-hidden="true" />
                        <span className="font-sans text-sm font-medium text-baby-text truncate">
                          Olá, {authUser?.name ?? 'Usuário'}
                        </span>
                        {authUser?.role === 'customer' && (
                          <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded-full bg-baby-pink/50
                                           text-baby-text/60 font-sans text-[10px] font-semibold uppercase">Cliente</span>
                        )}
                        {authUser?.role === 'manager' && (
                          <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded-full bg-baby-accent/15
                                           text-baby-accent font-sans text-[10px] font-semibold uppercase">Gerente</span>
                        )}
                        {authUser?.role === 'debug' && (
                          <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40
                                           text-purple-700 dark:text-purple-300 font-sans text-[10px] font-semibold uppercase">Dev</span>
                        )}
                      </div>

                      {/* Role-specific links */}
                      {(authUser?.role === 'manager' || authUser?.role === 'debug') && (
                        <Link
                          to="/admin"
                          onClick={closeMobile}
                          className="flex items-center gap-2 min-h-12 px-4 py-3 rounded-xl
                                     text-baby-text/80 hover:text-baby-text
                                     hover:bg-baby-pink/30 active:bg-baby-pink/50
                                     transition-colors font-sans
                                     focus:outline-none focus:ring-2 focus:ring-baby-accent"
                        >
                          <FiSettings size={18} aria-hidden="true" />
                          <span>Painel (Admin)</span>
                        </Link>
                      )}
                      {authUser?.role === 'debug' && (
                        <Link
                          to="/debug"
                          onClick={closeMobile}
                          className="flex items-center gap-2 min-h-12 px-4 py-3 rounded-xl
                                     text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300
                                     hover:bg-purple-50 dark:hover:bg-purple-900/20 active:bg-purple-100
                                     transition-colors font-sans
                                     focus:outline-none focus:ring-2 focus:ring-baby-accent"
                        >
                          <FiTerminal size={18} aria-hidden="true" />
                          <span>Ferramentas (Debug)</span>
                        </Link>
                      )}

                      {/* Logout */}
                      <button
                        type="button"
                        onClick={() => { logout(); closeMobile(); }}
                        className="flex items-center gap-2 min-h-12 px-4 py-3 rounded-xl
                                   text-red-500 dark:text-red-400 hover:text-red-600
                                   hover:bg-red-50 dark:hover:bg-red-900/15 active:bg-red-100
                                   transition-colors font-sans
                                   focus:outline-none focus:ring-2 focus:ring-baby-accent"
                      >
                        <FiLogOut size={18} aria-hidden="true" />
                        <span>Sair</span>
                      </button>
                    </>
                  ) : (
                    <Link
                      to="/entrar"
                      state={{ from: location.pathname }}
                      onClick={closeMobile}
                      className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-xl
                                 text-baby-text/80 hover:text-baby-text
                                 hover:bg-baby-pink/30 active:bg-baby-pink/50
                                 transition-colors font-sans
                                 focus:outline-none focus:ring-2 focus:ring-baby-accent"
                    >
                      <FiUser size={18} aria-hidden="true" />
                      <span>Entrar</span>
                    </Link>
                  )}
                </div>

                {/* Utilities row */}
                <div className="flex gap-2 pt-2 flex-wrap">
                  <Link
                    to="/meus-pedidos"
                    onClick={closeMobile}
                    className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-xl
                               text-baby-text/80 hover:text-baby-text
                               hover:bg-baby-pink/30 active:bg-baby-pink/50
                               transition-colors font-sans
                               focus:outline-none focus:ring-2 focus:ring-baby-accent"
                  >
                    <FiPackage size={18} aria-hidden="true" />
                    <span>Meus Pedidos</span>
                  </Link>
                  <Link
                    to="/favoritos"
                    onClick={closeMobile}
                    className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-xl
                               text-baby-text/80 hover:text-baby-text
                               hover:bg-baby-pink/30 active:bg-baby-pink/50
                               transition-colors font-sans
                               focus:outline-none focus:ring-2 focus:ring-baby-accent"
                  >
                    <FiHeart size={18} aria-hidden="true" />
                    <span>Favoritos{wishlist.length > 0 ? ` (${wishlist.length})` : ''}</span>
                  </Link>
                  <Link
                    to="/carrinho"
                    onClick={closeMobile}
                    className="flex items-center gap-2 min-h-12 px-4 py-2 rounded-xl
                               text-baby-text/80 hover:text-baby-text
                               hover:bg-baby-pink/30 active:bg-baby-pink/50
                               transition-colors font-sans
                               focus:outline-none focus:ring-2 focus:ring-baby-accent"
                  >
                    <FiShoppingBag size={18} aria-hidden="true" />
                    <span>Carrinho{cartCount > 0 ? ` (${cartCount})` : ''}</span>
                  </Link>
                </div>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </motion.header>

      <SearchModal isOpen={isSearchOpen} onClose={closeSearch} />
    </>
  );
}
