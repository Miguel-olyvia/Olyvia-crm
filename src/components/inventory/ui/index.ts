// Peças partilhadas da UI nova do Inventário. Adaptadas do protótipo
// (prototipo-negocios/inventario) para shadcn + tokens do tema — sem o contexto
// de simulação do protótipo nem dados fictícios. A API de cada peça está
// documentada no topo do respetivo ficheiro.

// Cabeçalho, separadores e contadores
export { InventoryPageHeader } from "./InventoryPageHeader";
export {
  InventoryAreaTabs,
  INVENTORY_AREA_LABEL,
  useInventoryAreaItems,
  type InventoryArea,
} from "./InventoryAreaTabs";
export { CounterPill, COUNTER_PILL_TONE, COUNTER_PILL_HINT, type CounterPillVariant } from "./CounterPill";
export { useInventoryCounters } from "./useInventoryCounters";

// Listas: filtros, ações por linha, ligações
export { FilterPills, FilterPill, type FilterPillOption } from "./FilterPills";
export {
  RowActions,
  usePermissionGate,
  permissionReason,
  type RowActionItem,
  type RowActionEntry,
  type RowPrimaryAction,
} from "./RowActions";
export { DocumentLink } from "./DocumentLink";
export * from "./inventoryLinks";

// Métricas, estados, vazios, fila
export { KpiTile, KpiGrid } from "./KpiTile";
export { InventoryStatusBadge } from "./InventoryStatusBadge";
export { InventoryEmptyState } from "./InventoryEmptyState";
export { WorkQueueCard } from "./WorkQueueCard";
export { FlowCounterButton } from "./FlowCounterButton";
export {
  MOVEMENT_TYPES,
  movementTypeLabel,
  movementTypeTone,
  movementIncreases,
  signedMovementQty,
} from "./movementTypes";
export { toneText, toneBorder, toneBorderMuted, toneBadge, type InventoryTone } from "./tones";
