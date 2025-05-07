/**
 * ProtectedRoute — gates child routes behind authentication (and optionally a role).
 *
 * Usage:
 *   <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
 *   <Route path="/admin"    element={<ProtectedRoute role="manager"><AdminPage /></ProtectedRoute>} />
 *
 * Behaviour:
 *   - Auth loading → spinner (prevents flash redirect)
 *   - Not authenticated → redirect to /entrar, passing current path in location.state.from
 *   - Authenticated but wrong role → redirect to /
 *   - Authenticated + correct role → render children
 */
import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { FiLoader } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { setAdminAccessToken } from '../lib/adminApi';
import { saveReturnPath } from '../lib/authReturn';

export default function ProtectedRoute({ children, role }) {
  const { isAuthed, hasRole, loading, accessToken } = useAuth();
  const location = useLocation();

  // Sync access token for adminApi calls
  useEffect(() => {
    if (accessToken) setAdminAccessToken(accessToken);
  }, [accessToken]);

  if (loading) {
    return (
      <section className="pt-24 pb-16 bg-baby-cream min-h-screen flex items-center justify-center">
        <FiLoader size={28} className="animate-spin text-baby-accent" />
      </section>
    );
  }

  if (!isAuthed) {
    saveReturnPath(location.pathname + location.search);
    return <Navigate to="/entrar" state={{ from: location.pathname }} replace />;
  }

  if (role && !hasRole(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
