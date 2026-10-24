/**
 * Fluxo 4 (Horario): o TIPO de horario, as versoes e a excepcao de um dia. Tudo funcoes puras, sem
 * estado: o store em memoria vive em `dados/lojaFluxosB.ts`. Cada funcao que muda alguma coisa devolve
 * um resultado novo (nunca altera o que recebe) ou uma chave de erro de traducao.
 *
 * Regras do documento: uma versao nova leva MOTIVO (minimo 3 caracteres) e anexo opcional; a versao
 * antiga fecha na vespera e nunca se apaga; a data de efeito no passado recusa e manda CORRIGIR;
 * corrigir o passado exige autorizacao e fica marcado; uma excepcao com data substitui o horario do dia.
 */
export const TIPOS_HORARIO = ["padrao", "repartido", "isencao", "livre", "banco"] as const;
export type TipoHorario = (typeof TIPOS_HORARIO)[number];

/** Atraso ate isto nao e atraso e nao desconta (a organizacao pode mudar; o documento diz 5 se nada for dito). */
export const TOLERANCIA_ATRASO_MINUTOS = 5;
export const MOTIVO_MINIMO_CARACTERES = 3;

/** Um dia de horario com entrada, saida e pausa (padrao, banco e excepcao). */
export interface DiaPadrao {
  trabalha: boolean;
  entrada: string;
  saida: string;
  pausaMin: number;
}

export interface PeriodosRepartido {
  p1Inicio: string;
  p1Fim: string;
  p2Inicio: string;
  p2Fim: string;
  dias: number[];
}

/** Limites do banco de horas, em horas. O saldo e os movimentos sao de outra frente. */
export interface LimitesBanco {
  acrescimoDia: number;
  acrescimoSemana: number;
  saldoMaximo: number;
  saldoMinimo: number;
  mesesReferencia: number;
  avisoDiasAntes: number;
}

export interface ConfigHorario {
  tipo: TipoHorario;
  /** Indice = dia da semana (0 domingo .. 6 sabado). Usado por padrao e banco. */
  padrao: DiaPadrao[];
  repartido: PeriodosRepartido;
  isencao: { dias: number[]; horasSemanais: number };
  livre: { dias: number[]; horasSemanais: number };
  banco: LimitesBanco;
}

export interface VersaoHorario {
  id: string;
  config: ConfigHorario;
  desde: string;
  ate: string | null;
  motivo: string;
  anexoNome: string | null;
  autor: string;
  criadaEm: string;
  /** Versao que esta corrige (so numa correccao do passado). */
  corrigeId: string | null;
  correccao: boolean;
  autorizadaPor: string | null;
  /** Preenchido na versao errada: fica no historico, esbatida. */
  substituidaPor: string | null;
}

export interface ExcecaoDia {
  id: string;
  data: string;
  dia: DiaPadrao;
  motivo: string;
  autor: string;
  criadaEm: string;
}

export interface HorarioPessoa {
  versoes: VersaoHorario[];
  excecoes: ExcecaoDia[];
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

export const DIAS_UTEIS = [1, 2, 3, 4, 5];

export function diaPadraoVazio(trabalha = false): DiaPadrao {
  return { trabalha, entrada: "09:00", saida: "18:00", pausaMin: 60 };
}

export function configInicial(tipo: TipoHorario = "padrao"): ConfigHorario {
  return {
    tipo,
    padrao: Array.from({ length: 7 }, (_, dia) => diaPadraoVazio(DIAS_UTEIS.includes(dia))),
    repartido: { p1Inicio: "11:00", p1Fim: "15:00", p2Inicio: "19:00", p2Fim: "23:00", dias: [2, 3, 4, 5, 6] },
    isencao: { dias: DIAS_UTEIS, horasSemanais: 40 },
    livre: { dias: DIAS_UTEIS, horasSemanais: 40 },
    banco: { acrescimoDia: 2, acrescimoSemana: 10, saldoMaximo: 40, saldoMinimo: -10, mesesReferencia: 12, avisoDiasAntes: 30 },
  };
}

export function motivoValido(motivo: string | null | undefined): boolean {
  return (motivo ?? "").trim().length >= MOTIVO_MINIMO_CARACTERES;
}

export function minutosDeHora(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora ?? "");
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) > 23 || Number(m[2]) > 59 ? null : total;
}

