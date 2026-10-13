/**
 * Obras por criar: os contratos com o 1.º pagamento validado pelo Financeiro
 * (no CRM) e ainda sem obra. Lê `rpc_ops_obras_por_criar`
 * (db/financeiro-obra.sql). Sem o SQL instalado, a lista vem vazia — a página
 * Obras funciona na mesma.
 */
import { supabase } from "./supabase";
import { ErroDeDados } from "./dados";

export interface ObraPorCriar {
  contrato_id: string;
  numero: string;
  cliente_id: string | null;
  cliente_nome: string;
  /** Quando o Financeiro validou o 1.º pagamento. */
  pago_em: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O contrato pedido no link do sino (`/obras?criar=<id>`), ou null se não for um id válido. */
export function contratoDoLink(search: string | URLSearchParams): string | null {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const id = (p.get("criar") ?? "").trim();
  return UUID.test(id) ? id.toLowerCase() : null;
}

/** "há 3 dias", "hoje", "ontem" — há quanto tempo o pagamento chegou. */
export function haQuantoTempo(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const dias = Math.round((dia(agora) - dia(d)) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

function rpcEmFalta(error: { message: string; code?: string } | null): boolean {
  return (
    !!error &&
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      /rpc_ops_obras_por_criar|function .* does not exist|client_finance_events/i.test(error.message))
  );
}

export async function listarObrasPorCriar(orgId: string): Promise<ObraPorCriar[]> {
  const { data, error } = await supabase.rpc("rpc_ops_obras_por_criar", { p_org: orgId });
  if (error) {
    // SQL por instalar: sem lista, sem erro no ecrã.
    if (rpcEmFalta(error)) return [];
    // Quem não planeia obras não tem permissão: também não é um erro para ele.
    if (error.code === "42501" || /Sem permissão/i.test(error.message)) return [];
    // eslint-disable-next-line no-console
    console.error("[Obras] obras por criar:", error);
    throw new ErroDeDados("Não foi possível carregar as obras por criar.");
  }
  return Array.isArray(data) ? (data as unknown as ObraPorCriar[]) : [];
}
