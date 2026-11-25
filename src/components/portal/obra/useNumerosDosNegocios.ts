// 23/11: o número do negócio (e a versão da proposta) para as LISTAS do portal, onde o número mostrado é «PR <ano>/<n.º do negócio>»
// (src/lib/numeroDocumento.ts). A conta do portal não lê a tabela `negocios` (RLS): o número só chega pela vista do cliente
// (portal_neg_vista), a mesma que o documento da proposta já lê. Lê-se uma vez por negócio e fica em memória durante a sessão da
// página (não segue a atualização de 20 s das listas). Um negócio sem vista, ou com erro, fica de fora: a lista mostra o número
// guardado, como antes. Sem react-query de propósito: as páginas que o usam não dependem de um QueryClient.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lerVista } from "@/emylia/real/vistaCliente";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { versaoDaProposta } from "@/lib/numeroDocumento";

type Rpc = { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export interface NumeroDoNegocio { numero: number; versao: number }

/** Os já lidos (null: sem vista ou com erro; não se volta a pedir). */
const lidos = new Map<string, NumeroDoNegocio | null>();

async function lerUm(negocioId: string): Promise<NumeroDoNegocio | null> {
  try {
    const { data, error } = await (supabase as unknown as Rpc).rpc("portal_neg_vista", { p_negocio_id: negocioId });
    if (error) throw new Error(error.message);
    const v = lerVista(data);
    return v?.d && typeof v.d.id === "number" ? { numero: v.d.id, versao: versaoDaProposta(v.d) } : null;
  } catch (e) {
    captureFlowError(e, "client-portal-proposal");
    return null;
  }
}

const doCache = (ids: readonly string[]): Map<string, NumeroDoNegocio> =>
  new Map(ids.flatMap((id) => { const x = lidos.get(id); return x ? [[id, x] as [string, NumeroDoNegocio]] : []; }));

/** Os números dos negócios pedidos (uuid → número e versão); sem vista, o negócio não aparece no mapa. */
export function useNumerosDosNegocios(negocioIds: readonly (string | null | undefined)[]): Map<string, NumeroDoNegocio> {
  const chave = Array.from(new Set(negocioIds.filter((x): x is string => !!x))).sort().join(",");
  const [mapa, setMapa] = useState<Map<string, NumeroDoNegocio>>(() => doCache(chave ? chave.split(",") : []));
  useEffect(() => {
    const ids = chave ? chave.split(",") : [];
    setMapa(doCache(ids));
    const faltam = ids.filter((id) => !lidos.has(id));
    if (faltam.length === 0) return;
    let vivo = true;
    void Promise.all(faltam.map(async (id) => { lidos.set(id, await lerUm(id)); })).then(() => { if (vivo) setMapa(doCache(ids)); });
    return () => { vivo = false; };
  }, [chave]);
  return mapa;
}

/** Só para os testes: esquece o que já se leu. */
export const esquecerNumerosDosNegocios = (): void => { lidos.clear(); };
