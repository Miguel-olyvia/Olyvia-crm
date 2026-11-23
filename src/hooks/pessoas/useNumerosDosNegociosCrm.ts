// 23/11: o número do negócio e a versão atual da proposta, para o CRM mostrar «PR <ano>/<n.º do negócio>» nas propostas de negócio
// (lista de Propostas, detalhe). Lê negocios.numero e o maior orcamentos.versao (as duas tabelas pedem pessoas.view na organização).
// Sem permissão, sem linhas ou com erro: o negócio fica de fora e mostra-se o número guardado, como antes (o erro vai para o Sentry).
// Sem react-query de propósito: os ecrãs que o usam não dependem de um QueryClient. Uma leitura por conjunto de negócios.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { NumeroDoNegocio } from "@/components/portal/obra/useNumerosDosNegocios";

interface Consulta extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select: (c: string) => Consulta; in: (c: string, v: readonly string[]) => Consulta;
}
const tabela = (nome: string): Consulta => (supabase as unknown as { from: (n: string) => Consulta }).from(nome);

export async function lerNumerosDosNegociosCrm(ids: readonly string[]): Promise<Map<string, NumeroDoNegocio>> {
  if (ids.length === 0) return new Map();
  const [neg, orc] = await Promise.all([tabela("negocios").select("id, numero").in("id", ids), tabela("orcamentos").select("negocio_id, versao").in("negocio_id", ids)]);
  if (neg.error) throw new Error(neg.error.message);
  const versao = new Map<string, number>();
  // sem as versões (erro), a versão fica 1: o número sai sem « · vN»
  if (!orc.error) for (const o of (orc.data ?? []) as { negocio_id: string; versao: number | null }[]) versao.set(o.negocio_id, Math.max(versao.get(o.negocio_id) ?? 1, o.versao ?? 1));
  const r = new Map<string, NumeroDoNegocio>();
  for (const n of (neg.data ?? []) as { id: string; numero: number | null }[]) if (typeof n.numero === "number") r.set(n.id, { numero: n.numero, versao: versao.get(n.id) ?? 1 });
  return r;
}

/** Os números dos negócios pedidos (uuid → número e versão). */
export function useNumerosDosNegociosCrm(negocioIds: readonly (string | null | undefined)[]): Map<string, NumeroDoNegocio> {
  const chave = Array.from(new Set(negocioIds.filter((x): x is string => !!x))).sort().join(",");
  const [mapa, setMapa] = useState<Map<string, NumeroDoNegocio>>(new Map());
  useEffect(() => {
    if (!chave) { setMapa(new Map()); return; }
    let vivo = true;
    lerNumerosDosNegociosCrm(chave.split(","))
      .then((m) => { if (vivo) setMapa(m); })
      .catch((e: unknown) => { captureFlowError(e, "proposal-workflow"); if (vivo) setMapa(new Map()); });
    return () => { vivo = false; };
  }, [chave]);
  return mapa;
}
