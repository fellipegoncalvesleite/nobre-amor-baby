# Pequeno Encanto

Loja online de moda infantil feita com React e Vite. O projeto tem vitrine pública, conta de cliente, carrinho, checkout, painel administrativo e integração com serviços brasileiros de pagamento e frete.

## O Que Tem

1. Catálogo público com produtos, coleções, busca, favoritos e carrinho.
2. Conta de cliente com login, cadastro, recuperação de senha e histórico de pedidos.
3. Checkout com Pix e cartão usando Asaas.
4. Cálculo de frete usando Melhor Envio.
5. Painel administrativo para produtos, coleções, tamanhos, pedidos e conteúdo da página inicial.
6. Banco de dados e autenticação no Supabase.
7. Publicação preparada para Vercel.

## Tecnologias

1. React 19
2. Vite
3. React Router
4. Tailwind CSS
5. Framer Motion
6. Supabase
7. Asaas
8. Melhor Envio
9. Vercel

## Antes De Rodar

Você precisa ter Node.js 20 ou mais recente, npm 10 ou mais recente, um projeto Supabase configurado, uma conta Asaas com chave de API e um token do Melhor Envio.

## Configuração Local

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

Copie o arquivo de exemplo, preencha os valores e instale as dependências:

```bash
cp .env.example .env
npm install
npm run dev
```

## Scripts

Use estes comandos no terminal dentro da pasta do projeto:

```bash
npm run lint
npm run build
npm run preview
```

## Banco De Dados

As migrations do Supabase ficam em `supabase/`. Execute os arquivos na ordem numérica antes de usar o painel administrativo ou o checkout.

## Deploy

O projeto está preparado para Vercel. Configure no painel da Vercel as mesmas variáveis usadas no arquivo `.env`.
