import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiCheck,
  FiCreditCard,
  FiEdit3,
  FiMapPin,
  FiPackage,
  FiPhone,
  FiRefreshCw,
  FiTruck,
  FiUser,
  FiX,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { btnPrimary, btnSecondary, focusRing, formatPrice } from '../lib/ui';
import { getFulfillmentStatus, getPaymentMethodLabel, getPaymentStatus } from '../lib/orderStatus';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

export default function AdminOrderDetailPage() {
  const navigate = useNavigate();
  const { orderCode } = useParams();
  const { accessToken } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [notesText, setNotesText] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin?resource=orders&id=${encodeURIComponent(orderCode)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao buscar pedido.');
      setOrder(data.order || null);
      setNotesText(data.order?.manager_notes || '');
      setNotesDirty(false);
    } catch (err) {
      console.error('[AdminOrderDetailPage] fetch error:', err);
      setError(err.message || 'Falha ao carregar pedido.');
      toast.error('Falha ao carregar pedido', { style: toastStyle });
    } finally {
      setLoading(false);
    }
  }, [accessToken, orderCode]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const patchOrder = async (body) => {
    const response = await fetch(`/api/admin?resource=orders&id=${encodeURIComponent(orderCode)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.message || 'Falha ao atualizar pedido.');
    return data.order;
  };

  const handleConfirm = async () => {
    setActionLoading(true);
    try {
      await patchOrder({ status: 'confirmed' });
      toast.success('Pedido confirmado!', { style: toastStyle });
      navigate('/admin/pedidos');
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Informe o motivo da recusa.', { style: toastStyle });
      return;
    }
    setActionLoading(true);
    try {
      await patchOrder({ status: 'rejected', rejected_reason: rejectReason.trim() });
      toast.success('Pedido recusado.', { style: toastStyle });
      navigate('/admin/pedidos');
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetToNew = async () => {
    setActionLoading(true);
    try {
      const updated = await patchOrder({ status: 'new' });
      setOrder(updated);
      setNotesText(updated.manager_notes || '');
      setNotesDirty(false);
      toast.success('Status resetado para Novo.', { style: toastStyle });
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    setNotesSaving(true);
    try {
      const updated = await patchOrder({ manager_notes: notesText });
      setOrder(updated);
      setNotesDirty(false);
      toast.success('Notas salvas!', { style: toastStyle });
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    } finally {
      setNotesSaving(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const fulfillment = useMemo(() => getFulfillmentStatus(order?.status), [order?.status]);
  const paymentStatus = useMemo(() => getPaymentStatus(order?.payment_state), [order?.payment_state]);

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
          <Link to="/admin/pedidos" className={btnSecondary}>Voltar aos pedidos</Link>
        </div>
      </section>
    );
  }

  const FulfillmentIcon = fulfillment.icon;
  const PaymentIcon = paymentStatus.icon;

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/admin/pedidos" className="hover:text-baby-accent transition-colors">Pedidos</Link></li>
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
                <h1 className="font-serif text-xl sm:text-2xl text-baby-text">{order.order_code}</h1>
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
            <StatusCard title="Status do pedido" icon={<FulfillmentIcon size={16} />} className={fulfillment.color} description={fulfillment.label} />
            <StatusCard title="Status do pagamento" icon={<PaymentIcon size={16} />} className={paymentStatus.color} description={paymentStatus.label} />
          </div>

          <div className="space-y-6">
            <Card icon={FiCheck} title="Ações">
              {order.rejected_reason && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="font-sans text-xs uppercase tracking-[0.18em] text-red-500 mb-1">Motivo da recusa</p>
                  <p className="font-sans text-sm text-red-700">{order.rejected_reason}</p>
                </div>
              )}

              {order.cancel_reason && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                  <p className="font-sans text-xs uppercase tracking-[0.18em] text-orange-500 mb-1">Motivo do cancelamento</p>
                  <p className="font-sans text-sm text-orange-700">{order.cancel_reason}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={actionLoading || order.status === 'confirmed'}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-green-100 text-green-700 hover:bg-green-200 font-sans text-sm font-medium disabled:opacity-50 ${focusRing}`}
                >
                  <FiCheck size={15} />
                  {order.status === 'confirmed' ? 'Já confirmado' : 'Confirmar pedido'}
                </button>

                <button
                  type="button"
                  onClick={() => setRejectModalOpen(true)}
                  disabled={actionLoading || order.status === 'rejected'}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-red-100 text-red-700 hover:bg-red-200 font-sans text-sm font-medium disabled:opacity-50 ${focusRing}`}
                >
                  <FiX size={15} />
                  {order.status === 'rejected' ? 'Já recusado' : 'Recusar pedido'}
                </button>

                {(order.status === 'confirmed' || order.status === 'rejected') && (
                  <button
                    type="button"
                    onClick={handleResetToNew}
                    disabled={actionLoading}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 font-sans text-sm font-medium disabled:opacity-50 ${focusRing}`}
                  >
                    <FiRefreshCw size={14} />
                    Resetar para Novo
                  </button>
                )}
              </div>
            </Card>

            <Card icon={FiCreditCard} title="Pagamento">
              <InfoRow label="Método" value={getPaymentMethodLabel(order.payment_method)} />
              <InfoRow label="Estado" value={paymentStatus.label} />
              <InfoRow label="ID externo" value={order.payment_external_id} />
              <InfoRow label="Pago em" value={formatDate(order.paid_at)} />
              <InfoRow label="Último evento" value={order.payment_last_event} />
              <InfoRow label="Subtotal" value={formatPrice((order.subtotal_cents || 0) / 100)} />
              <InfoRow label="Frete" value={formatPrice((order.shipping_fee_cents || 0) / 100)} />
              <div className="flex justify-between pt-2 border-t border-baby-pink/40">
                <span className="font-sans text-sm font-semibold text-baby-text">Total</span>
                <span className="font-sans text-sm font-bold text-baby-accent">{formatPrice((order.total_cents || 0) / 100)}</span>
              </div>
            </Card>

            <Card icon={FiUser} title="Cliente">
              <InfoRow label="Nome" value={order.customer_name} />
              <InfoRow label="Telefone" value={order.customer_phone} />
              <InfoRow label="E-mail" value={order.customer_email} />
              <InfoRow label="Mensagem" value={order.customer_message} />
            </Card>

            <Card icon={FiPhone} title="Contato rápido">
              <InfoRow label="Telefone" value={order.customer_phone} />
              <p className="font-sans text-xs text-baby-text/45">
                Use o telefone do cliente para confirmar dados ou orientar uma nova tentativa de pagamento.
              </p>
            </Card>

            <Card icon={FiMapPin} title="Endereço">
              <InfoRow label="CEP" value={order.address_cep} />
              <InfoRow label="Logradouro" value={[order.address_street, order.address_number, order.address_complement].filter(Boolean).join(', ')} />
              <InfoRow label="Bairro" value={order.address_neighborhood} />
              <InfoRow label="Cidade" value={[order.address_city, order.address_uf].filter(Boolean).join(' / ')} />
            </Card>

            <Card icon={FiTruck} title="Frete">
              <InfoRow label="Transportadora" value={order.shipping_provider} />
              <InfoRow label="Prazo" value={order.shipping_eta_text} />
              <InfoRow label="Frete" value={formatPrice((order.shipping_fee_cents || 0) / 100)} />
            </Card>

            <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
              <div className="px-5 py-4 border-b border-baby-pink flex items-center gap-2">
                <FiPackage className="text-baby-accent" size={16} />
                <h2 className="font-serif text-lg text-baby-text">Itens ({order.items?.length || 0})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-baby-pink/50">
                      <th className="px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50">Produto</th>
                      <th className="px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50 text-center">Tam</th>
                      <th className="px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50 text-center">Qtd</th>
                      <th className="px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50 text-right">Unit.</th>
                      <th className="px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-baby-text/50 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-baby-pink/30">
                    {(order.items || []).map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-2.5 font-sans text-sm text-baby-text">{item.product_name}</td>
                        <td className="px-4 py-2.5 font-sans text-xs text-baby-text/60 text-center">{item.size || '—'}</td>
                        <td className="px-4 py-2.5 font-sans text-sm text-baby-text text-center">{item.qty}</td>
                        <td className="px-4 py-2.5 font-sans text-sm text-baby-text/70 text-right">{formatPrice(item.unit_price_cents / 100)}</td>
                        <td className="px-4 py-2.5 font-sans text-sm text-baby-text font-medium text-right">{formatPrice(item.line_total_cents / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Card icon={FiEdit3} title="Notas internas">
              <textarea
                rows={3}
                value={notesText}
                onChange={(event) => {
                  setNotesText(event.target.value);
                  setNotesDirty(true);
                }}
                placeholder="Adicione observações sobre este pedido..."
                className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream p-3 font-sans text-sm resize-y ${focusRing}`}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={!notesDirty || notesSaving}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm font-medium ${btnPrimary} disabled:opacity-50`}
                >
                  {notesSaving ? 'Salvando...' : 'Salvar notas'}
                </button>
              </div>
            </Card>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/admin/pedidos" className={btnSecondary}>
              <FiArrowLeft size={14} />
              Voltar aos pedidos
            </Link>
            <Link to="/admin" className={btnSecondary}>Painel do Gerente</Link>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {rejectModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={() => setRejectModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(event) => event.stopPropagation()}
              className="bg-surface rounded-3xl shadow-xl w-full max-w-md p-6"
            >
              <h3 className="font-serif text-lg text-baby-text mb-2">Recusar pedido</h3>
              <p className="font-sans text-sm text-baby-text/60 mb-4">
                Informe o motivo para a cliente.
              </p>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Ex: produto indisponível, endereço incompleto..."
                className={`w-full rounded-2xl border border-baby-text/15 bg-baby-cream p-3 font-sans text-sm resize-y ${focusRing}`}
              />
              <div className="flex gap-2 justify-end mt-4">
                <button type="button" onClick={() => setRejectModalOpen(false)} className={btnSecondary}>
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={actionLoading || !rejectReason.trim()}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-red-600 text-white font-sans text-sm font-medium disabled:opacity-50 ${focusRing}`}
                >
                  {actionLoading ? <FiRefreshCw size={14} className="animate-spin" /> : <FiX size={14} />}
                  Confirmar recusa
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
