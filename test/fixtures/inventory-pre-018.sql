insert into public.orders (id, order_code, status, payment_state, checkout_finalization_state)
values ('00000000-0000-0000-0000-000000000001', 'NA-HISTORICAL', 'confirmed', 'paid', 'finalized');

insert into public.products (
  id, name, slug, price_cents, size_group, is_public, in_stock, stock_count, size_options
)
values
  ('00000000-0000-0000-0000-000000000010', 'Estoque nulo', 'estoque-nulo', 1000, 'roupa', true, true, null, null),
  ('00000000-0000-0000-0000-000000000011', 'Estoque negativo', 'estoque-negativo', 1000, 'roupa', true, true, -4, '{}');
