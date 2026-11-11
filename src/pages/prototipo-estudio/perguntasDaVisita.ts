// 11/11 (Rúben: «depois não consigo terminar porque isto não está preenchido e tenho de fazer muitos cliques para lá chegar; isto devem ser
// perguntas feitas dentro do Estúdio»). As perguntas da visita que o Estúdio não sabe sozinho (a área de intervenção e as escolhas do
// cliente) fazem-se no próprio Estúdio, no passo «Fechar»; as respostas voltam ao negócio com o resto (respostasDoEstudio). O pé-direito,
// a janela e o toalheiro não se perguntam: vêm do Estúdio (a altura e as peças da planta).
import { AREA, ESCOLHAS, divisaoPrincipal, obrigatorio, prefixoDivisao, visivel, type Def } from "@/emylia/campos";
import type { Projeto } from "./necessidadesEstudio";

/** O que o Estúdio responde sozinho (não se pergunta). */
export const DO_ESTUDIO: ReadonlySet<string> = new Set(["diag_tipo_area", "diag_pe_direito_m", "diag_toalheiro", "diag_janela"]);
const DA_AREA = new Set(AREA.campos.map((c) => c.k));

/** As perguntas da visita a fazer no Estúdio, pela ordem da visita. */
export const perguntasDoEstudio = (): Def[] => [...AREA.campos, ...ESCOLHAS.campos].filter((c) => !DO_ESTUDIO.has(c.k));

/** A chave no negócio: as da área levam o prefixo da divisão quando o Estúdio não é a divisão principal. */
export const chaveNoNegocio = (c: Pick<Def, "k">, prefixo = ""): string => (DA_AREA.has(c.k) ? prefixo + c.k : c.k);

/** O prefixo das chaves da área para a divisão do Estúdio (vazio na divisão principal). */
export function prefixoDoEstudio(f: Record<string, string>, divisao?: Projeto["divisao"]): string {
  const dp = divisaoPrincipal(f);
  return divisao && dp && dp !== divisao ? prefixoDivisao(divisao) : "";
}

/** As respostas que o negócio já tem a estas perguntas (para o Estúdio as mostrar respondidas). */
export function respostasDoNegocio(f: Record<string, string>, prefixo: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of perguntasDoEstudio()) { const k = chaveNoNegocio(c, prefixo), v = f[k]; if (v != null && v !== "") out[k] = v; }
  return out;
}

/** O que serve para decidir se uma pergunta aparece (as condições «@divisao», «@divisoes» e as de outro campo), visto do Estúdio. */
function valoresParaVer(p: Projeto): Record<string, string> {
  const pre = p.prefixoPerguntas ?? "", div = p.divisao ?? "Casa de banho";
  const v: Record<string, string> = { diag_tipo_area: div, diag_div_principal: div };
  for (const c of perguntasDoEstudio()) { const r = p.perguntas?.[chaveNoNegocio(c, pre)]; if (r) v[c.k] = r; }
  return v;
}

export interface Pergunta { c: Def; k: string; v: string; obrigatoria: boolean }
/** As perguntas que aparecem para este projeto, com a chave no negócio e a resposta (vazia: por responder). */
export function perguntasDe(p: Projeto): Pergunta[] {
  const pre = p.prefixoPerguntas ?? "", ver = valoresParaVer(p);
  return perguntasDoEstudio().filter((c) => visivel(c, ver)).map((c) => {
    const k = chaveNoNegocio(c, pre);
    return { c, k, v: p.perguntas?.[k] ?? "", obrigatoria: obrigatorio(c) };
  });
}
export const faltamPerguntas = (p: Projeto): Pergunta[] => perguntasDe(p).filter((x) => x.obrigatoria && !x.v.trim());
