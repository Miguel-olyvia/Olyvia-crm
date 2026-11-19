// F3 (28/10/2026): do negócio da Emylia para o Inventário REAL da Olyvia. A encomenda de cliente (EC) nasce no servidor quando o Financeiro
// registou a fatura e validou o pagamento (migration 20261231999700; a gravação é a de financeiroReal.ts). Aqui:
//  - lerProntidoes: a prontidão das encomendas emitidas (rpc_client_order_list_readiness), para «À espera dos materiais» e a Receção;
//  - contratosDasEcs: os contratos das EC dos negócios lidos (a inicial e as das adendas);
//  - urlDoInventario / ligacaoInventario: as páginas reais, filtradas pela EC do negócio (Encomendas de cliente, Receção, Compras).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DestinoInventario, LigacaoReal, Negocio } from "../motor";
import { definirProntidoes, type ProntidaoReal } from "../inventario/prontidaoReal";
import { clientOrdersLink, purchaseOrdersLink, receivingLink } from "@/components/inventory/ui/inventoryLinks";

/** A prontidão das encomendas de cliente dos negócios lidos (só as emitidas). Sem permissão de ver encomendas (ou com erro), não guarda nada. */
export async function lerProntidoes(sb: SupabaseClient, org: string, contratos: readonly string[]): Promise<ProntidaoReal[]> {
  if (!contratos.length) return [];
  const { data, error } = await sb.rpc("rpc_client_order_list_readiness" as never, { p_organization_id: org, p_contract_ids: [...new Set(contratos)] } as never);
  if (error) return [];
  const lidas = ((data as Record<string, unknown>[] | null) ?? []).map((x): ProntidaoReal => ({
    contrato: String(x.contract_id), linhasProntas: Number(x.lines_ready ?? 0), reservadas: Number(x.units_in_stock_reserved ?? 0),
    aChegar: Number(x.units_on_po ?? 0), emFalta: Number(x.units_missing ?? 0), servidas: Number(x.units_served ?? 0), precisas: Number(x.units_needed ?? 0),
  }));
  definirProntidoes(lidas);
  return lidas;
}

/** Os contratos das encomendas de cliente dos negócios (a inicial e as das adendas). */
export const contratosDasEcs = (deals: readonly Negocio[]): string[] =>
  deals.flatMap((d) => [d.obra?.ec?.contrato, ...(d.obra?.ecsAjuste ?? []).map((a) => a.contrato)]).filter((x): x is string => !!x);

/** A página real de cada destino, filtrada pela encomenda de cliente do negócio (o contrato). */
export function urlDoInventario(destino: DestinoInventario, contrato: string | null): string {
  if (destino === "ec") return clientOrdersLink({ open: contrato });
  if (destino === "rececao") return receivingLink({ ec: contrato });
  // as compras de uma encomenda de cliente veem-se na própria encomenda (as encomendas a fornecedor dela); sem ela, a lista das compras
  if (destino === "compras") return contrato ? clientOrdersLink({ open: contrato }) : purchaseOrdersLink();
  return clientOrdersLink();
}

/** O que o motor recebe (acoes(S, avisar, run, ligacao)): abrir o Inventário real com `navegar` (react-router, ou o endereço). */
export const ligacaoInventario = (navegar: (url: string) => void): LigacaoReal => ({
  abrir: (destino, contrato) => navegar(urlDoInventario(destino, contrato)),
});
