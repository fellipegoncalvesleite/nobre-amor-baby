import {
  FiAlertTriangle,
  FiCheck,
  FiClock,
  FiPackage,
  FiRefreshCw,
  FiSlash,
  FiTruck,
  FiX,
} from 'react-icons/fi';

export const FULFILLMENT_STATUS_MAP = {
  new: { label: 'Novo', customerLabel: 'Aguardando separação', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: FiClock },
  confirmed: { label: 'Confirmado', customerLabel: 'Confirmado', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: FiCheck },
  rejected: { label: 'Rejeitado', customerLabel: 'Recusado', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: FiX },
  cancelled: { label: 'Cancelado', customerLabel: 'Cancelado', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: FiSlash },
  packing: { label: 'Embalando', customerLabel: 'Embalando', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', icon: FiPackage },
  shipped: { label: 'Enviado', customerLabel: 'Enviado', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: FiTruck },
  done: { label: 'Concluído', customerLabel: 'Entregue', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300', icon: FiCheck },
};

export const PAYMENT_STATUS_MAP = {
  pending: { label: 'Pagamento pendente', shortLabel: 'Pendente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: FiClock },
  paid: { label: 'Pago', shortLabel: 'Pago', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: FiCheck },
  expired: { label: 'Expirado', shortLabel: 'Expirado', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: FiAlertTriangle },
  failed: { label: 'Falhou', shortLabel: 'Falhou', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: FiX },
  refunded: { label: 'Reembolsado', shortLabel: 'Reembolsado', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300', icon: FiRefreshCw },
  cancelled: { label: 'Cancelado', shortLabel: 'Cancelado', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300', icon: FiSlash },
};

export function getFulfillmentStatus(status) {
  return FULFILLMENT_STATUS_MAP[status] || FULFILLMENT_STATUS_MAP.new;
}

export function getPaymentStatus(state) {
  return PAYMENT_STATUS_MAP[state] || PAYMENT_STATUS_MAP.pending;
}

export function getPaymentMethodLabel(method) {
  if (method === 'pix') return 'Pix';
  if (method === 'cartao') return 'Cartão';
  return method || 'Não informado';
}

export function canRetryPayment(order) {
  return order?.status === 'new' && ['expired', 'failed'].includes(order?.payment_state);
}

export function canCancelOrder(order) {
  return order?.status === 'new' && order?.payment_state !== 'paid';
}
