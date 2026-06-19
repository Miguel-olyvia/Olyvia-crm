# Auditoria COMPLETE — Olyvia CRM
**Data:** 2026-06-12  
**Âmbito:** CRM/Leads, CRM/Contactos, CRM/Clientes, Deals & Pipeline, Comercial/Orçamentos, Comercial/Propostas, Comercial/Contratos  
**Ficheiros auditados:** 15  
**Tecnologia:** React + TypeScript + Supabase/PostgreSQL  

---

## Resumo Executivo

A auditoria cobriu 15 ficheiros de página, totalizando ~26.000 linhas de código. Os problemas mais graves são de **tamanho e decomposição** — seis ficheiros excedem largamente o limite de 800 linhas, com `AnewLeads.tsx` a atingir 6 140 linhas (7,7× o máximo). Esta realidade impossibilita testes unitários significativos, aumenta o blast radius de qualquer alteração, e é a causa raiz de vários outros problemas encontrados. Em paralelo, foram identificadas falhas de **segurança e privacidade** — `[DEBUG]` console.log que expõem dados pessoais em produção, ausência de PermissionGate em `LeadContactResults.tsx`, e um bug de estado no fluxo de rejeição de propostas públicas.

---

## Problemas Priorizados

### 🔴 HIGH

#### H1 — AnewLeads.tsx: 6 140 linhas (7,7× o limite)
**Ficheiro:** `AnewLeads.tsx`  
**Evidência:** `wc -l AnewLeads.tsx` → 6 140. Contém CRUD completo, workflow, paginação, filtros, deteção de duplicados, criação de entidades, import/export e vista de detalhe — tudo num único componente.  
**Impacto:** Testabilidade nula, blast radius total, tempo de leitura/review proibitivo. Qualquer alteração pode quebrar funcionalidades não relacionadas.  
**Resolução:** Decomposição em sub-componentes e hooks por responsabilidade: `useLeadsData`, `useLeadFilters`, `LeadDetailPanel`, `LeadCreateDialog`, `LeadImportDialog`, `LeadWorkflowPanel`. O orquestrador de página ficaria <200 linhas.

#### H2 — Ficheiros de página massivamente acima do limite
**Ficheiros:** `Proposals.tsx` (3 132), `Deals.tsx` (2 677), `AnewContacts.tsx` (2 557), `Quotes.tsx` (2 206), `AnewClients.tsx` (2 189), `ClientContracts.tsx` (1 567)  
**Evidência:** `wc -l` em todos os ficheiros. Total de 14 328 linhas em 7 ficheiros (limite combinado seria ~5 600).  
**Impacto:** Idem H1 — qualquer hook ou state change afeta o render de toda a página. Impossível ter cobertura de testes >80%.  
**Resolução:** Aplicar o mesmo padrão de decomposição — extrair views (Dashboard, Kanban, Lista) para componentes separados, e lógica de dados para hooks dedicados.

#### H3 — [DEBUG] console.log expõe dados pessoais em produção
**Ficheiros:** `AnewContacts.tsx:1199-1201`, `AnewClients.tsx:847-849`  
**Evidência:**
```ts
// AnewContacts.tsx:1199
console.log('[DEBUG] contactType:', contactType, 'dataToValidate:', JSON.stringify(dataToValidate));
// AnewContacts.tsx:1201
console.log('[DEBUG] validation result:', contactValidation.success, ...JSON.stringify(contactValidation.error.errors));
// AnewClients.tsx:847
console.log('[DEBUG] clientType:', clientType, 'dataToValidate:', JSON.stringify(dataToValidate));
```
`dataToValidate` contém `first_name`, `last_name`, `email`, `phone`, `vat` — dados pessoais e de NIF serializados no browser console em produção. Violação de RGPD.  
**Impacto:** Qualquer pessoa com acesso às DevTools do browser (outro colaborador, suporte remoto, gravação de ecrã) pode ver dados de contactos/clientes.  
**Resolução:** Remover imediatamente as linhas 1199, 1201 em `AnewContacts.tsx` e 847, 849 em `AnewClients.tsx`.

