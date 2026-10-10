// Os negócios de exemplo das pessoas da seed, só para mostrar o que o modelo permite. Dados puros: nada aqui toca no Estado, na seed nem na VERSAO.
// Um negócio tem fases e UM OU MAIS orçamentos; no fim, os orçamentos geram UMA proposta (e, se o negócio exigir, um contrato).
// O negócio real de cada pessoa (o da seed) vem sempre primeiro, de negociosDe (negociosApp.ts); estes juntam-se a ele.
import type { LinhaId } from "./motor";

export type EstadoProposta = "por gerar" | "enviada" | "aceite";
export type EstadoContrato = "por gerar" | "enviado" | "assinado";

export interface ExemploNegocio {
  /** Número do negócio de exemplo: estável e acima de todos os da seed (até 1050) e de S.seq (que começa em 1046). */
  id: number;
  titulo: string;
  /** Casa de banho ou cozinha, para os filtros da V2; vazio nos serviços que não são nenhuma das duas. */
  linhas: LinhaId[];
  /** Quando entrou ("dd/mm"). */
  quando: string;
  orcamentos: { titulo: string; valor: number }[];
  proposta: EstadoProposta;
  /** `null`: o negócio não exige contrato (venda direta); o ganho é a proposta aceite. */
  contrato: EstadoContrato | null;
  /** Negócio perdido: o motivo, em poucas palavras. */
  perdido?: string;
}

/** Os negócios de exemplo por pessoa (pelo nome). Quem não está aqui só tem o negócio da seed. */
export const EXEMPLOS: Readonly<Record<string, readonly ExemploNegocio[]>> = {
  "Carla Nunes": [
    { id: 90101, titulo: "Casa de banho e pintura", linhas: ["wc"], quando: "04/10", proposta: "por gerar", contrato: "por gerar",
      orcamentos: [{ titulo: "Casa de banho completa", valor: 4850 }, { titulo: "Pintura e tetos", valor: 1920 }] },
    { id: 90102, titulo: "Varanda fechada", linhas: [], quando: "07/10", proposta: "enviada", contrato: null,
      orcamentos: [{ titulo: "Caixilharia em alumínio", valor: 3480 }, { titulo: "Caixilharia com corte térmico", valor: 4260 }] },
  ],
  "Sérgio Pinto": [
    { id: 90103, titulo: "Pintura interior", linhas: [], quando: "08/10", proposta: "por gerar", contrato: "por gerar",
      orcamentos: [{ titulo: "Pintura de três divisões", valor: 1380 }] },
  ],
  "Tiago Almeida": [
    { id: 90104, titulo: "Climatização e isolamento", linhas: [], quando: "02/10", proposta: "aceite", contrato: null,
      orcamentos: [{ titulo: "Ar condicionado (três unidades)", valor: 4200 }, { titulo: "Isolamento do teto", valor: 2350 }] },
    { id: 90105, titulo: "Pintura exterior", linhas: [], quando: "09/10", proposta: "por gerar", contrato: "por gerar",
      orcamentos: [{ titulo: "Pintura da fachada", valor: 5600 }] },
  ],
  "Joana Ribeiro": [
    { id: 90106, titulo: "WC de serviço e lavandaria", linhas: ["wc"], quando: "06/10", proposta: "aceite", contrato: "enviado",
      orcamentos: [{ titulo: "WC de serviço", valor: 3150 }, { titulo: "Lavandaria", valor: 2080 }] },
  ],
  "Marta Lima": [
    { id: 90107, titulo: "Cozinha nova", linhas: ["coz"], quando: "08/10", proposta: "por gerar", contrato: "por gerar",
      orcamentos: [{ titulo: "Cozinha completa", valor: 7450 }] },
    { id: 90108, titulo: "Pavimento exterior", linhas: [], quando: "20/09", proposta: "enviada", contrato: "por gerar", perdido: "preço",
      orcamentos: [{ titulo: "Pavimento em pedra", valor: 2640 }] },
  ],
  "Rita Sousa": [
    { id: 90109, titulo: "WC social", linhas: ["wc"], quando: "26/09", proposta: "enviada", contrato: "por gerar", perdido: "adiou",
      orcamentos: [{ titulo: "WC social", valor: 2950 }] },
  ],
};
