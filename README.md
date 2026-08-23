# Nobre Amor Baby

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
VITE_SITE_URL=
CORS_ALLOWED_ORIGINS=
VITE_WA_TEST=
VITE_WA_TEST_NUMBER=
```

`SITE_URL` e `VITE_SITE_URL` devem apontar para a mesma origem HTTPS canônica da loja. `CORS_ALLOWED_ORIGINS` é opcional e aceita uma lista separada por vírgulas de origens HTTP(S) adicionais e exatas, por exemplo `https://preview.example.com`; curingas como `*` não são aceitos. Requisições servidor-a-servidor sem cabeçalho `Origin` continuam permitidas pelo limite CORS, mas todas as regras existentes de autenticação e autorização continuam obrigatórias.

Copie o arquivo de exemplo, preencha os valores e instale as dependências:

```bash
cp .env.example .env
npm install
npm run dev
```

## Scripts

Use estes comandos no terminal dentro da pasta do projeto:

```bash
npm run check:production-config
npm run lint
npm run build
npm run preview
```

## Banco De Dados

As migrations do Supabase ficam em `supabase/`. Execute os arquivos na ordem numérica antes de usar o painel administrativo ou o checkout.

## Deploy

O projeto está preparado para Vercel. Configure no painel da Vercel as mesmas variáveis usadas no arquivo `.env`.


## Preparação Para Produção

Antes de uma publicação real em produção, configure valores reais no ambiente de produção e execute:

```bash
npm run check:production-config
npm audit --audit-level=low
npm test
npm run lint
npm run build:budget
```

A configuração de produção precisa incluir Supabase público e servidor consistentes, endpoint e chave reais do Asaas, token do webhook Asaas, token do Melhor Envio e `SITE_URL`/`VITE_SITE_URL` apontando para a mesma origem HTTPS canônica. O modo de teste do WhatsApp deve permanecer desativado: `VITE_WA_TEST` não pode ser `true` e `VITE_WA_TEST_NUMBER` deve ficar vazio. O verificador também bloqueia endpoint Asaas de sandbox. Esses requisitos são validações de prontidão; este repositório não afirma que valores reais já estejam configurados ou que uma publicação de produção tenha sido realizada.

### Limitação de HTTP 404 da SPA

A rota React curinga continua renderizando a página “Página não encontrada” e o gerenciador de SEO marca URLs desconhecidas como `noindex,nofollow`. Porém, com a arquitetura Vite SPA atual, a regra de fallback da Vercel reescreve uma URL de navegador desconhecida para `/index.html`. Por isso, o documento inicial pode receber HTTP 200 e só depois renderizar a página de erro no cliente.

Um HTTP 404 verdadeiro para rotas desconhecidas exigiria renderização ou roteamento consciente da rota no servidor/edge, ou outra arquitetura de deploy. Isso não deve ser simulado com redirecionamentos JavaScript.
