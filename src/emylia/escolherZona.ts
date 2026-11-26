// 25/11: escolher NO 3D que atributo pinta uma zona. Clica-se numa parte da peça (a zona dela fica escolhida) e diz-se «Pintar com: …». A escolha vira uma lista de ligações atributo → zona
// (config3dDados.ts, a mesma que o painel «Ligações» edita e que se guarda por produto); nada aqui grava. Puro: sem React nem three.
//   - um atributo: liga-o a essa zona. Um atributo ligado só pinta as zonas a que está ligado (os nomes deixam de contar para ele), por isso, se ainda não tinha ligações, ligam-se também as
//     zonas que ele já pintava pelo nome: escolher «Cor» para a frente não pode tirar a cor ao corpo.
//     Uma ligação explícita a uma zona MANDA sobre qualquer atributo que a pinte só pelo nome («Cor da frente» → frente, «Cor do corpo» → corpo): esses ficam excluídos dessa zona (aplicar: não),
//     senão, pela ordem das definições, o do nome ganhava ao escolhido e a escolha não se via.
//   - «Pelo nome» (como por omissão): tira as ligações dessa zona e repõe o nome: o atributo do nome da zona que tinha sido ligado a outras zonas volta a ligar-se a ela.
//   - «Nenhum»: todos os atributos de cor do produto com «aplicar: não» nessa zona.
// Uma ligação «Tudo» (a todas as zonas) que ainda cobria a zona fica excluída só dessa zona (a zona explícita vence «Tudo»).
import { ligacoesDaConfig, type Ligacao } from "./config3dDados";
import { chaveDeExclusao } from "./planta3d/aspetoZonas";
import type { ZonaGlb } from "./planta3d/zonasGlb";

export type EscolhaDaZona = { tipo: "nome" } | { tipo: "nenhum" } | { tipo: "atributo"; id: string };

export interface ContextoEscolha {
  /** Os atributos do produto que dão cor ou foto (os que se podem escolher para pintar). */
  atributosDaCor: readonly string[];
  /** As zonas que um atributo pinta hoje (pelas ligações em vigor ou pelo nome): o que se preserva ao ligá-lo a uma zona. */
  pintaHoje: (atributo: string) => readonly ZonaGlb[];
  /** Os atributos que pintam a zona SÓ pelo nome (id, e se é a cor lisa, e não um acabamento: só esta concorre com uma ligação). Ausente: não se conhece nenhum. */
  pelaNome?: (zona: ZonaGlb) => readonly { id: string; lisa: boolean }[];
  /**
   * 26/11: os atributos que dão a SUPERFÍCIE (Tonalidade, Brilho). Os que não dão cor ficam fora da escolha da cor: as regras deles nesta zona não se apagam nem se excluem ao escolher uma cor
   * (a superfície e a cor são duas camadas). Ausente: como era (tudo o que cobre a zona entra na escolha da cor).
   */
  atributosDeSuperficie?: readonly string[];
}

/** O contexto da escolha da superfície: os atributos de superfície do produto, pela ordem das definições. */
export interface ContextoSuperficie { atributosDeSuperficie: readonly string[] }

/**
 * O que a zona tem escolhido nas ligações em vigor: um atributo ligado a ela (a explícita ou «Tudo»; com vários, o que pinta hoje pelo nome `nomeQuePinta`, senão o primeiro dos `atributosDaCor`),
 * «nenhum» se TODOS os atributos de cor do produto estão excluídos dela, senão «pelo nome».
 */
