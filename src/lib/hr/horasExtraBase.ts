/**
 * As horas extra entre a base e o ecra: as formas das linhas das RPCs `rpc_hr_horas_extra_*`, a conversao para o tipo do ecra,
 * os erros (HRA75 a HRA85, 42501, limite por hora) como texto traduzido e a partilha de um intervalo em semanas.
 * Sem React e sem cliente da base.
 *
 * As RPCs recusam com MESSAGE = codigo e SQLSTATE `HRA..`. O ecra so recebe TEXTO traduzido (`rhHeReal.erro.*`), nunca o
 * codigo em bruto nem a mensagem da base.
 */
import type { HoraExtra, LimitesHE, OrigemHoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import { periodoDaFolha } from "@/lib/hr/periodoFolha";

export interface LinhaHoraExtra {
  id: string;
  pessoa_id: string;
  pessoa_nome: string | null;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  minutos: number;
  nocturno_min: number;
  origem: string;
  tipo_registo: string | null;
  motivo_origem: string | null;
  estado: string;
  sem_autorizacao: boolean;
  acima_limite: boolean;
  motivo_decisao: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
}

export interface LinhaConfigHE {
  dia_min: number;
  ano_min: number;
  alerta_pct: number;
  minimo_min: number;
  omissao?: boolean;
}

export interface LinhaSaldoHE {
  pessoa_id: string;
  ano: number;
  total_ano_min: number;
  confirmadas_min: number;
  pendentes_min: number;
  limite_ano_min: number;
  limite_ano_origem: string | null;
  limite_dia_min: number;
  alerta_pct: number;
  em_alerta: boolean;
  acima_limite: boolean;
  restante_min: number;
}

/** O saldo como o ecra o le. `limiteAnoOrigem` diz de onde veio o limite anual: `regra` (regra salarial da organizacao em vigor) ou `omissao` (sem regra). */
export interface SaldoHE {
  pessoaId: string;
  ano: number;
  totalAnoMin: number;
  confirmadasMin: number;
  pendentesMin: number;
  limiteAnoMin: number;
  limiteAnoOrigem: string | null;
  limiteDiaMin: number;
  alertaPct: number;
  emAlerta: boolean;
  acimaDoLimite: boolean;
  restanteMin: number;
}

export interface ResumoDeteccao {
  criadas: number;
  atualizadas: number;
  inalteradas: number;
  jaDecididas: number;
  divergentes: number;
  saltadasSemHorario: number;
  abaixoMinimo: number;
  obsoletas: number;
}

export const RESUMO_VAZIO: ResumoDeteccao = {
  criadas: 0, atualizadas: 0, inalteradas: 0, jaDecididas: 0, divergentes: 0, saltadasSemHorario: 0, abaixoMinimo: 0, obsoletas: 0,
};

/** O resultado de uma escrita: `erro` e o texto traduzido da recusa, ou `null` quando correu bem. */
export interface ResultadoHE {
  ok: boolean;
  erro: string | null;
}

export const SUCESSO_HE: ResultadoHE = { ok: true, erro: null };

/** Os tetos da base que a deteccao respeita (a organizacao inteira nao passa de 31 dias num so pedido). */
export const DIAS_MAX_DETECAO_ORGANIZACAO = 31;
export const DIAS_MAX_DETECAO_PESSOA = 62;
export const MOTIVO_MIN = 3;

const ORIGENS: readonly OrigemHoraExtra[] = ["diaria", "semanal", "feriado", "descanso", "banco"];

const horaCurta = (h: string | null): string | null => (h ? h.slice(0, 5) : null);

export function horaExtraDaLinha(l: LinhaHoraExtra): HoraExtra {
  const origem = ORIGENS.includes(l.origem as OrigemHoraExtra) ? (l.origem as OrigemHoraExtra) : "diaria";
  return {
    id: l.id,
    pessoaId: l.pessoa_id,
    pessoaNome: l.pessoa_nome ?? undefined,
    data: l.data,
    minutos: Number(l.minutos),
    nocturnoMin: Number(l.nocturno_min),
    origem,
    motivoOrigem: l.motivo_origem ?? "",
    estado: l.estado === "confirmada" || l.estado === "rejeitada" ? l.estado : "pendente",
    acimaDoLimite: l.acima_limite === true,
    semAutorizacao: l.sem_autorizacao === true,
    motivoDecisao: l.motivo_decisao,
    decididoPor: l.decidido_por,
    horaInicio: horaCurta(l.hora_inicio),
    horaFim: horaCurta(l.hora_fim),
  };
}

export const limitesDaLinha = (l: LinhaConfigHE): LimitesHE => ({
  diaMin: Number(l.dia_min),
  anoMin: Number(l.ano_min),
  alertaPct: Number(l.alerta_pct),
  minimoMin: Number(l.minimo_min),
});

export const saldoDaLinha = (l: LinhaSaldoHE): SaldoHE => ({
  pessoaId: l.pessoa_id,
  ano: Number(l.ano),
  totalAnoMin: Number(l.total_ano_min),
  confirmadasMin: Number(l.confirmadas_min),
  pendentesMin: Number(l.pendentes_min),
  limiteAnoMin: Number(l.limite_ano_min),
  limiteAnoOrigem: l.limite_ano_origem,
  limiteDiaMin: Number(l.limite_dia_min),
  alertaPct: Number(l.alerta_pct),
  emAlerta: l.em_alerta === true,
  acimaDoLimite: l.acima_limite === true,
  restanteMin: Number(l.restante_min),
});

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function resumoDaResposta(r: unknown): ResumoDeteccao {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  return {
    criadas: num(o.criadas),
    atualizadas: num(o.atualizadas),
    inalteradas: num(o.inalteradas),
    jaDecididas: num(o.ja_decididas),
    divergentes: num(o.divergentes),
    saltadasSemHorario: num(o.saltadas_sem_horario),
    abaixoMinimo: num(o.abaixo_minimo),
    obsoletas: num(o.obsoletas),
  };
}

export function somarResumos(a: ResumoDeteccao, b: ResumoDeteccao): ResumoDeteccao {
  return {
    criadas: a.criadas + b.criadas,
    atualizadas: a.atualizadas + b.atualizadas,
    inalteradas: a.inalteradas + b.inalteradas,
    jaDecididas: a.jaDecididas + b.jaDecididas,
    divergentes: a.divergentes + b.divergentes,
    saltadasSemHorario: a.saltadasSemHorario + b.saltadasSemHorario,
    abaixoMinimo: a.abaixoMinimo + b.abaixoMinimo,
    obsoletas: a.obsoletas + b.obsoletas,
  };
}

/* ------------------------------------------------------------------ datas e intervalos */
const DIA_MS = 24 * 60 * 60 * 1000;
const ehData = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const emDias = (d: string): number => Math.floor(Date.parse(`${d}T00:00:00Z`) / DIA_MS);
const doDia = (n: number): string => new Date(n * DIA_MS).toISOString().slice(0, 10);

/** Quantos dias tem o intervalo, ambos incluidos; 0 se alguma data nao for valida ou se estiver invertido. */
export function diasDoIntervalo(de: string, ate: string): number {
  if (!ehData(de) || !ehData(ate) || ate < de) return 0;
  return emDias(ate) - emDias(de) + 1;
}

/** O intervalo partido em janelas de `tamanho` dias (a ultima pode ser mais curta). */
export function janelasDoIntervalo(de: string, ate: string, tamanho: number): Array<{ de: string; ate: string }> {
  const total = diasDoIntervalo(de, ate);
  if (total === 0 || tamanho < 1) return [];
  const janelas: Array<{ de: string; ate: string }> = [];
  for (let inicio = emDias(de); inicio <= emDias(ate); inicio += tamanho) {
    janelas.push({ de: doDia(inicio), ate: doDia(Math.min(inicio + tamanho - 1, emDias(ate))) });
  }
  return janelas;
}

/** O dia de hoje em Lisboa (`AAAA-MM-DD`): e o dia que a base usa para validar datas e para o «ano corrente». */
export function hojeLisboa(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** A mesma data `meses` atras (um 31 que nao existe nesse mes passa ao ultimo dia dele). */
export function dataHaMeses(iso: string, meses: number): string {
  if (!ehData(iso)) return iso;
  const total = Number(iso.slice(0, 4)) * 12 + (Number(iso.slice(5, 7)) - 1) - meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${ano}-${p(mes)}-${p(Math.min(Number(iso.slice(8, 10)), ultimo))}`;
}

/** Quantas janelas de deteccao um pedido pode fazer, para nao gastar o limite de 20 deteccoes por hora. */
export const MAX_JANELAS_DETECAO = 20;
export const DIAS_JANELA_SEMANAL = 7;

export interface PlanoDeteccao {
  janelas: Array<{ de: string; ate: string }>;
  /** Mais janelas do que o permitido: nao se corre. */
  excede: boolean;
}

/**
 * Como se parte uma deteccao: a organizacao inteira ate 31 dias vai num pedido (se a base o recusar por tamanho, o hook repete
 * por semanas); acima de 31, por semanas. Uma pessoa vai num pedido ate 62 dias e, acima disso, em janelas de 62.
 */
export function planoDeDeteccao(de: string, ate: string, pessoaId: string | null): PlanoDeteccao {
  const dias = diasDoIntervalo(de, ate);
  if (dias === 0) return { janelas: [], excede: false };
  const tamanho = pessoaId === null ? (dias > DIAS_MAX_DETECAO_ORGANIZACAO ? DIAS_JANELA_SEMANAL : dias) : DIAS_MAX_DETECAO_PESSOA;
  const janelas = janelasDoIntervalo(de, ate, tamanho);
  return { janelas, excede: janelas.length > MAX_JANELAS_DETECAO };
}

/** Primeiro e ultimo dia do mes `AAAA-MM` (ou da folha, com dia de inicio): a conta e a de `periodoDaFolha`, de um so sitio. */
export function limitesDoMes(ano: number, mes: number, diaInicio: number = 1): { de: string; ate: string } {
  return periodoDaFolha(ano, mes, diaInicio);
}

/* ------------------------------------------------------------------ erros */
/** O SQLSTATE (ERRCODE) que a RPC levanta, e o codigo que ele quer dizer. */
const CODIGO_POR_SQLSTATE: Readonly<Record<string, string>> = {
  HRA10: "pedido_invalido",
  HRA31: "nao_encontrado",
  HRA33: "organizacao_nao_empregadora",
  HRA41: "limite_excedido",
  HRA75: "decisao_propria",
  HRA76: "motivo_obrigatorio",
  HRA77: "ja_decidida",
  HRA78: "data_invalida",
  HRA79: "horas_invalidas",
  HRA80: "abaixo_minimo",
  HRA81: "config_invalida",
  HRA82: "motivo_invalido",
  HRA83: "sobreposicao",
  HRA84: "intervalo_excedido",
  HRA85: "detecao_em_curso",
};

const CHAVE_POR_CODIGO: Readonly<Record<string, string>> = {
  insufficient_privilege: "rhHeReal.erro.semPermissao",
  pedido_invalido: "rhHeReal.erro.pedidoInvalido",
  nao_encontrado: "rhHeReal.erro.naoEncontrado",
  organizacao_nao_empregadora: "rhHeReal.erro.organizacaoNaoEmpregadora",
  limite_excedido: "rhHeReal.erro.limiteExcedido",
  decisao_propria: "rhHeReal.erro.decisaoPropria",
  motivo_obrigatorio: "rhHeReal.erro.motivoObrigatorio",
  ja_decidida: "rhHeReal.erro.jaDecidida",
  data_invalida: "rhHeReal.erro.dataInvalida",
  horas_invalidas: "rhHeReal.erro.horasInvalidas",
  abaixo_minimo: "rhHeReal.erro.abaixoMinimo",
  config_invalida: "rhHeReal.erro.configInvalida",
  motivo_invalido: "rhHeReal.erro.motivoInvalido",
  sobreposicao: "rhHeReal.erro.sobreposicao",
  intervalo_excedido: "rhHeReal.erro.intervaloExcedido",
  detecao_em_curso: "rhHeReal.erro.detecaoEmCurso",
  // So do cliente (nunca vem da base):
  pedido_em_curso: "rhHeReal.erro.pedidoEmCurso",
  intervalo_grande: "rhHeReal.erro.intervaloGrande",
};

/** O texto quando nao ha codigo legivel (rede, timeout, defeito). */
export const CHAVE_ERRO_GENERICO_HE = "rhHeReal.erro.generico";

/** Recusa por permissao (42501, ou o PostgREST a recusar antes de chegar ao Postgres). */
function recusaPorPermissao(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (typeof code === "string" && ["42501", "PGRST301", "401", "403"].includes(code)) return true;
  return typeof message === "string" && /permission denied|insufficient_privilege/i.test(message);
}

/** O codigo de um erro destas RPCs, ou `null` quando e um defeito. So devolve codigos que o ecra sabe traduzir. */
export function codigoDeErroHorasExtra(erro: unknown): string | null {
  if (recusaPorPermissao(erro)) return "insufficient_privilege";
  if (!erro || typeof erro !== "object") return null;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (typeof code === "string" && CODIGO_POR_SQLSTATE[code]) return CODIGO_POR_SQLSTATE[code];
  return typeof message === "string" && CHAVE_POR_CODIGO[message] ? message : null;
}

export const chaveDoErroHorasExtra = (codigo: string | null): string => (codigo && CHAVE_POR_CODIGO[codigo]) || CHAVE_ERRO_GENERICO_HE;

/** Todas as chaves de erro (para o teste de traducoes). */
export const CHAVES_DE_ERRO_HE: readonly string[] = [...Object.values(CHAVE_POR_CODIGO), CHAVE_ERRO_GENERICO_HE];
