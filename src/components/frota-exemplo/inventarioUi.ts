// As peças do Inventário real que a Frota reutiliza, importadas ficheiro a ficheiro: o index de inventory/ui também
// exporta os contadores do Inventário (useInventoryToday → cliente Supabase), que a Frota de exemplo não usa nem deve
// carregar (os dados da Frota não vêm da base de dados).
export { FilterPills, FilterPill, type FilterPillOption } from "@/components/inventory/ui/FilterPills";
export { KpiTile, KpiGrid } from "@/components/inventory/ui/KpiTile";
export { WorkQueueCard } from "@/components/inventory/ui/WorkQueueCard";
export { InventoryStatusBadge } from "@/components/inventory/ui/InventoryStatusBadge";
export { InventoryEmptyState } from "@/components/inventory/ui/InventoryEmptyState";
export { usePermissionGate, permissionReason } from "@/components/inventory/ui/RowActions";
export type { InventoryTone } from "@/components/inventory/ui/tones";
