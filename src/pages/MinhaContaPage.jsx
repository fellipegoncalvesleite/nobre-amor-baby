import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCamera, FiCreditCard, FiLoader, FiLogOut, FiPackage, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { btnPrimary, btnSecondary, focusRing, formatPrice } from '../lib/ui';
import { getPaymentStatus, getFulfillmentStatus } from '../lib/orderStatus';
import AccountAvatar from '../components/AccountAvatar';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

async function resizeImageToSquare(file, size = 512) {
  const dataUrl = await fileToDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nao foi possivel processar a imagem.'));
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponivel.');

  const side = Math.min(image.width, image.height);
  const sx = (image.width - side) / 2;
  const sy = (image.height - side) / 2;
  context.drawImage(image, sx, sy, side, side, 0, 0, size, size);

  return canvas.toDataURL('image/jpeg', 0.86);
}

export default function MinhaContaPage() {
  const navigate = useNavigate();
  const { user, accessToken, signOut } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/public?resource=my-orders', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha ao carregar seus pedidos.');
      setOrders(data.orders || []);
    } catch (err) {
      console.error('[MinhaContaPage] fetch error:', err);
      setError(err.message || 'Falha ao carregar seus pedidos.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const stats = useMemo(() => ({
    total: orders.length,
    paid: orders.filter((order) => order.payment_state === 'paid').length,
    pending: orders.filter((order) => order.payment_state === 'pending').length,
  }), [orders]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !accessToken || uploadingAvatar) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Escolha uma imagem JPG, PNG ou WEBP.', { style: toastStyle });
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      toast.error('A imagem original deve ter no maximo 4MB.', { style: toastStyle });
      return;
    }

    setUploadingAvatar(true);
    try {
      const resizedImage = await resizeImageToSquare(file, 512);
      const response = await fetch('/api/profile-avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          file: resizedImage,
          filename: file.name,
          oldPath: user?.avatarPath || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Nao foi possivel enviar a foto.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          avatar_url: data.url,
          avatar_path: data.path,
        },
      });

      if (updateError) throw updateError;
      toast.success('Foto de perfil atualizada.', { style: toastStyle });
    } catch (uploadError) {
      console.error('[MinhaContaPage] avatar upload error:', uploadError);
      toast.error(uploadError.message || 'Falha ao atualizar foto de perfil.', { style: toastStyle });
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Minha Conta</li>
          </ol>
        </nav>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6">
          <section className="bg-surface rounded-3xl shadow-soft p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <AccountAvatar
                    size="xl"
                    src={user?.avatarUrl}
                    alt={`Foto de perfil de ${user?.name || 'Cliente'}`}
                  />
                  <label
                    className={`absolute -bottom-1 -right-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-baby-text text-white shadow-soft transition-colors hover:bg-baby-text/85 ${focusRing}`}
                    aria-label="Trocar foto de perfil"
                  >
                    {uploadingAvatar ? <FiLoader size={15} className="animate-spin" /> : <FiCamera size={15} />}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleAvatarChange}
                      disabled={uploadingAvatar}
                      className="sr-only"
                    />
                  </label>
                </div>
                <div>
                  <h1 className="font-serif text-3xl text-baby-text">Minha Conta</h1>
                  <p className="font-sans text-sm text-baby-text/55 mt-1">{user?.name || 'Cliente'}</p>
                  <p className="font-sans text-sm text-baby-text/45">{user?.email || '—'}</p>
                  <p className="font-sans text-xs text-baby-text/40 mt-2">
                    Clique no ícone da câmera para trocar sua foto.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link to="/meus-pedidos" className={btnPrimary}>
                  <FiPackage size={16} />
                  Ver pedidos
                </Link>
                <button type="button" onClick={handleSignOut} className={btnSecondary}>
                  <FiLogOut size={16} />
                  Sair
                </button>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Pedidos" value={stats.total} />
            <StatCard label="Pagos" value={stats.paid} />
            <StatCard label="Pendentes" value={stats.pending} />
          </div>

          <section className="bg-surface rounded-3xl shadow-soft p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="font-serif text-2xl text-baby-text">Pedidos recentes</h2>
                <p className="font-sans text-sm text-baby-text/50">Acompanhe pagamento e separação em um só lugar.</p>
              </div>

              <button
                type="button"
                onClick={fetchOrders}
                disabled={loading}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-baby-text/15 font-sans text-sm text-baby-text/60 hover:text-baby-accent hover:border-baby-accent transition-colors disabled:opacity-50 ${focusRing}`}
              >
                <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-sans text-sm text-red-700 mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-center py-10">
                <FiRefreshCw size={22} className="animate-spin mx-auto text-baby-accent mb-2" />
                <p className="font-sans text-sm text-baby-text/50">Carregando seus pedidos...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-10">
                <FiPackage size={34} className="mx-auto text-baby-text/20 mb-3" />
                <p className="font-sans text-baby-text/50 mb-5">Seu histórico ainda está vazio.</p>
                <Link to="/" className={btnPrimary}>Explorar produtos</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.slice(0, 5).map((order) => {
                  const fulfillment = getFulfillmentStatus(order.status);
                  const payment = getPaymentStatus(order.payment_state);
                  return (
                    <Link
                      key={order.order_code}
                      to={`/meus-pedidos/${order.order_code}`}
                      className="block rounded-2xl border border-baby-pink/45 bg-baby-cream/60 p-4 hover:border-baby-accent/40 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="font-mono text-sm font-bold text-baby-text">{order.order_code}</span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${fulfillment.color}`}>
                              {fulfillment.customerLabel || fulfillment.label}
                            </span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${payment.color}`}>
                              {payment.shortLabel}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-4 font-sans text-xs text-baby-text/50">
                            <span>{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                            <span className="font-medium text-baby-accent">{formatPrice((order.total_cents || 0) / 100)}</span>
                            <span>{order.items_count || 0} ite{order.items_count !== 1 ? 'ns' : 'm'}</span>
                          </div>
                        </div>

                        <div className="inline-flex items-center gap-2 font-sans text-sm text-baby-accent">
                          <FiCreditCard size={14} />
                          Ver detalhes
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </motion.div>
      </div>
    </section>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-surface rounded-2xl shadow-soft p-5 text-center">
      <p className="font-sans text-3xl font-bold text-baby-text">{value}</p>
      <p className="font-sans text-xs uppercase tracking-[0.2em] text-baby-text/40 mt-2">{label}</p>
    </div>
  );
}
