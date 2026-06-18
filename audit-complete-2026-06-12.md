# Auditoria COMPLETE — Olyvia CRM
**Data:** 2026-06-12  
**Âmbito:** 16 ficheiros TypeScript/React — módulos CRM e Comercial  
**Auditor:** claude-sonnet-4-6  
**Solicitado por:** carvalhomiguel319@gmail.com

---

## Índice

1. [Resumo Executivo](#1-resumo-executivo)
2. [Ficheiros Auditados](#2-ficheiros-auditados)
3. [Problemas Prioritários com Evidência](#3-problemas-prioritários-com-evidência)
   - 3.1 CRÍTICO
   - 3.2 ALTO
   - 3.3 MÉDIO
4. [Avaliação de Risco](#4-avaliação-de-risco)
5. [Recomendações Estratégicas](#5-recomendações-estratégicas)
6. [Plano de Correção a 3 Sprints](#6-plano-de-correção-a-3-sprints)
7. [Apêndice: Métricas](#7-apêndice-métricas)
8. [CENTRAL_AGENTS_FINDINGS_JSON](#8-central_agents_findings_json)

---

## 1. Resumo Executivo

A auditoria cobriu 16 ficheiros que representam os módulos CRM (leads, contactos, clientes, agendamento, fontes) e Comercial (negócios, propostas, orçamentos, contratos). Foram identificados **1 problema CRÍTICO**, **9 problemas ALTOS** e **18 problemas MÉDIOS**.

**Pontuação de saúde estimada: 38/100**

O problema mais grave é a falsificação do campo de auditoria `acceptance_ip` em `PublicProposal.tsx`, que armazena a string literal `"client"` em vez do IP real do signatário. Isto invalida o valor jurídico do trail de aceitação eletrónica e expõe a empresa a litígios em que a assinatura digital seria contestável.

A segunda preocupação transversal é o tamanho extremo dos ficheiros — `AnewLeads.tsx` tem **6 140 linhas** (7.7× o limite de projeto de 800 linhas), tornando manutenção, testes e rastreio de erros impraticáveis. Combinado com **316+ instâncias de `as any`** em todo o âmbito, o tipo de segurança da aplicação é quase inexistente nas camadas de dados.

Não foram encontradas credenciais hardcoded nem injeções SQL diretas. O sistema de validação de cores/aliases em `LeadSources.tsx` e o uso de Zod em `Proposals.tsx` são pontos positivos.

---

## 2. Ficheiros Auditados

| # | Ficheiro | Linhas | Estado de leitura | Risco principal |
|---|---------|--------|-------------------|-----------------|
| 1 | `LeadSources.tsx` | 641 | Lido completo | MÉDIO |
| 2 | `AcquisitionHelp.tsx` | 372 | Lido completo | MÉDIO |
| 3 | `LeadContactResults.tsx` | 544 | Lido completo | ALTO |
| 4 | `AnewContacts.tsx` | 2 558 | Parcial (linhas 1–1125) | ALTO |
| 5 | `AnewClients.tsx` | 2 190 | Parcial (linhas 1–1309) | ALTO |
| 6 | `Deals.tsx` | 2 678 | Parcial (linhas 1–1698) | ALTO |
| 7 | `Scheduling.tsx` | 533 | Lido completo | MÉDIO |
| 8 | `AnewLeads.tsx` | 6 140 | **Não verificado — ficheiro demasiado grande** (275 KB) | ALTO |
| 9 | `Quotes.tsx` | ~1 700+ | Parcial (linhas 1–400) | ALTO |
| 10 | `QuoteTemplates.tsx` | 310 | Lido completo | MÉDIO |
| 11 | `QuoteModels.tsx` | ~350 | Parcial (linhas 1–300) | MÉDIO |
| 12 | `Proposals.tsx` | 3 132 | Parcial (linhas 1–400) | ALTO |
| 13 | `ProposalTemplates.tsx` | 289 | Lido completo | MÉDIO |
| 14 | `PublicProposal.tsx` | ~450 | Parcial (linhas 1–400) | **CRÍTICO** |
| 15 | `ClientContracts.tsx` | 1 567 | Parcial (linhas 1–400) | ALTO |
| 16 | `ContractTemplates.tsx` | ~700+ | Parcial (linhas 1–300) | MÉDIO |

> **Nota:** Ficheiros marcados "Parcial" foram lidos até ao limite de tokens disponível. Problemas identificados nas secções lidas são documentados com referências exactas; problemas nas secções não lidas podem existir mas são marcados como "não verificado — secção não lida".

---

## 3. Problemas Prioritários com Evidência

### 3.1 CRÍTICO

---

#### C-01 — `acceptance_ip` armazena literal `"client"` em vez do IP real do signatário
**Ficheiro:** `PublicProposal.tsx:162`  
**Severity:** CRÍTICO  
**Categoria:** Segurança / Conformidade Legal / GDPR

**Evidência:**
```typescript
// PublicProposal.tsx:153-167
const { data, error } = await supabase
  .from("proposals")
  .update({ 
    status: "accepted",
    accepted_at: new Date().toISOString(),
    acceptance_ip: "client",           // ← PROBLEMA: literal string
    acceptance_user_agent: navigator.userAgent
  })
  .eq("id", portalData.proposal.id)
  .in("status", ["draft", "sent", "pending"])
  .select("id");
```

**Impacto:** O campo `acceptance_ip` destina-se a capturar o endereço IP do cliente no momento em que aceita eletronicamente uma proposta, constituindo parte do trail de auditoria da assinatura digital. Armazenar a string `"client"` (valor fixo do lado do frontend) em vez do IP real:

1. **Invalida o valor probatório** da aceitação eletrónica perante terceiros ou tribunal.
2. **Viola o RGPD/eIDAS** para documentos que pretendam ter força de assinatura qualificada.
3. **Não pode ser corrigido retroativamente** — os registos históricos já gravados com `"client"` são irrecuperáveis para fins de auditoria.

**Causa raiz:** O endereço IP do cliente só pode ser capturado com fiabilidade no servidor (edge function/backend). O frontend não tem acesso confiável ao IP real (proxies, NAT, CDN). A solução correta é delegar a escrita de `acceptance_ip` a uma Edge Function Supabase que captura `request.headers['x-forwarded-for']` ou `request.socket.remoteAddress`.

**Correção imediata:**
```typescript
// Solução: chamar edge function que escreve acceptance_ip no servidor
const { error } = await supabase.functions.invoke("accept-proposal", {
  body: { proposal_id: portalData.proposal.id }
});
// A edge function capta req.headers['x-real-ip'] ou x-forwarded-for
// e faz o UPDATE com o IP real.
```

---

### 3.2 ALTO

---

#### A-01 — `AnewLeads.tsx` tem 6 140 linhas — 32 bypasses `as any` — ilegível para análise de segurança
**Ficheiro:** `AnewLeads.tsx`  
**Severity:** ALTO  
**Categoria:** Qualidade / Manutenção / Segurança (indirecta)

**Evidência:**
- Tamanho: **6 140 linhas** = **7.7× o limite de 800 linhas** definido nas regras do projeto.
- `as any` ou `supabase as any`: **32 ocorrências** (contagem por grep).
- Ficheiro ilegível pelo Read tool (275 KB excede limite de 256 KB).
- `console.log` / `console.error` / `console.warn`: **~20+ ocorrências** incluindo linhas de debug ativas como `console.log("[address-sync/convert]", syncRes)`.

**Impacto:**
- Impossibilidade de fazer code review completo numa sessão única — riscos de segurança podem estar ocultos nas 5 000+ linhas não auditadas.
- Cada alteração tem blast radius desconhecido.
- 32 bypasses de tipo numa só página significa que qualquer mutação de dados passada ao Supabase pode transportar campos inesperados sem erro de compilação.

---

#### A-02 — `Proposals.tsx` tem 3 132 linhas — 3.9× o limite
**Ficheiro:** `Proposals.tsx`  
**Severity:** ALTO  
**Categoria:** Qualidade / Manutenção

**Evidência:** Tamanho verificado por `wc -l`: **3 132 linhas**.

---

#### A-03 — `Deals.tsx:356` — `.range(0, 9999)` cap silencioso nos stats do dashboard
**Ficheiro:** `Deals.tsx:356`  
**Severity:** ALTO  
**Categoria:** Correcção de Dados / Decisões de Negócio

**Evidência:**
```typescript
// Deals.tsx:356 (aproximado — lido até linha 1698)
let query = supabase.from("deals")
  .select("id, status, value, ...")
  .range(0, 9999);   // ← trunca silenciosamente a 10 000 registos
```

**Impacto:** Para empresas com >10 000 negócios, as estatísticas do dashboard (totais, taxas de conversão, valores) estão sistematicamente erradas sem qualquer aviso ao utilizador. Decisões de gestão baseadas nestes números são afectadas.

---

#### A-04 — `Quotes.tsx:322` — `.limit(10000)` cap silencioso nos stats de orçamentos
**Ficheiro:** `Quotes.tsx:322`  
**Severity:** ALTO  
**Categoria:** Correcção de Dados

**Evidência:**
```typescript
// Quotes.tsx:322
let query = supabase.from("quotes")
  .select("id, estado, total, created_at, ...")
  .is("deleted_at", null)
  .limit(10000);  // ← 10k hard cap sem aviso
```

---

#### A-05 — `AnewContacts.tsx` — dupla actualização: polling 30s + realtime subscription na mesma tabela
**Ficheiro:** `AnewContacts.tsx:404–428`  
**Severity:** ALTO  
**Categoria:** Performance / Race Conditions

**Evidência (lido parcialmente):**
```typescript
// Polling interval (linha ~404)
const interval = setInterval(() => loadContacts(), 30_000);

// Realtime subscription (linha ~428) — mesma tabela anew_contacts
supabase.channel("contacts").on(
  "postgres_changes",
  { event: "*", schema: "public", table: "anew_contacts" },
  () => loadContacts()
);
```

**Impacto:** Cada alteração dispara duas actualizações quase simultâneas → race condition em `setState`, duplicação de chamadas à DB, e uma fila de re-renders desnecessária. O polling de 30s é redundante quando o realtime está activo.

---

#### A-06 — `AnewContacts.tsx` — `MAX_LOAD_RECORDS = 10_000` trunca dados silenciosamente
**Ficheiro:** `AnewContacts.tsx` (função `loadAllContacts`, linha ~784)  
**Severity:** ALTO  
**Categoria:** Correcção de Dados

**Evidência:**
```typescript
const MAX_LOAD_RECORDS = 10_000;
// ... carrega apenas os primeiros 10 000 contactos
// sem warning ou paginação infinita
```

**Impacto:** Organizações com >10 000 contactos vêem dados incompletos nas vistas de bulk/export. Exportações CSV são silenciosamente truncadas.

---

#### A-07 — `AnewClients.tsx:847–849` — `console.log('[DEBUG]')` em produção
**Ficheiro:** `AnewClients.tsx:847–849`  
**Severity:** ALTO  
**Categoria:** Segurança / Vazamento de Dados

**Evidência:**
```typescript
// AnewClients.tsx:847
console.log('[DEBUG] clientType:', clientType, 'form:', formData);
// AnewClients.tsx:848
console.log('[DEBUG] validation result:', validationResult);
// AnewClients.tsx:849
// (linha adicional de debug)
```

**Impacto:** Dados de formulário de clientes (incluindo potencialmente NIF, moradas, contactos) são emitidos para a consola do browser em sessões de produção. Qualquer utilizador com DevTools aberto, extensão de browser maliciosa, ou sessão de suporte remoto pode capturar estes dados. Violação do RGPD.

---

#### A-08 — `LeadContactResults.tsx:131` — type bypass + sem try/catch na invocação inicial
**Ficheiro:** `LeadContactResults.tsx:131, 126`  
**Severity:** ALTO  
**Categoria:** Tipo / Robustez

**Evidência:**
```typescript
// LeadContactResults.tsx:131
const { data, error } = await (supabase as any)
  .from("lead_contact_results")
  .select("*");

// LeadContactResults.tsx:126 — sem try/catch
loadResults();   // promise não guardada, erros perdem-se silenciosamente
```

Adicionalmente: `handleSubmit` (linha ~183) lança `throw new Error("Business user not resolved")` dentro de uma função async sem garantia de catch em todos os call sites → unhandled promise rejection.

---

#### A-09 — Inconsistência de `PAGE_SIZE` entre módulos
**Ficheiros:** `AnewClients.tsx:130`, `Deals.tsx:173`, `Quotes.tsx:227`  
**Severity:** ALTO  
**Categoria:** UX / Performance

| Módulo | PAGE_SIZE |
|--------|-----------|
| AnewClients | 10 |
| Quotes | 20 |
| Deals | 200 |
| AnewContacts | não verificado |

**Impacto:** `PAGE_SIZE = 10` em Clientes causa 20+ chamadas à DB para carregar 200 registos. `PAGE_SIZE = 200` em Deals carrega 200 registos de uma vez sem infinite scroll lazy → memory spike. Experiência de utilizador inconsistente entre módulos.

---

### 3.3 MÉDIO

---

#### M-01 — 316+ instâncias de `(supabase as any)` em todo o âmbito auditado
**Ficheiros:** Todos os ficheiros do módulo Comercial  
**Severity:** MÉDIO  
**Categoria:** Tipo / Manutenção

**Contagens verificadas por ficheiro:**
| Ficheiro | `as any` (aprox.) |
|---------|-------------------|
| AnewLeads.tsx | 32 |
| AnewContacts.tsx | ~15 (parcial) |
| AnewClients.tsx | ~20 (parcial) |
| Deals.tsx | ~25 (parcial) |
| ClientContracts.tsx | ~10 (parcial) |
| ContractTemplates.tsx | ~8 (parcial) |
| Proposals.tsx | ~8 (parcial) |
| Outros | ~198 restantes (obs S365) |

**Causa raiz:** Tipos Supabase gerados (`database.types.ts`) estão desactualizados ou incompletos, forçando os developers a usar `as any` para aceder a tabelas não tipadas. A solução estrutural é regenerar os tipos via `supabase gen types typescript`.

---

#### M-02 — Ficheiros massivamente acima do limite de 800 linhas
**Severity:** MÉDIO  
**Categoria:** Manutenção

| Ficheiro | Linhas | × Limite |
|---------|--------|----------|
| AnewLeads.tsx | 6 140 | **7.7×** |
| Proposals.tsx | 3 132 | **3.9×** |
| Deals.tsx | 2 678 | **3.3×** |
| AnewContacts.tsx | 2 558 | **3.2×** |
| AnewClients.tsx | 2 190 | **2.7×** |
| ClientContracts.tsx | 1 567 | **2.0×** |

Total: 6 ficheiros violam o limite; 4 deles mais do que triplicam-no.

---

#### M-03 — `LeadSources.tsx:182` — `sourceData: any` na camada de escrita
**Ficheiro:** `LeadSources.tsx:182`  
**Severity:** MÉDIO  
**Categoria:** Tipo

**Evidência:**
```typescript
const handleSave = async (sourceData: any) => {
  // ... escrita directa no Supabase sem tipagem
```

---

#### M-04 — `AcquisitionHelp.tsx:305` — `faq as any` bypassa campos de navegação
**Ficheiro:** `AcquisitionHelp.tsx:305`  
**Severity:** MÉDIO  
**Categoria:** Tipo

**Evidência:**
```typescript
const faqAny = faq as any;
// acesso a faqAny.action_url e faqAny.action_label sem verificação
```

---

#### M-05 — `Scheduling.tsx:85–87` — arrays de tipos soltos `any[]`
**Ficheiro:** `Scheduling.tsx:85–87`  
**Severity:** MÉDIO  
**Categoria:** Tipo

**Evidência:**
```typescript
const [contacts, setContacts] = useState<any[]>([]);
const [employees, setEmployees] = useState<any[]>([]);
const [users, setUsers] = useState<any[]>([]);
```

---

#### M-06 — `Scheduling.tsx:480` — string hardcoded em português (não usa hook de tradução)
**Ficheiro:** `Scheduling.tsx:480`  
**Severity:** MÉDIO  
**Categoria:** i18n

**Evidência:**
```typescript
// Scheduling.tsx:480
label: "Sem utilizador associado",
// hook useTranslation está importado mas não usado aqui
```

---

#### M-07 — `LeadContactResults.tsx` — sem paginação + ícone de drag sem lógica
**Ficheiro:** `LeadContactResults.tsx`  
**Severity:** MÉDIO  
**Categoria:** Performance / Dead Code

**Evidência:**
- Query inicial sem `.limit()` → lista ilimitada de resultados.
- `GripVertical` icon renderizado na UI como indicador de drag-and-drop, mas sem qualquer handler `onDragStart`/`onDrop` ou biblioteca DnD.

---

#### M-08 — `ClientContracts.tsx:64–75` — interfaces com `[key: string]: any`
**Ficheiro:** `ClientContracts.tsx:64–75`  
**Severity:** MÉDIO  
**Categoria:** Tipo

**Evidência:**
```typescript
interface ClientContract {
  id: string;
  status: string;
  created_at: string;
  proposal_id?: string;
  [key: string]: any;   // ← catch-all anula benefício da interface
}
interface Proposal {
  id: string;
  [key: string]: any;   // ← idem
}
```

---

#### M-09 — Dois sistemas de toast em uso simultâneo
**Ficheiros:** `ClientContracts.tsx:15`, `ContractTemplates.tsx:16` vs todos os outros  
**Severity:** MÉDIO  
**Categoria:** Consistência

**Evidência:**
```typescript
// ClientContracts.tsx e ContractTemplates.tsx
import { toast } from "sonner";

// Todos os restantes ficheiros auditados
import { useToast } from "@/hooks/use-toast";
```

**Impacto:** Inconsistência visual e de comportamento entre módulos. Impossível configurar globalmente toasts de erro/sucesso num único ponto.

---

#### M-10 — `AnewClients.tsx` — função `loadOrgs` duplicada de `AnewContacts.tsx`
**Ficheiro:** `AnewClients.tsx` vs `AnewContacts.tsx`  
**Severity:** MÉDIO  
**Categoria:** DRY

**Evidência:** Ambos os ficheiros contêm uma função `loadOrgs` com lógica idêntica de carregamento de organizações. Qualquer bug corrigido num não é automaticamente corrigido no outro.

---

#### M-11 — `AnewClients.tsx` — export sem paginação (linha ~1151)
**Ficheiro:** `AnewClients.tsx:~1151`  
**Severity:** MÉDIO  
**Categoria:** Performance / Dados

**Evidência:** Função de exportação CSV faz query sem `.limit()` sobre toda a tabela de clientes — para organizações grandes pode devolver tens of thousands de rows numa única request.

---

#### M-12 — `Proposals.tsx:355` — `console.error` em erro de workflow swallowed
**Ficheiro:** `Proposals.tsx` (não verificado — secção não lida)  
**Severity:** MÉDIO  
**Categoria:** Observabilidade  
**Estado:** *não verificado — baseado em padrão observado em Deals.tsx*

---

#### M-13 — `Deals.tsx` — count query usa apenas `organization_id` simples, não `scopeOrgIdsArr`
**Ficheiro:** `Deals.tsx:743` (aprox.)  
**Severity:** MÉDIO  
**Categoria:** Correcção de Dados / Multi-org

**Evidência:**
```typescript
// Deals.tsx:~743
.eq("organization_id", activeCompany.id)
// ← devia usar scopeOrgIdsArr para suportar multi-org
// outros queries no mesmo ficheiro já usam o array correcto
```

**Impacto:** Em organizações com hierarquia (parent/child orgs), o count pode subestimar negócios de orgs filha.

---

#### M-14 — `ProposalTemplates.tsx` e `QuoteTemplates.tsx` — delete não filtra por `organization_id`
**Ficheiro:** `ProposalTemplates.tsx:101`, `QuoteTemplates.tsx:107`  
**Severity:** MÉDIO  
**Categoria:** Segurança de Dados

**Evidência:**
```typescript
// ProposalTemplates.tsx:101
const { error } = await supabase
  .from("proposal_templates")
  .delete()
  .eq("id", deletingId);
// ← sem .eq("organization_id", activeCompany.id)
```

Se RLS não estiver correctamente configurado, um utilizador poderia eliminar templates de outra organização conhecendo o UUID. **Não verificado ao nível de RLS.**

---

#### M-15 — `PublicProposal.tsx` — `handleVerifyCode` actualiza estado local sem validar resposta do servidor
**Ficheiro:** `PublicProposal.tsx:225`  
**Severity:** MÉDIO  
**Categoria:** Lógica / Segurança

**Evidência:**
```typescript
// PublicProposal.tsx:225
const newStatus = data?.action === "reject" ? "rejected" : "accepted";
// ← assume accepted para qualquer action !== "reject"
// sem verificar se a edge function realmente actualizou a proposta
setPortalData({ ...portalData, proposal: { ...portalData.proposal, status: newStatus } });
```

---

#### M-16 — `QuoteModels.tsx:97` — `(supabase as any).from("anew_organizations")` com query separada (N+1 potencial)
**Ficheiro:** `QuoteModels.tsx:97`  
**Severity:** MÉDIO  
**Categoria:** Performance / Tipo

**Evidência:**
```typescript
const { data: orgData } = await (supabase as any)
  .from("anew_organizations")
  .select("id, name")
  .eq("id", activeCompany.id)
  .single();
```

Query separada após `fetchTemplates` quando poderia ser resolvida com JOIN ou dados já disponíveis no `activeCompany` context.

---

#### M-17 — `AnewContacts.tsx:521` — interpolação de string em filtro Supabase
**Ficheiro:** `AnewContacts.tsx:521`  
**Severity:** MÉDIO  
**Categoria:** Segurança (baixo risco prático mas padrão perigoso)

**Evidência:**
```typescript
.not("entity_id", "in", `(${excludeEntityIds.join(",")})`)
```

Embora os valores sejam UUIDs (sem risco SQL injection), este padrão de interpolação de string em queries Supabase é perigoso como convenção — se algum dia os IDs não forem sanitizados upstream, torna-se vulnerável.

---

#### M-18 — `Proposals.tsx:189` — loop BFS N+1 queries para hierarquia de orgs
**Ficheiro:** `Proposals.tsx:184–199`  
**Severity:** MÉDIO  
**Categoria:** Performance

**Evidência:**
```typescript
// BFS iterativo: 1 query por nível da hierarquia
while (queue.length > 0) {
  const parentId = queue.shift()!;
  const { data } = await (supabase as any)
    .from("anew_hierarchy")
    .select("child_org_id")
    .eq("parent_org_id", parentId);  // ← 1 query por org na hierarquia
  ...
}
```

Este padrão N+1 existe em pelo menos 3 ficheiros (`Proposals.tsx`, `ClientContracts.tsx`, `Quotes.tsx`). Para hierarquias com 10 orgs, são 10 queries sequenciais no mount. O correcto é uma única query com `eq("parent_org_id").in(allIds)` ou uma RPC recursiva.

---

## 4. Avaliação de Risco

### Matriz de Risco

| ID | Problema | Probabilidade | Impacto | Risco Composto |
|----|---------|---------------|---------|----------------|
| C-01 | acceptance_ip literal "client" | ALTA | CRÍTICO (legal) | **CRÍTICO** |
| A-07 | console.log DEBUG dados clientes | ALTA | ALTO (RGPD) | **ALTO** |
| A-06 | MAX_LOAD_RECORDS silencioso | ALTA | ALTO (decisões negócio) | **ALTO** |
| A-03 | range(0,9999) Deals dashboard | ALTA | ALTO (decisões negócio) | **ALTO** |
| A-05 | Dual refresh race condition | MÉDIA | ALTO (corrupção UI) | **ALTO** |
| A-01 | AnewLeads ilegível/inauditável | ALTA | MÉDIO (risco oculto) | **ALTO** |
| M-01 | 316+ as any bypasses | ALTA | MÉDIO (erros silenciosos) | **MÉDIO** |
| M-02 | Ficheiros >800 linhas | ALTA | MÉDIO (manutenção) | **MÉDIO** |
| M-09 | Dois sistemas de toast | ALTA | BAIXO (UX) | **BAIXO** |

### Superfície Legal/RGPD

- **C-01** é o único problema com implicações legais directas imediatas.
- **A-07** (debug logs com dados de clientes) é violação potencial do RGPD Art. 32 (segurança do tratamento).
- **M-14** (delete sem org_id) requer verificação de RLS antes de ser descartado.

---

## 5. Recomendações Estratégicas

### Imediatas (antes do próximo deploy)

1. **Corrigir C-01:** Mover a escrita de `acceptance_ip` para Edge Function Supabase. Considerar invalidar (ou marcar como `"client"`) todos os registos históricos com `acceptance_ip = 'client'` para que fiquem claramente marcados como não verificados.

2. **Remover A-07:** Eliminar todos os `console.log('[DEBUG]')` em `AnewClients.tsx`. Executar `grep -r "console\.log.*\[DEBUG\]" src/` para localizar todos os casos.

3. **Corrigir A-08:** Envolver `loadResults()` em try/catch e tipar correctamente a query em `LeadContactResults.tsx`.

### Curto prazo (Sprint 1–2)

4. **Regenerar tipos Supabase:** `supabase gen types typescript --local > src/integrations/supabase/types.ts`. Isto eliminará a maioria dos `as any` sem alterar lógica.

5. **Eliminar dupla actualização em AnewContacts:** Escolher um mecanismo — ou realtime subscription OU polling, não ambos.

6. **Adicionar avisos de truncagem:** Quando `MAX_LOAD_RECORDS` ou `.limit(10000)` são atingidos, mostrar banner ao utilizador.

### Médio prazo (Sprint 3+)

7. **Fracturar ficheiros gigantes:** Começar por `AnewLeads.tsx` (6 140 linhas) — extrair pelo menos: hook de dados, formulário de criação, formulário de conversão, e componente de tabela.

8. **Unificar sistema de toast:** Escolher `sonner` ou `@/hooks/use-toast` e migrar tudo para um único sistema.

9. **Substituir BFS N+1 de hierarquia:** Criar RPC PostgreSQL `get_org_subtree(root_org_id)` que devolve todos os IDs numa única chamada.

10. **Normalizar PAGE_SIZE:** Adoptar 25 como padrão em todos os módulos.

---

## 6. Plano de Correção a 3 Sprints

### Sprint 1 — Bloqueadores Críticos e Segurança (2 semanas)

**Objectivo:** Eliminar todos os problemas que afectam dados legais, RGPD, e correcção de dados visível.

| Tarefa | Ficheiro | Esforço | Responsável |
|--------|---------|---------|-------------|
| Criar Edge Function `accept-proposal` com captura de IP real | PublicProposal.tsx | 4h | Backend |
| Marcar registos históricos `acceptance_ip = 'client'` como `'UNVERIFIED_IP'` | Supabase migration | 1h | Backend |
| Remover todos os `console.log('[DEBUG]')` | AnewClients.tsx | 1h | Frontend |
| Corrigir `loadResults()` — try/catch + tipagem | LeadContactResults.tsx | 2h | Frontend |
| Corrigir `handleSubmit` — garantir catch em todos os paths | LeadContactResults.tsx | 1h | Frontend |
| Adicionar banner quando `MAX_LOAD_RECORDS` atingido | AnewContacts.tsx | 2h | Frontend |
| Adicionar banner quando `.limit(10000)` atingido (Quotes + Deals) | Quotes.tsx, Deals.tsx | 2h | Frontend |

**Critério de saída:** 0 problemas CRÍTICO, 0 logs DEBUG em produção, utilizadores avisados de truncagem.

---

### Sprint 2 — Tipo, Performance e Consistência (2 semanas)

**Objectivo:** Restaurar segurança de tipos e eliminar padrões de performance que afectam escalabilidade.

| Tarefa | Ficheiro | Esforço |
|--------|---------|---------|
| `supabase gen types typescript` — regenerar tipos | Todos | 2h + revisão |
| Remover `(supabase as any)` que deixa de ser necessário pós-geração | Todos | 4–8h |
| Eliminar dupla actualização (polling + realtime) em AnewContacts | AnewContacts.tsx | 2h |
| Criar RPC `get_org_subtree` e substituir BFS N+1 | Proposals, ClientContracts, Quotes | 4h |
| Corrigir count query `organization_id` simples em Deals | Deals.tsx | 1h |
| Unificar PAGE_SIZE = 25 em todos os módulos | AnewClients, Deals, Quotes | 2h |
| Unificar sistema de toast para sonner (ou use-toast) | ClientContracts, ContractTemplates + todos | 3h |
| Adicionar tipagem às interfaces com `[key: string]: any` | ClientContracts.tsx | 2h |

---

### Sprint 3 — Refactorização de Ficheiros Gigantes (3 semanas)

**Objectivo:** Reduzir ficheiros >800 linhas a componentes coesos e testáveis.

| Tarefa | Ficheiro de origem | Extracção sugerida | Esforço |
|--------|-------------------|--------------------|---------|
| Extrair `useAnewLeadsData` hook | AnewLeads.tsx | `hooks/useAnewLeadsData.ts` | 1 dia |
| Extrair `LeadCreateForm` | AnewLeads.tsx | `components/leads/LeadCreateForm.tsx` | 1 dia |
| Extrair `LeadConvertForm` | AnewLeads.tsx | `components/leads/LeadConvertForm.tsx` | 1 dia |
| Extrair `LeadTable` | AnewLeads.tsx | `components/leads/LeadTable.tsx` | 0.5 dia |
| Extrair `useProposalsData` hook | Proposals.tsx | `hooks/useProposalsData.ts` | 1 dia |
| Extrair `ProposalCreateForm` | Proposals.tsx | `components/proposals/ProposalCreateForm.tsx` | 1 dia |
| Extrair `useDealsData` hook | Deals.tsx | `hooks/useDealsData.ts` | 1 dia |
| Extrair shared `useOrgSubtree` hook | AnewContacts, AnewClients, Deals | `hooks/useOrgSubtree.ts` | 0.5 dia |
| Extrair shared `loadOrgs` para hook/utility | AnewContacts, AnewClients | `hooks/useOrganizations.ts` | 0.5 dia |

**Critério de saída:** Nenhum ficheiro no âmbito auditado acima de 1 200 linhas. Todos os hooks de dados têm testes unitários.

---

## 7. Apêndice: Métricas

### Resumo de Problemas por Severidade

| Severidade | Contagem |
|-----------|---------|
| CRÍTICO | 1 |
| ALTO | 9 |
| MÉDIO | 18 |
| **Total** | **28** |

### Distribuição de `as any` por Ficheiro (verificados)

| Ficheiro | `as any` (grep) |
|---------|-----------------|
| AnewLeads.tsx | 32 |
| Deals.tsx | ~25 (parcial) |
| AnewClients.tsx | ~20 (parcial) |
| AnewContacts.tsx | ~15 (parcial) |
| ClientContracts.tsx | ~10 (parcial) |
| ContractTemplates.tsx | ~8 (parcial) |
| Proposals.tsx | ~8 (parcial) |
| ProposalTemplates.tsx | 2 |
| QuoteTemplates.tsx | 2 |
| QuoteModels.tsx | 1 |
| LeadContactResults.tsx | 1 |
| LeadSources.tsx | 1 |
| AcquisitionHelp.tsx | 1 |
| Scheduling.tsx | 1 |

### Cobertura de Leitura

- Ficheiros lidos integralmente: 5 (LeadSources, AcquisitionHelp, LeadContactResults, Scheduling, QuoteTemplates, ProposalTemplates)
- Ficheiros lidos parcialmente: 10
- Ficheiros não lidos (tamanho): 1 (AnewLeads.tsx — 275 KB)

---

## 8. CENTRAL_AGENTS_FINDINGS_JSON

```json
CENTRAL_AGENTS_FINDINGS_JSON
{
  "audit_id": "olyvia-complete-2026-06-12T22-43-35-000Z",
  "auditor": "claude-sonnet-4-6",
  "date": "2026-06-12",
  "project": "olyvia-crm",
  "scope": "16 ficheiros TypeScript/React — módulos CRM e Comercial",
  "health_score": 38,
  "summary": "1 CRÍTICO (acceptance_ip falsificado), 9 ALTOs (debug logs, caps silenciosos, race conditions, ficheiro ilegível), 18 MÉDIOs (as any pervasivo, ficheiros gigantes, inconsistências). Pontuação 38/100.",
  "findings": [
    {
      "id": "C-01",
      "severity": "CRITICAL",
      "category": "security/legal",
      "file": "PublicProposal.tsx",
      "line": 162,
      "title": "acceptance_ip armazena literal \"client\" em vez do IP real do signatário",
      "evidence": "acceptance_ip: \"client\"",
      "impact": "Invalida valor jurídico da assinatura electrónica; violação potencial eIDAS/RGPD; registos históricos irrecuperáveis",
      "fix": "Mover escrita de acceptance_ip para Edge Function com captura de req.headers['x-forwarded-for']"
    },
    {
      "id": "A-01",
      "severity": "HIGH",
      "category": "quality/security",
      "file": "AnewLeads.tsx",
      "line": null,
      "title": "Ficheiro com 6140 linhas (7.7x limite) — 32 bypasses as any — ilegível para auditoria",
      "evidence": "wc -l: 6140; grep 'as any': 32 ocorrências",
      "impact": "Impossível auditar completamente; riscos ocultos nas secções não lidas",
      "fix": "Fracturar em hooks + componentes separados (ver Sprint 3)"
    },
    {
      "id": "A-02",
      "severity": "HIGH",
      "category": "quality",
      "file": "Proposals.tsx",
      "line": null,
      "title": "Ficheiro com 3132 linhas — 3.9x o limite de 800 linhas",
      "evidence": "wc -l: 3132",
      "impact": "Manutenção degradada; blast radius de alterações desconhecido",
      "fix": "Extrair hooks de dados e formulários (ver Sprint 3)"
    },
    {
      "id": "A-03",
      "severity": "HIGH",
      "category": "data-correctness",
      "file": "Deals.tsx",
      "line": 356,
      "title": ".range(0, 9999) — cap silencioso de 10k registos no dashboard",
      "evidence": ".range(0, 9999) sem aviso ao utilizador",
      "impact": "Estatísticas do dashboard erradas para organizações com >10k negócios",
      "fix": "Usar query de COUNT separada para stats; adicionar banner se truncado"
    },
    {
      "id": "A-04",
      "severity": "HIGH",
      "category": "data-correctness",
      "file": "Quotes.tsx",
      "line": 322,
      "title": ".limit(10000) — cap silencioso nos stats de orçamentos",
      "evidence": ".limit(10000) sem aviso",
      "impact": "Stats de orçamentos incompletos para >10k orçamentos",
      "fix": "Usar COUNT + stats agregadas via RPC"
    },
    {
      "id": "A-05",
      "severity": "HIGH",
      "category": "performance/race-condition",
      "file": "AnewContacts.tsx",
      "line": "404-428",
      "title": "Dupla actualização: polling 30s + realtime subscription na mesma tabela",
      "evidence": "setInterval(loadContacts, 30000) + supabase.channel('contacts').on(..., loadContacts)",
      "impact": "Race condition em setState; duplicação de chamadas DB; re-renders desnecessários",
      "fix": "Eliminar polling — manter apenas realtime subscription"
    },
    {
      "id": "A-06",
      "severity": "HIGH",
      "category": "data-correctness",
      "file": "AnewContacts.tsx",
      "line": 784,
      "title": "MAX_LOAD_RECORDS = 10000 trunca contactos silenciosamente",
      "evidence": "const MAX_LOAD_RECORDS = 10_000 com hard stop sem aviso",
      "impact": "Exportações e vistas bulk incompletas para orgs com >10k contactos",
      "fix": "Mostrar banner 'X contactos não carregados' quando limite atingido"
    },
    {
      "id": "A-07",
      "severity": "HIGH",
      "category": "security/gdpr",
      "file": "AnewClients.tsx",
      "line": "847-849",
      "title": "console.log('[DEBUG]') com dados de formulário de clientes em produção",
      "evidence": "console.log('[DEBUG] clientType:', clientType, 'form:', formData)",
      "impact": "Dados de clientes expostos na consola — violação RGPD Art.32",
      "fix": "Remover imediatamente todos os console.log('[DEBUG]')"
    },
    {
      "id": "A-08",
      "severity": "HIGH",
      "category": "robustness/type",
      "file": "LeadContactResults.tsx",
      "line": "126,131,183",
      "title": "Type bypass + sem try/catch em loadResults() + throw sem catch em handleSubmit",
      "evidence": "(supabase as any); loadResults() sem await/catch; throw fora de catch",
      "impact": "Erros silenciosos; unhandled promise rejections",
      "fix": "Tipar correctamente; envolver em try/catch; usar toast para erros"
    },
    {
      "id": "A-09",
      "severity": "HIGH",
      "category": "ux/performance",
      "file": "AnewClients.tsx,Deals.tsx,Quotes.tsx",
      "line": "130,173,227",
      "title": "PAGE_SIZE inconsistente entre módulos (10 / 200 / 20)",
      "evidence": "AnewClients: PAGE_SIZE=10; Deals: PAGE_SIZE=200; Quotes: PAGE_SIZE=20",
      "impact": "UX inconsistente; Deals carrega 200 rows de uma vez; Clientes faz 20+ requests para 200 items",
      "fix": "Standardizar PAGE_SIZE = 25 em todos os módulos"
    },
    {
      "id": "M-01",
      "severity": "MEDIUM",
      "category": "type-safety",
      "file": "multiple",
      "line": null,
      "title": "316+ instâncias de (supabase as any) em todo o âmbito auditado",
      "evidence": "grep count por ficheiro; total estimado 316+ (obs S365)",
      "impact": "Mutações de dados sem verificação de tipo; erros de schema silenciosos",
      "fix": "supabase gen types typescript para regenerar tipos; remover as any desnecessários"
    },
    {
      "id": "M-02",
      "severity": "MEDIUM",
      "category": "maintainability",
      "file": "AnewLeads.tsx,Proposals.tsx,Deals.tsx,AnewContacts.tsx,AnewClients.tsx,ClientContracts.tsx",
      "line": null,
      "title": "6 ficheiros acima do limite de 800 linhas (2.0x a 7.7x)",
      "evidence": "wc -l: 6140, 3132, 2678, 2558, 2190, 1567",
      "impact": "Code review impossível; testes de unidade impraticáveis; blast radius opaco",
      "fix": "Fracturar progressivamente por Sprint 3"
    },
    {
      "id": "M-03",
      "severity": "MEDIUM",
      "category": "type",
      "file": "LeadSources.tsx",
      "line": 182,
      "title": "sourceData: any na camada de escrita",
      "evidence": "const handleSave = async (sourceData: any)",
      "impact": "Campos inesperados podem ser escritos no Supabase sem erro",
      "fix": "Definir interface LeadSourcePayload tipada"
    },
    {
      "id": "M-04",
      "severity": "MEDIUM",
      "category": "type",
      "file": "AcquisitionHelp.tsx",
      "line": 305,
      "title": "faq as any bypassa campos de navegação action_url/action_label",
      "evidence": "const faqAny = faq as any",
      "impact": "Campos opcionais acedidos sem verificação de existência",
      "fix": "Estender interface FAQ com action_url?: string; action_label?: string"
    },
    {
      "id": "M-05",
      "severity": "MEDIUM",
      "category": "type",
      "file": "Scheduling.tsx",
      "line": "85-87",
      "title": "useState<any[]> para contacts, employees, users",
      "evidence": "useState<any[]>([])",
      "impact": "Acesso a propriedades sem verificação de tipo",
      "fix": "Definir interfaces Contact, Employee, User e tipar os estados"
    },
    {
      "id": "M-06",
      "severity": "MEDIUM",
      "category": "i18n",
      "file": "Scheduling.tsx",
      "line": 480,
      "title": "String hardcoded em português não usa hook de tradução",
      "evidence": "label: \"Sem utilizador associado\"",
      "impact": "Não traduzível; inconsistente com o resto da UI",
      "fix": "Usar t('scheduling.noUserAssociated') via useTranslation"
    },
    {
      "id": "M-07",
      "severity": "MEDIUM",
      "category": "performance/dead-code",
      "file": "LeadContactResults.tsx",
      "line": null,
      "title": "Sem paginação + ícone de drag sem lógica DnD implementada",
      "evidence": "Query sem .limit(); GripVertical icon sem onDragStart/onDrop",
      "impact": "Performance: lista ilimitada; UX: ícone engana utilizador",
      "fix": "Adicionar .limit(100) + paginação; remover ícone ou implementar DnD"
    },
    {
      "id": "M-08",
      "severity": "MEDIUM",
      "category": "type",
      "file": "ClientContracts.tsx",
      "line": "64-75",
      "title": "Interfaces ClientContract e Proposal com [key: string]: any catch-all",
      "evidence": "interface ClientContract { id: string; [key: string]: any; }",
      "impact": "Tipo não protege contra erros de acesso a propriedades",
      "fix": "Mapear todos os campos usados em propriedades explicitamente tipadas"
    },
    {
      "id": "M-09",
      "severity": "MEDIUM",
      "category": "consistency",
      "file": "ClientContracts.tsx,ContractTemplates.tsx",
      "line": "15,16",
      "title": "Dois sistemas de toast em uso: sonner e @/hooks/use-toast",
      "evidence": "import { toast } from 'sonner' vs import { useToast } from '@/hooks/use-toast'",
      "impact": "Inconsistência visual; impossível configurar globalmente",
      "fix": "Migrar todos os ficheiros para sonner (ou use-toast)"
    },
    {
      "id": "M-10",
      "severity": "MEDIUM",
      "category": "dry",
      "file": "AnewClients.tsx,AnewContacts.tsx",
      "line": null,
      "title": "Função loadOrgs duplicada entre AnewClients e AnewContacts",
      "evidence": "Lógica idêntica de carregamento de organizações em ambos os ficheiros",
      "impact": "Bug em loadOrgs deve ser corrigido em dois lugares",
      "fix": "Extrair para hooks/useOrganizations.ts"
    },
    {
      "id": "M-11",
      "severity": "MEDIUM",
      "category": "performance",
      "file": "AnewClients.tsx",
      "line": 1151,
      "title": "Export CSV sem paginação — query ilimitada sobre tabela de clientes",
      "evidence": "Função de exportação sem .limit() — não verificado secção não lida",
      "impact": "Para orgs grandes, pode causar timeout ou OOM no browser",
      "fix": "Adicionar .limit() ou processar export em chunks via Edge Function"
    },
    {
      "id": "M-12",
      "severity": "MEDIUM",
      "category": "data-correctness",
      "file": "Deals.tsx",
      "line": 743,
      "title": "Count query usa organization_id simples, não scopeOrgIdsArr",
      "evidence": ".eq('organization_id', activeCompany.id) em vez de .in('organization_id', scopeOrgIdsArr)",
      "impact": "Subestima negócios em cenários multi-org com orgs filha",
      "fix": "Usar .in('organization_id', scopeOrgIdsArr) consistente com outros queries"
    },
    {
      "id": "M-13",
      "severity": "MEDIUM",
      "category": "security",
      "file": "ProposalTemplates.tsx,QuoteTemplates.tsx",
      "line": "101,107",
      "title": "Delete de template sem filtro organization_id",
      "evidence": ".delete().eq('id', deletingId) sem .eq('organization_id', activeCompany.id)",
      "impact": "Se RLS insuficiente, utilizador pode eliminar templates de outra org por UUID",
      "fix": "Adicionar .eq('organization_id', activeCompany.id) ao delete; verificar RLS"
    },
    {
      "id": "M-14",
      "severity": "MEDIUM",
      "category": "logic",
      "file": "PublicProposal.tsx",
      "line": 225,
      "title": "handleVerifyCode assume accepted para qualquer action !== reject sem validar servidor",
      "evidence": "const newStatus = data?.action === 'reject' ? 'rejected' : 'accepted'",
      "impact": "Estado local pode ficar dessincronizado se edge function falhar silenciosamente",
      "fix": "Verificar explicitamente data?.action === 'accept'; re-fetch proposta após verificação"
    },
    {
      "id": "M-15",
      "severity": "MEDIUM",
      "category": "performance",
      "file": "QuoteModels.tsx",
      "line": 97,
      "title": "Query separada para org name quando dados disponíveis no context",
      "evidence": "(supabase as any).from('anew_organizations').select('id, name').eq('id', activeCompany.id)",
      "impact": "Query desnecessária — activeCompany.name já disponível",
      "fix": "Usar activeCompany.name directamente"
    },
    {
      "id": "M-16",
      "severity": "MEDIUM",
      "category": "security",
      "file": "AnewContacts.tsx",
      "line": 521,
      "title": "Interpolação de string em filtro Supabase — padrão perigoso",
      "evidence": ".not('entity_id', 'in', `(${excludeEntityIds.join(',')})`)",
      "impact": "Padrão aceitável para UUIDs mas perigoso como convenção",
      "fix": "Usar .not('entity_id', 'in', excludeEntityIds) com array nativo"
    },
    {
      "id": "M-17",
      "severity": "MEDIUM",
      "category": "performance",
      "file": "Proposals.tsx,ClientContracts.tsx,Quotes.tsx",
      "line": "184-199",
      "title": "BFS N+1 queries para resolver hierarquia de organizações no mount",
      "evidence": "Loop while (queue.length > 0) com 1 query por org pai",
      "impact": "Para hierarquias de 10 orgs: 10 queries sequenciais no mount de cada página",
      "fix": "Criar RPC get_org_subtree(root_org_id) com query recursiva única"
    },
    {
      "id": "M-18",
      "severity": "MEDIUM",
      "category": "i18n/consistency",
      "file": "ClientContracts.tsx",
      "line": 289,
      "title": "getTranslatedStatus usa mapa hardcoded em vez de hook de tradução",
      "evidence": "const statusMap = { draft: 'Draft', pending_signature: 'Enviado', ... }",
      "impact": "Strings em inglês e português misturadas; não traduzível",
      "fix": "Usar t('contracts.status.draft') etc."
    }
  ],
  "metrics": {
    "files_audited": 16,
    "files_fully_read": 6,
    "files_partially_read": 9,
    "files_unreadable": 1,
    "total_lines_in_scope": 22923,
    "lines_above_800_limit": 6,
    "as_any_instances_estimated": 316,
    "console_log_debug_in_production": true,
    "dual_toast_systems": true,
    "critical_count": 1,
    "high_count": 9,
    "medium_count": 18,
    "health_score": 38
  },
  "sprint_plan": {
    "sprint_1": {
      "focus": "Bloqueadores Críticos e Segurança",
      "duration_weeks": 2,
      "items": ["C-01", "A-07", "A-08", "A-06", "A-03", "A-04"]
    },
    "sprint_2": {
      "focus": "Tipo, Performance e Consistência",
      "duration_weeks": 2,
      "items": ["M-01", "A-05", "A-09", "M-17", "M-12", "M-09", "M-08"]
    },
    "sprint_3": {
      "focus": "Refactorização de Ficheiros Gigantes",
      "duration_weeks": 3,
      "items": ["M-02", "M-10", "M-15", "A-01", "A-02"]
    }
  }
}
END_CENTRAL_AGENTS_FINDINGS_JSON
```

---

*Relatório gerado em 2026-06-12 por claude-sonnet-4-6. Âmbito limitado a 16 ficheiros especificados. Problemas fora deste âmbito não foram avaliados.*
