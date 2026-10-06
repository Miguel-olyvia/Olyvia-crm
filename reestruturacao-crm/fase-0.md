# CRM — Fase 0 da reestruturação (ganhos rápidos)

> **Estado:** pronta e verificada, **à espera de aprovação** para produção.
> Ramo: `feat/crm-fase-0`, criado a partir do `main` em `ea307d4e` (03/10/2026).
> Feita a 04/10/2026.
>
> Vem da auditoria ao CRM de 04/10/2026 (proposta de reestruturação: fluxo,
> dados e interface). A fase 0 junta o que se nota logo e quase não tem risco.
> **O fluxo negócio → orçamento → proposta → contrato → obra ainda não muda:
> isso é a fase 1.**

---

## O que muda para quem usa

### 1. Ecrã "Hoje" (o que aparece depois de entrar)

**Antes:** `/home` era um lançador de 38 links, todo em inglês, com 2 links
partidos (`/call-center`, `/lists`). Não dizia o que fazer.

**Agora:**
- saudação com o nome ("Bom dia, Ruben"), a data e as contagens do dia
  (agendados, por fazer, em atraso), ou "Está tudo em dia";
- **Agenda de hoje**: os agendamentos do dia e os que ficaram por fechar;
- **Tarefas**: em atraso e por fazer, com marcar como feita e "Nova tarefa";
- **Alertas por tratar**: leads, clientes, orçamentos, propostas e contratos
  com alertas (os mesmos números da barra lateral);
- cada linha tem um botão que abre a lead, o cliente, o negócio ou a agenda;
- os atalhos antigos ficam por baixo, recolhidos, traduzidos e sem os links
  partidos;
- funciona no telemóvel (uma coluna).

**Menu:** "Hoje" passa a ser o primeiro item. O botão do rodapé saiu.

**Retirado:** a personalização do lançador antigo (arrastar, mudar nomes e
cores). Os nomes personalizados eram texto inglês fixo. Pode voltar se fizer
falta.

### 2. Atividades ("O meu dia") para todos

Antes só os administradores entravam (o menu mostrava-o ao comercial, mas a
página recusava). Agora exige só `scheduling.items.view`, e cada pessoa vê o
seu dia.

### 3. "Criar orçamento" no negócio (Pedido de Proposta)

**Antes:** ir a Orçamentos → Novo Orçamento → escolher o Pedido → carregar em
"Importar do Pedido"; cliente e comercial à mão.

**Agora:**
- no detalhe do negócio, botão principal **Criar orçamento** (também no menu
  "…" de cada linha da lista);
- abre o construtor com pedido, cliente, título e comercial escolhidos e as
  **necessidades já importadas** (a mesma lógica de "Importar do Pedido", sem
  carregar em nada; não duplica linhas);
- o detalhe do negócio mostra o painel **Orçamentos**: quantos tem e a lista,
  cada um com link.
- Só aparece a quem tem `quotes.create` e `quotes.view` (as mesmas do
  "Novo Orçamento").

### 4. Ficha do cliente cria pelo caminho oficial

"Novo Pedido de Proposta" e "Nova Proposta" na ficha do cliente faziam
`insert` direto nas tabelas, saltando as regras e as automações. Agora usam
`rpc_create_deal` (+ `execute-workflow`) e `rpc_create_proposal`, como as
páginas de Negócios e Propostas.
- O botão do negócio fica atrás de `deals.create`.
- Corrigida a proteção contra duplicados (30 s), que nunca funcionava.
- A proposta passa a nascer com probabilidade 50 % (valor da RPC).

### 5. Modelos de orçamento: a mesma permissão no botão e na página

| Página | Antes (botão / página) | Agora |
|---|---|---|
| Modelos em PDF `/quote-templates` | `quotes.manage` / `proposals.manage` | `quotes.manage` em tudo |
| Modelos rápidos `/quote-models` | `quotes.manage` / `quote_templates.view` | `quote_templates.view` em tudo |

⚠ Quem tinha `proposals.manage` sem `quotes.manage` deixa de entrar nos
modelos em PDF. Confirmar os papéis antes de publicar.

### 6. Língua

- PT tinha 71 chaves a menos do que EN (apareciam em inglês): **0 em falta**.
- 3 chaves usadas que não existiam em língua nenhuma (`stocks.loadingMore`,
  `stocks.allLoaded`, `scheduling.resource.postalCodeNotFound`): criadas.
- ~200 textos em inglês fixo passados a tradução: Campanhas (detalhe e
  campos), Países, configuração de campos das leads, canais, definições.
- "Acções/acção/interacção/fracção…" → "Ações/ação/interação/fração…" em todo
  o `src` (eram 117 contra 77).
- **O que fica por fazer está documentado** em
  [`src/translations/README.md`](../src/translations/README.md) (português
  fixo no código, ES/FR/DE incompletas).

### 7. Limpeza

- Apagado código que ninguém usava: `QuoteDiagnosticPhase.tsx`,
  `useQuoteDiagnostic.ts`.
- Migração **`20261208120000_limpar_tabelas_backup.sql`** — apaga 11 tabelas de
  cópia de segurança sem uso (ver "Publicar", passo 3). **Opcional.**

---

## Publicar em produção (quando for aprovado)

O Vercel publica cada push no `main`.

**1. Pôr o ramo em dia com o `main`** (se o `main` avançou entretanto):

