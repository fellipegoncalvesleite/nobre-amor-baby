/**
 * ProtectedRoute — gates child routes behind authentication (and optionally a role).
 *
 * Usage:
 *   <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
 *   <Route path="/admin"    element={<ProtectedRoute role="manager"><AdminPage /></ProtectedRoute>} />
 *
 * Behaviour:
 *   - Not authenticated → redirect to /entrar, passing current path in location.state.from
 *   - Authenticated but wrong role → redirect to /
 *   - Authenticated + correct role → render children
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, role }) {
  const { isAuthed, hasRole } = useAuth();
  const location = useLocation();

  if (!isAuthed) {
    return <Navigate to="/entrar" state={{ from: location.pathname }} replace />;
  }

  if (role && !hasRole(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
