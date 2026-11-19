// F3 (28/10/2026): do negócio da Emylia para o Inventário REAL da Olyvia. A encomenda de cliente (EC) nasce no servidor quando o Financeiro
// registou a fatura e validou o pagamento (migration 20261231999700; a gravação é a de financeiroReal.ts). Aqui:
//  - lerProntidoes: a prontidão das encomendas emitidas (rpc_client_order_list_readiness), para «À espera dos materiais» e a Receção;
//  - contratosDasEcs: os contratos das EC dos negócios lidos (a inicial e as das adendas);
//  - urlDoInventario / ligacaoInventario: as páginas reais, filtradas pela EC do negócio (Encomendas de cliente, Receção, Compras).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DestinoInventario, LigacaoReal, Negocio } from "../motor";
import { definirProntidoes, type ProntidaoReal } from "../inventario/prontidaoReal";
import { clientOrdersLink, purchaseOrdersLink, receivingLink } from "@/components/inventory/ui/inventoryLinks";

/* 19/11 (auditoria): sem a permissão das encomendas (client_orders.view) a leitura falha e antes a lista vinha vazia: o arranque ficava
   «a ler» para sempre. Agora a falha fica guardada por contrato e o passo diz o que é: sem permissão (e a quem pedir) ou a leitura falhou. */
/** Porque é que a prontidão de um contrato não se leu: sem a permissão das encomendas, ou outro erro da base. */
export type FalhaProntidao = "sem-permissao" | "erro";
const falhas = new Map<string, FalhaProntidao>();
/** A falha da última leitura da prontidão deste contrato (undefined: leu-se, ou ainda está a ler). */
export const falhaProntidao = (contrato: string): FalhaProntidao | undefined => falhas.get(contrato);
/** Só para testes. */
export function limparFalhasProntidao(): void { falhas.clear(); }
/** O que se diz a quem não tem a permissão das encomendas de cliente. */
export const SEM_PERMISSAO_MATERIAIS = "Para ver os materiais, peça a permissão Encomendas de cliente ao administrador.";
/** O erro da base é de permissão? (fn_cat_exigir: ERRCODE insufficient_privilege, HINT no_permission) */
export function erroDePermissao(e: { code?: string; hint?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "42501" || e.hint === "no_permission" || /permiss|client_orders\.view/i.test(e.message ?? "");
}
/** O que falta para arrancar quando a prontidão não se leu (vazio: não falhou). */
export function faltaPorFalha(contrato: string): string[] {
  const f = falhas.get(contrato);
  return f === "sem-permissao" ? ["ver os materiais: peça a permissão Encomendas de cliente ao administrador"]
    : f === "erro" ? ["confirmar os materiais nas Encomendas de cliente (a leitura falhou: recarregue a página)"] : [];
}
/** A frase dos materiais quando a prontidão não se leu (null: não falhou). */
export function textoPorFalha(numero: string, contrato: string): string | null {
  const f = falhas.get(contrato);
  return f === "sem-permissao" ? `Encomenda de cliente ${numero} emitida. ${SEM_PERMISSAO_MATERIAIS}`
    : f === "erro" ? `Encomenda de cliente ${numero} emitida. Os materiais não se leram: recarregue a página.` : null;
}

/** A prontidão das encomendas de cliente dos negócios lidos (só as emitidas). Sem permissão de ver encomendas (ou com erro), não guarda
 *  prontidão nenhuma: guarda a falha (falhaProntidao), para o passo não ficar «a ler». */
export async function lerProntidoes(sb: SupabaseClient, org: string, contratos: readonly string[]): Promise<ProntidaoReal[]> {
  if (!contratos.length) return [];
  const ids = [...new Set(contratos)];
  const { data, error } = await sb.rpc("rpc_client_order_list_readiness" as never, { p_organization_id: org, p_contract_ids: ids } as never);
  if (error) {
    const f: FalhaProntidao = erroDePermissao(error as { code?: string; hint?: string; message?: string }) ? "sem-permissao" : "erro";
    for (const c of ids) falhas.set(c, f);
    // avisa quem desenha (sem prontidões novas): o passo troca o «a ler» pelo motivo
    definirProntidoes([]);
    return [];
  }
  for (const c of ids) falhas.delete(c);
  const lidas = ((data as Record<string, unknown>[] | null) ?? []).map((x): ProntidaoReal => ({
    contrato: String(x.contract_id), linhasProntas: Number(x.lines_ready ?? 0), reservadas: Number(x.units_in_stock_reserved ?? 0),
    aChegar: Number(x.units_on_po ?? 0), emFalta: Number(x.units_missing ?? 0), servidas: Number(x.units_served ?? 0), precisas: Number(x.units_needed ?? 0),
  }));
  // 19/11 (20270124010000): do que falta, o que se pode pedir e porquê o resto não. Sem a função (base por atualizar) ou com erro,
  // fica a prontidão como estava (a obra diz «encomendar ao fornecedor» sem distinguir).
  if (lidas.some((p) => p.emFalta > 0)) {
    const causas = await sb.rpc("rpc_client_order_missing_causes" as never, { p_organization_id: org, p_contract_ids: lidas.filter((p) => p.emFalta > 0).map((p) => p.contrato) } as never);
    if (!causas.error && Array.isArray(causas.data)) {
      const porContrato = new Map((causas.data as Record<string, unknown>[]).map((c) => [String(c.contract_id), c]));
      for (const p of lidas) {
        const c = porContrato.get(p.contrato);
        if (!c || !("units_requestable" in c)) continue;
        p.aPedir = Math.min(p.emFalta, Number(c.units_requestable ?? 0));
        p.semFornecedor = Number(c.lines_no_supplier ?? 0);
        p.unidadeIncompativel = Number(c.lines_incompatible_uom ?? 0);
      }
    }
  }
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
