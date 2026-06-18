/**
 * Barrel de re-exports — Templates de Documentos (propostas, orçamentos, contratos).
 *
 * Plano: .lovable/plan.md §7.
 *
 * Esta pasta é o ponto de entrada unificado para componentes visuais
 * partilhados entre os três tipos de template. Nesta fase, re-exporta os
 * componentes existentes em src/components/contracts/ SEM os mover, para
 * preservar 100% do render atual (zero risco antes da baseline visual).
 *
 * Imports novos devem usar este barrel:
 *   import { DocumentHeaderSettings } from "@/components/document-editor";
 *
 * Os imports antigos (`@/components/contracts/DocumentHeaderSettings`)
 * continuam a funcionar normalmente.
 *
 * Fase futura (após baseline capturada — ver docs/document-templates-baseline.md):
 * mover ficheiros para esta pasta e converter contracts/ em re-exports
 * de compatibilidade.
 */

export { DocumentHeaderSettings } from "@/components/contracts/DocumentHeaderSettings";
export { DocumentFooterSettings } from "@/components/contracts/DocumentFooterSettings";
export { DocumentPageSettings } from "@/components/contracts/DocumentPageSettings";
export { StylePresetsSelector } from "@/components/contracts/StylePresetsSelector";
export { VariablePicker } from "./VariablePicker";
export { ItemsTableSettings } from "./ItemsTableSettings";
export { DocumentPreview } from "./DocumentPreview";
