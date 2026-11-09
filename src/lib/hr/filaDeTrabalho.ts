/**
 * A FILA DE TRABALHO do mapa de assiduidade: tudo o que o RH tem por tratar, agrupado por PESSOA. Funcoes puras.
 *
 * O ecra mostra so as pessoas com problemas a resolver; ao abrir uma pessoa resolve-se tudo numa so lista (horas extra,
 * justificacoes, alertas do fim do dia), cada item com a etiqueta do seu tipo. Contador e lista saem do MESMO resultado
 * de `agruparPorPessoa`, por isso nao podem divergir.
 *
 * EXTENSIVEL: um tipo novo acrescenta-se a `TIPOS_DE_ITEM` (etiqueta, fonte, permissao), a `ItemFila` (uniao
 * discriminada) e ao aspecto no componente; nada mais muda aqui. Assim entraram as «ausencias por decidir» (a fila do
 * ecra de Ausencias, com a sua propria fonte) e o «desvio a validar» (fonte `desvios_a_validar`: `rpc_hr_desvios_listar`, ver `DesvioAValidar`).
 */
import { diasDeCalendarioEntre } from "@/lib/hr/periodoFolha";
import type { HoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { accoesDoPedido } from "@/lib/hr/ausencias";
import type { Desvio, PermissoesAssiduidade } from "@/types/hrAssiduidade";
import type { AusenciaPedido } from "@/types/hrAusencias";
import { podeSerHoraExtra } from "@/lib/hr/desviosBase";

/** Quantas horas extra pendentes a fila le (a pagina da base); acima disto diz-se e o contador mostra «N+». */
export const LIMITE_HORAS_EXTRA_NA_FILA = 500;
/** A partir de quantos dias do fim do periodo da folha a pessoa passa para o topo da lista. */
export const DIAS_AVISO_FECHO = 5;

/** As fontes da fila do mapa de assiduidade (as quatro que o hook `useFilaDeTrabalho` le de uma so vez). */
export type FonteFila = "horas_extra" | "justificacoes" | "desvios" | "desvios_a_validar";
/** A fonte da fila do ecra de Ausencias: os pedidos pendentes de decisao. */
export type FonteAusencias = "ausencias";
export type TipoFila = "hora_extra" | "justificacao" | "alerta" | "desvio_a_validar" | "ausencia";

/** Como correu a leitura de uma fonte. So `ok` permite dizer «ninguem tem nada por tratar». */
export type EstadoDeFonte = "ok" | "recusado" | "erro" | "indisponivel";

export interface DefinicaoDoTipo {
  tipo: TipoFila;
  fonte: FonteFila | FonteAusencias;
  /** Chave de traducao da etiqueta do tipo. */
  chaveEtiqueta: string;
  /** A permissao que decide as accoes do tipo; `null` quando quem decide e a base (justificacoes) ou varia por accao (alertas). */
  permissao: keyof PermissoesAssiduidade | null;
}

/** O registo de tipos, pela ordem em que aparecem nos contadores e no filtro. */
export const TIPOS_DE_ITEM: readonly DefinicaoDoTipo[] = [
  { tipo: "hora_extra", fonte: "horas_extra", chaveEtiqueta: "rhFila.tipo.hora_extra", permissao: "gerir" },
  { tipo: "justificacao", fonte: "justificacoes", chaveEtiqueta: "rhFila.tipo.justificacao", permissao: null },
  { tipo: "alerta", fonte: "desvios", chaveEtiqueta: "rhFila.tipo.alerta", permissao: null },
  { tipo: "desvio_a_validar", fonte: "desvios_a_validar", chaveEtiqueta: "rhFila.tipo.desvio_a_validar", permissao: null },
  { tipo: "ausencia", fonte: "ausencias", chaveEtiqueta: "rhFila.tipo.ausencia", permissao: null },
];

/** Todos os tipos do registo: servem para contar, etiquetar e ordenar. */
export const TIPOS_FILA: readonly TipoFila[] = TIPOS_DE_ITEM.map((definicao) => definicao.tipo);
export const FONTES_FILA: readonly FonteFila[] = ["horas_extra", "justificacoes", "desvios", "desvios_a_validar"];
export const FONTES_AUSENCIAS: readonly FonteAusencias[] = ["ausencias"];
/** Os tipos que o filtro do mapa de assiduidade oferece. */
export const TIPOS_ASSIDUIDADE: readonly TipoFila[] = ["hora_extra", "justificacao", "alerta", "desvio_a_validar"];
/** Os tipos do filtro do ecra de Ausencias. */
export const TIPOS_AUSENCIAS: readonly TipoFila[] = ["ausencia"];

export const definicaoDoTipo = (tipo: TipoFila): DefinicaoDoTipo =>
  TIPOS_DE_ITEM.find((definicao) => definicao.tipo === tipo) ?? TIPOS_DE_ITEM[0];

/** O que o RH pode fazer a um desvio (as mesmas tres accoes da fila de fim do dia). */
export type AccaoDeDesvio = "corrigir" | "lancar_picagem" | "marcar_falta" | "anular_por_ausencia";

interface ItemComum {
  /** Estavel entre leituras: distingue itens de tipos diferentes com o mesmo id. */
  id: string;
  pessoaId: string;
  /** AAAA-MM-DD: o dia a que o item diz respeito (o primeiro, quando abrange varios). */
  data: string;
  /** AAAA-MM-DD: o ultimo dia, quando o item abrange varios (uma ausencia). Sem ele o item e de um so dia. */
  dataFim?: string;
}

export interface ItemHoraExtra extends ItemComum {
  tipo: "hora_extra";
  hora: HoraExtra;
}

export interface ItemJustificacao extends ItemComum {
  tipo: "justificacao";
  justificacao: JustificacaoDia;
}

export interface ItemAlerta extends ItemComum {
  tipo: "alerta";
  desvio: Desvio;
  /** Todas as accoes que o tipo de desvio admite, independentemente da permissao de quem ve. */
  accoesPossiveis: readonly AccaoDeDesvio[];
}

/** Um pedido de ausencia por decidir (pendente da chefia ou do RH). `data` e o primeiro dia, `dataFim` o ultimo. */
export interface ItemAusencia extends ItemComum {
  tipo: "ausencia";
  pedido: AusenciaPedido;
  /** O nome do tipo de ausencia («Ferias»), ja traduzido por quem constroi o item. */
  nomeDoTipo: string;
}

/**
 * A INTERFACE QUE A FONTE DA VALIDACAO DE DESVIOS TEM DE CUMPRIR. Uma linha por desvio que espera validacao de uma pessoa:
 * `id` estavel entre leituras, o dia a que diz respeito, a natureza (o que o sistema detetou) e a medida. A fonte entrega
 * `DesvioAValidar[]` e o estado da leitura (`EstadoDeFonte`); `construirItensDeDesviosAValidar` faz o resto.
 */
export interface DesvioAValidar {
  id: string;
  pessoaId: string;
  /** AAAA-MM-DD. */
  data: string;
  natureza: "hora_extra" | "desvio_horario" | "tempo_a_menos";
  minutos: number;
  horaInicio: string | null;
  horaFim: string | null;
  detalhe: string | null;
  /** As medidas do dia (da base), para o detalhe mostrar as duas e para saber se «hora extra» e possivel (diferenca > margem). */
  planeadoMin?: number;
  realizadoMin?: number;
  diferencaMin?: number;
  desvioHorarioMin?: number;
  margemMin?: number | null;
}

export interface ItemDesvioAValidar extends ItemComum {
  tipo: "desvio_a_validar";
  validacao: DesvioAValidar;
}

export type ItemFila = ItemHoraExtra | ItemJustificacao | ItemAlerta | ItemDesvioAValidar | ItemAusencia;

export interface FontesLidas {
  horasExtra: readonly HoraExtra[];
  justificacoes: readonly JustificacaoDia[];
  desvios: readonly Desvio[];
}

/** O que o cálculo precisa de funções que vivem nos ecrãs (accoes e chave de um desvio): entram de fora. */
export interface AjudasDeDesvio {
  accoesDoDesvio: (desvio: Desvio) => readonly AccaoDeDesvio[];
  chaveDoDesvio: (desvio: Desvio, indice: number) => string;
}

/** Junta as tres fontes numa so lista de itens. So entram os por decidir. */
export function construirItens(fontes: FontesLidas, ajudas: AjudasDeDesvio): ItemFila[] {
  const horas: ItemFila[] = fontes.horasExtra
    .filter((hora) => hora.estado === "pendente")
    .map((hora) => ({ tipo: "hora_extra", id: `he:${hora.id}`, pessoaId: hora.pessoaId, data: hora.data, hora }));
  const justificacoes: ItemFila[] = fontes.justificacoes
    .filter((justificacao) => justificacao.estado === "pendente")
    .map((justificacao) => ({ tipo: "justificacao", id: `jd:${justificacao.id}`, pessoaId: justificacao.pessoaId, data: justificacao.data, justificacao }));
  const alertas: ItemFila[] = fontes.desvios.map((desvio, indice) => ({
    tipo: "alerta",
    id: `al:${ajudas.chaveDoDesvio(desvio, indice)}`,
    pessoaId: desvio.pessoa_id,
    data: desvio.data,
    desvio,
    accoesPossiveis: ajudas.accoesDoDesvio(desvio),
  }));
  return [...horas, ...justificacoes, ...alertas];
}

/** Os pedidos pendentes da chefia ou do RH, como itens da fila. O passo decide quem os pode decidir (`accoesDoItem`). */
export function construirItensDeAusencias(pedidos: readonly AusenciaPedido[], nomeDoTipo: (tipoId: string) => string): ItemFila[] {
  return pedidos
    .filter((pedido) => pedido.estado === "pendente_chefia" || pedido.estado === "pendente_rh")
    .map((pedido): ItemFila => ({
      tipo: "ausencia",
      id: `au:${pedido.id}`,
      pessoaId: pedido.pessoa_id,
      data: pedido.data_inicio,
      dataFim: pedido.data_fim,
      pedido,
      nomeDoTipo: nomeDoTipo(pedido.tipo_id),
    }));
}

/** Os desvios que esperam validacao, como itens da fila (`dv:<id>`). */
export function construirItensDeDesviosAValidar(linhas: readonly DesvioAValidar[]): ItemFila[] {
  return linhas.map((validacao): ItemFila => ({ tipo: "desvio_a_validar", id: `dv:${validacao.id}`, pessoaId: validacao.pessoaId, data: validacao.data, validacao }));
}

export type ContagemPorTipo = Record<TipoFila, number>;

const contagemVazia = (): ContagemPorTipo => ({ hora_extra: 0, justificacao: 0, alerta: 0, desvio_a_validar: 0, ausencia: 0 });

export function contagemPorTipo(itens: readonly ItemFila[]): ContagemPorTipo {
  const contagem = contagemVazia();
  for (const item of itens) contagem[item.tipo] += 1;
  return contagem;
}

const posicaoDoTipo = (tipo: TipoFila): number => TIPOS_FILA.indexOf(tipo);

/** Cronologica: o dia mais antigo primeiro; no mesmo dia, pela ordem dos tipos e depois pelo id. */
export function compararItens(a: ItemFila, b: ItemFila): number {
  return a.data.localeCompare(b.data) || posicaoDoTipo(a.tipo) - posicaoDoTipo(b.tipo) || a.id.localeCompare(b.id);
}

export interface PessoaNaFila {
  pessoaId: string;
  nome: string;
  /** Da mais antiga para a mais recente. */
  itens: ItemFila[];
  contagem: ContagemPorTipo;
  total: number;
  /** AAAA-MM-DD do item mais antigo. */
  maisAntigo: string;
  /** Dias que faltam para fechar o periodo da folha, so quando ha pendencias dentro dele e o fecho esta perto; senao `null`. */
  fechaEmDias: number | null;
}

/** Uma pessoa por entrada, so as que tem pelo menos um item. A ordem e a do primeiro item de cada pessoa (use `ordenarPessoas`). */
export function agruparPorPessoa(itens: readonly ItemFila[], nomeDe: (pessoaId: string) => string): PessoaNaFila[] {
  const porPessoa = new Map<string, ItemFila[]>();
  for (const item of itens) porPessoa.set(item.pessoaId, [...(porPessoa.get(item.pessoaId) ?? []), item]);
  return [...porPessoa.entries()].map(([pessoaId, doConjunto]) => {
    const ordenados = [...doConjunto].sort(compararItens);
    return {
      pessoaId,
      nome: nomeDe(pessoaId),
      itens: ordenados,
      contagem: contagemPorTipo(ordenados),
      total: ordenados.length,
      maisAntigo: ordenados[0].data,
      fechaEmDias: null,
    };
  });
}

export interface ContextoDeOrdem {
  /** AAAA-MM-DD, em Lisboa. */
  hoje: string;
  /** O periodo da folha que contem hoje; `null` (sem periodo) ordena so pelo item mais antigo. */
  periodo: { de: string; ate: string } | null;
  diasAviso?: number;
}

/**
 * 1) quem tem algum item dentro do periodo da folha em curso quando o seu fim esta a `diasAviso` dias ou menos; 2) o item
 * mais antigo primeiro; 3) o nome. Devolve copias com `fechaEmDias` preenchido.
 */
export function ordenarPessoas(pessoas: readonly PessoaNaFila[], contexto: ContextoDeOrdem): PessoaNaFila[] {
  const { hoje, periodo, diasAviso = DIAS_AVISO_FECHO } = contexto;
  const faltam = periodo && hoje <= periodo.ate ? diasDeCalendarioEntre(hoje, periodo.ate) : null;
  const pertoDoFecho = faltam !== null && faltam <= diasAviso;
  const comFecho = pessoas.map((pessoa): PessoaNaFila => ({
    ...pessoa,
    // Um item de varios dias (ausencia) conta se atravessar o periodo, mesmo a comecar antes dele.
    fechaEmDias: pertoDoFecho && periodo && pessoa.itens.some((item) => item.data <= periodo.ate && (item.dataFim ?? item.data) >= periodo.de) ? faltam : null,
  }));
  return comFecho.sort(
    (a, b) =>
      Number(b.fechaEmDias !== null) - Number(a.fechaEmDias !== null) ||
      a.maisAntigo.localeCompare(b.maisAntigo) ||
      a.nome.localeCompare(b.nome),
  );
}

/** Minusculas e sem acentos, para a pesquisa por nome. */
export const normalizarParaPesquisa = (texto: string): string => texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** O filtro por tipo (a pessoa tem pelo menos um item desse tipo) e a pesquisa por nome. */
export function filtrarPessoas(pessoas: readonly PessoaNaFila[], filtro: { tipo: TipoFila | null; texto: string }): PessoaNaFila[] {
  const procura = normalizarParaPesquisa(filtro.texto);
  return pessoas.filter(
    (pessoa) => (filtro.tipo === null || pessoa.contagem[filtro.tipo] > 0) && (procura === "" || normalizarParaPesquisa(pessoa.nome).includes(procura)),
  );
}

export const ehTipoFila = (valor: string | null): valor is TipoFila => valor !== null && (TIPOS_FILA as readonly string[]).includes(valor);

export const totalDePendencias = (pessoas: readonly PessoaNaFila[]): number => pessoas.reduce((soma, pessoa) => soma + pessoa.total, 0);

/** So diz «ninguem tem nada por tratar» quem leu TODAS as fontes com sucesso. */
export const todasLidasComSucesso = (fontes: Readonly<Record<string, EstadoDeFonte>>): boolean =>
  Object.values(fontes).every((estado) => estado === "ok");

/** O numero do separador: pessoas com pendencias; «N+» quando as horas extra foram cortadas no limite (ha mais do que se leu). */
export function rotuloDoContador(pessoas: number, horasExtraCortadas: boolean): string {
  return horasExtraCortadas ? `${pessoas}+` : String(pessoas);
}

/** O dia anterior a `dia` (AAAA-MM-DD), sem passar por fusos. */
export function diaAnterior(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const anterior = new Date(Date.UTC(a, m - 1, d - 1));
  return anterior.toISOString().slice(0, 10);
}

/** O dia 1 do mes anterior ao de `dia`. */
function primeiroDiaDoMesAnterior(dia: string): string {
  const [a, m] = dia.split("-").map(Number);
  const anterior = new Date(Date.UTC(a, m - 2, 1));
  return anterior.toISOString().slice(0, 10);
}

/**
 * A janela dos desvios: do inicio do periodo da folha ANTERIOR ao em curso ate hoje, para que no dia em que o periodo vira
 * os alertas do periodo que acabou de fechar nao saiam da fila sem decisao. Sem periodos conhecidos (regras por ler ou
 * recusadas), do dia 1 do mes anterior.
 */
export function janelaDosDesvios(
  periodoEmCurso: { de: string } | null,
  periodoAnterior: { de: string } | null,
  hoje: string,
): { de: string; ate: string } {
  const de = periodoAnterior?.de ?? periodoEmCurso?.de ?? primeiroDiaDoMesAnterior(hoje);
  return { de, ate: hoje < de ? de : hoje };
}

/* ---------------------------------------------------------------- accoes por item, com a razao de uma estar desactivada */

export type IdDeAccao =
  | "confirmar"
  | "rejeitar"
  | "aceitar"
  | "recusar"
  | "corrigir"
  | "lancar_picagem"
  | "marcar_falta"
  | "anular_por_ausencia"
  | "aprovar_chefia"
  | "recusar_chefia"
  | "ajustar"
  | "aprovar_rh"
  | "recusar_rh"
  | "devolver"
  | "validar_normal"
  | "validar_hora_extra"
  | "validar_aceitar_desvio";

export interface AccaoDoItem {
  id: IdDeAccao;
  permitida: boolean;
  /** Chave de traducao do motivo de estar desactivada; `null` quando permitida. */
  porque: string | null;
}

/**
 * As permissoes que decidem as accoes. As de ausencias (`aprovarChefia`, `aprovarRh`) sao SEPARADAS, como na base: o
 * passo do pedido decide qual delas conta. `validarDesvios` ainda nao tem permissao propria (a fixar com a validacao de
 * desvios): ate la, na sua falta, vale `gerir`.
 */
export type PermissoesDaFila = Pick<PermissoesAssiduidade, "gerir" | "corrigir" | "faltasEdit" | "justificacaoEdit"> & {
  aprovarChefia?: boolean;
  aprovarRh?: boolean;
  validarDesvios?: boolean;
  /** Lancar uma picagem a outra pessoa (`hr.assiduidade.picar.outros`); sem ele «Corrigir o ponto» nao aparece. */
  picarOutros?: boolean;
};

const CHAVE_SEM_JUSTIFICACAO = "rhFila.semPermissao.justificacao";
const CHAVE_SEM_GERIR = "rhFila.semPermissao.gerir";
const CHAVE_SEM_CORRIGIR = "rhFila.semPermissao.corrigir";
const CHAVE_SEM_FALTAS = "rhFila.semPermissao.faltas";
const CHAVE_SEM_APROVAR_CHEFIA = "rhFila.semPermissao.aprovarChefia";
const CHAVE_SEM_APROVAR_RH = "rhFila.semPermissao.aprovarRh";
const CHAVE_SEM_VALIDAR = "rhFila.semPermissao.validar";
const CHAVE_PROPRIA = "rhJust.rh.propriaSemDecisao";
const CHAVE_PROPRIA_VALIDAR = "rhFila.semPermissao.propriaValidar";
const CHAVE_SEM_TEMPO_A_MAIS = "rhFila.semPermissao.horaExtraSemTempo";

const accao = (id: IdDeAccao, permitida: boolean, porque: string): AccaoDoItem => ({ id, permitida, porque: permitida ? null : porque });

/**
 * As accoes de um item e, por cada uma, se quem esta a ver a pode fazer. Hora extra: confirmar e rejeitar exigem `gerir`.
 * Justificacao: exige `justificacaoEdit` e ninguem decide a sua (a base recusa-o). Alerta: corrigir exige `corrigir`; faltas exigem `faltasEdit`.
 */
export function accoesDoItem(item: ItemFila, permissoes: PermissoesDaFila, minhaPessoaId: string | null): AccaoDoItem[] {
  switch (item.tipo) {
    case "hora_extra":
      return [accao("confirmar", permissoes.gerir, CHAVE_SEM_GERIR), accao("rejeitar", permissoes.gerir, CHAVE_SEM_GERIR)];
    case "justificacao": {
      const propria = minhaPessoaId !== null && item.pessoaId === minhaPessoaId;
      // A propria justificacao diz-se primeiro: nem com permissao a base deixa decidi-la.
      const permitida = !propria && permissoes.justificacaoEdit;
      const porque = propria ? CHAVE_PROPRIA : CHAVE_SEM_JUSTIFICACAO;
      return [accao("aceitar", permitida, porque), accao("recusar", permitida, porque)];
    }
    case "alerta":
      return item.accoesPossiveis
        // Lancar a picagem de outra pessoa so existe para quem tem `picarOutros`: sem ele a accao nao aparece (nao fica desactivada).
        .filter((id) => id !== "lancar_picagem" || permissoes.picarOutros === true)
        .map((id) =>
          id === "corrigir" ? accao(id, permissoes.corrigir, CHAVE_SEM_CORRIGIR) : accao(id, id === "lancar_picagem" ? true : permissoes.faltasEdit, CHAVE_SEM_FALTAS),
        );
    case "desvio_a_validar": {
      // Ninguem valida os proprios desvios (a base recusa); diz-se primeiro, como nas justificacoes.
      const propria = minhaPessoaId !== null && item.pessoaId === minhaPessoaId;
      const permitida = !propria && (permissoes.validarDesvios ?? permissoes.gerir);
      const porque = propria ? CHAVE_PROPRIA_VALIDAR : CHAVE_SEM_VALIDAR;
      // «Hora extra» so quando o realizado passa o planeado em mais do que a margem.
      const { diferencaMin, margemMin } = item.validacao;
      const horaExtraPossivel = podeSerHoraExtra(diferencaMin, margemMin);
      return [
        accao("validar_normal", permitida, porque),
        horaExtraPossivel ? accao("validar_hora_extra", permitida, porque) : accao("validar_hora_extra", false, permitida ? CHAVE_SEM_TEMPO_A_MAIS : porque),
        accao("validar_aceitar_desvio", permitida, porque),
      ];
    }
    case "ausencia": {
      // As accoes possiveis saem de `accoesDoPedido` (a regra que o detalhe do pedido ja usa): pede-se-lhe o que o
      // passo admite com todas as permissoes, e cada accao e depois activada ou nao pela permissao REAL de quem ve.
      const possiveis = accoesDoPedido({
        estado: item.pedido.estado,
        souOAutor: false,
        podeAprovarChefia: true,
        podeAprovarRh: true,
        podeEditarHistorico: false,
        temChefiaResoluvel: Boolean(item.pedido.aprovador_chefia_pessoa_id),
      });
      const chefia = permissoes.aprovarChefia === true;
      const rh = permissoes.aprovarRh === true;
      const accoes: AccaoDoItem[] = [];
      if (possiveis.aprovarChefia) accoes.push(accao("aprovar_chefia", chefia, CHAVE_SEM_APROVAR_CHEFIA));
      if (possiveis.recusarChefia) accoes.push(accao("recusar_chefia", chefia, CHAVE_SEM_APROVAR_CHEFIA));
      if (possiveis.ajustarChefia) accoes.push(accao("ajustar", chefia, CHAVE_SEM_APROVAR_CHEFIA));
      if (possiveis.aprovarRh) accoes.push(accao("aprovar_rh", rh, CHAVE_SEM_APROVAR_RH));
      if (possiveis.recusarRh) accoes.push(accao("recusar_rh", rh, CHAVE_SEM_APROVAR_RH));
      if (possiveis.devolverAChefia) accoes.push(accao("devolver", rh, CHAVE_SEM_APROVAR_RH));
      return accoes;
    }
  }
}
