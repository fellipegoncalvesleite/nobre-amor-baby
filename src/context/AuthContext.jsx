/**
 * AuthContext — Supabase Auth (Email+Password, Google OAuth).
 *
 * Roles (from profiles table):
 *   "customer"  — default
 *   "manager"   — admin access (assigned via the profiles table / DB trigger)
 *   "debug"     — superset of manager (assigned via the profiles table)
 *
 * Exposes:
 *   session, user, profile, isAuthed, loading
 *   hasRole(r), signUp, signInWithPassword, signInWithOtp,
 *   signInWithOAuth, resetPassword, updatePassword, signOut, accessToken
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { assertSupabaseConfigured, supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(() => !!supabase);

  /* ── Fetch profile from DB ─────────────────────── */
  const fetchProfile = useCallback(async (userId, token) => {
    if (!userId || !token) { setProfile(null); return; }
    try {
      const res = await fetch(`/api/public?resource=profile&userId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    if (!supabase) return undefined;

    // 1. Restore any existing session from storage
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user && s?.access_token) fetchProfile(s.user.id, s.access_token);
      setLoading(false);
    });

    // 2. Listen for auth state changes (login, logout, token refresh, email confirm)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // Debug: log auth events to sessionStorage + console
      if (import.meta.env.DEV) {
        console.log(`[Auth] Event: ${event}`, { hasSession: !!s, userId: s?.user?.id });
      }
      try {
        const logs = JSON.parse(sessionStorage.getItem('nobre_amor_auth_debug') || '[]');
        logs.push({ event, timestamp: new Date().toISOString(), hasSession: !!s, userId: s?.user?.id ?? null });
        if (logs.length > 20) logs.splice(0, logs.length - 20);
        sessionStorage.setItem('nobre_amor_auth_debug', JSON.stringify(logs));
      } catch { /* ok */ }

      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id, s.access_token);
      } else {
        setProfile(null);
      }
      // Always ensure loading is false after any auth event
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const requireSupabase = useCallback(() => {
    assertSupabaseConfigured();
    return supabase;
  }, []);

  /* ── Auth actions ──────────────────────────────── */
  const signUp = useCallback(async (email, password, firstName, lastName) => {
    const client = requireSupabase();
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, first_name: firstName, last_name: lastName || '' },
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    });
    if (error) throw error;
  }, [requireSupabase]);

  const signInWithPassword = useCallback(async (email, password) => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, [requireSupabase]);

  const signInWithOtp = useCallback(async (email) => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    });
    if (error) throw error;
  }, [requireSupabase]);

  const signInWithOAuth = useCallback(async (provider) => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + '/auth/callback',
        queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
      },
    });
    if (error) throw error;
  }, [requireSupabase]);

  const resetPassword = useCallback(async (email) => {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/redefinir-senha',
    });
    if (error) throw error;
  }, [requireSupabase]);

  const updatePassword = useCallback(async (newPassword) => {
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, [requireSupabase]);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
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
      avatarUrl: user.user_metadata?.avatar_url || '',
      avatarPath: user.user_metadata?.avatar_path || '',
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
      signUp,
      signInWithPassword,
      signInWithOtp,
      signInWithOAuth,
      resetPassword,
      updatePassword,
      signOut,
      accessToken,
      logout: signOut,
    }),
    [session, authUser, profile, isAuthed, loading, hasRole, signUp, signInWithPassword, signInWithOtp, signInWithOAuth, resetPassword, updatePassword, signOut, accessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
