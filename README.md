## Nobre Amor Baby

E-commerce de moda infantil desenvolvido com React e Vite, com catálogo público, autenticação de clientes, painel administrativo, checkout integrado ao Asaas e cálculo de frete via Melhor Envio.

## O que o projeto inclui

- Catálogo público de produtos e coleções
- Autenticação e área da cliente
- Painel administrativo para pedidos e catálogo
- Checkout com Pix e cartão via Asaas
- Cálculo de frete com Melhor Envio
- Backend serverless integrado ao Supabase

## Stack

- React 19
- Vite
- React Router
- Tailwind CSS
- Framer Motion
- Supabase
- Asaas
- Melhor Envio
- Vercel

## Requisitos

- Node.js 20+
- npm 10+
- Projeto Supabase configurado
- Conta Asaas com API key
- Token do Melhor Envio

## Configuração

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ASAAS_API_KEY=
ASAAS_API_URL=
ASAAS_WEBHOOK_TOKEN=
MELHOR_ENVIO_TOKEN=
SITE_URL=
ADMIN_API_KEY=
```

Copie o exemplo de variáveis e preencha os valores do projeto:

```bash
cp .env.example .env
npm install
npm run dev
```

## Scripts

```bash
npm run lint
npm run build
npm run preview
```

## Banco de dados

As migrations do Supabase ficam em `supabase/`. Execute os arquivos na ordem numérica antes de usar o painel administrativo ou o checkout.

## Deploy

O projeto está preparado para Vercel. Configure as mesmas variáveis de ambiente no painel do projeto antes de publicar.
