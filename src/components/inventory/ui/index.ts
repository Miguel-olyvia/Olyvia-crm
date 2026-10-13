// Peças partilhadas da UI nova do Inventário (Fase 1: Hoje, Existências,
// Movimentos). Adaptadas do protótipo (prototipo-negocios/inventario) para
// shadcn + tokens do tema — sem o contexto de simulação do protótipo.
export { InventoryPageHeader, type InventoryArea } from "./InventoryPageHeader";
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
