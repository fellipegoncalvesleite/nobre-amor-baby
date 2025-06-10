import { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';

/* ── localStorage helpers ─────────────────────────────── */

const STORAGE_VERSION = 'v1';
const key = (name) => `nobre_amor_${STORAGE_VERSION}_${name}`;

function load(name, fallback) {
  try {
    const raw = localStorage.getItem(key(name));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(name, value) {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

/* ── Initial state ────────────────────────────────────── */

const initialShipping = {
  cepDigits: '',         // 8 digits only
  city: '',              // auto-filled from ViaCEP or typed
  uf: '',                // auto-filled from ViaCEP or typed
  feeCents: null,        // final fee shown to customer (cents)
  etaText: '',           // e.g. "Entrega local (1–2 dias úteis)" or "5 dias úteis"
  source: '',            // 'local_fixed' | 'melhorenvio' | '' (internal only)
  isLoading: false,      // true while shipping is being calculated
  error: '',             // user-facing error message, '' when ok
};

const initialAddress = {
  cep: '',
  street: '',            // logradouro (auto-filled from ViaCEP)
  number: '',            // número (user input, required)
  complement: '',        // complemento (optional)
  neighborhood: '',      // bairro (auto-filled from ViaCEP)
  city: '',              // localidade (auto-filled)
  uf: '',                // UF (auto-filled)
};

const initialPayment = {
  method: 'pix',                     // 'cartao' | 'pix'
  card: { installments: 1 },
  lastOrder: null,                   // latest API response used by the success page / retry flow
};

function migratePayment(loaded) {
  if (!loaded || typeof loaded !== 'object') return { ...initialPayment };
  return {
    ...initialPayment,
    method: loaded.method === 'cartao' ? 'cartao' : 'pix',
    card: { ...initialPayment.card, ...(loaded.card || {}) },
    lastOrder: loaded.lastOrder || null,
  };
}

/** Migrate old shipping state shapes to current shape. */
function migrateShipping(loaded) {
  if (!loaded || typeof loaded !== 'object') return { ...initialShipping };
  // Old shape had 'mode' — discard and reset
  if ('mode' in loaded) return { ...initialShipping };
  // Ensure all current keys exist
  return { ...initialShipping, ...loaded };
}

const initialState = {
  /** @type {{ id: string; qty: number; size: string }[]} */
  cart: load('cart', []),
  /** @type {string[]} product ids */
  wishlist: load('wishlist', []),
  /** @type {{ displayName: string }} */
  user: load('user', { displayName: '' }),
  /** Shipping state (persisted) */
  shipping: migrateShipping(load('shipping', initialShipping)),
  /** Address state (persisted) */
  address: load('address', initialAddress),
  /** Payment state (persisted) */
  payment: migratePayment(load('payment', initialPayment)),
};

/* ── Reducer ──────────────────────────────────────────── */

function reducer(state, action) {
  switch (action.type) {
    /* ── Cart ─────────────────────────────────────────── */
    case 'ADD_TO_CART': {
      const { id, size, qty = 1 } = action.payload;
      const idx = state.cart.findIndex((i) => i.id === id && i.size === size);
      if (idx >= 0) {
        const cart = state.cart.map((item, i) =>
          i === idx ? { ...item, qty: item.qty + qty } : item
        );
        return { ...state, cart };
      }
      return { ...state, cart: [...state.cart, { id, qty, size }] };
    }
    case 'REMOVE_FROM_CART': {
      const { id, size } = action.payload;
      return {
        ...state,
        cart: state.cart.filter((i) => !(i.id === id && i.size === size)),
      };
    }
    case 'SET_CART_QTY': {
      const { id, size, qty } = action.payload;
      if (qty <= 0) {
        return {
          ...state,
          cart: state.cart.filter((i) => !(i.id === id && i.size === size)),
        };
      }
      return {
        ...state,
        cart: state.cart.map((i) =>
          i.id === id && i.size === size ? { ...i, qty } : i
        ),
      };
    }
    case 'CLEAR_CART':
      return { ...state, cart: [] };

    /* ── Wishlist ─────────────────────────────────────── */
    case 'TOGGLE_WISHLIST': {
      const id = action.payload;
      const exists = state.wishlist.includes(id);
      return {
        ...state,
        wishlist: exists
          ? state.wishlist.filter((i) => i !== id)
          : [...state.wishlist, id],
      };
    }

    /* ── User ─────────────────────────────────────────── */
    case 'SET_USER':
      return { ...state, user: { ...state.user, ...action.payload } };

    /* ── Shipping ─────────────────────────────────────── */
    case 'SET_SHIPPING':
      return {
        ...state,
        shipping: { ...state.shipping, ...action.payload },
      };
    case 'CLEAR_SHIPPING':
      return { ...state, shipping: { ...initialShipping } };

    /* ── Address ──────────────────────────────────────── */
    case 'SET_ADDRESS':
      return { ...state, address: { ...state.address, ...action.payload } };
    case 'CLEAR_ADDRESS':
      return { ...state, address: { ...initialAddress } };

    /* ── Payment ──────────────────────────────────────── */
    case 'SET_PAYMENT':
      return { ...state, payment: { ...state.payment, ...action.payload } };
    case 'SET_PAYMENT_CARD':
      return {
        ...state,
        payment: {
          ...state.payment,
          card: { ...(state.payment.card || {}), ...action.payload },
        },
      };
    case 'RESET_PAYMENT':
      return { ...state, payment: { ...initialPayment } };

    default:
      return state;
  }
}

/* ── Context ──────────────────────────────────────────── */

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Persist on every change
  useEffect(() => { save('cart', state.cart); }, [state.cart]);
  useEffect(() => { save('wishlist', state.wishlist); }, [state.wishlist]);
  useEffect(() => { save('user', state.user); }, [state.user]);
  useEffect(() => { save('shipping', state.shipping); }, [state.shipping]);
  useEffect(() => { save('address', state.address); }, [state.address]);
  useEffect(() => { save('payment', state.payment); }, [state.payment]);

  /* ── Convenience actions ─────────────────────────── */

  const addToCart = useCallback(
    (id, size, qty = 1) => dispatch({ type: 'ADD_TO_CART', payload: { id, size, qty } }),
    []
  );
  const removeFromCart = useCallback(
    (id, size) => dispatch({ type: 'REMOVE_FROM_CART', payload: { id, size } }),
    []
  );
  const setCartQty = useCallback(
    (id, size, qty) => dispatch({ type: 'SET_CART_QTY', payload: { id, size, qty } }),
    []
  );
  const clearCart = useCallback(() => dispatch({ type: 'CLEAR_CART' }), []);

  const toggleWishlist = useCallback(
    (id) => dispatch({ type: 'TOGGLE_WISHLIST', payload: id }),
    []
  );
  const isInWishlist = useCallback(
    (id) => state.wishlist.includes(id),
    [state.wishlist]
  );

  const setUser = useCallback(
    (data) => dispatch({ type: 'SET_USER', payload: data }),
    []
  );

  /* ── Shipping actions ────────────────────────────── */
  const setShipping = useCallback(
    (fields) => dispatch({ type: 'SET_SHIPPING', payload: fields }),
    [],
  );
  const clearShipping = useCallback(
    () => dispatch({ type: 'CLEAR_SHIPPING' }),
    [],
  );

  /* ── Address actions ─────────────────────────────── */
  const setAddress = useCallback(
    (fields) => dispatch({ type: 'SET_ADDRESS', payload: fields }),
    [],
  );
  const clearAddress = useCallback(
    () => dispatch({ type: 'CLEAR_ADDRESS' }),
    [],
  );

  /* ── Payment actions ─────────────────────────────── */
  const setPayment = useCallback(
    (fields) => dispatch({ type: 'SET_PAYMENT', payload: fields }),
    [],
  );
  const setPaymentCard = useCallback(
    (fields) => dispatch({ type: 'SET_PAYMENT_CARD', payload: fields }),
    [],
  );
  const resetPayment = useCallback(
    () => dispatch({ type: 'RESET_PAYMENT' }),
    [],
  );

  const cartCount = useMemo(
    () => state.cart.reduce((sum, i) => sum + i.qty, 0),
    [state.cart]
  );

  const value = useMemo(
    () => ({
      cart: state.cart,
      wishlist: state.wishlist,
      user: state.user,
      shipping: state.shipping,
      address: state.address,
      payment: state.payment,
      cartCount,
      addToCart,
      removeFromCart,
      setCartQty,
      clearCart,
      toggleWishlist,
      isInWishlist,
      setUser,
      setShipping,
      clearShipping,
      setAddress,
      clearAddress,
      setPayment,
      setPaymentCard,
      resetPayment,
    }),
    [
      state.cart, state.wishlist, state.user, state.shipping, state.address, state.payment, cartCount,
      addToCart, removeFromCart, setCartQty, clearCart,
      toggleWishlist, isInWishlist, setUser,
      setShipping, clearShipping, setAddress, clearAddress,
      setPayment, setPaymentCard, resetPayment,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** @returns {ReturnType<typeof StoreProvider>['value']} */
// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
