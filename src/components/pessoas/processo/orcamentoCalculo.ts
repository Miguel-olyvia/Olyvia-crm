// O cálculo do orçamento e a verificação das margens. Funções puras, sem texto: a verificação devolve DADOS (que bloqueio, em que
// linha, que margem) e o ecrã escreve-os. A margem é sobre o valor sem IVA, depois do desconto; o custo não desce com o desconto.
import { CATALOGO, type ChaveTrabalho } from "./catalogoTrabalhos";

/** A margem mínima: abaixo dela o orçamento não se verifica sem a Direção. Decisão de produto: constante no código. */
export const MARGEM_MIN = 0.28;
/** A margem que se procura: abaixo dela só há um aviso, que não bloqueia. */
export const MARGEM_ALVO = 0.35;
export const DESCONTO_MAXIMO = 50;
const IVA_MAO_DE_OBRA = 0.06;
const IVA_MATERIAIS = 0.23;

/** Dois números iguais até aqui (o `0,28` exato calcula-se como 0,27999999…): a margem compara-se com esta folga. */
const FOLGA = 1e-9;

/** Uma linha do orçamento: um trabalho do catálogo, a quantidade e o preço unitário (sem IVA). */
export interface LinhaTrabalho {
  id: string;
  trabalho: ChaveTrabalho;
  quantidade: number;
  precoUnitario: number;
  /** O texto de um trabalho escrito à mão no levantamento ("outro"); os do catálogo têm o nome traduzido. */
  nome?: string;
}

export interface EntradaOrcamento {
  linhas: readonly LinhaTrabalho[];
  /** Percentagem de 0 a 50. */
  desconto: number;
}

export interface TotaisOrcamento {
  /** A soma das linhas, antes do desconto e sem IVA. */
  semDesconto: number;
  /** Depois do desconto, sem IVA: a base da margem. */
  semIva: number;
  iva: number;
  total: number;
  custo: number;
  /** De 0 a 1; 0 sem linhas. */
  margem: number;
}

export function totaisDoOrcamento({ linhas, desconto }: EntradaOrcamento): TotaisOrcamento {
  let maoDeObra = 0;
  let materiais = 0;
  let custo = 0;
  for (const l of linhas) {
    const valor = l.quantidade * l.precoUnitario;
    if (CATALOGO[l.trabalho].tipo === "maoDeObra") maoDeObra += valor;
    else materiais += valor;
    custo += l.quantidade * CATALOGO[l.trabalho].custo;
  }
  const fator = 1 - desconto / 100;
  const semIva = (maoDeObra + materiais) * fator;
  const iva = maoDeObra * fator * IVA_MAO_DE_OBRA + materiais * fator * IVA_MATERIAIS;
  return { semDesconto: maoDeObra + materiais, semIva, iva, total: semIva + iva, custo, margem: semIva > 0 ? (semIva - custo) / semIva : 0 };
}

/** O que impede de verificar. "abaixoDoCusto" (por linha) e "vendaAbaixoDoCusto" (a venda toda) são duros: a Direção não os pode aprovar. */
export type Bloqueio =
  | { tipo: "abaixoDoCusto"; linha: string; trabalho: ChaveTrabalho; precoUnitario: number; custo: number; sugestao: number }
  /** Cada preço cobre o seu custo, mas o desconto leva a venda (sem IVA) para baixo do custo total: margem negativa. */
  | { tipo: "vendaAbaixoDoCusto"; semIva: number; custo: number }
  | { tipo: "margemBaixa"; margem: number }
  | { tipo: "descontoBaixaMargem"; margem: number };

/** Não bloqueia: só avisa. */
interface AvisoMargem {
  tipo: "abaixoDoAlvo";
  margem: number;
}

export interface Verificacao {
  totais: TotaisOrcamento;
  bloqueios: Bloqueio[];
  avisos: AvisoMargem[];
  /** Há um bloqueio duro (preço ou venda abaixo do custo): nunca é aprovável. */
  duro: boolean;
}

const abaixoDe = (margem: number, limite: number): boolean => margem + FOLGA < limite;

/** O preço unitário (inteiro, arredondado para cima) que dá pelo menos a margem mínima sobre o custo. */
const precoComMargemMinima = (custo: number): number => Math.ceil(custo / (1 - MARGEM_MIN) - FOLGA);

/**
 * Verifica o orçamento. Um preço unitário abaixo do custo é um bloqueio duro (um por linha); enquanto houver um, não se olha à
 * margem global. Uma venda cujo valor sem IVA, depois do desconto, fica abaixo do custo (margem negativa) também é duro: nunca se
 * aprova. Sem bloqueios duros, a margem global entre 0 % e o mínimo bloqueia, mas a Direção pode aprová-la (o desconto é a causa
 * quando, sem ele, passava) e, sem nenhum bloqueio, uma margem abaixo do alvo é só um aviso.
 */
export function verificarOrcamento(orcamento: EntradaOrcamento): Verificacao {
  const totais = totaisDoOrcamento(orcamento);
  const duros: Bloqueio[] = orcamento.linhas
    .filter((l) => l.precoUnitario < CATALOGO[l.trabalho].custo)
    .map((l) => ({
      tipo: "abaixoDoCusto", linha: l.id, trabalho: l.trabalho, precoUnitario: l.precoUnitario,
      custo: CATALOGO[l.trabalho].custo, sugestao: precoComMargemMinima(CATALOGO[l.trabalho].custo),
    }));
  if (duros.length > 0) return { totais, bloqueios: duros, avisos: [], duro: true };
  if (totais.semIva + FOLGA < totais.custo) {
    return { totais, bloqueios: [{ tipo: "vendaAbaixoDoCusto", semIva: totais.semIva, custo: totais.custo }], avisos: [], duro: true };
  }
  if (abaixoDe(totais.margem, MARGEM_MIN)) {
    const semDesconto = totaisDoOrcamento({ ...orcamento, desconto: 0 }).margem;
    const descontoCausa = orcamento.desconto > 0 && !abaixoDe(semDesconto, MARGEM_MIN);
    return { totais, bloqueios: [{ tipo: descontoCausa ? "descontoBaixaMargem" : "margemBaixa", margem: totais.margem }], avisos: [], duro: false };
  }
  const avisos: AvisoMargem[] = abaixoDe(totais.margem, MARGEM_ALVO) ? [{ tipo: "abaixoDoAlvo", margem: totais.margem }] : [];
  return { totais, bloqueios: [], avisos, duro: false };
}
