/**
 * O horario REAL da pessoa (`pessoas_horario_planeado`) visto como versoes e excepcoes de um dia. Funcoes puras,
 * sem base: recebem as linhas que o hook da ficha ja leu e devolvem o que o painel do horario e o calendario mostram.
 *
 * COMO UMA LINHA VIRA UMA «VERSAO»
 * --------------------------------
 * A base nao tem versoes: tem linhas, uma por intervalo. As recorrentes (`dia_semana` preenchido, `data` nula) tem uma
 * janela `valido_de`/`valido_ate`; as que partilham a mesma janela formam uma versao. Uma linha com `data` e a
 * excepcao desse dia e substitui o padrao semanal nessa data (a mesma regra de `leituraDoPlaneado`).
 *
 * O QUE A BASE NAO GUARDA, E ESTE FICHEIRO NAO INVENTA
 * ----------------------------------------------------
 * So existem dois «tipos»: padrao (um intervalo por dia) e repartido (dois ou mais intervalos no dia). Nao ha coluna
 * para isencao, livre, banco de horas, pausa em minutos, motivo ou anexo de uma versao, nem autor de uma excepcao.
 * Quem precisar destes valores tem de os pedir a uma migration; aqui recusam-se com uma mensagem, nunca se
 * guardam em memoria.
 */
import { emVigor, LEITOR_PLANEADO } from "@/components/rh-exemplo/lib/assiduidade";
import {
  hojeIsoServidor,
  horaNormalizada,
  linhaPlaneadaDecorrida,
  linhasParaGravar,
  minutosDe,
  novaChave,
  ORDEM_DIAS,
  rascunhoDeLinhas,
  type HorarioRascunho,
  type IntervaloRascunho,
  type LinhaPlaneadoParaGravar,
} from "@/components/rh-exemplo/lib/horario";
import {
  configInicial,
  diaPadraoVazio,
  minutosDoDiaPadrao,
  problemasDaConfig,
  type ConfigHorario,
  type DiaPadrao,
  type ExcecaoDia,
  type HorarioPessoa,
  type Resultado,
  type VersaoHorario,
} from "@/components/rh-exemplo/lib/horarioTipos";
import type { HorarioPlaneado } from "@/components/rh-exemplo/tipos";

/** Os unicos tipos que a base sabe representar. */
export const TIPOS_REAIS = ["padrao", "repartido"] as const;
export type TipoReal = (typeof TIPOS_REAIS)[number];

/** Data anterior a qualquer outra, para uma regra sem `valido_de` (todo o horario escrito antes das janelas). */
export const DESDE_SEMPRE = "0001-01-01";

export type EstadoVersaoReal = "em_vigor" | "futura" | "fechada";

export interface IntervaloHora {
  inicio: string;
  fim: string;
}

export interface VersaoReal {
  /** Chave estavel da janela (`valido_de|valido_ate`). */
  chave: string;
  desde: string | null;
  ate: string | null;
  tipo: TipoReal;
  /** Indice = dia da semana (0 domingo .. 6 sabado). */
  dias: DiaPadrao[];
  linhas: HorarioPlaneado[];
  minutosSemana: number;
  /** Alguma linha desta versao e uma correccao de outra. */
  corrigida: boolean;
  motivoCorreccao: string | null;
  estado: EstadoVersaoReal;
}

export interface ExcecaoReal {
  data: string;
  naoTrabalha: boolean;
  intervalos: IntervaloHora[];
  dia: DiaPadrao;
}

const SEM_DIA: DiaPadrao = { trabalha: false, entrada: "09:00", saida: "18:00", pausaMin: 0 };

const hhmm = (hora: string | null): string => horaNormalizada(hora ?? "").slice(0, 5);

