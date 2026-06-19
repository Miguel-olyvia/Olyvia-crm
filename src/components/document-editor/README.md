# Components — Document Editor (templates partilhados)

Barrel de re-exports para componentes visuais partilhados entre `/proposal-templates`, `/quote-templates` e `/contract-templates`.

## Estado atual (Fase 1, não-destrutivo)

Os ficheiros reais continuam em `src/components/contracts/`. Esta pasta só re-exporta. Imports antigos continuam a funcionar; imports novos devem usar:

```ts
import {
  DocumentHeaderSettings,
  DocumentFooterSettings,
  DocumentPageSettings,
  StylePresetsSelector,
} from "@/components/document-editor";
```

## Fase futura (após baseline)

Ver `docs/document-templates-baseline.md`. Quando a baseline visual estiver capturada e validada:

1. Mover os ficheiros para esta pasta
2. Converter `src/components/contracts/<X>.tsx` em re-export de compatibilidade
3. Generalizar `DocumentSettings` (contract-specific) para `DocumentTemplateSettings` (`src/utils/documentTemplate/types.ts`) via adapter por contexto

Não tocar em `body_html`, `signatories`, `doc_settings` legais de contratos.
