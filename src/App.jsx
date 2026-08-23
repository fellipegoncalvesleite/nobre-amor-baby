import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './components/ScrollToTop';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';

const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const ProductListingPage = lazy(() => import('./pages/ProductListingPage'));
const AllProductsPage = lazy(() => import('./pages/AllProductsPage'));
const ColecoesPage = lazy(() => import('./pages/ColecoesPage'));
const WishlistPage = lazy(() => import('./pages/WishlistPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminOrdersPage = lazy(() => import('./pages/AdminOrdersPage'));
const AdminOrderDetailPage = lazy(() => import('./pages/AdminOrderDetailPage'));
const AdminCatalogPage = lazy(() => import('./pages/AdminCatalogPage'));
const AdminHomePage = lazy(() => import('./pages/AdminHomePage'));
const OrderSuccessPage = lazy(() => import('./pages/OrderSuccessPage'));
const MeusPedidosPage = lazy(() => import('./pages/MeusPedidosPage'));
const MinhaContaPage = lazy(() => import('./pages/MinhaContaPage'));
const CustomerOrderDetailPage = lazy(() => import('./pages/CustomerOrderDetailPage'));
const DebugPage = lazy(() => import('./pages/DebugPage'));
const StaticPage = lazy(() => import('./pages/StaticPage'));

function AuthRedirectBridge() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const hasAuthParams = searchParams.has('token_hash') || searchParams.has('code') || searchParams.has('error');

    if (!hasAuthParams) return;
    if (location.pathname === '/auth/callback' || location.pathname === '/redefinir-senha') return;

    const targetPath = searchParams.get('type') === 'recovery' ? '/redefinir-senha' : '/auth/callback';
    navigate({ pathname: targetPath, search: location.search }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  return null;
}

function RouteLoadingFallback() {
  return (
    <div role="status" className="py-10 text-center font-sans text-baby-text dark:text-baby-cream">
      Carregando…
    </div>
  );
}

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Toaster position="top-center" toastOptions={{ duration: 2200 }} />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-baby-text text-white dark:text-baby-cream px-4 py-2 rounded-lg z-100 font-sans"
      >
        Ir para o conteúdo principal
      </a>

      <ScrollToTop />
      <AuthRedirectBridge />
      <Header />

      <main id="main-content" className="flex-1">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/produto/:id" element={<ProductDetailPage />} />
            <Route path="/produtos" element={<AllProductsPage />} />
            <Route path="/novidades" element={<ProductListingPage filter="new" />} />
            <Route path="/promocoes" element={<ProductListingPage filter="promo" />} />
            <Route path="/colecoes" element={<ColecoesPage />} />
            <Route path="/colecoes/:slug" element={<ProductListingPage filter="category" />} />
            <Route path="/favoritos" element={<WishlistPage />} />
            <Route path="/carrinho" element={<CartPage />} />
            <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
            <Route path="/pedido-enviado" element={<ProtectedRoute><OrderSuccessPage /></ProtectedRoute>} />
            <Route path="/meus-pedidos" element={<ProtectedRoute><MeusPedidosPage /></ProtectedRoute>} />
            <Route path="/meus-pedidos/:orderCode" element={<ProtectedRoute><CustomerOrderDetailPage /></ProtectedRoute>} />
            <Route path="/minha-conta" element={<ProtectedRoute><MinhaContaPage /></ProtectedRoute>} />
            <Route path="/entrar" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

            <Route path="/admin" element={<ProtectedRoute role="manager"><AdminDashboardPage /></ProtectedRoute>} />
            <Route path="/admin/pedidos" element={<ProtectedRoute role="manager"><AdminOrdersPage /></ProtectedRoute>} />
            <Route path="/admin/pedidos/:orderCode" element={<ProtectedRoute role="manager"><AdminOrderDetailPage /></ProtectedRoute>} />
            <Route path="/admin/catalogo" element={<ProtectedRoute role="manager"><AdminCatalogPage /></ProtectedRoute>} />
            <Route path="/admin/produtos" element={<Navigate to="/admin/catalogo?tab=produtos" replace />} />
            <Route path="/admin/colecoes-gerenciar" element={<Navigate to="/admin/catalogo?tab=colecoes" replace />} />
            <Route path="/admin/inicio" element={<ProtectedRoute role="manager"><AdminHomePage /></ProtectedRoute>} />

            <Route path="/debug" element={<ProtectedRoute role="debug"><DebugPage /></ProtectedRoute>} />
            <Route path="/sobre" element={<StaticPage page="sobre" />} />
            <Route path="/faq" element={<StaticPage page="faq" />} />
            <Route path="/guia-de-tamanhos" element={<StaticPage page="guia-de-tamanhos" />} />
            <Route path="/envio-e-trocas" element={<StaticPage page="envio-e-trocas" />} />
            <Route path="/privacidade" element={<StaticPage page="privacidade" />} />
            <Route path="/termos" element={<StaticPage page="termos" />} />
            <Route path="*" element={<StaticPage page="404" />} />
          </Routes>
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}

export default App;
