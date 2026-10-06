import { supabase } from "./supabase";
import { ErroDeDados } from "./dados";
import type { ExpansaoOrcamento, PrevisaoBase } from "../domain/previsao";

/**
 * Leitura da Previsão (db/previsao.sql). Só lê: nenhuma destas chamadas cria
 * obras nem mexe em dados.
 */

function falhou(contexto: string, error: { message: string } | null): void {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error(`[Operações] ${contexto}:`, error);
  throw new ErroDeDados(
    /function .* does not exist|Could not find the function/i.test(error.message)
      ? "A previsão ainda não está instalada na base (falta correr db/previsao.sql)."
      : /Só quem planeia/.test(error.message)
        ? "Só quem planeia (gestor) vê a previsão."
        : `Não foi possível ${contexto}.`
  );
}

export async function carregarPrevisaoBase(orgId: string, dias: number): Promise<PrevisaoBase> {
  const { data, error } = await supabase.rpc("rpc_ops_previsao_base", { p_org: orgId, p_dias: dias });
  falhou("carregar a previsão", error);
  return data as unknown as PrevisaoBase;
}

/** O cruzamento linha × modelo, por lotes (a RPC aceita até 20 de cada vez). */
export async function expandirOrcamentos(
  orgId: string,
  ids: string[],
  aoAvancar?: (feitos: number) => void,
  lote = 10
): Promise<ExpansaoOrcamento[]> {
  const res: ExpansaoOrcamento[] = [];
  for (let i = 0; i < ids.length; i += lote) {
    const { data, error } = await supabase.rpc("rpc_ops_previsao_expandir", {
      p_org: orgId,
      p_ids: ids.slice(i, i + lote),
    });
    falhou("cruzar os orçamentos com os modelos", error);
    res.push(...((data as unknown as { orcamentos: ExpansaoOrcamento[] })?.orcamentos ?? []));
    aoAvancar?.(Math.min(ids.length, i + lote));
  }
  return res;
}
