// Os portões dos passos das Fases 3 e 4: o que falta para cada um avançar. Funções puras que reaproveitam a validação que já existe
// (`validarLevantamento`, `validarNovoNegocio`) em vez de a repetir; o ecrã traduz cada falta
// (`pessoasPagina.gate.<falta>`) para o botão explicar o que falta em vez de falhar em silêncio.
import { validarLevantamento, type LevantamentoForm, type LinhaForm } from "@/components/negocio-metas/levantamento";
import { VALOR_MAXIMO_ORCAMENTO } from "@/components/negocio-metas/negocioAcoes";
import { validarNovoNegocio } from "@/components/negocio-metas/novoNegocio";
import type { VisitaPessoa } from "../pessoasTipos";
import type { ErrosCondicoes } from "./condicoesProposta";
import { DESCONTO_MAXIMO, type Verificacao } from "./orcamentoCalculo";
import type { DirecaoOrcamento } from "./orcamentoDetalhado";

/** O que pode faltar. Cada valor tem texto em `pessoasPagina.gate.<falta>`. */
export type FaltaProcesso =
  | "dataVisita" | "visita" | "visitaFeita" | "linhas" | "linhaInvalida" | "pessoa"
  | "orcamentoLinhas" | "orcamentoValor" | "semOrcamento" | "margem" | "abaixoDoCusto" | "semPedido" | "porVerificar" | "condicoes"
  | "orcamentoNaoGuardado" | "negocioDesapareceu" | "descontoInvalido";

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

/** Guardar o orçamento: pelo menos uma linha. */
export function portaoGuardarOrcamento(linhas: readonly unknown[]): Portao {
  return portao(linhas.length === 0 ? ["orcamentoLinhas"] : []);
}

/** O desconto tem de ser um número de 0 a `DESCONTO_MAXIMO` % (o formulário já o pede, o portão não confia nele). */
export function portaoDesconto(desconto: number): Portao {
  return portao(Number.isFinite(desconto) && desconto >= 0 && desconto <= DESCONTO_MAXIMO ? [] : ["descontoInvalido"]);
}

/** O total do orçamento tem de caber no que um orçamento aceita: mais de zero e até ao máximo (`VALOR_MAXIMO_ORCAMENTO`). */
export function portaoValorOrcamento(total: number): Portao {
  return portao(total > 0 && total <= VALOR_MAXIMO_ORCAMENTO ? [] : ["orcamentoValor"]);
}

/** Verificar o orçamento: só com um orçamento (detalhado) que tenha linhas. */
export function portaoVerificarOrcamento(orcamento: { linhas: readonly unknown[] } | undefined): Portao {
  if (orcamento === undefined) return portao(["semOrcamento"]);
  return portaoGuardarOrcamento(orcamento.linhas);
}

/** Os bloqueios da verificação: um preço abaixo do custo (a Direção não o aprova) ou margem por resolver. */
export function portaoMargem(verificacao: Pick<Verificacao, "bloqueios" | "duro">): Portao {
  if (verificacao.duro) return portao(["abaixoDoCusto"]);
  return portao(verificacao.bloqueios.length > 0 ? ["margem"] : []);
}

/** A resposta da Direção: só há o que registar com o pedido feito. */
export function portaoResponderDirecao(direcao: DirecaoOrcamento | undefined): Portao {
  return portao(direcao === "pedida" ? [] : ["semPedido"]);
}

/**
 * Enviar a proposta: o orçamento verificado (ou com a exceção aprovada) e as condições completas. As condições só travam quando já
 * se conhecem os erros (o botão do passo abre o diálogo que as pede; o diálogo e a transição conhecem-nos).
 */
export function portaoEnviarProposta(dados: { verificado: boolean; erros?: ErrosCondicoes }): Portao {
  return portao([
    ...(dados.verificado ? [] : (["porVerificar"] as const)),
    ...(dados.erros !== undefined && Object.keys(dados.erros).length > 0 ? (["condicoes"] as const) : []),
  ]);
}
