// Os portões dos passos das Fases 3 e 4: o que falta para cada um avançar. Funções puras que reaproveitam a validação que já existe
// (`validarLevantamento`, `validarNovoNegocio`) em vez de a repetir; o ecrã traduz cada falta
// (`pessoasPagina.gate.<falta>`) para o botão explicar o que falta em vez de falhar em silêncio.
import { validarLevantamento, type LevantamentoForm, type LinhaForm } from "@/components/negocio-metas/levantamento";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { VALOR_MAXIMO_ORCAMENTO } from "@/components/negocio-metas/negocioAcoes";
import { validarNovoNegocio } from "@/components/negocio-metas/novoNegocio";
import { proximaVisitaDoNegocio } from "@/components/negocio-metas/visitasNegocio";
import type { ErrosCondicoes } from "./condicoesProposta";
import { DESCONTO_MAXIMO, type Verificacao } from "./orcamentoCalculo";
import type { DirecaoOrcamento } from "./orcamentoDetalhado";

/** O que pode faltar. Cada valor tem texto em `pessoasPagina.gate.<falta>`. */
export type FaltaProcesso =
  | "dataVisita" | "visita" | "linhaInvalida" | "pessoa"
  | "orcamentoLinhas" | "orcamentoValor" | "semOrcamento" | "margem" | "abaixoDoCusto" | "semPedido" | "porVerificar" | "condicoes"
  | "orcamentoNaoGuardado" | "negocioDesapareceu" | "descontoInvalido" | "pessoaPerdida" | "pedidoDesapareceu";

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

/** Os erros do levantamento como faltas: só há linhas por acabar (haver linhas é opcional). */
const faltasDoLevantamento = (erros: ErrosDeLevantamento): FaltaProcesso[] => (erros.linhas ? ["linhaInvalida"] : []);

type VisitasDoPedido = readonly Pick<VisitaNegocio, "estado">[];

const haVisitaFeita = (visitas: VisitasDoPedido): boolean => visitas.some((v) => v.estado === "feita");
const haVisita = (visitas: VisitasDoPedido): boolean => visitas.some((v) => v.estado !== "cancelada");

/**
 * Marcar a visita como feita (abrir o painel de visita e levantamento do pedido): tem de haver uma visita, e a próxima por fazer
 * com data (pode ser de um dia que já passou: é o caso normal). Com todas as visitas já feitas o painel abre na mesma (faltam as medidas).
 */
export function portaoVisitaFeita(pedido: { visitas: readonly VisitaNegocio[] } | null): Portao {
  if (pedido === null || !haVisita(pedido.visitas)) return portao(["visita"]);
  const proxima = proximaVisitaDoNegocio(pedido.visitas);
  return portao(proxima && proxima.data.trim() === "" ? ["dataVisita"] : []);
}

/**
 * Guardar a visita e o levantamento numa só gravação: o levantamento é opcional, mas as linhas que existirem têm de estar completas. Num
 * pedido novo (`exigirVisita`) tem de haver pelo menos uma visita que não esteja cancelada.
 */
export function portaoLevantamento(dados: { visitas: VisitasDoPedido; linhas: readonly LinhaForm[]; exigirVisita?: boolean }): Portao {
  const estado = haVisitaFeita(dados.visitas) ? "feito" : "porFazer";
  const faltas = faltasDoLevantamento(validarLevantamento(levantamentoDeLinhas(dados.linhas, estado)));
  return portao([...(dados.exigirVisita && !haVisita(dados.visitas) ? (["visita"] as const) : []), ...faltas]);
}

/**
 * Criar o negócio: só a pessoa é obrigatória (e as linhas de medidas que existirem têm de estar completas). A visita e o levantamento
 * são opcionais: sem visita, com visitas por fazer ou com uma feita e sem linhas, nada mais se exige.
 */
export function portaoCriarNegocio(dados: { pessoaId: string; visitas: VisitasDoPedido; linhas: readonly LinhaForm[] }): Portao {
  const erros = validarNovoNegocio({
    pessoaId: dados.pessoaId, levantamento: levantamentoDeLinhas(dados.linhas, haVisitaFeita(dados.visitas) ? "feito" : "porFazer"),
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
