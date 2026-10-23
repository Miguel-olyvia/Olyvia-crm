// As escolhas fixas da ficha da pessoa. Copiadas do protótipo (os 5 resultados de uma chamada e os 5 motivos de perda),
// com um código estável em vez do texto, para a tradução (`pessoasPagina.result.*` e `pessoasPagina.lost.*`).
import type { MotivoPerda, PassoChamada, ResultadoContacto, ResultadoOuNenhum } from "./pessoasTipos";

export const RESULTADOS_CONTACTO: readonly ResultadoContacto[] = [
  "atendeuInteressado", "atendeuMaisTarde", "naoAtendeu", "semInteresse", "numeroErrado",
];

/** Só estes resultados contam como resposta: "Não atendeu" e "Número errado" não tiram a pessoa de "Voltou a contactar" (decisão de produto assumida, reversível). */
export const RESULTADOS_ATENDIDOS: readonly ResultadoContacto[] = ["atendeuInteressado", "atendeuMaisTarde"];

/** Os seis valores do filtro "Resultado do último contacto": os cinco da chamada e "Sem contacto" (nunca houve chamada). */
export const RESULTADOS_FILTRO: readonly ResultadoOuNenhum[] = [...RESULTADOS_CONTACTO, "semContacto"];

export const MOTIVOS_PERDA: readonly MotivoPerda[] = ["preco", "adiou", "outraEmpresa", "semResposta", "naoProcurava"];

export const PASSOS_CHAMADA: readonly PassoChamada[] = ["marcarVisita", "ligarData", "ligarAmanha", "ligarHoje", "perder", "nenhum"];

/** Quantos dias depois de hoje fica o próximo contacto; `null` quando o dia vem de outro lado (o escolhido) ou não há. */
export const DIAS_DO_PASSO: Record<PassoChamada, number | null> = {
  marcarVisita: null, ligarData: null, ligarAmanha: 1, ligarHoje: 0, perder: null, nenhum: null,
};

/** O máximo de caracteres da nota de uma chamada. */
export const LIMITE_NOTA_CHAMADA = 140;
