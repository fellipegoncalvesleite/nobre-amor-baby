# Nobre Amor Baby

Loja React + Vite com catálogo público, autenticação via Supabase, painel de gestão, checkout com Asaas e frete via Melhor Envio.

## Stack

- Frontend: React 19, React Router, Framer Motion, Tailwind CSS
- Auth e banco: Supabase
- Pagamentos: Asaas
- Frete: Melhor Envio
- Deploy alvo: Vercel

## Requisitos

- Node.js 20+
- npm 10+
- Projeto Supabase configurado
- Conta Asaas com chave de API
- Token do Melhor Envio

## Ambiente

Copie [.env.example](/c:/nobreamorsite/.env.example) para `.env` e preencha:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ASAAS_API_KEY`
- `ASAAS_API_URL`
- `ASAAS_WEBHOOK_TOKEN`
- `MELHOR_ENVIO_TOKEN`
- `SITE_URL`
- `ADMIN_API_KEY`

Notas:

- `SUPABASE_*` do servidor são usados pelas rotas em `api/`.
- `SITE_URL` deve apontar para o domínio público do site em produção. Ela é usada para o retorno do checkout hospedado do Asaas quando disponível.
- `ADMIN_API_KEY` existe apenas como fallback legado. O fluxo principal usa JWT do Supabase.

## Banco de Dados

Execute as migrations nesta ordem no Supabase SQL Editor:

1. [migration_001_orders.sql](/c:/nobreamorsite/supabase/migration_001_orders.sql)
2. [migration_002_order_actions.sql](/c:/nobreamorsite/supabase/migration_002_order_actions.sql)
3. [migration_003_products_collections_home.sql](/c:/nobreamorsite/supabase/migration_003_products_collections_home.sql)
4. [migration_004_cancel_order.sql](/c:/nobreamorsite/supabase/migration_004_cancel_order.sql)
5. [migration_005_profiles_auth.sql](/c:/nobreamorsite/supabase/migration_005_profiles_auth.sql)
6. [migration_006_payments_newsletter.sql](/c:/nobreamorsite/supabase/migration_006_payments_newsletter.sql)
7. [003_homepage_settings.sql](/c:/nobreamorsite/supabase/migrations/003_homepage_settings.sql)

Buckets esperados no Supabase Storage:

- `product-images`
- `collection-images`

## Asaas

Configuração necessária:

- Gere a API key no ambiente correto: sandbox ou produção.
- Defina `ASAAS_API_URL`.
  Sandbox: `https://sandbox.asaas.com/api/v3`
- Configure o webhook para apontar para:
  `POST {SITE_URL}/api/asaas-webhook`
- Configure o token do webhook e copie o mesmo valor para `ASAAS_WEBHOOK_TOKEN`.

Fluxo implementado:

- `POST /api/orders` cria o pedido no Supabase e a cobrança no Asaas.
- Pix retorna QR Code e código copia e cola.
- Cartão retorna a URL hospedada do Asaas.
- `POST /api/asaas-webhook` sincroniza `payment_state`, `paid_at` e metadados do pagamento.
- `POST /api/public?resource=retry-payment` recria uma cobrança para pedidos `new` com pagamento `expired` ou `failed`.

## Melhor Envio

- Defina `MELHOR_ENVIO_TOKEN`.
- A rota [shipping-quote.js](/c:/nobreamorsite/api/shipping-quote.js) recebe o CEP e o pacote consolidado do carrinho.
- Em desenvolvimento, verifique o token do ambiente correto antes de testar frete real.

## Desenvolvimento

Instale dependências:

```bash
npm install
```

Inicie o app:

```bash
npm run dev
```

Validações principais:

```bash
npm run lint
npm run build
```

## Rotas Principais

- Loja: `/`, `/produtos`, `/produto/:id`, `/checkout`
- Cliente: `/pedido-enviado`, `/meus-pedidos`, `/meus-pedidos/:orderCode`, `/minha-conta`
- Auth: `/entrar`, `/auth/callback`, `/redefinir-senha`
- Admin: `/admin`, `/admin/pedidos`, `/admin/pedidos/:orderCode`, `/admin/catalogo`
- Aliases admin:
  - `/admin/produtos`
  - `/admin/colecoes-gerenciar`
  - `/admin/inicio`

## Smoke Checklist

- Auth:
  - Criar conta
  - Confirmar e-mail
  - Login/logout
- Checkout Pix:
  - Criar pedido
  - Visualizar QR Code e copia e cola em `/pedido-enviado`
  - Confirmar atualização para `payment_state = paid` após webhook
- Checkout Cartão:
  - Criar pedido
  - Abrir URL hospedada do Asaas
  - Confirmar retorno e sincronização do webhook
- Retry:
  - Colocar um pedido em `expired` ou `failed`
  - Gerar nova cobrança sem duplicar o pedido
- Cliente:
  - Ver pedidos em `/meus-pedidos`
  - Ver resumo em `/minha-conta`
  - Cancelar pedido `new` não pago
- Admin:
  - Ver diferença entre pendente pago e pendente não pago
  - Confirmar pedido e validar baixa de estoque
  - Voltar de `confirmed` para `new` e validar recomposição de estoque
- Newsletter:
  - Inscrever novo e-mail
  - Repetir inscrição e validar resposta amigável

## Observações

- O status do pedido e o status do pagamento são independentes.
- `orders.status` continua sendo o status de fulfillment.
- O webhook do Asaas não confirma o pedido automaticamente.
- A baixa de estoque continua no fluxo de confirmação manual do admin.
