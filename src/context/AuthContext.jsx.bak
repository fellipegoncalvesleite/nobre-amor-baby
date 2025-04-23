/**
 * AuthContext — local-only authentication (frontend-only, no backend).
 *
 * Roles:
 *   "customer"  — default for any login
 *   "manager"   — access code MANAGER-123
 *   "debug"     — access code DEBUG-123  (also grants manager access)
 *
 * Persisted in localStorage under "nobre_amor_v1_auth".
 *
 * Testing notes:
 *   1. Visit /checkout while logged out → redirects to /entrar
 *      → log in → auto-redirected back to /checkout
 *   2. Log in with code "MANAGER-123" → visit /admin → access granted
 *   3. Log in with code "DEBUG-123"   → visit /admin → access granted
 *   4. Log in with no code            → role "customer" → /admin redirects to /
 */
import { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';

/* ── localStorage helpers (same pattern as StoreContext) ── */

const STORAGE_KEY = 'nobre_amor_v1_auth';

function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate shape
    if (
      parsed &&
      typeof parsed.name === 'string' &&
      typeof parsed.email === 'string' &&
      ['customer', 'manager', 'debug'].includes(parsed.role)
    ) {
      return parsed;
    }
  } catch {
    /* corrupted — ignore */
  }
  return null;
}

function saveAuth(user) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* quota exceeded */
  }
}

/* ── Initial state ────────────────────────────────────── */

const storedUser = loadAuth();

const initialState = {
  isAuthed: !!storedUser,
  user: storedUser, // { name, email, role } | null
};

/* ── Reducer ──────────────────────────────────────────── */

function reducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      return { isAuthed: true, user: action.payload };
    case 'LOGOUT':
      return { isAuthed: false, user: null };
    default:
      return state;
  }
}

/* ── Context ──────────────────────────────────────────── */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Persist on every change
  useEffect(() => {
    saveAuth(state.user);
  }, [state.user]);

  const login = useCallback(
    /** @param {{ name: string, email: string, role: 'customer'|'manager'|'debug' }} user */
    (user) => dispatch({ type: 'LOGIN', payload: user }),
    [],
  );

  const logout = useCallback(
    () => dispatch({ type: 'LOGOUT' }),
    [],
  );

  /** Check if the authenticated user has at least the given role */
  const hasRole = useCallback(
    /** @param {'customer'|'manager'|'debug'} role */
    (role) => {
      if (!state.isAuthed || !state.user) return false;
      if (state.user.role === 'debug') return true; // debug can access everything
      if (role === 'manager') return state.user.role === 'manager';
      return true; // customer — any authed user qualifies
    },
    [state.isAuthed, state.user],
  );

  const value = useMemo(
    () => ({
      isAuthed: state.isAuthed,
      user: state.user,
      login,
      logout,
      hasRole,
    }),
    [state.isAuthed, state.user, login, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
