// 20/11 (auditoria de 19/11, lote 3): a releitura das obras de 20 em 20 segundos (página dos negócios) lia todas as obras da organização,
// com o estado da Emylia inteiro, incluindo as concluídas e as canceladas. Agora lê tudo uma vez e depois só o que mudou
// (obra_ler_negocios_desde, 20270125500000: atualizada_em desde a última leitura, menos uma margem para as gravações a meio). Sem a
// função na base, lê como antes (obra_ler_negocios: tudo).
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerObras, semFuncao } from "./negocioBase";

/** A margem que se volta a ler para trás da última leitura: uma gravação que começou antes e acabou depois dela tem uma hora anterior. */
export const MARGEM_RELEITURA_MS = 2 * 60_000;

export interface LeituraObras {
  /** O id do negócio na base → o estado da Emylia da obra (só as que vieram nesta leitura). */
  lidas: Map<string, unknown>;
  /** A hora do servidor a que se leu (null: leitura completa sem a função nova). */
  agora: string | null;
}

/** Lê as obras mudadas desde `desde` (null: todas). Devolve "sem-funcao" se a base ainda não tem obra_ler_negocios_desde; null com erro. */
export async function lerObrasDesde(sb: SupabaseClient, org: string, desde: string | null): Promise<LeituraObras | "sem-funcao" | null> {
  const { data, error } = await sb.rpc("obra_ler_negocios_desde" as never, { p_org: org, p_desde: desde } as never);
  if (error) return semFuncao(error) ? "sem-funcao" : null;
  const r = data as { agora?: string; obras?: { negocio_id: string; emylia: unknown }[] } | null;
  return { lidas: new Map((r?.obras ?? []).map((o) => [o.negocio_id, o.emylia])), agora: r?.agora ?? null };
}

/**
 * Quem relê as obras guarda onde ficou. `ler()` devolve as obras a juntar; só depois de as juntar (`confirmar`) a próxima leitura passa a
 * ser a partir desta (uma leitura que não se juntou, porque entretanto se estava a gravar, volta a vir na seguinte).
 */
export function criarReleituraObras(sb: SupabaseClient, org: string) {
  let desde: string | null = null; // null: ainda não se leu tudo
  let semNova = false;
  return {
    async ler(): Promise<LeituraObras | null> {
      if (!semNova) {
        const r = await lerObrasDesde(sb, org, desde);
        if (r !== "sem-funcao") return r;
        semNova = true; // a base ainda não tem a função: até se recarregar a página, lê-se como antes
      }
      const lidas = await lerObras(sb, org);
      return lidas ? { lidas, agora: null } : null;
    },
    confirmar(l: LeituraObras): void {
      if (!l.agora) return;
      const t = Date.parse(l.agora);
      if (Number.isFinite(t)) desde = new Date(t - MARGEM_RELEITURA_MS).toISOString();
    },
    /** A partir de quando se lê (para os testes). */
    get desde() { return desde; },
  };
}
export type ReleituraObras = ReturnType<typeof criarReleituraObras>;
