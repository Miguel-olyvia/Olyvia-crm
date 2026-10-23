/**
 * Itens da Agenda que vêm da Frota (reservas e manutenções das viaturas).
 *
 * São criados e mexidos só pelas RPCs da Frota (fn_fleet_sync_schedule_item, migração 20261220100000): ficam no quadro
 * de sistema com board_type = 'fleet' e levam metadata.source = 'fleet', metadata.fleet_vehicle_id e
 * metadata.fleet_kind ('reservation' | 'maintenance'). Decisão do Rafael: na Agenda são só de leitura (não se editam,
 * arrastam, confirmam nem apagam); muda-se na Frota, que volta a sincronizar o item.
 */
import type { ScheduleBoard, ScheduleItem } from "@/types/scheduling";

type ItemLike = Pick<ScheduleItem, "board_id"> & { metadata?: Record<string, unknown> | null };
type BoardLike = Pick<ScheduleBoard, "id" | "board_type">;

export const FLEET_BOARD_TYPE = "fleet";

/** O item é da Frota? (metadata.source = 'fleet' ou está num quadro board_type = 'fleet'). */
export function isFleetScheduleItem(item: ItemLike | null | undefined, boards?: readonly BoardLike[]): boolean {
  if (!item) return false;
  if (item.metadata?.source === "fleet") return true;
  return !!boards?.some((b) => b.id === item.board_id && b.board_type === FLEET_BOARD_TYPE);
}

/** A ligação "Abrir na Frota": a ficha da viatura na aba da reserva ou da manutenção. */
export function fleetItemLink(item: ItemLike): string {
  const md = item.metadata ?? {};
  const vid = typeof md.fleet_vehicle_id === "string" ? md.fleet_vehicle_id : null;
  const kind = md.fleet_kind;
  if (!vid) return kind === "maintenance" ? "/frota/manutencao" : "/frota/atribuicoes";
  const q = `viatura=${encodeURIComponent(vid)}`;
  if (kind === "reservation") return `/frota/atribuicoes?${q}&aba=atrib`;
  if (kind === "maintenance") return `/frota/manutencao?${q}&aba=manut`;
  return `/frota/viaturas?${q}`;
}

/** O texto do aviso quando alguém tenta mexer num item da Frota na Agenda. */
export const FLEET_READ_ONLY_MESSAGE = "Este item é gerido na Frota: não se edita, move nem apaga na Agenda. Abre-o na Frota para o alterar.";