export function escolhaAtualDaZona(
  valor: readonly Ligacao[], zona: ZonaGlb, atributosDaCor: readonly string[], nomeQuePinta?: string, nomeDe?: (id: string) => string | undefined,
): EscolhaDaZona {
  const { ligacoes, excluidos } = ligacoesDaConfig(valor);
  const ligados = Object.keys(ligacoes).filter((id) => ligacoes[id].includes(zona));
  if (ligados.length) {
    const doNome = nomeQuePinta && nomeDe ? ligados.find((id) => nomeDe(id) === nomeQuePinta) : undefined;
    const primeiro = atributosDaCor.find((id) => ligados.includes(id)) ?? ligados[0];
    return { tipo: "atributo", id: doNome ?? primeiro };
  }
  if (atributosDaCor.length > 0 && atributosDaCor.every((id) => excluidos.has(chaveDeExclusao(id, zona)))) return { tipo: "nenhum" };
  return { tipo: "nome" };
}

/** A lista de ligações depois de escolher `escolha` para a `zona`. Devolve uma lista nova; a recebida não se altera. */
export function aplicarEscolhaNaZona(valor: readonly Ligacao[], zona: ZonaGlb, escolha: EscolhaDaZona, ctx: ContextoEscolha): Ligacao[] {
  // 26/11: as regras de SUPERFÍCIE desta zona (que não são de cor) são de outra camada: ficam como estão
  const soSuperficie = new Set((ctx.atributosDeSuperficie ?? []).filter((id) => !ctx.atributosDaCor.includes(id)));
  const resto = valor.filter((l) => l.zona !== zona || soSuperficie.has(l.atributo));
  const antes = ligacoesDaConfig(resto).ligacoes;
  const resultado: Ligacao[] = [...resto];
  const tem = (atributo: string, z: Ligacao["zona"]): boolean => resultado.some((l) => l.atributo === atributo && l.zona === z);
  // o que ainda cobre a zona sem ser por uma ligação dela (só pode ser «Tudo»): exclui-se dela, salvo o atributo escolhido
  const escolhido = escolha.tipo === "atributo" ? escolha.id : null;
  const doNome = ctx.pelaNome?.(zona) ?? [];
  // «Pelo nome»: o atributo do nome da zona, mesmo que coberto por «Tudo», continua a pintá-la (é o que o nome diz)
  const ficaPeloNome = (id: string): boolean => escolha.tipo === "nome" && doNome.some((n) => n.id === id);
  for (const id of Object.keys(antes)) if (antes[id].includes(zona) && id !== escolhido && !ficaPeloNome(id) && !soSuperficie.has(id)) resultado.push({ atributo: id, zona, aplicar: false });
  if (escolha.tipo === "nome") {
    // repor o nome: o atributo do nome da zona que foi ligado a OUTRAS zonas (um atributo ligado deixa de pintar pelo nome) volta a pintá-la
    const { excluidos } = ligacoesDaConfig(resto);
    for (const n of doNome) if (antes[n.id]?.length && !antes[n.id].includes(zona) && !excluidos.has(chaveDeExclusao(n.id, zona)) && !tem(n.id, zona)) resultado.push({ atributo: n.id, zona, aplicar: true });
    return resultado;
  }
  if (escolha.tipo === "nenhum") {
    for (const id of ctx.atributosDaCor) if (!tem(id, zona)) resultado.push({ atributo: id, zona, aplicar: false });
    return resultado;
  }
  // a ligação explícita manda: a cor lisa que pinta a zona só pelo nome (e não está ligada a nada) deixa de a pintar
  for (const n of doNome) if (n.lisa && n.id !== escolha.id && !antes[n.id]?.length && !tem(n.id, zona)) resultado.push({ atributo: n.id, zona, aplicar: false });
  // um atributo sem ligações explícitas pintava pelo nome: ao ligá-lo, ligam-se também as zonas que ele já pintava, para não as perder
  if (!antes[escolha.id]?.length) for (const z of ctx.pintaHoje(escolha.id)) if (z !== zona && !tem(escolha.id, z)) resultado.push({ atributo: escolha.id, zona: z, aplicar: true });
  if (!tem(escolha.id, zona)) resultado.push({ atributo: escolha.id, zona, aplicar: true });
  return resultado;
}