function duracao(inicio: string, fim: string): number {
  const a = minutosDeHora(inicio);
  const b = minutosDeHora(fim);
  return a === null || b === null || b <= a ? 0 : b - a;
}

export function minutosDoDiaPadrao(dia: DiaPadrao): number {
  return dia.trabalha ? Math.max(0, duracao(dia.entrada, dia.saida) - Math.max(0, dia.pausaMin)) : 0;
}

function minutosRepartido(r: PeriodosRepartido, diaSemana: number): number {
  return r.dias.includes(diaSemana) ? duracao(r.p1Inicio, r.p1Fim) + duracao(r.p2Inicio, r.p2Fim) : 0;
}

/** Horas planeadas de um dia da semana, em minutos. No horario livre as contas sao por semana: 0 por dia. */
export function minutosPlaneadosDoDiaDaSemana(config: ConfigHorario, diaSemana: number): number {
  switch (config.tipo) {
    case "padrao":
    case "banco":
      return minutosDoDiaPadrao(config.padrao[diaSemana] ?? diaPadraoVazio());
    case "repartido":
      return minutosRepartido(config.repartido, diaSemana);
    case "isencao": {
      const { dias, horasSemanais } = config.isencao;
      return dias.includes(diaSemana) && dias.length > 0 ? Math.round((horasSemanais * 60) / dias.length) : 0;
    }
    default:
      return 0;
  }
}

/** Horas planeadas da semana, em minutos, segundo o tipo. */
export function minutosPlaneadosDaSemana(config: ConfigHorario): number {
  if (config.tipo === "livre") return Math.round(config.livre.horasSemanais * 60);
  return [0, 1, 2, 3, 4, 5, 6].reduce((soma, dia) => soma + minutosPlaneadosDoDiaDaSemana(config, dia), 0);
}

function problemasDeDia(dia: DiaPadrao): string[] {
  if (!dia.trabalha) return [];
  const fim = duracao(dia.entrada, dia.saida);
  if (fim <= 0) return ["rhExemplo.hor.erro.fimAntesInicio"];
  return dia.pausaMin >= fim ? ["rhExemplo.hor.erro.pausaGrande"] : [];
}

function problemasRepartido(r: PeriodosRepartido): string[] {
  if (r.dias.length === 0) return ["rhExemplo.hor.erro.semDias"];
  if (duracao(r.p1Inicio, r.p1Fim) <= 0 || duracao(r.p2Inicio, r.p2Fim) <= 0) return ["rhExemplo.hor.erro.fimAntesInicio"];
  const fim1 = minutosDeHora(r.p1Fim) ?? 0;
  const ini2 = minutosDeHora(r.p2Inicio) ?? 0;
  return ini2 <= fim1 ? ["rhExemplo.hor.erro.semIntervalo"] : [];
}

function problemasHoras(dias: number[], horas: number): string[] {
  if (dias.length === 0) return ["rhExemplo.hor.erro.semDias"];
  return horas > 0 && horas <= 80 ? [] : ["rhExemplo.hor.erro.horasInvalidas"];
}

function problemasBanco(b: LimitesBanco): string[] {
  const invalido = b.acrescimoDia <= 0 || b.acrescimoSemana < b.acrescimoDia || b.saldoMaximo <= 0 || b.saldoMinimo > 0;
  return invalido || b.mesesReferencia <= 0 ? ["rhExemplo.hor.erro.limitesInvalidos"] : [];
}