```
git -C D:/Olyvia/Olyvia-crm-fase0 fetch origin
git -C D:/Olyvia/Olyvia-crm-fase0 rebase origin/main
```

Conflitos prováveis, se houver: `src/translations/index.ts`, `Deals.tsx`,
`Quotes.tsx`, `QuoteBuilder.tsx`, `Home.tsx`. Depois do rebase, voltar a correr
as verificações de baixo.

**2. Publicar a aplicação:**

```
git -C D:/Olyvia/Olyvia-crm-fase0 push origin feat/crm-fase-0:main
```

Não há SQL obrigatório: a aplicação só usa RPCs e tabelas que já existem.

**3. (Opcional) Apagar as tabelas de cópia de segurança.** Não tem volta.

Antes, contar as linhas e exportar as que tiverem dados (a consulta está no
cabeçalho da migração). Depois, colar a migração no SQL Editor do Supabase.
Fica de fora `anew_users_ligacao_ficha_backup`: guarda 10 contas do portal da
Mudelar à espera de decisão.

Tabelas apagadas:
`anew_leads_status_backup_20261204_conversao`,
`anew_leads_status_backup_20261204_no_answer`,
`anew_leads_status_backup_20261204_rejeicao`,
`anew_leads_workflow_stage_backup_20261204`,
`anew_leads_workflow_stage_backup_20261204_bmgest`,
`lead_contact_results_backup_20261204`,
`lead_workflow_stages_rules_backup_20261204`,
`lead_workflow_stages_rules_backup_20261204_etapas56`,
`lead_pipeline_settings_backup_20261204_etapas56`,
`anew_entity_emails_apagados_backup`, `anew_entities_apagadas_backup`.

**4. Voltar atrás**, se for preciso: `git revert` dos commits da fase 0 no
`main` e push. A aplicação não depende da migração, por isso reverter o código
não exige SQL.

---

## Como testar (local, antes de publicar)

```
cd D:/Olyvia/Olyvia-crm-fase0
npm run dev          # http://localhost:8080
```

⚠ O `.env` local aponta para a **base de dados de produção**: o que se grava
é real. Testar com um negócio de teste e apagá-lo no fim.

1. Entrar → aparece o "Hoje". Ver no telemóvel (ou janela estreita).
2. Menu: "Hoje" no topo; "Atividades" abre com um utilizador comercial.
3. Pedidos de Proposta → abrir um negócio com necessidades → painel
   "Orçamentos" → **Criar orçamento** → as necessidades entram sozinhas.
4. Clientes → ficha → "Novo Pedido de Proposta" → o negócio aparece em
   Pedidos de Proposta e as automações da etapa correm.
5. Orçamentos → botões "Templates" e "Modelos Rápidos" com um utilizador sem
   permissão: não aparecem, e o URL direto também recusa.
6. Campanhas → detalhe; Países: tudo em português.

## Verificação feita (04/10/2026)

- TypeScript: 158 erros, **os mesmos do `main`** (nenhum novo).
- `vite build`: passa.
- Testes: 1480 de 1481 passam. Falha só
  `LeadContactResults.loadError`, que **já falha no `main`**.
- Testes novos: regras do "Hoje" (incluindo: todos os atalhos apontam para
  rotas reais) e o link negócio → orçamento.
- eslint: 0 erros nos ficheiros alterados.
- Vista no browser: a página abre sem erros. **O "Criar
  orçamento" foi experimentado pelo Ruben no localhost; o "Hoje" falta ver com dados reais.**

## Por decidir / riscos conhecidos

- **Permissão dos modelos em PDF** (ponto 5): confirmar quem só tinha
  `proposals.manage`.
- Um orçamento do negócio que seja de outra empresa do grupo aparece na lista
  do painel, mas ao abrir diz "não encontrado" (o link só procura na empresa
  ativa).
- No painel, o estado do orçamento aparece como está na base de dados
  ("aceite"), sem os nomes da página de Orçamentos.
- O kanban dos negócios não tem "Criar orçamento" no cartão (chocava com o
  arrastar): abre-se o detalhe.
- ES, FR e DE continuam a mostrar inglês onde faltam chaves.

## Ficheiros

Novos: `src/lib/agenda/today.ts` (+ teste), `src/components/home/QuickLinks.tsx`,
`src/translations/today.ts`, `src/translations/README.md`,
`src/lib/quotes/dealQuoteLink.ts` (+ teste),
`src/components/deals/DealQuotesPanel.tsx`, a migração.

Principais alterados: `src/pages/Home.tsx` (reescrito), `menuConfig.ts`,
`AppSidebar.tsx`, `SidebarSkeleton.tsx`, `App.tsx`, `useTranslation.ts`,
`useSidebarAlertCounts.ts`, `Deals.tsx`, `Quotes.tsx`, `QuoteBuilder.tsx`,
`QuoteTemplates.tsx`, `ClientDetailsDialog.tsx`, `CampaignDetail.tsx`,
`Countries.tsx`, `CampaignFieldsConfig.tsx`, `AnewLeads.tsx`,
`translations/index.ts`, `types.ts` (tipos das tabelas apagadas).
Os restantes ~45 ficheiros só têm a troca "Acções" → "Ações".

Apagados: `src/components/quote/QuoteDiagnosticPhase.tsx`,
`src/hooks/useQuoteDiagnostic.ts`.
