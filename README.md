# Olyvia CRM

Plataforma CRM multi-tenant para gestão de clientes, contactos, leads, oportunidades, orçamentos, propostas, contratos, marketing e operações.

## Stack

- React 18, TypeScript e Vite
- Tailwind CSS e shadcn/ui
- Supabase: PostgreSQL, autenticação, RLS, Storage e Edge Functions
- Vitest e Testing Library
- Playwright para testes end-to-end
- Vercel para alojamento do frontend

## Requisitos

- Node.js
- npm
- Supabase CLI para desenvolvimento e migrações
- Docker Desktop apenas para executar a stack Supabase local

## Configuração

```bash
git clone https://github.com/Miguel-olyvia/Olyvia-crm.git
cd Olyvia-crm
npm install
```

Cria os ficheiros de ambiente locais a partir do exemplo:

```bash
copy .env.example .env.local
```

Preenche apenas variáveis do teu ambiente. Nunca publiques chaves secretas, passwords ou a `service_role`.

## Comandos

```bash
npm run dev
npm run build
npm run lint
npm run preview
npx vitest run
```

O servidor de desenvolvimento usa, por defeito:

```text
http://localhost:8080
```

## Supabase

As migrações versionadas encontram-se em:

```text
supabase/migrations/
```

Comandos principais:

```bash
supabase start
supabase status
supabase migration list
supabase db push --dry-run
supabase db push
```

Antes de aplicar alterações na base de dados ativa:

1. Confirma o projeto Supabase ligado.
2. Executa `supabase migration list`.
3. Executa sempre o `dry-run`.
4. Não alteres migrações que já tenham sido aplicadas.

## Branches

- `development`: desenvolvimento e integração.
- A publicação para produção deve seguir o fluxo definido no GitHub/Vercel.

## Segurança

- A autorização real deve ser aplicada na base de dados através de RLS e RPCs seguras.
- Controlos do frontend não substituem autorização no servidor.
- Não incluir dados pessoais, tokens ou segredos nos logs.
- Não fazer commit de `.env`, `.env.local`, dumps privados ou credenciais.

## Deploy

O frontend é compilado com:

```bash
npm run build
```

A configuração SPA da Vercel encontra-se em `vercel.json`.
