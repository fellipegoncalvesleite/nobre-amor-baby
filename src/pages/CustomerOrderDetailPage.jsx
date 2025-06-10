import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiCheckCircle,
  FiCopy,
  FiCreditCard,
  FiExternalLink,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiRefreshCw,
  FiRotateCcw,
  FiSlash,
  FiTruck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useStore } from '../context/StoreContext';
import { btnSecondary, focusRing, formatPrice } from '../lib/ui';
import {
  canCancelOrder,
  canRetryPayment,
  getFulfillmentStatus,
  getPaymentMethodLabel,
  getPaymentStatus,
} from '../lib/orderStatus';
import siteConfig from '../config/siteConfig';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

const ARRIVAL_STORAGE_KEY = 'nobre_amor_v1_order_arrivals';

function loadArrivals() {
  try {
    const raw = localStorage.getItem(ARRIVAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveArrival(orderCode, value) {
  try {
    const current = loadArrivals();
    if (value === null) {
      delete current[orderCode];
    } else {
      current[orderCode] = value;
    }
    localStorage.setItem(ARRIVAL_STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* ignore quota errors */
  }
}

function openWhatsAppForOrder(order, topic) {
  const number = (siteConfig.whatsappNumber || '').replace(/\D/g, '');
  if (!number) return;
  const code = order?.order_code || '';
  const subject = topic === 'arrived_no'
    ? `Oi! Meu pedido ${code} ainda não chegou. Podem me ajudar?`
    : topic === 'exchange'
      ? `Oi! Gostaria de trocar/devolver itens do pedido ${code}.`
      : `Oi! Preciso de ajuda com o pedido ${code}.`;
  const url = `https://wa.me/${number}?text=${encodeURIComponent(subject)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function CustomerOrderDetailPage() {
  const { orderCode } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useStore();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [arrival, setArrival] = useState(null);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/public?resource=order&orderCode=${encodeURIComponent(orderCode)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Pedido não encontrado.');
      setOrder(data.order || null);
    } catch (err) {
      console.error('[CustomerOrderDetailPage] fetch error:', err);
      setError(err.message || 'Falha ao carregar pedido.');
    } finally {
      setLoading(false);
    }
  }, [orderCode]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    if (!orderCode) return;
    const record = loadArrivals()[orderCode];
    setArrival(record || null);
  }, [orderCode]);

  const markArrived = () => {
    const record = { status: 'arrived', at: new Date().toISOString() };
    saveArrival(orderCode, record);
    setArrival(record);
    toast.success('Obrigado! Registramos que seu pedido chegou.', { style: toastStyle });
  };

  const resetArrival = () => {
    saveArrival(orderCode, null);
    setArrival(null);
  };

  const fulfillment = useMemo(() => getFulfillmentStatus(order?.status), [order?.status]);
  const paymentStatus = useMemo(() => getPaymentStatus(order?.payment_state), [order?.payment_state]);

  const formatDate = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const copyPixCode = async () => {
    if (!order?.payment?.copyPaste) return;
    try {
      await navigator.clipboard.writeText(order.payment.copyPaste);
      toast.success('Código Pix copiado.', { style: toastStyle });
    } catch {
      toast.error('Não foi possível copiar o código Pix.', { style: toastStyle });
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/meus-pedidos');
  };

  const handleReorder = () => {
    const validItems = (order?.items || []).filter((item) => item.product_id);
    if (validItems.length === 0) {
      toast.error('Não foi possível montar este pedido novamente.', { style: toastStyle });
      return;
    }

    validItems.forEach((item) => {
      addToCart(String(item.product_id), item.size || '', Math.max(1, Number(item.qty || 1)));
    });

    toast.success('Itens adicionados ao carrinho.', { style: toastStyle });
    navigate('/carrinho');
  };

  const handleRetryPayment = async () => {
    if (!order) return;
    setRetrying(true);
    try {
      const response = await fetch('/api/public?resource=retry-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderCode: order.order_code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Não foi possível gerar uma nova cobrança.');
      toast.success('Nova cobrança gerada com sucesso.', { style: toastStyle });
      await fetchOrder();
    } catch (err) {
      console.error('[CustomerOrderDetailPage] retry error:', err);
      toast.error(err.message || 'Falha ao gerar nova cobrança.', { style: toastStyle });
    } finally {
      setRetrying(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason.trim() || cancelReason.trim().length < 3) {
      toast.error('Informe o motivo do cancelamento.', { style: toastStyle });
      return;
    }

    setCancelling(true);
    try {
      const response = await fetch('/api/public?resource=cancel-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderCode, reason: cancelReason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Não foi possível cancelar.');
      toast.success('Pedido cancelado com sucesso.', { style: toastStyle });
      setCancelModalOpen(false);
      setCancelReason('');
      await fetchOrder();
    } catch (err) {
      console.error('[CustomerOrderDetailPage] cancel error:', err);
      toast.error(err.message || 'Falha ao cancelar pedido.', { style: toastStyle });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center py-20">
          <FiRefreshCw size={28} className="mx-auto animate-spin text-baby-accent mb-3" />
          <p className="font-sans text-baby-text/50">Carregando pedido...</p>
        </div>
      </section>
    );
  }

  if (!order || error) {
    return (
      <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center py-20">
          <p className="font-sans text-baby-text mb-4">{error || 'Pedido não encontrado.'}</p>
          <Link to="/meus-pedidos" className={btnSecondary}>Voltar aos meus pedidos</Link>
        </div>
      </section>
    );
  }

  const FulfillmentIcon = fulfillment.icon;
  const PaymentIcon = paymentStatus.icon;
  const retryAllowed = canRetryPayment(order);
  const cancelAllowed = canCancelOrder(order);

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <button
          type="button"
          onClick={handleBack}
          className={`mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-xs text-baby-text/55 transition-colors hover:bg-white/60 hover:text-baby-text ${focusRing}`}
        >
          <FiArrowLeft size={13} />
          Voltar
        </button>
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/meus-pedidos" className="hover:text-baby-accent transition-colors">Meus Pedidos</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">{order.order_code}</li>
          </ol>
        </nav>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
                <FiPackage className="text-baby-accent" size={22} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-serif text-xl sm:text-2xl text-baby-text">Pedido</h1>
                  <span className="inline-flex items-center rounded-full border border-baby-text/10 bg-baby-cream px-3 py-1 font-mono text-xs text-baby-text/70">
                    {order.order_code}
                  </span>
                </div>
                <p className="font-sans text-xs text-baby-text/50 mt-1">Criado em {formatDate(order.created_at)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchOrder}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-baby-text/15 font-sans text-sm text-baby-text/60 hover:text-baby-accent hover:border-baby-accent transition-colors ${focusRing}`}
            >
              <FiRefreshCw size={14} />
              Atualizar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <StatusCard
              title="Status do pedido"
              description={fulfillment.customerLabel || fulfillment.label}
              className={fulfillment.color}
              icon={<FulfillmentIcon size={16} />}
            />
            <StatusCard
              title="Status do pagamento"
              description={paymentStatus.label}
              className={paymentStatus.color}
              icon={<PaymentIcon size={16} />}
            />
          </div>

          {order.rejected_reason && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="font-sans text-xs uppercase tracking-[0.18em] text-red-500 mb-1">Motivo da recusa</p>
              <p className="font-sans text-sm text-red-700">{order.rejected_reason}</p>
            </div>
          )}

          {order.cancel_reason && (
            <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <p className="font-sans text-xs uppercase tracking-[0.18em] text-orange-500 mb-1">Motivo do cancelamento</p>
              <p className="font-sans text-sm text-orange-700">{order.cancel_reason}</p>
            </div>
          )}

          <div className="space-y-6">
            <Card icon={FiCreditCard} title="Pagamento">
              <InfoRow label="Método" value={getPaymentMethodLabel(order.payment_method)} />
              <InfoRow label="Estado" value={paymentStatus.label} />
              <InfoRow label="Pago em" value={formatDate(order.paid_at)} />
              <InfoRow label="Subtotal" value={formatPrice((order.subtotal_cents || 0) / 100)} />
              <InfoRow label="Frete" value={formatPrice((order.shipping_fee_cents || 0) / 100)} />
              <div className="flex justify-between pt-2 border-t border-baby-pink/40">
                <span className="font-sans text-sm font-semibold text-baby-text">Total</span>
                <span className="font-sans text-sm font-bold text-baby-text">{formatPrice((order.total_cents || 0) / 100)}</span>
              </div>

              {order.payment_state === 'pending' && order.payment_method === 'pix' && (
                <div className="space-y-3 pt-3">
                  {order.payment?.qrCode && (
                    <div className="bg-baby-cream rounded-2xl p-4 w-fit mx-auto">
                      <img src={order.payment.qrCode} alt="QR Code Pix" className="w-44 h-44 rounded-2xl border border-baby-pink/50" />
                    </div>
                  )}

                  {order.payment?.copyPaste && (
                    <div className="rounded-2xl bg-baby-cream p-4">
                      <p className="font-sans text-xs uppercase tracking-[0.16em] text-baby-text/45 mb-2">Pix copia e cola</p>
                      <p className="font-mono text-sm text-baby-text break-all">{order.payment.copyPaste}</p>
                      <button type="button" onClick={copyPixCode} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-baby-text text-white font-sans text-sm">
                        <FiCopy size={14} />
                        Copiar código
                      </button>
                    </div>
                  )}
                </div>
              )}

              {order.payment_state === 'pending' && order.payment_method === 'cartao' && order.payment?.url === '__hosted_card_disabled__' && (
                <div className="pt-3">
                  <a href={order.payment.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-baby-text text-white font-sans text-sm">
                    Abrir pagamento com cartão
                    <FiExternalLink size={14} />
                  </a>
                </div>
              )}

              {order.payment_state === 'pending' && order.payment_method === 'cartao' && (
                <div className="pt-3">
                  <div className="rounded-2xl border border-baby-text/10 bg-baby-cream p-4">
                    <p className="font-sans text-sm text-baby-text/60">
                      O pagamento com cartão está em análise. Atualize esta tela em instantes para acompanhar a confirmação.
                    </p>
                  </div>
                </div>
              )}

              {order.payment_state === 'failed' && order.payment_method === 'cartao' && (
                <div className="pt-3">
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="font-sans text-sm text-red-700">
                      O pagamento com cartão falhou. Use "Pedir de novo" para refazer a compra e informar o cartão novamente.
                    </p>
                  </div>
                </div>
              )}

              {retryAllowed && (
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={handleRetryPayment}
                    disabled={retrying}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-sans text-sm font-medium bg-baby-accent text-white hover:bg-baby-accent/90 disabled:opacity-50 ${focusRing}`}
                  >
                    {retrying ? <FiRefreshCw size={14} className="animate-spin" /> : <FiRefreshCw size={14} />}
                    Gerar nova cobrança
                  </button>
                </div>
              )}
            </Card>

            <Card icon={FiTruck} title="Entrega">
              <InfoRow label="Prazo" value={order.shipping_eta_text || '—'} />
              <InfoRow label="Frete" value={formatPrice((order.shipping_fee_cents || 0) / 100)} />
              <InfoRow label="Transportadora" value={order.shipping_provider || '—'} />
            </Card>

            <Card icon={FiMapPin} title="Endereço">
              <InfoRow label="CEP" value={order.address_cep} />
              <InfoRow
                label="Logradouro"
                value={[order.address_street, order.address_number, order.address_complement].filter(Boolean).join(', ')}
              />
              <InfoRow label="Bairro" value={order.address_neighborhood} />
              <InfoRow label="Cidade" value={[order.address_city, order.address_uf].filter(Boolean).join(' / ')} />
            </Card>

            <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
              <div className="px-5 py-4 border-b border-baby-pink flex items-center gap-2">
                <FiPackage className="text-baby-accent" size={16} />
                <h2 className="font-serif text-lg text-baby-text">Itens ({order.items?.length || 0})</h2>
              </div>
              {(order.items || []).length > 0 ? (
                <ul className="divide-y divide-baby-pink/30">
                  {order.items.map((item) => (
                    <li key={item.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-sans text-sm text-baby-text font-medium truncate">{item.product_name}</p>
                        <p className="font-sans text-xs text-baby-text/50">
                          {item.size ? `Tam. ${item.size} · ` : ''}{item.qty}x {formatPrice(item.unit_price_cents / 100)}
                        </p>
                      </div>
                      <span className="font-sans text-sm font-medium text-baby-text whitespace-nowrap">
                        {formatPrice(item.line_total_cents / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-sans text-sm text-baby-text/40 text-center py-6">Nenhum item registrado.</p>
              )}
            </div>

            {order.payment_state === 'paid' && order.status !== 'cancelled' && order.status !== 'rejected' && (
              <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
                <div className="px-5 py-4 border-b border-baby-pink flex items-center gap-2">
                  <FiCheckCircle className="text-baby-accent" size={16} />
                  <h2 className="font-serif text-lg text-baby-text">Seu pedido já chegou?</h2>
                </div>
                <div className="px-5 py-4 space-y-4">
                  {!arrival ? (
                    <>
                      <p className="font-sans text-sm text-baby-text/70">
                        Assim que receber o pedido, confirme pra gente. É importante pra sabermos que tudo chegou certinho.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={markArrived}
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-600 text-white font-sans text-sm font-medium hover:bg-green-700 ${focusRing}`}
                        >
                          <FiCheckCircle size={15} />
                          Sim, já chegou
                        </button>
                        <button
                          type="button"
                          onClick={() => openWhatsAppForOrder(order, 'arrived_no')}
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-baby-text/15 text-baby-text hover:border-baby-accent hover:text-baby-accent font-sans text-sm font-medium ${focusRing}`}
                        >
                          <FiMessageCircle size={15} />
                          Ainda não chegou
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
                        <FiCheckCircle className="text-green-600 shrink-0 mt-0.5" size={18} />
                        <div>
                          <p className="font-sans text-sm font-medium text-green-800">
                            Pedido confirmado como recebido.
                          </p>
                          <p className="font-sans text-xs text-green-700/80 mt-0.5">
                            Você marcou em {formatDate(arrival.at)}.
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-baby-pink/60 bg-baby-cream/60 p-4">
                        <h3 className="font-serif text-base text-baby-text mb-2">Trocas e devoluções</h3>
                        <ul className="font-sans text-sm text-baby-text/75 space-y-1.5 list-disc pl-5">
                          <li>Troca em até <strong>15 dias</strong> após o recebimento.</li>
                          <li>Devolução em até <strong>7 dias</strong> após o recebimento.</li>
                          <li>Em caso de defeito, a troca ou devolução é garantida e o frete é por nossa conta.</li>
                          <li>Produtos em promoção não têm troca.</li>
                        </ul>
                        <p className="font-sans text-xs text-baby-text/50 mt-3">
                          Veja todos os detalhes em{' '}
                          <Link to="/envio-e-trocas" className="text-baby-accent underline">Envio e Trocas</Link>.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => openWhatsAppForOrder(order, 'exchange')}
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-baby-accent text-white font-sans text-sm font-medium hover:bg-baby-accent/90 ${focusRing}`}
                        >
                          <FiMessageCircle size={15} />
                          Solicitar troca/devolução no WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => openWhatsAppForOrder(order, 'support')}
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-baby-text/15 text-baby-text hover:border-baby-accent hover:text-baby-accent font-sans text-sm font-medium ${focusRing}`}
                        >
                          <FiMessageCircle size={15} />
                          Falar com a loja
                        </button>
                        <button
                          type="button"
                          onClick={resetArrival}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-sans text-xs text-baby-text/55 hover:text-baby-text ${focusRing}`}
                        >
                          <FiRotateCcw size={13} />
                          Desfazer
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={handleReorder}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-baby-text text-white font-sans text-sm font-medium hover:bg-baby-text/85 ${focusRing}`}
            >
              <FiRefreshCw size={14} />
              Pedir de novo
            </button>

            {cancelAllowed && (
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-orange-100 text-orange-700 hover:bg-orange-200 font-sans text-sm font-medium ${focusRing}`}
              >
                <FiSlash size={14} />
                Cancelar pedido
              </button>
            )}
            <Link to="/meus-pedidos" className={btnSecondary}>Meus Pedidos</Link>
          </div>
        </motion.div>

        <AnimatePresence>
          {cancelModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
              onClick={() => setCancelModalOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                onClick={(event) => event.stopPropagation()}
                className="bg-surface rounded-3xl shadow-xl w-full max-w-md p-6"
              >
                <h3 className="font-serif text-lg text-baby-text mb-2">Cancelar pedido</h3>
                <p className="font-sans text-sm text-baby-text/60 mb-4">
                  Conte pra gente por que você precisa cancelar este pedido.
                </p>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  placeholder="Ex: comprei por engano, endereço mudou, encontrei outro item..."
                  className={`w-full rounded-2xl border border-baby-text/15 bg-baby-cream p-3 font-sans text-sm resize-y ${focusRing}`}
                />
                <div className="flex gap-2 justify-end mt-4">
                  <button type="button" onClick={() => setCancelModalOpen(false)} className={btnSecondary}>
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelOrder}
                    disabled={cancelling || cancelReason.trim().length < 3}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-orange-600 text-white font-sans text-sm font-medium disabled:opacity-50 ${focusRing}`}
                  >
                    {cancelling ? <FiRefreshCw size={14} className="animate-spin" /> : <FiSlash size={14} />}
                    Confirmar cancelamento
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function StatusCard({ title, description, className, icon }) {
  return (
    <div className="bg-surface rounded-2xl shadow-soft p-5">
      <p className="font-sans text-xs uppercase tracking-[0.18em] text-baby-text/45 mb-3">{title}</p>
      <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${className}`}>
        {icon}
        {description}
      </span>
    </div>
  );
}

function Card({ icon: Icon, title, children }) {
  return (
    <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-baby-pink flex items-center gap-2">
        <Icon className="text-baby-accent" size={16} />
        <h2 className="font-serif text-lg text-baby-text">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="font-sans text-sm text-baby-text/50 shrink-0">{label}</span>
      <span className="font-sans text-sm text-baby-text text-right">{value || '—'}</span>
    </div>
  );
}