#### H4 — LeadContactResults.tsx: sem PermissionGate em operações de escrita
**Ficheiro:** `LeadContactResults.tsx`  
**Evidência:**
```tsx
// Linha 256 — sem guarda de permissão
<Button onClick={() => handleOpenDialog()}>
  <Plus className="w-4 h-4 mr-2" />
  {t('contactResults.newResult')}
</Button>
// Linhas 348-368 — editar e apagar sem PermissionGate
<Button variant="ghost" size="icon" onClick={() => handleOpenDialog(result)}>
<Button variant="ghost" size="icon" onClick={() => { setResultToDelete(result); ... }}>
```
Contrariamente a `LeadSources.tsx` (que usa `<PermissionGate permission="channels.create">` etc.), `LeadContactResults` não tem qualquer guarda.  
**Impacto:** Qualquer utilizador autenticado pode criar, editar ou apagar resultados de contacto — configuração de sistema que afeta o workflow de todos os leads.  
**Resolução:** Envolver os botões com `<PermissionGate permission="contact_results.create|edit|delete">` em linha com o padrão de `LeadSources.tsx`.

#### H5 — PublicProposal.tsx: rejeição direta sem guard de estado
**Ficheiro:** `PublicProposal.tsx:249`  
**Evidência:**
```ts
// handleDirectAccept (linha 165) — correto, tem guard:
.in("status", ["draft", "sent", "pending"])

// handleDirectReject (linha 249) — sem guard:
.update({ status: "rejected", ... })
.eq("id", portalData.proposal.id)  // sem .in("status", ...)
```
**Impacto:** Uma proposta já aceite pode ser rejeitada se o utilizador tiver o portal aberto no momento em que o estado muda — comportamento inconsistente com `handleDirectAccept` e que pode corromper o pipeline comercial.  
**Resolução:** Adicionar `.in("status", ["draft", "sent", "pending"])` ao update de rejeição, idêntico ao de aceitação.

---

### 🟡 MEDIUM

#### M1 — acceptance_ip hardcoded como "client" em PublicProposal.tsx
**Ficheiro:** `PublicProposal.tsx:162`  
**Evidência:**
```ts
acceptance_ip: "client",
acceptance_user_agent: navigator.userAgent
```
O IP registado no audit trail de aceitação é sempre a string literal `"client"`. O IP real do cliente nunca é capturado. O `navigator.userAgent` é fornecido pelo browser e pode ser falsificado.  
**Impacto:** O audit trail de aceitação de propostas é inválido para efeitos legais ou de disputas comerciais.  
**Resolução:** Mover o registo de aceitação para uma Edge Function que capture o IP real via `request.headers.get("x-forwarded-for")`.

#### M2 — (supabase as any) usado em ~20+ locais no âmbito
**Ficheiros:** `ClientContracts.tsx`, `AnewLeads.tsx`, `AnewContacts.tsx`, `QuoteModels.tsx`, `ContractTemplates.tsx`, `PublicProposal.tsx`, `Deals.tsx`, `Quotes.tsx`, `Proposals.tsx`  
**Evidência (exemplos):**
```ts
// ClientContracts.tsx:344
const { data, error } = await (supabase as any).from("client_contracts").select(...)
// QuoteModels.tsx:97
const { data: orgData } = await (supabase as any).from("anew_organizations").select(...)
// PublicProposal.tsx:144
const { data } = await (supabase.from("proposal_rejection_reasons") as any)
```
**Impacto:** Elimina verificação de tipos em queries — erros de coluna ou tipo só manifestam em runtime. Opõe-se à política TypeScript do projeto.  
**Resolução:** Regenerar/atualizar os tipos Supabase com `supabase gen types typescript` e substituir os casts por tipos gerados. A maioria dos casts existe porque a tabela não está no schema gerado — indicando schema desatualizado.

#### M3 — QuoteTemplates.tsx: sem sistema de tradução (i18n ausente)
**Ficheiro:** `QuoteTemplates.tsx`  
**Evidência:** Sem import de `useTranslation`. Todas as strings visíveis ao utilizador são hardcoded em Português:
```ts
toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
toast({ title: "Template eliminado" });
toast({ title: "Template duplicado" });
```
**Impacto:** A página não suporta EN/PT. Inconsistente com todos os outros ficheiros do âmbito que usam `t()`.  
**Resolução:** Importar `useTranslation`, adicionar chaves ao ficheiro de tradução, e substituir todas as strings hardcoded por `t('quoteTemplates.*')`.

#### M4 — ProposalTemplates.tsx: strings de toast hardcoded em Português
**Ficheiro:** `ProposalTemplates.tsx:103-104, 110`  
**Evidência:**
```ts
toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
toast({ title: "Template eliminado" });
```
Apesar de `useTranslation` estar importado e `t` usado noutros contextos, os toasts de erro/sucesso são hardcoded.  
**Resolução:** Substituir por chaves `t('proposalTemplates.toast.loadError')` etc. em linha com o padrão do projeto.

