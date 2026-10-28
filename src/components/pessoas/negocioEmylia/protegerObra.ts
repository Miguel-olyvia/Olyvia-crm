// A Emylia assume que um negócio na Obra (fase 5) já tem plano: ObraSimples e proximo() leem `d.obra.plano!`. Um negócio que vem da base com
// a fase gravada em 5 mas sem o plano (as Operações da fase 3 do Ben ainda não o gravam) rebentaria o ecrã. Estas guardas são o único sítio
// que decide se se pode montar o que depende do plano.
import { proximo, type Estado, type Negocio } from "@/emylia/motor";

export type Proximo = ReturnType<typeof proximo>;

/** O negócio tem o plano da obra na memória do ecrã (a base ainda não o guarda). */
export const temPlanoDaObra = (d: Negocio): boolean => d.obra?.plano != null;

/** Na Obra sem plano não se monta ObraSimples nem o botão do passo. */
export const podeMontarObra = (d: Negocio): boolean => d.fase === 5 && temPlanoDaObra(d);

/** `proximo(d, S)` sem rebentar: um negócio na Obra sem plano devolve um passo de espera, honesto, em vez de ler `plano!`. */
export function proximoSeguro(d: Negocio, S: Estado): Proximo {
  if (d.fase === 5 && !temPlanoDaObra(d)) {
    return { t: "A obra ainda não tem plano", sub: "O plano gera-se nas Operações, que ainda não estão ligadas à base.", who: "operacoes", wait: true } as Proximo;
  }
  return proximo(d, S);
}
