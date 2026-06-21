# Relatório de código não usado (análise apenas — nada foi apagado)

Data da análise: 2026-06-19.

Esta análise foi feita sobre o estado atual da working tree, depois da primeira
passagem que já moveu ficheiros para `eliminar/` (ver `eliminar/README.md`).
Os ficheiros já marcados como deletados (`D`) no `git status` não são repetidos
aqui.

Ferramentas usadas: `npx ts-unused-exports tsconfig.app.json`, `npx depcheck`,
`npx eslint` (regra `@typescript-eslint/no-unused-vars`), e um script Node
próprio para detetar ficheiros `.ts`/`.tsx` sem nenhum import estático/dinâmico
a partir de outro ficheiro em `src/`. Todos os resultados foram confirmados
manualmente com grep antes de entrarem nesta lista, para reduzir falsos
positivos (tipos só usados por inferência, barrels de `src/components/ui`,
ficheiros de `src/_migration`, entry points, configs, testes).

## Ficheiros órfãos (sem nenhum import em todo o `src/`)

- `src/components/CalendarItemDetailsDialog.tsx` — sem nenhuma referência em
  `src/`; não confundir com `src/components/scheduling/ScheduleCalendarView.tsx`
  e `CalendarItemDetailsDialog` (nome diferente, dialog de scheduling) que são
  os realmente usados em `src/pages/Scheduling.tsx`. Aparece como `M`
  (modificado) no git status, mas a modificação não introduziu nenhum
  consumidor novo.
- `src/components/CalendarView.tsx` — mesma situação; sem import em
  `src/pages/Scheduling.tsx` nem em nenhum outro ficheiro. O componente
  equivalente em uso é `ScheduleCalendarView`.
- `src/pages/PlansCentral.tsx` — `export default function PlansCentral()`
  sem nenhuma rota `lazy(() => import("./pages/PlansCentral"))` em
  `src/App.tsx`, nem qualquer outro import. Risco: confirmar se não é uma
  página planeada mas ainda não ligada às rotas antes de remover.
- `src/pages/api/InsertLead.tsx` — componente de "API proxy" sem rota
  correspondente em `src/App.tsx` e sem qualquer import; a funcionalidade real
  de inserção de lead passa pela Edge Function `supabase/functions/insert-lead`,
  não por este ficheiro React.

## Dependências não usadas (package.json)

Confirmadas manualmente (sem qualquer referência em `vite.config.ts`,
`postcss.config.js`, `tailwind.config.ts` ou em código fonte):

- `@swc/core` — não referenciado em `vite.config.ts` (o plugin React usado é
  `@vitejs/plugin-react`, não o `@vitejs/plugin-react-swc`).
- `lovable-tagger` — sem qualquer referência no repositório; resíduo de
  configuração antiga do Vite/Lovable.
- `@tailwindcss/typography` (devDependency) — sem `require("@tailwindcss/typography")`
  nem entrada em `plugins` de `tailwind.config.ts`.
- `@hookform/resolvers` — nenhum uso de `zodResolver` ou de
  `@hookform/resolvers` encontrado em `src/`. Confirmar se `react-hook-form`
  usa validação manual noutro lugar antes de remover, mas não há import direto.

Reportadas pelo `depcheck` mas que são **falsos positivos** (não remover):

- `buffer` — usado em `src/main.tsx` (`import { Buffer } from "buffer"`),
  polyfill necessário no browser.
- `postcss`, `autoprefixer` — usados em `postcss.config.js`, que o depcheck não
  inspeciona por defeito.

## Exports não usados (amostra confirmada via `ts-unused-exports`)

O `ts-unused-exports` devolveu 146 módulos com exports não consumidos fora do
próprio ficheiro. A grande maioria são **falsos positivos** esperados num
projeto deste tipo: tipos/interfaces só usados por inferência estrutural,
barrels de `src/components/ui` (shadcn — não tocar), e reexports de índice
(`src/utils/documentVariables/index.ts`, `src/components/document-editor/index.ts`).
Casos com maior probabilidade de serem genuinamente removíveis, a validar
manualmente um a um antes de qualquer remoção:

- `src/components/contracts/FormulaInsertPopover.tsx`: `buildFormulaChipHtml`,
  `buildFormulaLabelChipHtml` — exportados mas sem import externo encontrado.
- `src/components/contracts/TableInsertPopover.tsx`: `buildManualTableHtml`,
  `buildQuoteItemsChipHtml`, `buildSignatoriesChipHtml` — idem.