#### M5 — LeadContactResults.tsx: query com selectedCompanyId potencialmente undefined
**Ficheiro:** `LeadContactResults.tsx:134`  
**Evidência:**
```ts
const selectedCompanyId = activeCompany?.id; // pode ser undefined
// ...
.or(`organization_id.is.null,organization_id.eq.${selectedCompanyId}`)
// → "organization_id.is.null,organization_id.eq.undefined"
```
Quando `selectedCompanyId` é `undefined` (utilizador sem empresa ativa), a query torna-se malformada.  
**Impacto:** A query pode lançar erro ou devolver resultados incorretos. A cláusula `organization_id.is.null` sozinha devolve todos os registos globais para um utilizador sem contexto de empresa.  
**Resolução:** Adicionar guard no início de `loadResults()`:
```ts
if (!selectedCompanyId) { setResults([]); setLoading(false); return; }
```

#### M6 — ClientContracts.tsx: interface ClientContract sem tipos
**Ficheiro:** `ClientContracts.tsx:64-70`  
**Evidência:**
```ts
interface ClientContract {
  id: string;
  status: string;
  created_at: string;
  proposal_id?: string;
  [key: string]: any;  // elimina toda a type safety
}
```
**Impacto:** Todas as propriedades além de `id`/`status`/`created_at` são `any`. Erros de acesso a propriedades só surgem em runtime.  
**Resolução:** Definir a interface completa com todas as propriedades conhecidas, ou gerar via `supabase gen types` e inferir do schema.

---

### 🔵 LOW

#### L1 — AcquisitionHelp.tsx: cast `as any` para aceder a propriedades de FAQ
**Ficheiro:** `AcquisitionHelp.tsx:305-313`  
**Evidência:**
```ts
const faqAny = faq as any;
// ...
{faqAny.action_url && ( <Button onClick={() => navigate(faqAny.action_url)}> )}
```
**Resolução:** Adicionar `action_url?: string; action_label?: string` ao tipo FAQ.

#### L2 — QuoteTemplates.tsx: ESLint disable para dependência em falta
**Ficheiro:** `QuoteTemplates.tsx:77`  
**Evidência:** `// eslint-disable-next-line react-hooks/exhaustive-deps`  
**Resolução:** Usar `useCallback` para `fetchTemplates` e adicionar como dependência, eliminando a necessidade do disable.

#### L3 — console.error/warn em múltiplos ficheiros de produção
**Ficheiros:** `AnewLeads.tsx` (~15 ocorrências), `AnewContacts.tsx` (~10), `AnewClients.tsx` (~6), `PublicProposal.tsx` (~5)  
**Evidência (exemplo):** `console.error("Error loading campaigns:", error)` em `AnewLeads.tsx:1142`  
Os que são marcados como `[DEBUG]` (H3 acima) são os mais críticos. Os restantes expõem stack traces e mensagens de erro internas no browser.  
**Resolução:** Substituir por um logger estruturado ou remover completamente — o utilizador já recebe feedback via `toast`.

---

## Riscos

| Risco | Probabilidade | Impacto |
|-------|---------------|---------|
| Bug de rejeição (H5) causa corrupção de estado de proposta | Médio | Alto |
| Dados pessoais expostos via console (H3) — RGPD | Alto | Alto |
| Utilizador sem permissão altera configuração de workflow (H4) | Médio | Médio |
| Schema Supabase desatualizado → cast `as any` mascara erros de coluna (M2) | Médio | Médio |
| Página QuoteTemplates inutilizável em EN (M3) | Baixo | Baixo |

---

## Plano de Correção

### Sprint 1 — Segurança/Privacidade (urgente)
1. **H3** — Remover as 4 linhas `[DEBUG] console.log` em `AnewContacts.tsx` e `AnewClients.tsx`
2. **H5** — Adicionar `.in("status", ["draft", "sent", "pending"])` em `handleDirectReject` em `PublicProposal.tsx`
3. **H4** — Adicionar `PermissionGate` aos botões de `LeadContactResults.tsx`
4. **M5** — Adicionar guard de `selectedCompanyId` em `LeadContactResults.tsx`

### Sprint 2 — Qualidade/Correção
5. **M1** — Mover registo de IP de aceitação para Edge Function
6. **M3** — Adicionar `useTranslation` a `QuoteTemplates.tsx`
7. **M4** — Substituir strings hardcoded em `ProposalTemplates.tsx`
8. **M2** — Regenerar tipos Supabase e eliminar casts `as any`
9. **M6** — Tipificar a interface `ClientContract`

