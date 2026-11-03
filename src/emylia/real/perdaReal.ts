// 3/11 (20270105200000): a perda do negócio em /negocios grava-se pelas funções da base, como o diálogo «Perder o negócio» da ficha
// (PerderNegocioDialogo → useMutacoesNegocio): neg_perder_negocio(p_negocio_id, p_fase, p_motivo) e neg_anular_perda(p_negocio_id,
// p_motivo_reabertura), pela mesma chamada (chamarNeg: os erros NG*/42501 traduzidos) e com o mesmo texto limpo (textoDeEstado). Antes, o
// motor só mudava o Estado e neg_guardar_negocio ignora o estado e o motivo: a perda desaparecia ao reler. Ambas pedem negocios.perder.
import { chamarNeg, ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { lerMudou, textoDeEstado } from "@/hooks/pessoas/paramsNegocio";
import type { FasePerdaBase } from "../motor";

/** Dá o negócio (uuid) como perdido na base. Lança ErroNeg se a base recusar. */
export async function perderNegocioReal(negocioId: string, fase: FasePerdaBase, motivo: string): Promise<{ mudou: boolean }> {
  const texto = textoDeEstado(motivo);
  return lerMudou(await chamarNeg<unknown>("neg_perder_negocio", { p_negocio_id: negocioId, p_fase: fase, p_motivo: texto }));
}

/** Anula a perda do negócio (uuid) na base. Lança ErroNeg se a base recusar. */
export async function anularPerdaReal(negocioId: string, razao: string): Promise<{ mudou: boolean }> {
  const texto = textoDeEstado(razao);
  return lerMudou(await chamarNeg<unknown>("neg_anular_perda", { p_negocio_id: negocioId, p_motivo_reabertura: texto }));
}

/** A mensagem a mostrar de uma falha (a da base, em português, quando a há). */
export function mensagemDaPerda(e: unknown): string {
  if (e instanceof ErroNeg) {
    const causa = e.causa as { message?: unknown } | null;
    if (causa && typeof causa.message === "string" && causa.message.trim()) return causa.message;
  }
  return e instanceof Error && e.message ? e.message : "Não foi possível gravar a perda do negócio.";
}
