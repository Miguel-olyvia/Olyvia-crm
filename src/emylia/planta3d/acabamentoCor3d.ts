// 25/11: que atributos dão a COR e a FOTO ao 3D, POR NOME, depois da separação Cor/Acabamento (migration 20270126430000_separar_cor_acabamento_mudelar.sql).
// Antes só havia «Cor do corpo», «Cor da frente» e «Cor»; a migration passa as madeiras, os decors e os metais para atributos novos (as opções mantêm id, foto e hex):
//   «Acabamento do corpo» (era «Cor do corpo»), «Acabamento da frente» (era «Cor da frente») e «Acabamento da cor» (era «Cor»; a alternativa de nome é «Decor»).
// Cada atributo tem um PAPEL (a zona que pinta: corpo, frente ou geral = as zonas sem atributo próprio) e um NÍVEL: o acabamento (0), a «Decor» (1), o «Acabamento» ORIGINAL (2: Natural,
// Frost Plus… não é cor) e a cor (3). Dentro do mesmo papel o nível mais baixo manda: a foto de um acabamento tem prioridade sobre a cor lisa. Um acabamento só conta quando a opção
// escolhida dá aspeto (foto, hex, ou metal/superfície com «Tem aspeto»): «Halifax» sem nada não tapa a cor. O «Acabamento» original só entra depois de a separação estar feita (há um
// atributo novo), para sem nenhum destes atributos o 3D ficar EXACTAMENTE como antes. Puro: sem React nem three.
import type { AtributoDef, AtributoProduto, OpcaoAtributo } from "../v2/catalogoModelo";
import { ehAtributoDeSuperficie } from "./aspetoZonas";
import { sem } from "./catalogo3d";

export type PapelCor = "corpo" | "frente" | "geral";
/** 0 acabamento da zona (ou da cor), 1 «Decor», 2 «Acabamento» original, 3 cor lisa. */
export type NivelCor = 0 | 1 | 2 | 3;
export interface ClasseCor { papel: PapelCor; nivel: NivelCor }

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export const hexValido = (hex: string | null | undefined): hex is string => !!hex && HEX.test(hex);
/** A ordem dos papéis quando só há UMA foto para o objecto inteiro: o corpo, depois a frente, depois o geral (a prioridade de sempre). */
const ORDEM_PAPEL: Readonly<Record<PapelCor, number>> = { corpo: 0, frente: 1, geral: 2 };
/** A posição de um atributo na lista única (foto e cor únicas): o papel e, dentro dele, o acabamento antes da cor. */
export const ordemUnica = (c: ClasseCor): number => ORDEM_PAPEL[c.papel] * 10 + c.nivel;

/** A classe de um atributo pelo nome (ou pelo código dos atributos novos); sem nenhum destes nomes: null. Os três nomes de sempre são avaliados primeiro, tal como antes. */
function classeDoNome(d: Pick<AtributoDef, "nome" | "codigo">): ClasseCor | null {
  const n = sem(d.nome).trim(), c = d.codigo.toLowerCase();
  if (n === "cor do corpo") return { papel: "corpo", nivel: 3 };
  if (n === "cor da frente") return { papel: "frente", nivel: 3 };
  if (n === "cor" || c === "cor") return { papel: "geral", nivel: 3 };
  if (n === "acabamento do corpo" || c === "acabamento_corpo") return { papel: "corpo", nivel: 0 };
  if (n === "acabamento da frente" || c === "acabamento_frente") return { papel: "frente", nivel: 0 };
  if (n === "acabamento da cor" || c === "acabamento_cor") return { papel: "geral", nivel: 0 };
  if (n === "decor" || c === "decor") return { papel: "geral", nivel: 1 };
  if (n === "acabamento" || c === "acabamento") return { papel: "geral", nivel: 2 };
  return null;
}

/** A classe que o NOME dá a um atributo (o papel: a zona que pinta pelo nome; o nível), ou null. Para quem só tem o nome (o painel «Zona» do 3D). */
export const classeDoNomeDe = (nome: string, codigo = ""): ClasseCor | null => classeDoNome({ nome, codigo });

/** A classe de cada atributo (por id). O «Acabamento» original só entra com um atributo novo (acabamento do corpo/frente/cor ou «Decor») presente. */
export function classesDosAtributos(defs: readonly AtributoDef[]): Map<string, ClasseCor> {
  const m = new Map<string, ClasseCor>();
  for (const d of defs) { const c = classeDoNome(d); if (c) m.set(d.id, c); }
  const separado = [...m.values()].some((c) => c.nivel === 0 || c.nivel === 1);
  if (!separado) for (const [id, c] of m) if (c.nivel === 2) m.delete(id);
  return m;
}

/** O atributo é um acabamento (nível 0 a 2): só conta se a opção escolhida der aspeto. */
export const ehAcabamento = (c: ClasseCor | undefined): boolean => !!c && c.nivel < 3;

/** A opção dá aspeto ao 3D: foto, hex válido, ou (com «Tem aspeto» no atributo) metal ou superfície. */
export function daAspeto(d: AtributoDef, o: OpcaoAtributo | undefined): boolean {
  return !!o && (!!o.foto || hexValido(o.hex) || (d.temAspeto === true && (o.metal === true || !!o.superficie)));
}

