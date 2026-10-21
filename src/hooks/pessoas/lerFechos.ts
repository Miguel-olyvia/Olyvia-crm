// O tipo de fecho de cada negócio da ficha. `neg_ficha_pessoa` ainda não devolve `negocios.fecho`, por isso lê-se da tabela, pela regra de acesso
// dela (só leitura, preso aos ids da ficha e à organização), e junta-se à ficha. Uma leitura que falhe nunca impede a ficha de abrir: fica sem
// tipo (os ecrãs não assumem nenhum) e a falha vai para a observabilidade. Quando a função da ficha passar a trazer `fecho`, isto só lê o que
// faltar (nada, se vier tudo).
import { fechoDe, type FechoNegocio } from "@/components/negocio-metas/fechoNegocio";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { FichaDb } from "./fichaTipos";

type Consulta = PromiseLike<{ data: unknown; error: unknown }>;
const db = (): { from: (tabela: string) => any } => supabase as unknown as { from: (tabela: string) => any };

/** Os tipos de fecho dos negócios pedidos (id → tipo), ou `null` se não há ids ou a leitura falhou. */
export async function lerFechos(organizationId: string, ids: readonly string[]): Promise<ReadonlyMap<string, FechoNegocio> | null> {
  if (ids.length === 0) return null;
  try {
    const consulta: Consulta = db().from("negocios").select("id, fecho").in("id", [...ids]).eq("organization_id", organizationId);
    const { data, error } = await consulta;
    if (error) {
      captureFlowError(error, "pessoas-neg");
      return null;
    }
    const mapa = new Map<string, FechoNegocio>();
    for (const linha of Array.isArray(data) ? data : []) {
      const l = typeof linha === "object" && linha !== null ? (linha as { id?: unknown; fecho?: unknown }) : null;
      const fecho = fechoDe(l?.fecho);
      if (typeof l?.id === "string" && fecho) mapa.set(l.id, fecho);
    }
    return mapa;
  } catch (falha) {
    captureFlowError(falha, "pessoas-neg");
    return null;
  }
}

/** A ficha com o tipo de fecho em cada negócio que ainda não o traz; a mesma ficha se não há nada a juntar ou a leitura falhou. */
export async function comFechos(ficha: FichaDb, organizationId: string): Promise<FichaDb> {
  const itens = ficha.negocios?.itens ?? [];
  const faltam = itens.filter((n) => fechoDe(n.fecho) === null).map((n) => n.id);
  const fechos = await lerFechos(organizationId, faltam);
  if (!fechos || !ficha.negocios) return ficha;
  const negocios = { ...ficha.negocios, itens: itens.map((n) => (fechos.has(n.id) ? { ...n, fecho: fechos.get(n.id) } : n)) };
  return { ...ficha, negocios };
}
