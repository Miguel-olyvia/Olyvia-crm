// As escolhas fixas da ficha da pessoa. Copiadas do protótipo (os 5 resultados de uma chamada e os 5 motivos de perda),
// com um código estável em vez do texto, para a tradução (`pessoasPagina.result.*` e `pessoasPagina.lost.*`).
import type { MotivoPerda, PassoChamada, ResultadoContacto } from "./pessoasTipos";

export const RESULTADOS_CONTACTO: readonly ResultadoContacto[] = [
  "atendeuInteressado", "atendeuMaisTarde", "naoAtendeu", "semInteresse", "numeroErrado",
];

/** Só estes resultados contam como resposta: "Não atendeu" e "Número errado" não tiram a pessoa de "Voltou a contactar" (decisão de produto assumida, reversível). */
export const RESULTADOS_ATENDIDOS: readonly ResultadoContacto[] = ["atendeuInteressado", "atendeuMaisTarde"];

export const MOTIVOS_PERDA: readonly MotivoPerda[] = ["preco", "adiou", "outraEmpresa", "semResposta", "naoProcurava"];

export const PASSOS_CHAMADA: readonly PassoChamada[] = ["ligarAmanha", "ligarHoje", "visitaOuOrcamento", "nenhum"];

/** Quantos dias depois de hoje fica o próximo contacto, para cada passo (o da visita ou do orçamento é uma suposição). */
export const DIAS_DO_PASSO: Record<PassoChamada, number | null> = {
  ligarAmanha: 1, ligarHoje: 0, visitaOuOrcamento: 2, nenhum: null,
};

/** O máximo de caracteres da nota de uma chamada. */
export const LIMITE_NOTA_CHAMADA = 140;