/** As chaves de erro de um horario, da primeira a ultima. Vazio = pode gravar. */
export function problemasDaConfig(config: ConfigHorario): string[] {
  switch (config.tipo) {
    case "padrao":
      return config.padrao.flatMap(problemasDeDia).slice(0, 1).concat(config.padrao.some((d) => d.trabalha) ? [] : ["rhExemplo.hor.erro.semDias"]);
    case "banco":
      return [
        ...config.padrao.flatMap(problemasDeDia).slice(0, 1),
        ...(config.padrao.some((d) => d.trabalha) ? [] : ["rhExemplo.hor.erro.semDias"]),
        ...problemasBanco(config.banco),
      ];
    case "repartido":
      return problemasRepartido(config.repartido);
    case "isencao":
      return problemasHoras(config.isencao.dias, config.isencao.horasSemanais);
    default:
      return problemasHoras(config.livre.dias, config.livre.horasSemanais);
  }
}

/** Aviso (nunca bloqueia): o total semanal planeado e diferente das horas contratadas. */
export function avisoContratadas(config: ConfigHorario, horasContratadasSemanais: number | null): boolean {
  if (horasContratadasSemanais === null || horasContratadasSemanais <= 0) return false;
  return minutosPlaneadosDaSemana(config) !== Math.round(horasContratadasSemanais * 60);
}

export function diaAnterior(iso: string): string {
  const base = Date.parse(`${iso}T00:00:00Z`);
  return new Date(base - 86_400_000).toISOString().slice(0, 10);
}

const naoSubstituidas = (versoes: VersaoHorario[]): VersaoHorario[] => versoes.filter((v) => v.substituidaPor === null);

/** A versao que vale num dia (as substituidas por uma correccao nao contam). */
export function versaoEmVigor(horario: HorarioPessoa, iso: string): VersaoHorario | null {
  return naoSubstituidas(horario.versoes).find((v) => v.desde <= iso && (v.ate === null || iso <= v.ate)) ?? null;
}

export interface DadosNovaVersao {
  id: string;
  config: ConfigHorario;
  desde: string;
  motivo: string;
  anexoNome: string | null;
  autor: string;
  hoje: string;
  agora: string;
}

/** NOVA VERSAO: motivo obrigatorio, data de efeito nao passada, a versao aberta fecha na vespera. */
export function criarVersao(horario: HorarioPessoa, dados: DadosNovaVersao): Resultado<HorarioPessoa> {
  if (!motivoValido(dados.motivo)) return { ok: false, erro: "rhExemplo.hor.erro.motivoCurto" };
  if (dados.desde < dados.hoje) return { ok: false, erro: "rhExemplo.hor.erro.dataPassada" };
  const problema = problemasDaConfig(dados.config)[0];
  if (problema) return { ok: false, erro: problema };
  const aberta = naoSubstituidas(horario.versoes).find((v) => v.ate === null) ?? null;
  if (aberta && dados.desde <= aberta.desde) return { ok: false, erro: "rhExemplo.hor.erro.antesDaVersao" };
  const nova: VersaoHorario = {
    id: dados.id,
    config: dados.config,
    desde: dados.desde,
    ate: null,
    motivo: dados.motivo.trim(),
    anexoNome: dados.anexoNome,
    autor: dados.autor,
    criadaEm: dados.agora,
    corrigeId: null,
    correccao: false,
    autorizadaPor: null,
    substituidaPor: null,
  };
  const versoes = horario.versoes.map((v) => (aberta && v.id === aberta.id ? { ...v, ate: diaAnterior(dados.desde) } : v));
  return { ok: true, valor: { ...horario, versoes: [...versoes, nova] } };
}

export interface DadosCorreccao {
  id: string;
  versaoId: string;
  config: ConfigHorario;
  motivo: string;
  autorizado: boolean;
  autor: string;
  agora: string;
}

