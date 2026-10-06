import { supabase } from "@/integrations/supabase/client";

/**
 * Distância do armazém mais próximo da empresa até um código postal
 * (Operações: rpc_ops_distancia_armazem, em operacao-app/db/dados-encomendas.sql).
 * Usa as coordenadas de `postal_codes` do próprio CRM — nenhum serviço externo.
 *
 * null quando não se sabe: sem código postal, sem armazém com código postal,
 * ou o SQL ainda não correu na base. A sugestão da ficha do local usa então
 * o valor por defeito (30 km ida e volta).
 */
export interface DistanciaArmazem {
  armazem: string;
  km_estrada: number;
  km_ida_volta: number;
  minutos: number;
  /** cp7 = código postal exato; cp4/cp2 = média da zona. */
  precisao_obra: "cp7" | "cp4" | "cp2";
}

const cache = new Map<string, Promise<DistanciaArmazem | null>>();

/** Só os dígitos — "1675-195 " e "1675195" são o mesmo código. */
export function normalizarCodigoPostal(cp: string | null | undefined): string | null {
  const d = (cp ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d : null;
}

export function distanciaArmazem(orgId: string | null | undefined, cp: string | null | undefined): Promise<DistanciaArmazem | null> {
  const codigo = normalizarCodigoPostal(cp);
  if (!orgId || !codigo) return Promise.resolve(null);
  const chave = `${orgId}:${codigo}`;
  let p = cache.get(chave);
  if (!p) {
    p = Promise.resolve(supabase.rpc("rpc_ops_distancia_armazem" as never, { p_org: orgId, p_cp: cp } as never))
      .then(({ data, error }) => {
        if (error) {
          cache.delete(chave);
          return null;
        }
        const d = (data ?? {}) as Partial<DistanciaArmazem>;
        return d.armazem && typeof d.km_ida_volta === "number" ? (d as DistanciaArmazem) : null;
      })
      .catch(() => {
        cache.delete(chave);
        return null;
      });
    cache.set(chave, p);
  }
  return p;
}

/** "Armazém Lisboa · 30 km · ~45 min" (e a nota de zona quando o CP não é exato). */
export function textoDistanciaArmazem(d: DistanciaArmazem): string {
  const km = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(d.km_estrada);
  const zona = d.precisao_obra === "cp7" ? "" : " (pela zona do código postal)";
  return `Armazém ${d.armazem} · ${km} km · ~${d.minutos} min${zona}`;
}
