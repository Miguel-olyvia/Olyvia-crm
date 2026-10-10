// V2 da página de Negócios: só negócios a decorrer, UM CARTÃO POR NEGÓCIO, na coluna da fase dele
// (Orçamento, Proposta, Contrato, Financeiro). Os negócios vêm de negociosDe (negociosApp.ts): o da seed e os de exemplo.
// Funções puras: nada aqui muda o Estado.
import { aberto, proximo, type Estado, type LinhaId } from "./motor";
import { docFase, negociosDe, textoOrcamentos, valorNegocio, type DocFase, type NegocioApp } from "./negociosApp";

export { docFase, type DocFase } from "./negociosApp";

export const COLUNAS_V2: { id: DocFase; nome: string }[] = [
  { id: "orcamento", nome: "Orçamento" },
  { id: "proposta", nome: "Proposta" },
  { id: "contrato", nome: "Contrato" },
  { id: "financeiro", nome: "Financeiro" },
];

export interface LinhaCartaoV2 {
  rotulo: string;
  valor: number;
}

export interface CartaoV2 {
  id: string;
  /** A coluna: a fase do negócio. */
  doc: DocFase;
  /** O negócio base da pessoa, que se abre ao clicar no cartão (nos exemplos, o da mesma pessoa). */
  negocioId: number;
  nome: string;
  /** O que o cartão mostra por baixo do nome: o título do negócio e, havendo mais de um orçamento, "2 orçamentos". */
  servico: string;
  titulo: string;
  /** Quantos orçamentos tem o negócio. */
  orcamentos: number;
  local: string;
  /** Casa de banho e cozinha, para os filtros; vazio nos outros serviços. */
  linhasFiltro: LinhaId[];
  /** A soma dos orçamentos do negócio. */
  valor: number | null;
  proximo: string;
  /** Exemplo acrescentado só nesta camada; não existe no Estado. */
  demo: boolean;
  /** Os orçamentos do negócio, quando são mais de um. */
  linhas?: LinhaCartaoV2[];
  /** Já não existe "proposta conjunta" (é a proposta de um negócio com vários orçamentos), mas a V2 e a página de Leads ainda leem o campo: fica sempre por definir. */
  conjunta?: boolean;
}

function localDe(n: NegocioApp): string {
  const d = n.deal;
  return d.f.localidade || d.local.split(",").pop()!.trim();
}

function cartao(n: NegocioApp, doc: DocFase, S: Estado): CartaoV2 {
  return {
    id: n.id, doc, negocioId: n.negocioId, nome: n.nome, titulo: n.titulo, orcamentos: n.orcamentos.length, local: localDe(n),
    servico: [n.titulo, textoOrcamentos(n)].filter(Boolean).join(" · "), linhasFiltro: n.linhas, valor: valorNegocio(n), proximo: proximo(n.deal, S).t, demo: n.demo,
    ...(n.orcamentos.length > 1 ? { linhas: n.orcamentos.map((o) => ({ rotulo: o.titulo, valor: o.valor })) } : {}),
  };
}

/** A lista de cartões da V2: cada negócio a decorrer (o da seed e os de exemplo) é um cartão, na coluna da sua fase. Perdidos, levantamento e obra ficam de fora. */
export function cartoesV2(S: Estado): CartaoV2[] {
  const nomes = [...new Set(aberto(S).map((d) => d.nome))];
  return nomes.flatMap((nome) => negociosDe(S, nome).flatMap((n) => {
    const doc = docFase(n.deal);
    return doc ? [cartao(n, doc, S)] : [];
  }));
}

/** Pessoas ainda em lead, contacto ou visita (fases da pessoa, não do negócio). */
export function pessoasAntes(S: Estado): number {
  return aberto(S).filter((d) => d.fase < 3).length;
}

/** Quantos cartões tem cada pessoa (por nome). */
export function negociosPorPessoa(cs: CartaoV2[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of cs) m[c.nome] = (m[c.nome] || 0) + 1;
  return m;
}
