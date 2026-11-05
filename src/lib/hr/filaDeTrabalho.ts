/**
 * A FILA DE TRABALHO do mapa de assiduidade: tudo o que o RH tem por tratar, agrupado por PESSOA. Funcoes puras.
 *
 * O ecra mostra so as pessoas com problemas a resolver; ao abrir uma pessoa resolve-se tudo numa so lista (horas extra,
 * justificacoes, alertas do fim do dia), cada item com a etiqueta do seu tipo. Contador e lista saem do MESMO resultado
 * de `agruparPorPessoa`, por isso nao podem divergir.
 *
 * EXTENSIVEL: um tipo novo (por exemplo «ausencia por decidir» ou «desvio a validar») acrescenta-se a `TIPOS_DE_ITEM`
 * (etiqueta, fonte, permissao), a `ItemFila` (uniao discriminada) e ao aspecto no componente; nada mais muda aqui.
 */
import { diasDeCalendarioEntre } from "@/lib/hr/periodoFolha";
import type { HoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import type { Desvio, PermissoesAssiduidade } from "@/types/hrAssiduidade";

/** Quantas horas extra pendentes a fila le (a pagina da base); acima disto diz-se e o contador mostra «N+». */
export const LIMITE_HORAS_EXTRA_NA_FILA = 500;
/** A partir de quantos dias do fim do periodo da folha a pessoa passa para o topo da lista. */
export const DIAS_AVISO_FECHO = 5;

export type FonteFila = "horas_extra" | "justificacoes" | "desvios";
export type TipoFila = "hora_extra" | "justificacao" | "alerta";

/** Como correu a leitura de uma fonte. So `ok` permite dizer «ninguem tem nada por tratar». */
export type EstadoDeFonte = "ok" | "recusado" | "erro" | "indisponivel";

export interface DefinicaoDoTipo {
  tipo: TipoFila;
  fonte: FonteFila;
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
];

export const TIPOS_FILA: readonly TipoFila[] = TIPOS_DE_ITEM.map((definicao) => definicao.tipo);
export const FONTES_FILA: readonly FonteFila[] = ["horas_extra", "justificacoes", "desvios"];

export const definicaoDoTipo = (tipo: TipoFila): DefinicaoDoTipo =>
  TIPOS_DE_ITEM.find((definicao) => definicao.tipo === tipo) ?? TIPOS_DE_ITEM[0];

/** O que o RH pode fazer a um desvio (as mesmas tres accoes da fila de fim do dia). */
export type AccaoDeDesvio = "corrigir" | "marcar_falta" | "anular_por_ausencia";

interface ItemComum {
  /** Estavel entre leituras: distingue itens de tipos diferentes com o mesmo id. */
  id: string;
  pessoaId: string;
  /** AAAA-MM-DD: o dia a que o item diz respeito. */
  data: string;
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

export type ItemFila = ItemHoraExtra | ItemJustificacao | ItemAlerta;

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

export type ContagemPorTipo = Record<TipoFila, number>;

const contagemVazia = (): ContagemPorTipo => ({ hora_extra: 0, justificacao: 0, alerta: 0 });

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
    fechaEmDias: pertoDoFecho && periodo && pessoa.itens.some((item) => item.data >= periodo.de && item.data <= periodo.ate) ? faltam : null,
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
export const todasLidasComSucesso = (fontes: Readonly<Record<FonteFila, EstadoDeFonte>>): boolean =>
  FONTES_FILA.every((fonte) => fontes[fonte] === "ok");

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

export type IdDeAccao = "confirmar" | "rejeitar" | "aceitar" | "recusar" | "corrigir" | "marcar_falta" | "anular_por_ausencia";

export interface AccaoDoItem {
  id: IdDeAccao;
  permitida: boolean;
  /** Chave de traducao do motivo de estar desactivada; `null` quando permitida. */
  porque: string | null;
}

export type PermissoesDaFila = Pick<PermissoesAssiduidade, "gerir" | "corrigir" | "faltasEdit" | "justificacaoEdit">;

const CHAVE_SEM_JUSTIFICACAO = "rhFila.semPermissao.justificacao";
const CHAVE_SEM_GERIR = "rhFila.semPermissao.gerir";
const CHAVE_SEM_CORRIGIR = "rhFila.semPermissao.corrigir";
const CHAVE_SEM_FALTAS = "rhFila.semPermissao.faltas";
const CHAVE_PROPRIA = "rhJust.rh.propriaSemDecisao";

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
      return item.accoesPossiveis.map((id) =>
        id === "corrigir" ? accao(id, permissoes.corrigir, CHAVE_SEM_CORRIGIR) : accao(id, permissoes.faltasEdit, CHAVE_SEM_FALTAS),
      );
  }
}
