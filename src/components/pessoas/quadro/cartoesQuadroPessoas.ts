// O Quadro de Pessoas, em duas partes. A Parte 1 é a abordagem: um cartão por PESSOA que ainda não tem negócio aberto (Por contactar,
// Contactado, Visita, lidos dos registos dela). A Parte 2 são os negócios: um cartão por NEGÓCIO aberto (Levantamento, Orçamento, Proposta,
// Contrato). A mesma pessoa nunca está nas duas partes (ver `emAbordagem`). Funções puras: o dia de hoje chega por parâmetro. Perdidos e
// ganhos não têm cartão (um perdido volta ao anular a perda); uma pessoa perdida ou com a abordagem encerrada não tem nenhum.
import { valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { faseDoPercurso } from "@/components/negocio-metas/percursoNegocio";
import { passoDoNegocio, type ColunaAbordagem, type IdPasso } from "../etapaPessoa";
import type { PapelPessoa, ResumoPessoa } from "../pessoasTipos";

export type ColunaQuadro = ColunaAbordagem | "levantamento" | "orcamento" | "proposta" | "contrato";

/** A parte do quadro a que a coluna pertence. */
export type ParteDaColuna = "abordagem" | "negocio";

export interface DefColuna {
  id: ColunaQuadro;
  parte: ParteDaColuna;
  /** Colunas de negócio mostram a soma do valor; as da abordagem não. */
  negocio: boolean;
}

export const COLUNAS_QUADRO: readonly DefColuna[] = [
  { id: "porContactar", parte: "abordagem", negocio: false },
  { id: "contactado", parte: "abordagem", negocio: false },
  { id: "visita", parte: "abordagem", negocio: false },
  { id: "levantamento", parte: "negocio", negocio: true },
  { id: "orcamento", parte: "negocio", negocio: true },
  { id: "proposta", parte: "negocio", negocio: true },
  { id: "contrato", parte: "negocio", negocio: true },
];

export interface CartaoQuadro {
  /** O id do negócio, ou `pessoa-<id da pessoa>` num cartão da abordagem. */
  id: string;
  /** `pessoa`: um cartão da Parte 1; `negocio`: um da Parte 2. */
  tipo: "pessoa" | "negocio";
  pessoaId: string;
  nome: string;
  papel: PapelPessoa;
  coluna: ColunaQuadro;
  /** O serviço do negócio; `null` num cartão da abordagem, ou quando não há. */
  trabalho: string | null;
  /** O valor do orçamento escolhido; `null` num cartão da abordagem. */
  valor: number | null;
  passo: IdPasso;
  /** AAAA-MM-DD; `null` sem prazo. */
  prazo: string | null;
  /** O prazo é anterior a hoje. */
  atrasado: boolean;
  /** Só no Quadro real: dias parado (orçamento e proposta, acima do limite dos parados). Ausente no exemplo. */
  paradoDias?: number;
  /** Só no Quadro real: a base diz que o negócio está pronto a ganhar. Ausente no exemplo. */
  prontoAGanhar?: boolean;
}

/** Marca o botão do nome de um cartão de negócio; o valor é o id do negócio (o atalho `o` abre a ficha já nesse negócio). */
export const ATRIBUTO_NEGOCIO = "data-negocio-id";

/** O id do cartão (e do item do processo) de uma pessoa em abordagem. */
export const idCartaoPessoa = (pessoaId: string): string => `pessoa-${pessoaId}`;

const COLUNA_DO_PERCURSO = { levantamento: "levantamento", orcamento: "orcamento", proposta: "proposta", contrato: "contrato" } as const;

const passou = (prazo: string | null, hoje: string): boolean => prazo !== null && prazo < hoje;

function cartaoDaPessoa(r: ResumoPessoa, hoje: string): CartaoQuadro | null {
  if (r.parte !== "abordagem" || r.coluna === null) return null;
  const prazo = r.proximoContacto;
  return {
    id: idCartaoPessoa(r.pessoa.id), tipo: "pessoa", pessoaId: r.pessoa.id, nome: r.pessoa.nome, papel: r.papel, coluna: r.coluna, trabalho: null,
    valor: null, passo: r.proximo?.id ?? "nenhum", prazo, atrasado: passou(prazo, hoje),
  };
}

function cartaoDoNegocio(r: ResumoPessoa, n: NegocioMes, hoje: string): CartaoQuadro | null {
  const fase = faseDoPercurso(n, { registos: r.registos });
  if (fase === "ganho" || fase === "perdido") return null;
  const coluna = COLUNA_DO_PERCURSO[fase];
  return {
    id: n.id, tipo: "negocio", pessoaId: r.pessoa.id, nome: r.pessoa.nome, papel: r.papel, coluna, trabalho: n.servico, valor: fase === "levantamento" ? null : valorDoNegocio(n),
    passo: passoDoNegocio(n), prazo: n.proximoPrazo, atrasado: passou(n.proximoPrazo, hoje),
  };
}

/** Os cartões do quadro, pela ordem das pessoas recebidas (a da lista): o da abordagem, ou os dos negócios abertos dela. */
export function cartoesDoQuadro(resumos: readonly ResumoPessoa[], hoje: string): CartaoQuadro[] {
  return resumos.flatMap((r) => {
    // Quem está perdida não tem cartões, mesmo com negócios abertos: fica na ficha e na lista.
    if (r.pessoa.perdida) return [];
    const daPessoa = cartaoDaPessoa(r, hoje);
    return daPessoa ? [daPessoa] : r.abertos.flatMap((n) => cartaoDoNegocio(r, n, hoje) ?? []);
  });
}
