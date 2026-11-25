// 25/11: «Tem aspeto» nos atributos do Catálogo. O que corre na base é o CONTRATO com a migration (por aplicar enquanto isto se escreve):
//   cat_definir_aspeto_atributo(p_org, p_atributo, p_tem_aspeto) → { atributo: { id, tem_aspeto } }   liga/desliga o interruptor (uma medida não tem aspeto); desligar não apaga nada
//   cat_aspeto_opcao(p_org, p_opcao, p_metal, p_superficie) → { opcao: { id, metal, superficie }, anterior: { metal, superficie } }
//        p_metal null = não mexe; p_superficie null = não mexe, '' = limpa, senão polida | acetinada | mate. Recusa (CT002) se o atributo não tem «Tem aspeto».
// Mesmo padrão de fotoOpcaoDados: `chamar` (função que ainda não existe → «Ainda não disponível nesta base»; CT00x com a mensagem em português da base).
import { chamar, type ResG } from "./atributosGestao";
import { SUPERFICIES, superficieDeLeitura, type Superficie } from "./v2/catalogoModelo";

/** O texto de uma superfície («Acetinada»). */
export const rotuloDaSuperficie = (s: Superficie): string => s.charAt(0).toUpperCase() + s.slice(1);
/** O resumo do aspeto de uma opção para a lista: «Metal · Acetinada», «Mate», «Metal»; vazio se não tem nada. */
export const resumoDoAspeto = (metal: boolean, superficie: Superficie | null): string => [metal ? "Metal" : null, superficie ? rotuloDaSuperficie(superficie) : null].filter(Boolean).join(" · ");

export interface ResultadoAspeto { metal: boolean; superficie: Superficie | null; anterior: { metal: boolean; superficie: Superficie | null } }

/** O interruptor «Tem aspeto» de um atributo de lista. A mensagem de recusa é a da base. */
export function definirAspetoAtributo(org: string, atributo: string, temAspeto: boolean): Promise<ResG<unknown>> {
  return chamar("cat_definir_aspeto_atributo", { p_org: org, p_atributo: atributo, p_tem_aspeto: temAspeto }, "Não foi possível mudar o aspeto do atributo.");
}

const objeto = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});

/**
 * Grava o aspeto de uma opção. `metal` e `superficie` ausentes (undefined) não mexem; `superficie: null` limpa (vai '' à base). Uma superfície fora das três nem vai à base.
 * Devolve o aspeto que a base ficou com e o anterior.
 */
export async function definirAspetoOpcao(org: string, opcao: string, o: { metal?: boolean; superficie?: Superficie | null }): Promise<ResG<ResultadoAspeto>> {
  if (o.superficie != null && !(SUPERFICIES as readonly string[]).includes(o.superficie)) return { ok: false, erro: "A superfície escolhida não é válida: use polida, acetinada ou mate." };
  const r = await chamar("cat_aspeto_opcao", { p_org: org, p_opcao: opcao, p_metal: o.metal ?? null, p_superficie: o.superficie === undefined ? null : o.superficie === null ? "" : o.superficie }, "Não foi possível guardar o aspeto da opção.");
  if (r.ok === false) return r;
  const v = objeto(r.v), novo = objeto(v.opcao), antes = objeto(v.anterior);
  return { ok: true, v: { metal: novo.metal === true, superficie: superficieDeLeitura(novo.superficie), anterior: { metal: antes.metal === true, superficie: superficieDeLeitura(antes.superficie) } } };
}