function intervalosDe(linhas: readonly HorarioPlaneado[]): IntervaloHora[] {
  return linhas
    .filter((l) => !l.nao_trabalha && l.hora_inicio && l.hora_fim)
    .map((l) => ({ inicio: hhmm(l.hora_inicio), fim: hhmm(l.hora_fim) }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Um dia com varios intervalos como entrada, saida e pausa: as horas contam exactamente (o buraco e a pausa). */
export function diaDeIntervalos(intervalos: readonly IntervaloHora[]): DiaPadrao {
  if (intervalos.length === 0) return { ...SEM_DIA };
  const entrada = intervalos[0].inicio;
  const saida = intervalos[intervalos.length - 1].fim;
  const total = (minutosDe(saida) ?? 0) - (minutosDe(entrada) ?? 0);
  const feito = intervalos.reduce((soma, i) => soma + Math.max(0, (minutosDe(i.fim) ?? 0) - (minutosDe(i.inicio) ?? 0)), 0);
  return { trabalha: true, entrada, saida, pausaMin: Math.max(0, total - feito) };
}

const ehRecorrente = (l: HorarioPlaneado): boolean => l.data === null && l.dia_semana !== null;

function estadoDaJanela(desde: string | null, ate: string | null, hoje: string): EstadoVersaoReal {
  if (desde !== null && desde > hoje) return "futura";
  return ate === null || ate >= hoje ? "em_vigor" : "fechada";
}

/** As versoes do horario semanal, da mais recente para a mais antiga. So conta a linha em vigor (sem as corrigidas). */
export function versoesDoPlaneado(linhas: readonly HorarioPlaneado[], hoje: string = hojeIsoServidor()): VersaoReal[] {
  const grupos = new Map<string, HorarioPlaneado[]>();
  for (const linha of emVigor([...linhas], LEITOR_PLANEADO).filter(ehRecorrente)) {
    const chave = `${linha.valido_de ?? ""}|${linha.valido_ate ?? ""}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha]);
  }
  const versoes = [...grupos.entries()].map(([chave, doGrupo]): VersaoReal => {
    const dias = Array.from({ length: 7 }, (_, d) => diaDeIntervalos(intervalosDe(doGrupo.filter((l) => l.dia_semana === d))));
    const repartido = Array.from({ length: 7 }, (_, d) => doGrupo.filter((l) => l.dia_semana === d && !l.nao_trabalha).length).some((n) => n >= 2);
    const corrigidas = doGrupo.filter((l) => l.corrige_horario_id !== null);
    const desde = doGrupo[0].valido_de;
    const ate = doGrupo[0].valido_ate;
    return {
      chave,
      desde,
      ate,
      tipo: repartido ? "repartido" : "padrao",
      dias,
      linhas: doGrupo,
      minutosSemana: dias.reduce((soma, dia) => soma + minutosDoDiaPadrao(dia), 0),
      corrigida: corrigidas.length > 0,
      motivoCorreccao: corrigidas.find((l) => l.correccao_motivo)?.correccao_motivo ?? null,
      estado: estadoDaJanela(desde, ate, hoje),
    };
  });
  return versoes.sort((a, b) => (b.desde ?? DESDE_SEMPRE).localeCompare(a.desde ?? DESDE_SEMPRE));
}

export function versaoEmVigorReal(versoes: readonly VersaoReal[]): VersaoReal | null {
  return versoes.find((v) => v.estado === "em_vigor") ?? null;
}

/** Aviso (nunca bloqueia): o total semanal planeado e diferente das horas contratadas. */
export function avisoContratadasMin(minutosSemana: number, horasContratadasSemanais: number | null | undefined): boolean {
  if (horasContratadasSemanais === null || horasContratadasSemanais === undefined || horasContratadasSemanais <= 0) return false;
  return minutosSemana !== Math.round(horasContratadasSemanais * 60);
}

/** A configuracao inicial de uma versao real: padrao, sem pausa (a base nao a guarda). */
export function configInicialReal(): ConfigHorario {
  const base = configInicial("padrao");
  return { ...base, padrao: base.padrao.map((d) => ({ ...d, pausaMin: 0 })) };
}

function intervalosPorDia(versao: VersaoReal): IntervaloHora[][] {
  return Array.from({ length: 7 }, (_, d) => intervalosDe(versao.linhas.filter((l) => l.dia_semana === d)));
}

/**
 * A versao como configuracao editavel, ou `null` quando nao cabe num dos dois tipos (por exemplo horas diferentes
 * em cada dia com dois periodos, ou tres intervalos no mesmo dia): nesse caso edita-se nas linhas, mais abaixo.
 */
export function configDaVersao(versao: VersaoReal): ConfigHorario | null {
  const porDia = intervalosPorDia(versao);
  if (porDia.some((i) => i.length > 2)) return null;
  const base = configInicialReal();
  if (versao.tipo === "padrao") {
    return { ...base, tipo: "padrao", padrao: porDia.map((i) => diaDeIntervalos(i)) };
  }
  const comPeriodos = porDia.map((i, dia) => ({ dia, i })).filter((x) => x.i.length > 0);
  if (comPeriodos.some((x) => x.i.length !== 2)) return null;
  const [primeiro] = comPeriodos;
  const igual = comPeriodos.every((x) => x.i[0].inicio === primeiro.i[0].inicio && x.i[0].fim === primeiro.i[0].fim && x.i[1].inicio === primeiro.i[1].inicio && x.i[1].fim === primeiro.i[1].fim);
  if (!igual) return null;
  return {
    ...base,
    tipo: "repartido",
    repartido: {
      p1Inicio: primeiro.i[0].inicio, p1Fim: primeiro.i[0].fim, p2Inicio: primeiro.i[1].inicio, p2Fim: primeiro.i[1].fim,
      dias: comPeriodos.map((x) => x.dia),
    },
  };
}

/** As linhas que ainda se alteram (em vigor ou futuras): as que `savePlaneado` substitui. */
export function linhasEditaveis(planeado: readonly HorarioPlaneado[], hoje: string = hojeIsoServidor()): HorarioPlaneado[] {
  return planeado.filter((l) => !linhaPlaneadaDecorrida(l, hoje));
}

function intervalosDaConfig(config: ConfigHorario, dia: number): IntervaloHora[] {
  if (config.tipo === "repartido") {
    const r = config.repartido;
    return r.dias.includes(dia) ? [{ inicio: r.p1Inicio, fim: r.p1Fim }, { inicio: r.p2Inicio, fim: r.p2Fim }] : [];
  }
  const d = config.padrao[dia];
  return d?.trabalha ? [{ inicio: d.entrada, fim: d.saida }] : [];
}

/**
 * As linhas a gravar para uma NOVA VERSAO (ALTERAR: vale a partir de hoje). Mantem as excepcoes futuras que ja
 * existiam, porque `savePlaneado` substitui tudo o que ainda se pode alterar, e o local de cada intervalo que ja o tinha.
 */
export function linhasParaNovaVersao(editaveis: readonly HorarioPlaneado[], config: ConfigHorario): Resultado<LinhaPlaneadoParaGravar[]> {
  if (!(TIPOS_REAIS as readonly string[]).includes(config.tipo)) return { ok: false, erro: "rhExemplo.hor.real.tipoSemColuna" };
  if (config.tipo === "padrao" && config.padrao.some((d) => d.trabalha && d.pausaMin > 0)) return { ok: false, erro: "rhExemplo.hor.real.pausaSemColuna" };
  const problema = problemasDaConfig(config)[0];
  if (problema) return { ok: false, erro: problema };
  const actual = rascunhoDeLinhas([...editaveis]);
  const dias = ORDEM_DIAS.map((dia_semana) => {
    const locais = actual.dias.find((d) => d.dia_semana === dia_semana)?.intervalos ?? [];
    const intervalos: IntervaloRascunho[] = intervalosDaConfig(config, dia_semana).map((i, indice) => ({
      chave: novaChave(), hora_inicio: i.inicio, hora_fim: i.fim, local_id: locais[indice]?.local_id ?? null,
    }));
    return { dia_semana, nao_trabalha: false, intervalos };
  });
  return { ok: true, valor: linhasParaGravar({ dias, excepcoes: actual.excepcoes }) };
}

/** As excepcoes de um dia que ainda se podem alterar (hoje ou futuras), por data. */
export function excecoesDoPlaneado(editaveis: readonly HorarioPlaneado[]): ExcecaoReal[] {
  const porData = new Map<string, HorarioPlaneado[]>();
  for (const linha of emVigor([...editaveis], LEITOR_PLANEADO)) {
    if (linha.data !== null) porData.set(linha.data, [...(porData.get(linha.data) ?? []), linha]);
  }
  return [...porData.entries()]
    .map(([data, doDia]): ExcecaoReal => {
      const intervalos = intervalosDe(doDia);
      return { data, naoTrabalha: intervalos.length === 0, intervalos, dia: diaDeIntervalos(intervalos) };
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Acrescenta a excepcao de um dia ao que ja se pode alterar. No passado nao se cria (so se corrige). */
export function linhasComExcecao(
  editaveis: readonly HorarioPlaneado[],
  dados: { data: string; dia: DiaPadrao },
  hoje: string = hojeIsoServidor(),
): Resultado<LinhaPlaneadoParaGravar[]> {
  if (!dados.data || dados.data < hoje) return { ok: false, erro: "rhExemplo.hor.erro.dataPassada" };
  if (excecoesDoPlaneado(editaveis).some((e) => e.data === dados.data)) return { ok: false, erro: "rhExemplo.hor.erro.excecaoJaExiste" };
  const entrada = minutosDe(dados.dia.entrada);
  const saida = minutosDe(dados.dia.saida);
  if (dados.dia.trabalha && (entrada === null || saida === null || saida <= entrada)) return { ok: false, erro: "rhExemplo.hor.erro.fimAntesInicio" };
  const actual = rascunhoDeLinhas([...editaveis]);
  const intervalos: IntervaloRascunho[] = dados.dia.trabalha
    ? [{ chave: novaChave(), hora_inicio: dados.dia.entrada, hora_fim: dados.dia.saida, local_id: null }]
    : [];
  const excepcoes = [...actual.excepcoes, { chave: novaChave("exc"), data: dados.data, nao_trabalha: !dados.dia.trabalha, intervalos }];
  return { ok: true, valor: linhasParaGravar({ dias: actual.dias, excepcoes }) };
}

/** O que sobra depois de tirar a excepcao de uma data. */
export function linhasSemExcecao(editaveis: readonly HorarioPlaneado[], data: string): LinhaPlaneadoParaGravar[] {
  const actual: HorarioRascunho = rascunhoDeLinhas([...editaveis]);
  return linhasParaGravar({ dias: actual.dias, excepcoes: actual.excepcoes.filter((e) => e.data !== data) });
}

/**
 * As linhas reais no formato que o calendario e o resolvedor de dia ja conhecem. Sem linhas devolve `undefined`
 * (sem horario: nao se mostra nada previsto). Versao e excepcao em vigor tal como `leituraDoPlaneado` as le.
 */
export function horarioPessoaDeLinhas(linhas: readonly HorarioPlaneado[], hoje: string = hojeIsoServidor()): HorarioPessoa | undefined {
  if (linhas.length === 0) return undefined;
  const versoes: VersaoHorario[] = versoesDoPlaneado(linhas, hoje).map((v) => ({
    id: v.chave,
    config: { ...configInicialReal(), tipo: "padrao", padrao: v.dias.map((d) => (d.trabalha ? d : diaPadraoVazio(false))) },
    desde: v.desde ?? DESDE_SEMPRE,
    ate: v.ate,
    motivo: v.motivoCorreccao ?? "",
    anexoNome: null,
    autor: "",
    criadaEm: "",
    corrigeId: null,
    correccao: v.corrigida,
    autorizadaPor: null,
    substituidaPor: null,
  }));
  const excecoes: ExcecaoDia[] = excecoesDoPlaneado(linhas).map((e) => ({
    id: `exc-${e.data}`, data: e.data, dia: e.dia, motivo: "", autor: "", criadaEm: "",
  }));
  return { versoes, excecoes };
}
