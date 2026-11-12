// 11/11 (Rúben: «depois não consigo terminar porque isto não está preenchido e tenho de fazer muitos cliques para lá chegar; isto devem ser
// perguntas feitas dentro do Estúdio»). As perguntas da visita que o Estúdio não sabe sozinho (a área de intervenção e as escolhas do
// cliente) fazem-se no próprio Estúdio, no passo «Fechar»; as respostas voltam ao negócio com o resto (respostasDoEstudio). O pé-direito,
// a janela e o toalheiro não se perguntam: vêm do Estúdio (a altura e as peças da planta).
// 12/11 (Rúben: «o que faltar preencher da visita tem de ser preenchido na última fase do Estúdio»): também o exterior do edifício e o
// interior do espaço. Os campos são os da empresa (os nomes mudados, os escondidos e os juntados pelo admin), que a Visita manda ao abrir
// o Estúdio (Projeto.camposVisita); sem eles, os de base.
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, divisaoPrincipal, obrigatorio, prefixoDivisao, visivel, type Def, type Grupo } from "@/emylia/campos";
import type { Projeto } from "./necessidadesEstudio";

/** O que o Estúdio responde sozinho (não se pergunta). */
export const DO_ESTUDIO: ReadonlySet<string> = new Set(["diag_tipo_area", "diag_pe_direito_m", "diag_toalheiro", "diag_janela"]);

/** Os grupos da visita que o Estúdio pergunta, com o nome que aparece no passo «Fechar». */
export interface GrupoVisita { id: "exterior" | "interior" | "area" | "escolhas"; nome: string; campos: Def[] }
const BASE: GrupoVisita[] = [
  { id: "exterior", nome: "Exterior do edifício", campos: EXTERIOR.campos },
  { id: "interior", nome: "Interior do espaço", campos: INTERIOR.campos },
  { id: "area", nome: "A divisão", campos: AREA.campos },
  { id: "escolhas", nome: "As escolhas do cliente", campos: ESCOLHAS.campos },
];
/** Os grupos para o Estúdio a partir dos da empresa (efetivo): os ocultos não vão. */
export function gruposParaEstudio(gs: Record<GrupoVisita["id"], Grupo>): GrupoVisita[] {
  return BASE.filter((b) => !gs[b.id].oculto).map((b) => ({ ...b, campos: gs[b.id].campos }));
}
const grupos = (p?: Pick<Projeto, "camposVisita">): GrupoVisita[] => (p?.camposVisita?.length ? p.camposVisita : BASE);

/** Uma pergunta do Estúdio: o campo, com o grupo da visita a que pertence e o bloco do passo «Fechar». */
export interface DefEstudio extends Def { grupo: GrupoVisita["id"] }
/** As perguntas da visita a fazer no Estúdio, pela ordem da visita. */
export const perguntasDoEstudio = (p?: Pick<Projeto, "camposVisita">): DefEstudio[] =>
  grupos(p).flatMap((g) => g.campos.filter((c) => !DO_ESTUDIO.has(c.k)).map((c) => ({
    ...c, grupo: g.id,
    // o exterior e o interior têm sub-blocos («Acesso e estacionamento»): ficam com o nome do grupo à frente
    bloco: g.id === "exterior" || g.id === "interior" ? (c.bloco ? `${g.nome} · ${c.bloco}` : g.nome) : c.bloco ?? g.nome,
  })));

/** A chave no negócio: as da área levam o prefixo da divisão quando o Estúdio não é a divisão principal. */
export const chaveNoNegocio = (c: Pick<Def, "k"> & { grupo?: GrupoVisita["id"] }, prefixo = ""): string =>
  (c.grupo ? c.grupo === "area" : AREA.campos.some((a) => a.k === c.k)) ? prefixo + c.k : c.k;

/** O prefixo das chaves da área para a divisão do Estúdio (vazio na divisão principal). */
export function prefixoDoEstudio(f: Record<string, string>, divisao?: Projeto["divisao"]): string {
  const dp = divisaoPrincipal(f);
  return divisao && dp && dp !== divisao ? prefixoDivisao(divisao) : "";
}

/** As respostas que o negócio já tem a estas perguntas (para o Estúdio as mostrar respondidas). */
export function respostasDoNegocio(f: Record<string, string>, prefixo: string, p?: Pick<Projeto, "camposVisita">): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of perguntasDoEstudio(p)) { const k = chaveNoNegocio(c, prefixo), v = f[k]; if (v != null && v !== "") out[k] = v; }
  return out;
}

/** O que serve para decidir se uma pergunta aparece (as condições «@divisao», «@divisoes» e as de outro campo), visto do Estúdio. */
function valoresParaVer(p: Projeto): Record<string, string> {
  const pre = p.prefixoPerguntas ?? "", div = p.divisao ?? "Casa de banho";
  const v: Record<string, string> = { diag_tipo_area: div, diag_div_principal: div };
  for (const c of perguntasDoEstudio(p)) { const r = p.perguntas?.[chaveNoNegocio(c, pre)]; if (r) v[c.k] = r; }
  return v;
}

export interface Pergunta { c: DefEstudio; k: string; v: string; obrigatoria: boolean }
/** As perguntas que aparecem para este projeto, com a chave no negócio e a resposta (vazia: por responder). */
export function perguntasDe(p: Projeto): Pergunta[] {
  const pre = p.prefixoPerguntas ?? "", ver = valoresParaVer(p);
  return perguntasDoEstudio(p).filter((c) => visivel(c, ver)).map((c) => {
    const k = chaveNoNegocio(c, pre);
    return { c, k, v: p.perguntas?.[k] ?? "", obrigatoria: obrigatorio(c) };
  });
}
export const faltamPerguntas = (p: Projeto): Pergunta[] => perguntasDe(p).filter((x) => x.obrigatoria && !x.v.trim());
