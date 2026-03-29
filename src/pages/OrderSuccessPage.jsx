import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiCheck,
  FiCopy,
  FiCreditCard,
  FiExternalLink,
  FiLoader,
  FiRefreshCw,
  FiShoppingBag,
  FiUser,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { btnPrimary, btnSecondary } from '../lib/ui';
import { getLastOrderId } from '../utils/orderMessage';
import { getPaymentMethodLabel, getPaymentStatus } from '../lib/orderStatus';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

export default function OrderSuccessPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const orderCode = location.state?.orderCode || searchParams.get('orderCode') || getLastOrderId();
  const initialPayment = location.state?.payment || null;
  const warning = location.state?.warning || null;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(Boolean(orderCode));
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!orderCode) {
      setLoading(false);
      return () => {};
    }

    const fetchOrder = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/public?resource=order&orderCode=${encodeURIComponent(orderCode)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Não foi possível carregar o pedido.');
        if (active) setOrder(data.order || null);
      } catch (err) {
        console.error('[OrderSuccessPage] fetch error:', err);
        if (active) setError(err.message || 'Falha ao carregar pedido.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchOrder();
    return () => {
      active = false;
    };
  }, [orderCode]);

  const payment = order?.payment || initialPayment;
  const paymentStatus = useMemo(() => getPaymentStatus(payment?.state || 'pending'), [payment]);
  const PaymentIcon = paymentStatus.icon;

  const copyPixCode = async () => {
    if (!payment?.copyPaste) return;
    try {
      await navigator.clipboard.writeText(payment.copyPaste);
      toast.success('Código Pix copiado.', { style: toastStyle });
    } catch {
      toast.error('Não foi possível copiar o código Pix.', { style: toastStyle });
    }
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          <div className="bg-surface rounded-3xl shadow-soft p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <FiCheck size={36} className="text-green-600 dark:text-green-400" />
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl text-baby-text mb-3">
              Pedido criado com sucesso
            </h1>
            <p className="font-sans text-baby-text/60 text-base max-w-xl mx-auto leading-relaxed">
              Seu pedido já está registrado. Agora é só concluir o pagamento e acompanhar tudo pela sua conta ou pela página de pedidos.
            </p>

            {orderCode && (
              <div className="mt-6 rounded-2xl bg-baby-cream p-4">
                <p className="font-sans text-xs uppercase tracking-[0.2em] text-baby-text/45 mb-1">
                  Código do pedido
                </p>
                <p className="font-mono text-xl font-bold text-baby-text select-all">
                  {orderCode}
                </p>
              </div>
            )}

            {warning && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
                <p className="font-sans text-sm text-amber-800">
                  {warning}
                </p>
              </div>
            )}
          </div>

          {loading && (
            <div className="bg-surface rounded-3xl shadow-soft p-6 text-center">
              <FiLoader size={24} className="animate-spin mx-auto text-baby-accent mb-3" />
              <p className="font-sans text-sm text-baby-text/50">Atualizando o estado do pedido...</p>
            </div>
          )}

          {!loading && error && (
            <div className="bg-surface rounded-3xl shadow-soft p-6 text-center">
              <FiRefreshCw size={22} className="mx-auto text-amber-500 mb-3" />
              <p className="font-sans text-sm text-baby-text/60">{error}</p>
            </div>
          )}

          {payment && (
            <section className="bg-surface rounded-3xl shadow-soft p-6 sm:p-8 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl text-baby-text">Pagamento</h2>
                  <p className="font-sans text-sm text-baby-text/50">
                    {getPaymentMethodLabel(payment.method)} · {paymentStatus.label}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${paymentStatus.color}`}>
                  <PaymentIcon size={15} />
                  {paymentStatus.label}
                </span>
              </div>

              {payment.state === 'paid' && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-sans text-sm text-emerald-800">
                    Pagamento confirmado. Seu pedido segue para análise e confirmação da gerente.
                  </p>
                </div>
              )}

              {payment.state === 'pending' && payment.method === 'pix' && (
                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5 items-start">
                  <div className="bg-baby-cream rounded-3xl p-4 flex items-center justify-center min-h-[220px]">
                    {payment.qrCode ? (
                      <img
                        src={payment.qrCode}
                        alt="QR Code Pix"
                        className="w-full max-w-[180px] rounded-2xl border border-baby-pink/50"
                      />
                    ) : (
                      <div className="text-center font-sans text-sm text-baby-text/50">
                        QR Code indisponível.
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-baby-pink/60 bg-baby-pink/12 p-4">
                      <p className="font-sans text-sm text-baby-text/60 leading-relaxed">
                        Use o QR Code acima ou copie o código abaixo no app do seu banco. Assim que o webhook do Asaas confirmar o pagamento, esta página e “Meus Pedidos” passam a mostrar o pedido como pago.
                      </p>
                    </div>

                    {payment.copyPaste && (
                      <div className="rounded-2xl bg-baby-cream p-4">
                        <p className="font-sans text-xs uppercase tracking-[0.18em] text-baby-text/45 mb-2">
                          Pix copia e cola
                        </p>
                        <p className="font-mono text-sm text-baby-text break-all select-all">
                          {payment.copyPaste}
                        </p>
                        <button type="button" onClick={copyPixCode} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-baby-text text-white font-sans text-sm">
                          <FiCopy size={14} />
                          Copiar código
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {payment.state === 'pending' && payment.method === 'cartao' && payment.url === '__hosted_card_disabled__' && (
                <div className="rounded-2xl border border-baby-pink/60 bg-baby-pink/12 p-5">
                  <p className="font-sans text-sm text-baby-text/65 leading-relaxed mb-4">
                    O pagamento com cartão é concluído na página hospedada do Asaas. Se você fechar a aba, o link continua disponível nos detalhes do pedido.
                  </p>
                  {payment.url ? (
                    <a
                      href={payment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={btnPrimary}
                    >
                      <FiCreditCard size={16} />
                      Abrir pagamento com cartão
                      <FiExternalLink size={16} />
                    </a>
                  ) : (
                    <p className="font-sans text-sm text-red-600">
                      O link do pagamento ainda não está disponível.
                    </p>
                  )}
                </div>
              )}
              {payment.state === 'pending' && payment.method === 'cartao' && (
                <div className="rounded-2xl border border-baby-pink/60 bg-baby-pink/12 p-5">
                  <p className="font-sans text-sm text-baby-text/65 leading-relaxed">
                    Recebemos o pagamento com cartÃ£o e ele estÃ¡ em anÃ¡lise. Acompanhe o status em Meus Pedidos.
                  </p>
                </div>
              )}

              {payment.state === 'failed' && payment.method === 'cartao' && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                  <p className="font-sans text-sm text-red-700 leading-relaxed">
                    O pagamento com cartÃ£o falhou. RefaÃ§a a compra em Meus Pedidos para informar o cartÃ£o novamente.
                  </p>
                </div>
              )}
            </section>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/meus-pedidos" className={btnPrimary}>
              <FiRefreshCw size={16} />
              Meus Pedidos
            </Link>
            <Link to="/minha-conta" className={btnSecondary}>
              <FiUser size={16} />
              Minha Conta
            </Link>
            <Link to="/" className={btnSecondary}>
              <FiShoppingBag size={16} />
              Continuar comprando
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
