const ERROR_DEFINITIONS = {
  invalid_status: [400, 'Status de pedido inválido.'],
  invalid_product_size: [400, 'O tamanho solicitado não está disponível para este produto.'],
  invalid_inventory_quantity: [400, 'A quantidade de um item do pedido é inválida.'],
  invalid_inventory_product: [400, 'Um item do pedido não possui produto válido.'],
  invalid_inventory_item: [400, 'Um item do pedido não pode ser usado para ajustar o estoque.'],
  order_items_required: [400, 'O pedido não possui itens para reservar.'],
  rejected_reason_required: [400, 'Motivo de rejeição é obrigatório.'],
  cancel_reason_required: [400, 'Motivo de cancelamento é obrigatório.'],
  order_not_found: [404, 'Pedido não encontrado.'],
  inventory_product_not_found: [409, 'Um produto do pedido não existe mais.'],
  product_not_public: [409, 'Um produto do pedido não está mais disponível.'],
  product_out_of_stock: [409, 'Um produto do pedido está sem estoque.'],
  insufficient_inventory: [409, 'A quantidade solicitada excede o estoque disponível.'],
  inventory_reservation_conflict: [409, 'O estoque deste pedido não pode ser reservado neste estado.'],
  inventory_state_conflict: [409, 'O estado de estoque do pedido não permite esta operação.'],
  inventory_not_reserved: [409, 'O pedido ainda não possui estoque reservado.'],
  invalid_fulfillment_transition: [409, 'Esta transição de atendimento não é permitida.'],
  verified_payment_required: [409, 'O pedido precisa de um pagamento verificado antes da confirmação.'],
  payment_required: [409, 'O pedido precisa estar pago antes da confirmação.'],
  inventory_release_requires_payment_resolution: [409, 'O pagamento precisa ser resolvido antes de liberar o estoque.'],
  inventory_count_overflow: [500, 'O ajuste de estoque excedeu o limite permitido.'],
};

function extractRpcCode(error) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  return Object.keys(ERROR_DEFINITIONS).find((code) => text.includes(code)) || null;
}

export function inventoryRpcError(error) {
  const code = extractRpcCode(error) || 'inventory_transaction_failed';
  const [status, message] = ERROR_DEFINITIONS[code] || [500, 'Falha na transação de estoque do pedido.'];
  const mapped = new Error(message);
  mapped.code = code;
  mapped.status = status;
  mapped.cause = error;
  return mapped;
}

function rpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function reserveOrderInventory(supabase, orderId) {
  const { data, error } = await supabase.rpc('reserve_order_inventory', {
    p_order_id: orderId,
  });
  if (error) throw inventoryRpcError(error);
  const order = rpcRow(data);
  if (!order) {
    throw inventoryRpcError({ message: 'reservation returned no order' });
  }
  return order;
}

export async function transitionOrderFulfillment(supabase, {
  orderId,
  newStatus,
  rejectedReason = null,
  cancelReason = null,
}) {
  const { data, error } = await supabase.rpc('transition_order_fulfillment', {
    p_order_id: orderId,
    p_new_status: newStatus,
    p_rejected_reason: rejectedReason,
    p_cancel_reason: cancelReason,
  });
  if (error) throw inventoryRpcError(error);
  const order = rpcRow(data);
  if (!order) {
    throw inventoryRpcError({ message: 'transition returned no order' });
  }
  return order;
}