### Sprint 3 — Decomposição (refactoring)
10. **H1/H2** — Decomposição faseada:
    - Fase 3a: `AnewLeads.tsx` → extrair hooks (`useLeadsData`, `useLeadFilters`) e dialogs
    - Fase 3b: `Proposals.tsx` e `Deals.tsx` → extrair views e hooks
    - Fase 3c: `AnewContacts.tsx`, `Quotes.tsx`, `AnewClients.tsx`, `ClientContracts.tsx`
    - Critério de saída: nenhum ficheiro de página acima de 800 linhas

---

CENTRAL_AGENTS_FINDINGS_JSON
{"findings":[{"severity":"high","title":"AnewLeads.tsx com 6 140 linhas (7,7× o limite)","description":"Ficheiro de 6 140 linhas que agrega CRUD, workflow, paginação, filtros, duplicados, import/export e detalhe. Testabilidade nula. Blast radius total — qualquer alteração afeta todo o módulo de Leads.","resolution":"Decomposição em hooks (useLeadsData, useLeadFilters) e sub-componentes (LeadDetailPanel, LeadCreateDialog, LeadImportDialog). Orquestrador de página deve ficar <200 linhas.","file":"AnewLeads.tsx","scope":"CRM / Leads","suggestedAgent":"gsd-executor"},{"severity":"high","title":"6 ficheiros adicionais massivamente acima de 800 linhas","description":"Proposals.tsx (3 132), Deals.tsx (2 677), AnewContacts.tsx (2 557), Quotes.tsx (2 206), AnewClients.tsx (2 189), ClientContracts.tsx (1 567). Total: 14 328 linhas em 7 ficheiros. Limite combinado seria ~5 600. Impossibilita cobertura de testes >80%.","resolution":"Decomposição faseada por módulo: extrair views (Dashboard, Kanban, Lista), dialogs, e hooks de dados. Aplicar o mesmo padrão de decomposição de AnewLeads.","file":"Proposals.tsx, Deals.tsx, AnewContacts.tsx, Quotes.tsx, AnewClients.tsx, ClientContracts.tsx","scope":"CRM / Contactos, CRM / Clientes, CRM / Deals & Pipeline, Comercial","suggestedAgent":"gsd-executor"},{"severity":"high","title":"[DEBUG] console.log expõe dados pessoais (RGPD) em produção","description":"AnewContacts.tsx:1199-1201 e AnewClients.tsx:847-849 serializam dataToValidate (first_name, last_name, email, phone, vat) para JSON no browser console. Qualquer DevTools aberto expõe estes dados.","resolution":"Remover imediatamente as 4 linhas de console.log marcadas com [DEBUG] em ambos os ficheiros.","file":"AnewContacts.tsx, AnewClients.tsx","scope":"CRM / Contactos, CRM / Clientes","suggestedAgent":"gsd-executor"},{"severity":"high","title":"LeadContactResults.tsx: sem PermissionGate em operações de escrita","description":"Os botões Novo Resultado (linha 256), Editar (linha 349) e Apagar (linha 357) não têm PermissionGate. Contrariamente a LeadSources.tsx que usa permission='channels.create/edit/delete', qualquer utilizador autenticado pode alterar configurações de workflow de contacto.","resolution":"Envolver cada botão com <PermissionGate permission='contact_results.create|edit|delete'> em linha com o padrão de LeadSources.tsx.","file":"LeadContactResults.tsx","scope":"CRM / Leads","suggestedAgent":"gsd-executor"},{"severity":"high","title":"PublicProposal.tsx: handleDirectReject sem guard de estado","description":"handleDirectAccept usa .in('status', ['draft', 'sent', 'pending']) como safeguard (linha 165), mas handleDirectReject (linha 249) usa apenas .eq('id', ...) sem restrição de estado. Uma proposta já aceite pode ser rejeitada via portal se o URL ainda estiver aberto.","resolution":"Adicionar .in('status', ['draft', 'sent', 'pending']) ao update de rejeição em handleDirectReject, idêntico ao de aceitação.","file":"PublicProposal.tsx","scope":"Comercial / Propostas","suggestedAgent":"gsd-executor"},{"severity":"medium","title":"acceptance_ip hardcoded como string 'client' em PublicProposal.tsx","description":"PublicProposal.tsx:162 define acceptance_ip: 'client' (string literal). O IP real do cliente nunca é capturado. O audit trail de aceitação de propostas é inválido para efeitos legais.","resolution":"Mover o registo de aceitação para uma Edge Function que capture o IP via request.headers.get('x-forwarded-for').","file":"PublicProposal.tsx","scope":"Comercial / Propostas","suggestedAgent":"gsd-executor"},{"severity":"medium","title":"(supabase as any) usado em ~20 locais — schema Supabase desatualizado","description":"Casts (supabase as any) encontrados em ClientContracts.tsx, AnewLeads.tsx, AnewContacts.tsx, QuoteModels.tsx, ContractTemplates.tsx, PublicProposal.tsx, Deals.tsx, Quotes.tsx, Proposals.tsx. Elimina type safety nas queries — erros de coluna só surgem em runtime.","resolution":"Executar 'supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts' para atualizar os tipos gerados e eliminar os casts.","file":"ClientContracts.tsx, AnewLeads.tsx, QuoteModels.tsx, ContractTemplates.tsx","scope":"Todos os módulos","suggestedAgent":"gsd-executor"},{"severity":"medium","title":"QuoteTemplates.tsx: i18n completamente ausente","description":"QuoteTemplates.tsx não importa useTranslation. Todas as strings visíveis ao utilizador (toasts, labels) estão hardcoded em Português. Inconsistente com todos os outros ficheiros do âmbito.","resolution":"Importar useTranslation, adicionar chaves ao ficheiro de tradução (pt/en), e substituir todas as strings hardcoded por t('quoteTemplates.*').","file":"QuoteTemplates.tsx","scope":"Comercial / Orçamentos","suggestedAgent":"gsd-executor"},{"severity":"medium","title":"ProposalTemplates.tsx: strings de toast hardcoded em Português","description":"Apesar de importar useTranslation, ProposalTemplates.tsx usa strings hardcoded nos toasts de erro/sucesso (linhas 103, 110: 'Erro ao carregar', 'Template eliminado').","resolution":"Substituir por chaves t('proposalTemplates.toast.loadError') etc. em linha com o padrão do projeto.","file":"ProposalTemplates.tsx","scope":"Comercial / Propostas","suggestedAgent":"gsd-executor"},{"severity":"medium","title":"LeadContactResults.tsx: query malformada quando selectedCompanyId é undefined","description":"Linha 134: .or(`organization_id.is.null,organization_id.eq.${selectedCompanyId}`) corre mesmo quando selectedCompanyId é undefined (utilizador sem empresa ativa), gerando 'organization_id.eq.undefined'. Pode expor registos globais ou lançar erro.","resolution":"Adicionar guard no início de loadResults(): if (!selectedCompanyId) { setResults([]); setLoading(false); return; }","file":"LeadContactResults.tsx","scope":"CRM / Leads","suggestedAgent":"gsd-executor"},{"severity":"medium","title":"ClientContracts.tsx: interface ClientContract sem tipagem real","description":"A interface ClientContract define apenas id, status, created_at e um index signature [key: string]: any. Toda a type safety para este modelo central é eliminada.","resolution":"Definir a interface completa com todas as propriedades conhecidas (entity_id, organization_id, contract_number, etc.) ou gerar via supabase gen types.","file":"ClientContracts.tsx","scope":"Comercial / Contratos","suggestedAgent":"gsd-executor"},{"severity":"low","title":"AcquisitionHelp.tsx: cast as any para aceder a propriedades de FAQ","description":"Linha 305: const faqAny = faq as any; para aceder a action_url e action_label que não estão no tipo FAQ.","resolution":"Adicionar action_url?: string e action_label?: string à interface/tipo FAQ.","file":"AcquisitionHelp.tsx","scope":"CRM / Leads","suggestedAgent":"gsd-executor"},{"severity":"low","title":"QuoteTemplates.tsx: ESLint disable para dependência em falta em useEffect","description":"Linha 77: // eslint-disable-next-line react-hooks/exhaustive-deps silencia uma dependência em falta no useEffect de fetchTemplates.","resolution":"Usar useCallback para fetchTemplates e adicioná-lo como dependência, eliminando o disable.","file":"QuoteTemplates.tsx","scope":"Comercial / Orçamentos","suggestedAgent":"gsd-executor"},{"severity":"low","title":"console.error/warn em múltiplos ficheiros de produção expõem detalhes internos","description":"~30 chamadas console.error/warn em AnewLeads.tsx, AnewContacts.tsx, AnewClients.tsx, PublicProposal.tsx expõem stack traces e mensagens de erro internas no browser. Os [DEBUG] (H3) são os mais críticos; os restantes são low.","resolution":"Substituir por um logger estruturado ou remover — o utilizador já recebe feedback via toast.","file":"AnewLeads.tsx, AnewContacts.tsx, AnewClients.tsx, PublicProposal.tsx","scope":"Todos os módulos","suggestedAgent":"gsd-executor"}]}
END_CENTRAL_AGENTS_FINDINGS_JSON
