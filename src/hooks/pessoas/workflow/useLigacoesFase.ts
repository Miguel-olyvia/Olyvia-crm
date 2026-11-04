import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useFontePessoas } from "../useFontePessoas";

/** Um campo de formulário ligado a uma pergunta de fase (neg_ligacoes_fase). */
export interface LigacaoFase {
  form_id: string;
  form_nome: string;
  field_id: string;
  field_label: string;
  /** O título estável do grupo (nunca o nome que a empresa lhe deu). */
  grupo: string;
  /** A chave da pergunta. */
  chave: string;
  /** Rótulo do formulário → rótulo da pergunta (null = sem correspondência). */
  valores: Record<string, string | null> | null;
}

/** A função ou a coluna ainda não existem na base: sem ligações, nada muda. */
export const semFuncaoOuColuna = (e: { code?: string } | null | undefined): boolean =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "42703" || e.code === "PGRST204");

const texto = (x: unknown): string => (typeof x === "string" ? x : "");

/** O que a base devolveu, limpo: só linhas com grupo e chave. */
export function lerLigacoes(x: unknown): LigacaoFase[] {
  if (!Array.isArray(x)) return [];
  const r: LigacaoFase[] = [];
  for (const l of x as Record<string, unknown>[]) {
    if (!l || typeof l !== "object" || !texto(l.grupo) || !texto(l.chave)) continue;
    const v = l.valores && typeof l.valores === "object" && !Array.isArray(l.valores) ? (l.valores as Record<string, string | null>) : null;
    r.push({ form_id: texto(l.form_id), form_nome: texto(l.form_nome), field_id: texto(l.field_id), field_label: texto(l.field_label), grupo: texto(l.grupo), chave: texto(l.chave), valores: v });
  }
  return r;
}

/** Lê as ligações da organização. Best-effort: qualquer erro (a função ainda não existe, sem permissão) devolve []. */
export async function lerLigacoesFase(sb: SupabaseClient, org: string): Promise<LigacaoFase[]> {
  try {
    // `as never`: a função está nos tipos gerados, mas a leitura é tolerante à sua ausência
    const { data, error } = await sb.rpc("neg_ligacoes_fase" as never, { p_org: org } as never);
    if (error) {
      if (!semFuncaoOuColuna(error)) console.warn("[ligações] não carregaram:", (error as { message?: string }).message);
      return [];
    }
    return lerLigacoes(data);
  } catch (e) {
    console.warn("[ligações] não carregaram:", (e as Error).message);
    return [];
  }
}

export interface LigacoesFaseLidas {
  ligacoes: LigacaoFase[];
  /** A leitura terminou. Antes disso (ou se avariou) não se sabe o que está ligado: o editor pede confirmação genérica em vez de passar sem aviso. */
  pronto: boolean;
}

/** As ligações campo do formulário → pergunta de fase, para os avisos do editor de campos das fases. Sem ligações (ou sem a função): []. */
export function useLigacoesFase(habilitado = true): LigacoesFaseLidas {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: ["pessoas-ligacoes-fase", organizationId],
    queryFn: () => lerLigacoesFase(supabase as unknown as SupabaseClient, organizationId as string),
    enabled: habilitado && !!organizationId,
    retry: false,
  });
  return { ligacoes: consulta.data ?? [], pronto: consulta.isSuccess };
}