/* ------------------------------------------------------------------ 26/11: a camada «Superfície» (Tonalidade, Brilho) */
/**
 * O que a superfície da zona tem escolhido nas regras em vigor: um atributo de superfície ligado a ela (a regra explícita ou «Todas as zonas»; com vários, o que decide hoje, `nomeQuePinta`,
 * senão o primeiro de `ids`), «nenhum» se TODOS os atributos de superfície estão excluídos dela, senão «nome» (automático: os que não têm regras actuam em todas as zonas).
 */
export function escolhaDeSuperficieDaZona(
  valor: readonly Ligacao[], zona: ZonaGlb, ids: readonly string[], nomeQuePinta?: string, nomeDe?: (id: string) => string | undefined,
): EscolhaDaZona {
  const { ligacoes, excluidos } = ligacoesDaConfig(valor);
  const ligados = ids.filter((id) => ligacoes[id]?.includes(zona));
  if (ligados.length) {
    const doNome = nomeQuePinta && nomeDe ? ligados.find((id) => nomeDe(id) === nomeQuePinta) : undefined;
    return { tipo: "atributo", id: doNome ?? ligados[0] };
  }
  if (ids.length > 0 && ids.every((id) => excluidos.has(chaveDeExclusao(id, zona)))) return { tipo: "nenhum" };
  return { tipo: "nome" };
}

/**
 * A lista de regras depois de escolher `escolha` para a superfície da `zona`. Devolve uma lista nova; a recebida não se altera. Só mexe nas regras desta zona dos atributos de superfície:
 *   - um atributo: os outros atributos de superfície que actuariam nesta zona ficam excluídos dela (a zona explícita vence «Todas as zonas»). Se o escolhido não tinha regras (actuava em
 *     todas as zonas), passa a ter «Todas as zonas»: as outras zonas ficam como estavam. Se estava limitado a outras zonas, ou desligado em tudo, liga-se a esta.
 *   - «nome» (automático): tira as regras desta zona e exclui dela os que a regra «Todas as zonas» ainda cobria; os que não têm regras continuam a actuar.
 *   - «nenhum» (sem superfície): todos os atributos de superfície que actuariam nesta zona ficam excluídos dela (a superfície por omissão da opção de cor continua a valer).
 */
export function aplicarSuperficieNaZona(valor: readonly Ligacao[], zona: ZonaGlb, escolha: EscolhaDaZona, ctx: ContextoSuperficie): Ligacao[] {
  const ids = ctx.atributosDeSuperficie, doZona = new Set(ids);
  const resto = valor.filter((l) => l.zona !== zona || !doZona.has(l.atributo));
  const { ligacoes: antes, excluidos } = ligacoesDaConfig(resto);
  const resultado: Ligacao[] = [...resto];
  const tem = (atributo: string, z: Ligacao["zona"]): boolean => resultado.some((l) => l.atributo === atributo && l.zona === z);
  // actua nesta zona (depois de tirar as regras dela): sem regras actua em todas; com regras, só onde elas chegam; um «não» nesta zona tira-o
  const actua = (id: string): boolean => !excluidos.has(chaveDeExclusao(id, zona)) && (antes[id]?.length ? antes[id].includes(zona) : true);
  const escolhido = escolha.tipo === "atributo" ? escolha.id : null;
  if (escolha.tipo === "nome") {
    for (const id of ids) if (antes[id]?.includes(zona)) resultado.push({ atributo: id, zona, aplicar: false });
    return resultado;
  }
  for (const id of ids) if (id !== escolhido && actua(id)) resultado.push({ atributo: id, zona, aplicar: false });
  if (escolhido === null) return resultado;
  if (!actua(escolhido)) { if (!tem(escolhido, zona)) resultado.push({ atributo: escolhido, zona, aplicar: true }); return resultado; }
  if (!antes[escolhido]?.length && !tem(escolhido, "tudo")) resultado.push({ atributo: escolhido, zona: "tudo", aplicar: true });
  return resultado;
}
