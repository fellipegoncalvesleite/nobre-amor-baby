/**
 * AuthContext — Supabase Auth (Email OTP, Google, Apple).
 *
 * Roles (from profiles table):
 *   "customer"  — default
 *   "manager"   — admin access  (nobreamorbaby@gmail.com)
 *   "debug"     — superset of manager (felipezzlx@icloud.com)
 *
 * Exposes:
 *   session, user, profile, isAuthed, loading
 *   hasRole(r), signInWithOtp, signInWithOAuth, signOut, accessToken
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ── Fetch profile from DB ─────────────────────── */
  const fetchProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    try {
      const res = await fetch(`/api/public?resource=profile&userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || null);
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
    }
  }, []);

  /* ── Listen to Supabase auth state ─────────────── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) fetchProfile(s.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  /* ── Auth actions ──────────────────────────────── */
  const signInWithOtp = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + '/entrar',
      },
    });
    if (error) throw error;
  }, []);

  const signInWithOAuth = useCallback(async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + '/entrar',
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    try { localStorage.removeItem('nobre_amor_v1_auth'); } catch { /* ok */ }
  }, []);

  /* ── Derived state ─────────────────────────────── */
  const user = session?.user ?? null;
  const isAuthed = !!user;
  const accessToken = session?.access_token ?? null;

  const authUser = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '',
      email: user.email || '',
      role: profile?.role || 'customer',
    };
  }, [user, profile]);

  const hasRole = useCallback(
    (role) => {
      if (!isAuthed || !authUser) return false;
      if (authUser.role === 'debug') return true;
      if (role === 'manager') return authUser.role === 'manager';
      return true;
    },
    [isAuthed, authUser],
  );

  const value = useMemo(
    () => ({
      session,
      user: authUser,
      profile,
      isAuthed,
      loading,
      hasRole,
      signInWithOtp,
      signInWithOAuth,
      signOut,
      accessToken,
      logout: signOut,
    }),
    [session, authUser, profile, isAuthed, loading, hasRole, signInWithOtp, signInWithOAuth, signOut, accessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

