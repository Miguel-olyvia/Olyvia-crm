// 9/11 (Rúben: «por motivos de teste o super admin deve sempre ter botões para fazer ações pelo cliente e pelo fornecedor»). O modo de
// teste no ecrã: a página real (NegociosEmylia) pergunta à base se quem entrou é super admin da organização E se a base tem o modo de
// teste ligado (fn_modo_teste_para_mim, migração 20270110300000); só então põe aqui as ações. Os passos (a fase, o contrato, os
// materiais) mostram os botões «… pelo cliente (teste)» e «Confirmar pelo fornecedor (teste)» quando elas existem. Sem a página real
// (o protótipo, os testes), nada aparece.
import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Negocio } from "../motor";

export interface AcoesDeTeste {
  /** Aceitar a proposta como o cliente no portal (o mesmo caminho do portal, sem o código por SMS). */
  aceitarProposta: (d: Negocio) => Promise<void>;
  /** Assinar o contrato como o cliente no portal. */
  assinarContrato: (d: Negocio) => Promise<void>;
  /** Confirmar a encomenda a fornecedor como o fornecedor no portal dele. */
  confirmarFornecedor: (poUuid: string) => Promise<void>;
}

let acoes: AcoesDeTeste | null = null;
const quem = new Set<() => void>();
export function definirModoTeste(a: AcoesDeTeste | null) { acoes = a; quem.forEach((f) => f()); }
export function modoTeste(): AcoesDeTeste | null { return acoes; }
export function useModoTeste(): AcoesDeTeste | null {
  return useSyncExternalStore((f) => { quem.add(f); return () => quem.delete(f); }, () => acoes, () => null);
}

/** A base diz se quem entrou vê os botões de teste nesta organização (ligado E super admin). Um erro é «não». */
export async function podeModoTeste(sb: SupabaseClient, org: string): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("fn_modo_teste_para_mim" as never, { p_org: org } as never);
    return !error && data === true;
  } catch { return false; }
}

/** O cliente, pelo portal: a Edge Function client-portal-action, ação «simular_cliente». */
export async function simularCliente(sb: SupabaseClient, acao: "sign_proposal" | "sign_contract", docId: string): Promise<void> {
  const params = acao === "sign_proposal" ? { acao, proposal_id: docId } : { acao, contract_id: docId };
  const { data, error } = await sb.functions.invoke("client-portal-action", { body: { action: "simular_cliente", params } });
  if (error) {
    // a mensagem da função (sem portal, modo desligado…) vem no corpo da resposta
    let msg = error.message;
    try { const ctx = (error as { context?: Response }).context; const j = ctx ? await ctx.json() : null; if (j?.message || j?.error) msg = j.message ?? j.error; } catch { /* fica a do cliente */ }
    throw new Error(msg);
  }
  const d = data as { error?: string; message?: string } | null;
  if (d?.error) throw new Error(d.message ?? d.error);
}

/** O fornecedor, pelo portal dele: teste_fornecedor_confirmar (a mesma confirmação de sp_confirm_order). */
export async function simularFornecedor(sb: SupabaseClient, poUuid: string): Promise<void> {
  const { error } = await sb.rpc("teste_fornecedor_confirmar" as never, { p_po_id: poUuid } as never);
  if (error) throw new Error(error.message);
}
