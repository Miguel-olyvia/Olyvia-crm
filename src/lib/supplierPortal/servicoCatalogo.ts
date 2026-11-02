// Contrato de Fornecedor — Fase 5: o catálogo do fornecedor tem Produto | Serviço
// (migration 20270103600000_catalogo_fornecedor_servicos.sql). Usado no portal e no CRM.
import { useEffect, useState } from "react";

export type ItemKind = "produto" | "servico";

export const ITEM_KIND_LABEL: Record<ItemKind, string> = { produto: "Produto", servico: "Serviço" };

/** As unidades de um serviço: o valor é o que a base grava em unit_label (fn_sp_service_unit). */
export const UNIDADES_SERVICO: ReadonlyArray<readonly [string, string]> = [
  ["h", "hora"],
  ["dia", "dia"],
  ["m²", "m² (metro quadrado)"],
  ["m³", "m³ (metro cúbico)"],
  ["ml", "metro linear"],
  ["m", "metro"],
  ["un", "unidade"],
  ["pt", "ponto"],
  ["km", "km"],
  ["vg", "empreitada (valor global)"],
];

export const unidadeServicoLabel = (code: string | null | undefined): string =>
  (code && UNIDADES_SERVICO.find(([v]) => v === code)?.[1]) || code || "—";

/** Ausente (resposta antiga) = produto. */
export const kindOf = (i: { item_kind?: string | null }): ItemKind => (i.item_kind === "servico" ? "servico" : "produto");

export interface Distrito {
  code: string;
  name: string;
}

let cache: Promise<Distrito[]> | null = null;

/**
 * Os distritos (administrative_divisions PT nível 1, leitura pública). Açores e Madeira
 * aparecem duas vezes na tabela: fica um por código.
 */
export function carregarDistritos(): Promise<Distrito[]> {
  if (!cache) {
    cache = (async () => {
      // Import tardio: quem só usa as listas/rótulos (e os testes) não cria o cliente.
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase
        .from("administrative_divisions")
        .select("code, name")
        .eq("country_code", "PT")
        .eq("admin_level", 1)
        .eq("is_active", true)
        .not("code", "is", null)
        .order("name");
      if (error) throw error;
      const seen = new Set<string>();
      const out: Distrito[] = [];
      for (const d of data ?? []) {
        if (!d.code || seen.has(d.code)) continue;
        seen.add(d.code);
        out.push({ code: d.code, name: d.name });
      }
      return out;
    })().catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

/** Distritos para mostrar/escolher. `enabled` = só carrega quando é preciso. */
export function useDistritos(enabled = true): { distritos: Distrito[] | null; erro: string | null } {
  const [distritos, setDistritos] = useState<Distrito[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || distritos) return;
    let vivo = true;
    carregarDistritos()
      .then((d) => { if (vivo) setDistritos(d); })
      .catch((e: { message?: string }) => { if (vivo) setErro(e?.message || "Não foi possível carregar os distritos."); });
    return () => { vivo = false; };
  }, [enabled, distritos]);
  return { distritos, erro };
}

/** "Lisboa, Setúbal" (ou os códigos, se os nomes ainda não chegaram). Muitos → "Lisboa, Porto +3". */
export function nomesDistritos(codes: string[] | null | undefined, distritos: Distrito[] | null, max = 3): string {
  if (!codes || codes.length === 0) return "—";
  const nomes = codes.map((c) => distritos?.find((d) => d.code === c)?.name ?? c);
  return nomes.length > max ? `${nomes.slice(0, max).join(", ")} +${nomes.length - max}` : nomes.join(", ");
}
