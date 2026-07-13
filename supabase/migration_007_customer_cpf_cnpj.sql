-- ============================================================
-- Pequeno Encanto — customer CPF/CNPJ on orders
-- ============================================================

alter table orders
  add column if not exists customer_cpf_cnpj text;
