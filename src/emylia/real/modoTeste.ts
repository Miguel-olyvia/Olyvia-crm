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
export async function simularFornecedor(sb: SupabaseClient, poUuid: string, hoje = new Date()): Promise<void> {
  // 11/11 (teste da Obra): o fornecedor confirma com a data prometida (dois dias úteis), como no portal; sem ela, a encomenda ficava
  // «à espera do fornecedor» no negócio (a base só devolve a data prometida, não o estado da confirmação)
  const { error } = await sb.rpc("teste_fornecedor_confirmar" as never, { p_po_id: poUuid, p_promised_date: dataPrometidaTeste(hoje) } as never);
  if (error) throw new Error(error.message);
}

/** A data que o fornecedor de teste promete: daqui a dois dias úteis ("aaaa-mm-dd"). */
export function dataPrometidaTeste(hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let n = 0;
  while (n < 2) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// FERRAMENTAS-TESTE (temporário, remover antes da main)
// 11/11 (Rafael): aceitar a proposta / assinar o contrato como o cliente também nas contas de perfis normais (Comercial, Financeiro…),
// no botão do passo «À espera do cliente». A base diz que sim só com o modo de teste ligado E membro ativo da organização
// (fn_modo_teste_simular_cliente_para_mim, migração 20270114200000). As outras ferramentas do modo de teste continuam só do super admin.
export type AcoesSimularCliente = Pick<AcoesDeTeste, "aceitarProposta" | "assinarContrato">;
let acoesCliente: AcoesSimularCliente | null = null;
const quemCliente = new Set<() => void>();
export function definirSimularClienteTeste(a: AcoesSimularCliente | null) { acoesCliente = a; quemCliente.forEach((f) => f()); }
export function useSimularClienteTeste(): AcoesSimularCliente | null {
  return useSyncExternalStore((f) => { quemCliente.add(f); return () => quemCliente.delete(f); }, () => acoesCliente, () => null);
}
/** A base diz se quem entrou pode aceitar/assinar como o cliente nesta organização (modo de teste ligado E membro ativo). Um erro é «não». */
export async function podeSimularClienteTeste(sb: SupabaseClient, org: string): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("fn_modo_teste_simular_cliente_para_mim" as never, { p_org: org } as never);
    return !error && data === true;
  } catch { return false; }
}
