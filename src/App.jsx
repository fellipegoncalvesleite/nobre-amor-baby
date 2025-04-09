import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './components/ScrollToTop';
import Header from './components/Header';
import Footer from './components/Footer';

/* ── Pages (lazy-ish — they're small enough to bundle) ── */
import HomePage from './pages/HomePage';
import ProductDetailPage from './pages/ProductDetailPage';
import ProductListingPage from './pages/ProductListingPage';
import AllProductsPage from './pages/AllProductsPage';
import ColecoesPage from './pages/ColecoesPage';
import WishlistPage from './pages/WishlistPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import LoginPage from './pages/LoginPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminOrdersPage from './pages/AdminOrdersPage';
import AdminOrderDetailPage from './pages/AdminOrderDetailPage';
import AdminCatalogPage from './pages/AdminCatalogPage';
import OrderSuccessPage from './pages/OrderSuccessPage';
import MeusPedidosPage from './pages/MeusPedidosPage';
import CustomerOrderDetailPage from './pages/CustomerOrderDetailPage';
import DebugPage from './pages/DebugPage';
import StaticPage from './pages/StaticPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Toaster
        position="top-center"
        toastOptions={{ duration: 2000 }}
      />

      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4
                   bg-baby-text text-white dark:text-baby-cream px-4 py-2 rounded-lg z-100 font-sans"
      >
        Ir para o conteúdo principal
      </a>

      <ScrollToTop />
      <Header />

      <main id="main-content" className="flex-1">
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
          <Route path="/pedido-enviado" element={<OrderSuccessPage />} />
          <Route path="/meus-pedidos" element={<MeusPedidosPage />} />
          <Route path="/meus-pedidos/:orderCode" element={<CustomerOrderDetailPage />} />
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/admin" element={<ProtectedRoute role="manager"><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="/admin/pedidos" element={<ProtectedRoute role="manager"><AdminOrdersPage /></ProtectedRoute>} />
          <Route path="/admin/pedidos/:orderCode" element={<ProtectedRoute role="manager"><AdminOrderDetailPage /></ProtectedRoute>} />
          <Route path="/admin/catalogo" element={<ProtectedRoute role="manager"><AdminCatalogPage /></ProtectedRoute>} />
          <Route path="/debug" element={<ProtectedRoute role="debug"><DebugPage /></ProtectedRoute>} />
          <Route path="/sobre" element={<StaticPage page="sobre" />} />
          <Route path="/faq" element={<StaticPage page="faq" />} />
          <Route path="/guia-de-tamanhos" element={<StaticPage page="guia-de-tamanhos" />} />
          <Route path="/envio-e-trocas" element={<StaticPage page="envio-e-trocas" />} />
          <Route path="/privacidade" element={<StaticPage page="privacidade" />} />
          <Route path="/termos" element={<StaticPage page="termos" />} />
          {/* 404 fallback */}
          <Route path="*" element={<StaticPage page="404" />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}

export default App;