/** CORRIGIR o passado: exige autorizacao e motivo; as datas nao mudam; a errada fica esbatida. */
export function corrigirVersao(horario: HorarioPessoa, dados: DadosCorreccao): Resultado<HorarioPessoa> {
  if (!dados.autorizado) return { ok: false, erro: "rhExemplo.hor.erro.semAutorizacao" };
  if (!motivoValido(dados.motivo)) return { ok: false, erro: "rhExemplo.hor.erro.motivoCurto" };
  const original = naoSubstituidas(horario.versoes).find((v) => v.id === dados.versaoId);
  if (!original) return { ok: false, erro: "rhExemplo.hor.erro.versaoInexistente" };
  const problema = problemasDaConfig(dados.config)[0];
  if (problema) return { ok: false, erro: problema };
  const corrigida: VersaoHorario = {
    ...original,
    id: dados.id,
    config: dados.config,
    motivo: dados.motivo.trim(),
    anexoNome: null,
    autor: dados.autor,
    criadaEm: dados.agora,
    corrigeId: original.id,
    correccao: true,
    autorizadaPor: dados.autor,
    substituidaPor: null,
  };
  const versoes = horario.versoes.map((v) => (v.id === original.id ? { ...v, substituidaPor: dados.id } : v));
  return { ok: true, valor: { ...horario, versoes: [...versoes, corrigida] } };
}

export interface DadosExcecao {
  id: string;
  data: string;
  dia: DiaPadrao;
  motivo: string;
  autor: string;
  hoje: string;
  agora: string;
}

/** EXCECAO DE UM DIA: substitui o horario normal nesse dia; no passado so por correccao. */
export function criarExcecao(horario: HorarioPessoa, dados: DadosExcecao): Resultado<HorarioPessoa> {
  if (!motivoValido(dados.motivo)) return { ok: false, erro: "rhExemplo.hor.erro.motivoCurto" };
  if (!dados.data || dados.data < dados.hoje) return { ok: false, erro: "rhExemplo.hor.erro.dataPassada" };
  if (horario.excecoes.some((e) => e.data === dados.data)) return { ok: false, erro: "rhExemplo.hor.erro.excecaoJaExiste" };
  if (problemasDeDia(dados.dia)[0]) return { ok: false, erro: problemasDeDia(dados.dia)[0] };
  const nova: ExcecaoDia = { id: dados.id, data: dados.data, dia: dados.dia, motivo: dados.motivo.trim(), autor: dados.autor, criadaEm: dados.agora };
  return { ok: true, valor: { ...horario, excecoes: [...horario.excecoes, nova] } };
}

export function removerExcecao(horario: HorarioPessoa, id: string): HorarioPessoa {
  return { ...horario, excecoes: horario.excecoes.filter((e) => e.id !== id) };
}

export interface HorarioDoDia {
  origem: "excecao" | "versao" | "sem_horario";
  tipo: TipoHorario | null;
  minutosPlaneados: number;
  versaoId: string | null;
  excecaoId: string | null;
}

/** O horario de um dia: uma excepcao com essa data SUBSTITUI o da semana; senao vale o dia da semana. */
export function resolverHorarioDoDia(horario: HorarioPessoa, iso: string): HorarioDoDia {
  const versao = versaoEmVigor(horario, iso);
  const excecao = horario.excecoes.find((e) => e.data === iso) ?? null;
  if (excecao) {
    return {
      origem: "excecao",
      tipo: versao?.config.tipo ?? null,
      minutosPlaneados: minutosDoDiaPadrao(excecao.dia),
      versaoId: versao?.id ?? null,
      excecaoId: excecao.id,
    };
  }
  if (!versao) return { origem: "sem_horario", tipo: null, minutosPlaneados: 0, versaoId: null, excecaoId: null };
  const diaSemana = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return {
    origem: "versao",
    tipo: versao.config.tipo,
    minutosPlaneados: minutosPlaneadosDoDiaDaSemana(versao.config, diaSemana),
    versaoId: versao.id,
    excecaoId: null,
  };
}

/** Um atraso so conta (e so desconta) acima da tolerancia. */
export function atrasoConta(minutos: number, tolerancia: number = TOLERANCIA_ATRASO_MINUTOS): boolean {
  return minutos > tolerancia;
}