/** A opção que o produto escolheu neste atributo (ou undefined). */
export const opcaoEscolhida = (d: AtributoDef, attrs: readonly AtributoProduto[]): { opcao: OpcaoAtributo | undefined } | null => {
  const a = attrs.find((x) => x.atributoId === d.id && x.opcaoId);
  return a ? { opcao: d.opcoes.find((o) => o.id === a.opcaoId) } : null;
};

/**
 * O hex do «Acabamento da cor» (o metal da torneira, o decor da cerâmica) escolhido: o primeiro, por nível, com hex válido. Nenhum: undefined (segue a «Cor»).
 */
export function hexDoAcabamentoGeral(attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined): string | undefined {
  if (!attrs?.length || !defs?.length) return undefined;
  const classes = classesDosAtributos(defs);
  const fontes = defs.filter((d) => (d.temHex || d.temFoto) && classes.get(d.id)?.papel === "geral" && ehAcabamento(classes.get(d.id))).sort((a, b) => classes.get(a.id)!.nivel - classes.get(b.id)!.nivel);
  for (const d of fontes) {
    const e = opcaoEscolhida(d, attrs);
    if (hexValido(e?.opcao?.hex)) return e!.opcao!.hex!;
  }
  return undefined;
}

/* ------------------------------------------------------------------ o que o 3D lê de cada atributo, por omissão (para o painel «Ligações») */
/** Um atributo que o 3D pode ler (tem hex, foto ou aspeto) e se, SEM configuração do produto, se aplica por omissão (e onde). */
export interface LeituraPorOmissao { id: string; nome: string; aplicado: boolean; onde: string; /** 26/11: dá a superfície (Brilho, Tonalidade) e não a cor: o painel di-lo em palavras («dá a superfície a…»). */ daSuperficie?: boolean }
const ONDE: Readonly<Record<PapelCor, string>> = { corpo: "pinta o corpo", frente: "pinta a frente", geral: "pinta as zonas sem atributo próprio" };

/**
 * TODOS os atributos de lista com hex, foto ou aspeto, e o estado por omissão de cada um (sem configuração do produto): os nomes conhecidos (Cor, Cor do corpo, Cor da frente, os acabamentos,
 * Decor, e o Brilho/Tonalidade com «Tem aspeto») aplicam-se; o único atributo de cor aplica-se a tudo (a regra de sempre); qualquer outro (Puxador…) fica desligado, para não pintar o corpo por engano.
 */
export function leiturasPorOmissao(defs: readonly AtributoDef[] | undefined): LeituraPorOmissao[] {
  const lista = (defs ?? []).filter((d) => d.tipo === "lista" && (d.temHex || d.temFoto || d.temAspeto));
  const classes = classesDosAtributos(lista);
  const cores = lista.filter((d) => d.temHex || d.temFoto);
  return lista.map((d) => {
    const c = classes.get(d.id);
    if (c && (d.temHex || d.temFoto)) return { id: d.id, nome: d.nome, aplicado: true, onde: ONDE[c.papel] };
    if (ehAtributoDeSuperficie(d)) return { id: d.id, nome: d.nome, aplicado: true, onde: "dá a superfície a todas as zonas", daSuperficie: true };
    if (cores.length === 1 && cores[0].id === d.id) return { id: d.id, nome: d.nome, aplicado: true, onde: "é o único atributo de cor: pinta tudo" };
    return { id: d.id, nome: d.nome, aplicado: false, onde: "" };
  });
}

/** A opção que o produto escolheu num atributo, para a amostra (foto > cor) e o nome. */
export interface OpcaoDaLeitura { nome: string; hex: string | null; foto: string | null }
/** Uma leitura de um atributo QUE O PRODUTO TEM: com a opção escolhida e se o atributo dá cor ou foto (`daCor`; o «Brilho», só com aspeto, lê-se mas não é cor). */
export interface LeituraDoProduto extends LeituraPorOmissao {
  opcao: OpcaoDaLeitura; daCor: boolean;
  /** 26/11: o atributo dá a SUPERFÍCIE das zonas (Brilho ou Tonalidade com «Tem aspeto»): o painel «Aspeto 3D» mostra-o na camada «Superfície», e não na «Cor» (a não ser que também tenha hex ou foto). */
  daSuperficie: boolean;
}

/**
 * 25/11: só os atributos que o PRODUTO tem, isto é, com uma opção escolhida (que ainda existe no atributo), e que o 3D lê (hex, foto ou aspeto). O estado por omissão de cada um (`aplicado`)
 * vem do conjunto de TODOS os atributos do sistema (leiturasPorOmissao), porque é assim que o 3D decide («o único atributo de cor» conta os do sistema): filtrar só depois. Pela ordem das definições.
 */
export function leiturasDoProduto(defs: readonly AtributoDef[] | undefined, attrs: readonly AtributoProduto[] | undefined): LeituraDoProduto[] {
  if (!defs?.length || !attrs?.length) return [];
  const porId = new Map(defs.map((d) => [d.id, d]));
  const lidos: LeituraDoProduto[] = [];
  for (const l of leiturasPorOmissao(defs)) {
    const d = porId.get(l.id);
    const e = d ? opcaoEscolhida(d, attrs)?.opcao : undefined;
    if (!d || !e) continue;
    lidos.push({ ...l, opcao: { nome: e.nome, hex: hexValido(e.hex) ? e.hex : null, foto: e.foto || null }, daCor: d.temHex === true || d.temFoto === true, daSuperficie: ehAtributoDeSuperficie(d) });
  }
  return lidos;
}
