// Os portões dos passos da Fase 3: o que falta para cada um avançar. Funções puras que reaproveitam a validação que já existe
// (`validarLevantamento`, `validarNovoNegocio`) em vez de a repetir; o ecrã traduz cada falta
// (`pessoasPagina.gate.<falta>`) para o botão explicar o que falta em vez de falhar em silêncio.
import { validarLevantamento, type LevantamentoForm, type LinhaForm } from "@/components/negocio-metas/levantamento";
import { validarNovoNegocio } from "@/components/negocio-metas/novoNegocio";
import type { VisitaPessoa } from "../pessoasTipos";

/** O que pode faltar. Cada valor tem texto em `pessoasPagina.gate.<falta>`. */
export type FaltaProcesso =
  | "dataVisita" | "visita" | "visitaFeita" | "linhas" | "linhaInvalida" | "pessoa";

export interface Portao {
  ok: boolean;
  /** O que falta, por ordem de importância; vazio quando `ok`. */
  emFalta: FaltaProcesso[];
}

const portao = (emFalta: FaltaProcesso[]): Portao => ({ ok: emFalta.length === 0, emFalta });

/** O levantamento só com o que a validação olha (as linhas e o estado); o resto não conta para os portões. */
const levantamentoDeLinhas = (linhas: readonly LinhaForm[], estado: LevantamentoForm["estado"]): LevantamentoForm => ({
  data: "", feitoPor: "", estado, linhas: [...linhas], observacoes: "",
});

type ErrosDeLevantamento = ReturnType<typeof validarLevantamento>;

/** Os erros do levantamento como faltas: nenhuma linha, ou linhas por acabar. */
const faltasDoLevantamento = (erros: ErrosDeLevantamento): FaltaProcesso[] => [
  ...(erros.levantamento ? (["linhas"] as const) : []), ...(erros.linhas ? (["linhaInvalida"] as const) : []),
];

/** Marcar a visita como feita: tem de haver uma visita, com data (pode ser de um dia que já passou: é o caso normal). */
export function portaoVisitaFeita(visita: Pick<VisitaPessoa, "data" | "feita"> | null): Portao {
  if (visita === null) return portao(["visita"]);
  return portao(visita.data.trim() === "" ? ["dataVisita"] : []);
}

/** Abrir o levantamento: a visita tem de estar feita. */
export function portaoFazerLevantamento(visita: Pick<VisitaPessoa, "feita"> | null): Portao {
  return portao(visita?.feita === true ? [] : ["visitaFeita"]);
}

/** O levantamento está feito: a visita feita e pelo menos uma linha de medidas, todas completas. */
export function portaoLevantamento(dados: { visitaFeita: boolean; linhas: readonly LinhaForm[] }): Portao {
  const faltas = faltasDoLevantamento(validarLevantamento(levantamentoDeLinhas(dados.linhas, "feito")));
  return portao([...(dados.visitaFeita ? [] : (["visitaFeita"] as const)), ...faltas]);
}

/**
 * Criar o negócio: a pessoa e, se a visita está feita, pelo menos uma linha de medidas (a regra de `validarNovoNegocio`,
 * que pede o levantamento quando o estado é "feito").
 */
export function portaoCriarNegocio(dados: { pessoaId: string; visitaFeita: boolean; linhas: readonly LinhaForm[] }): Portao {
  const erros = validarNovoNegocio({
    pessoaId: dados.pessoaId, levantamento: levantamentoDeLinhas(dados.linhas, dados.visitaFeita ? "feito" : "porFazer"),
  });
  return portao([...(erros.pessoaId ? (["pessoa"] as const) : []), ...faltasDoLevantamento(erros)]);
}
