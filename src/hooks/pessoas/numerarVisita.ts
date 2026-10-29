// Dá à visita acabada de criar na agenda o seu visita_numero real (neg_numerar_visita: idempotente, o menor número livre >= 1 do negócio, exige pessoas.edit).
// É esse número que o espelho da Emylia usa (v<n>_*), para a função da base que sincroniza as visitas a encontrar pelo número e só a atualizar, sem criar uma segunda.
import { supabase } from "@/integrations/supabase/client";

/** O erro da numeração; `semFuncao` quando a RPC ainda não existe na base (PGRST202 / 42883). */
export class ErroNumerarVisita extends Error {
  readonly semFuncao: boolean;
  constructor(semFuncao: boolean, detalhe: string) {
    super(detalhe);
    this.name = "ErroNumerarVisita";
    this.semFuncao = semFuncao;
  }
}

export const AVISO_VISITA_SEM_NUMERO = "A visita ficou marcada, mas falta uma atualização da base para a ligar ao negócio: pode aparecer repetida na agenda.";

export async function numerarVisita(negocioId: string, visitaId: string): Promise<number> {
  // a RPC ainda não está nos tipos gerados
  const cliente = supabase as unknown as { rpc: (nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }> };
  const { data, error } = await cliente.rpc("neg_numerar_visita", { p_negocio_id: negocioId, p_visita_id: visitaId });
  if (error) throw new ErroNumerarVisita(error.code === "PGRST202" || error.code === "42883", error.message ?? "erro");
  if (typeof data !== "number" || !Number.isInteger(data) || data < 1) throw new ErroNumerarVisita(false, "A base devolveu um número de visita inválido.");
  return data;
}
