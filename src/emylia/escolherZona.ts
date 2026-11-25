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
}

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
  const resto = valor.filter((l) => l.zona !== zona);
  const antes = ligacoesDaConfig(resto).ligacoes;
  const resultado: Ligacao[] = [...resto];
  const tem = (atributo: string, z: Ligacao["zona"]): boolean => resultado.some((l) => l.atributo === atributo && l.zona === z);
  // o que ainda cobre a zona sem ser por uma ligação dela (só pode ser «Tudo»): exclui-se dela, salvo o atributo escolhido
  const escolhido = escolha.tipo === "atributo" ? escolha.id : null;
  const doNome = ctx.pelaNome?.(zona) ?? [];
  // «Pelo nome»: o atributo do nome da zona, mesmo que coberto por «Tudo», continua a pintá-la (é o que o nome diz)
  const ficaPeloNome = (id: string): boolean => escolha.tipo === "nome" && doNome.some((n) => n.id === id);
  for (const id of Object.keys(antes)) if (antes[id].includes(zona) && id !== escolhido && !ficaPeloNome(id)) resultado.push({ atributo: id, zona, aplicar: false });
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