- `src/components/flow-builder/bpmn-nodes.tsx`: `BpmnProcessNode`,
  `BpmnDecisionNode`, `BpmnStartEndNode`, `BpmnSubProcessNode`,
  `BpmnEventNode`, `BpmnTextNode`, `SwimLaneNode` — possivelmente registados
  apenas via objeto de configuração de nó (`nodeTypes`), confirmar antes de
  remover (padrão React Flow comum).
- `src/components/leads/leadVisitMatching.ts`: tipos `LeadLike`,
  `ScheduleItemLike` — exportados mas usados só internamente no próprio
  ficheiro pelos restantes consumidores.
- `src/hooks/useWhatsApp.ts`: `WhatsAppModule`, `formatWhatsAppPhone` — sem
  consumidor externo encontrado.
- `src/utils/sanitize.ts`: `sanitizeExternalUrl` — sem consumidor externo
  encontrado (pode ser usado apenas em testes ou ter sido substituído).
- `src/utils/quotesExportImport.ts`: `exportQuoteToDetailedCSV` — sem
  consumidor externo encontrado.

Lista completa reproduzível com:
```
npx ts-unused-exports tsconfig.app.json --excludePathsFromReport=src/components/ui
```

## Imports/variáveis não usadas (ESLint `@typescript-eslint/no-unused-vars`)

`npx eslint src --rule '{"@typescript-eslint/no-unused-vars": "error"}'`
devolveu **1003 ocorrências** em todo o `src/`, na maioria imports de ícones
Lucide, componentes shadcn (`Label`, `Separator`, `Tabs`, `ScrollArea`, etc.) e
variáveis de estado (`useState`) declaradas mas nunca lidas. É demasiado
volume para listar item a item aqui; ficam os ficheiros com maior
concentração, candidatos prioritários para limpeza de imports:

| Ficheiro | Nº de ocorrências |
|---|---|
| `src/components/QuoteBuilder.tsx` | 41 |
| `src/pages/AnewLeads.tsx` | 40 |
| `src/pages/ClientContracts.tsx` | 31 |
| `src/pages/Campaigns.tsx` | 24 |
| `src/pages/AnewClients.tsx` | 24 |
| `src/components/organizations/MemberHierarchyTab.tsx` | 23 |
| `src/pages/AnewContacts.tsx` | 22 |
| `src/pages/PublicLeadForm.tsx` | 21 |
| `src/pages/Proposals.tsx` | 21 |
| `src/components/clients/ClientDetailsDialog.tsx` | 21 |
| `src/components/organizations/MemberFormPanel.tsx` | 20 |
| `src/pages/Deals.tsx` | 19 |
| `src/components/campaigns/CampaignFormBuilder.tsx` | 18 |
| `src/pages/OrganizationDetail.tsx` | 17 |
| `src/pages/CampaignDetail.tsx` | 17 |

Exemplos concretos de imports de componentes inteiros não usados (maior
impacto, não apenas variáveis locais):
- `src/components/QuoteBuilder.tsx`: `Tabs`, `TabsContent`, `TabsList`,
  `TabsTrigger`, `Switch`, `DialogDescription`, `DialogFooter` importados e
  nunca usados no JSX.
- `src/components/ProposalTemplateEditor.tsx`: `CardHeader`, `CardTitle`,
  `GalleryPickerDialog` importado mas nunca usado.
- `src/components/AttributeOptionPalettesDialog.tsx`: `Accordion`,
  `AccordionContent`, `AccordionItem`, `AccordionTrigger`, `Label`,
  `Separator`.
- `src/components/PageFAQSheet.tsx`: `Card`, `CardContent`, `CardHeader`,
  `CardTitle`.
- `src/App.tsx`: `Landing` importado/atribuído mas nunca usado em nenhuma
  rota.

Reproduzir a lista completa com:
```
npx eslint src --rule '{"@typescript-eslint/no-unused-vars": "error", "@typescript-eslint/no-explicit-any": "off"}'
```

## Notas de segurança / falsos positivos a não remover

- `src/components/ui/*` (shadcn) — barrels com muitos exports não usados
  globalmente; mantidos por instrução do `eliminar/README.md`.
- `src/_migration/*` — excluído da análise, conforme `eliminar/README.md`.
- Tipos exportados usados apenas por inferência estrutural (props de
  componentes, retornos de hooks) aparecem como "não usados" no
  `ts-unused-exports` mas são falsos positivos — não remover sem confirmação
  manual ficheiro a ficheiro.
- Componentes/hooks referenciados via Context Providers, `React.lazy`, ou
  registados em objetos de configuração (`nodeTypes`, mapas de ícones) podem
  não aparecer em greps simples; foram excluídos sempre que esse padrão foi
  identificado.
