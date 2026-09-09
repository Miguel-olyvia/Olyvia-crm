# DUC — Documento Único de Cliente (app separada)

Aplicação **independente** do sistema Olyvia. Partilha o **mesmo backend Supabase**
(mesma base de dados, mesmos utilizadores e clientes), mas tem **login próprio** e
**não altera nada** no código nem no schema existente da Olyvia.

- Login: as **mesmas credenciais** (email/password) da Olyvia — autentica contra o
  mesmo Supabase Auth. Não há utilizadores próprios do DUC.
- Acesso: **visibilidade por área/organização** — quem tem acesso à org vê/edita
  **todos** os DUCs dela (documento colaborativo, cada departamento preenche a sua
  etapa). INSERT/DELETE ficam restritos ao criador. Tudo imposto por RLS.
- Dados: tabelas **novas** `anew_client_ducs` e `anew_client_duc_items` (aditivas).
  Não se insere nada nas tabelas de permissões da Olyvia.

## 1. Aplicar o schema à base de dados (uma vez)

O ficheiro [`db/schema.sql`](./db/schema.sql) é **aditivo e idempotente** (só cria
tabelas novas e as suas policies; não toca em nada da Olyvia).

**Opção A — Supabase Studio (recomendado):**
1. Abrir o projeto no Supabase → **SQL Editor**.
2. Colar o conteúdo de `db/schema.sql` e **Run**.

**Opção B — psql / supabase CLI (a partir da tua máquina):**
```bash
psql "postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres" -f db/schema.sql
```

## 2. Configurar o ambiente

O `.env` já aponta para o mesmo projeto Supabase (ver `.env.example`):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## 3. Correr

```bash
npm install      # já feito
npm run dev      # http://localhost:5273
```

Login com um utilizador Olyvia → lista de DUCs → **+ Novo DUC** (escolhe um cliente
teu + variante) → preenche as 9 etapas, o rastreio e o registo de alterações →
**Guardar DUC**.

## Estrutura

- `db/schema.sql` — tabelas + RLS. Visibilidade **por área/organização** (qualquer
  utilizador com acesso à org vê/edita os DUCs dela; INSERT/DELETE ficam com o
  criador). Inclui `anew_client_duc_configs` (config dinâmica por org).
- `src/lib/ducSchema.ts` — template base declarativo das 9 etapas/variantes.
- `src/lib/ducConfig.ts` — config **efetiva por organização** (override guardado ou
  template base). É a fonte de verdade que o `DucDetail` renderiza.
- `src/lib/clientInfo.ts` — pré-preenchimento a partir da Olyvia (cliente, contrato
  e **linhas do orçamento vendido** → âmbito do DUC).
- `src/auth/` — sessão Supabase + resolução do utilizador/organizações.
- `src/pages/` — `Login`, `DucList`, `DucDetail`, `DucConfig` (editor visual).
- `src/components/` — layout próprio, guarda de rota, primitivos de UI, canvas do editor.

## Configuração dinâmica por entidade

Rota `/config` (ícone ⚙️ no topo) — um **editor visual estilo n8n** (React Flow) onde
cada etapa é um nó do fluxo. Escolhe-se a organização e editam-se etapas, campos,
tipos, opções e tabelas de itens. Guardar grava o override em `anew_client_duc_configs`
para essa org; "Repor template" apaga o override. O `DucDetail` passa a usar essa
config efetiva — **tudo é dinâmico por entidade**.

## Variantes

`universal`, `mudelar_obra` (MUDELAR · obra) e `bmg_contrato` (BMG · contrato).
No template base cada campo/secção declara a que variante pertence; ao guardar uma
config por org, a variante fica resolvida e a config passa a mandar.

## Testes

```bash
npm run test        # vitest (funções puras: schema, config efetiva, prefill)
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + build de produção
```
