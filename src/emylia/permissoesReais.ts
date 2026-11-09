// 23/10/2026 (2.0, segurança): os códigos das permissões dos Negócios que se leem da base (CODIGOS_NEGOCIOS).
// 5/11: quem os lê é usePermissoesReaisNegocio (real/usePermissoesReais.ts), por fn_cat_pode(org, código), a função com que o servidor
// decide; usado na ficha da pessoa e em /negocios. lerPermissoesNegocios e usePermissoesNegocios, abaixo, são código morto: ninguém
// os chama e perguntam `tem_permissao(org, perm)`, que não existe nesta base. Ficam só para não mexer no que não é preciso; não usar.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ALTERNATIVAS, CODIGO_APROVAR_PO, CODIGO_BASE, CODIGO_ESCREVER_CONVERSA, CODIGO_GERIR_ORCAMENTOS } from "./permissoes";

/** 09/11: os códigos dos separadores de /negocios (NegociosEmylia.tsx): ver os Negócios e as Pessoas, criar um negócio, ver as encomendas
 *  de cliente (Inventário) e o Catálogo e custos. negocios.obra.executar e negocios.obra.planear (as Operações) já estão em CODIGO_BASE. */
export const CODIGOS_VISTAS: readonly string[] = ["pessoas.view", "pessoas.create", "client_orders.view", "services.view"];

/** Os códigos que o protótipo pergunta: os das ações (CODIGO_BASE), o de ver custos e (24/10) o de ver salários (a ponte do RH).
 *  2/11: os códigos reais da base (quotes.view_costs; o salário é a retribuição do RH, hr.pessoas.retribuicao.view). */
export const CODIGOS_NEGOCIOS: readonly string[] = [...new Set([...Object.values(CODIGO_BASE), ...Object.values(ALTERNATIVAS).flat(),
  "quotes.view_costs", "hr.pessoas.retribuicao.view",
  // 9/11 (Lote 1): quotes.manage (ver custos, como fn_quote_custos_pode), purchase_orders.approve (aprovar a encomenda a fornecedor,
  // fn_po_crm_load) e pessoas.edit (escrever na conversa da obra, neg_mensagem_enviar)
  CODIGO_GERIR_ORCAMENTOS, CODIGO_APROVAR_PO, CODIGO_ESCREVER_CONVERSA,
  // 09/11: os separadores e as ligações de /negocios (perfil OU papel OU admin, como a base): Negócios, Novo negócio, Inventário, Catálogo
  ...CODIGOS_VISTAS])];

export type LeituraPermissoes = { org: string; codigos: ReadonlySet<string> | null };

/** MORTO (5/11): ninguém chama; `tem_permissao` não existe nesta base. Use lerPermissoesReais (real/usePermissoesReais.ts). */
export async function lerPermissoesNegocios(org: string): Promise<ReadonlySet<string> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  try {
    const r = await Promise.all(CODIGOS_NEGOCIOS.map((perm) => db.rpc("tem_permissao", { org, perm }) as Promise<{ data: unknown; error: unknown }>));
    if (r.some((x) => x.error)) return null;
    return new Set(CODIGOS_NEGOCIOS.filter((_, i) => r[i].data === true));
  } catch {
    return null;
  }
}

/** MORTO (5/11): ninguém chama. Use usePermissoesReaisNegocio (real/usePermissoesReais.ts). */
export function usePermissoesNegocios(org: string | null): ReadonlySet<string> | null {
  const [l, setL] = useState<LeituraPermissoes | null>(null);
  useEffect(() => {
    if (!org) return;
    let cancelado = false;
    void lerPermissoesNegocios(org).then((codigos) => { if (!cancelado) setL({ org, codigos: codigos ?? new Set() }); });
    return () => { cancelado = true; };
  }, [org]);
  return l && l.org === org ? l.codigos : null;
}
