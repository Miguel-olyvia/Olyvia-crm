/**
 * A logica pura da assiduidade: valor em vigor, sobreposicao de intervalos,
 * falta parcial, e o mapa dos erros estaveis das RPCs.
 *
 * PORQUE E QUE O "VALOR EM VIGOR" EXISTE AQUI SE EXISTE NA BASE
 * -------------------------------------------------------------
 * Quem manda e a base: `v_hr_picagens_em_vigor`,
 * `v_hr_horario_realizado_em_vigor` e `v_hr_faltas_em_vigor` sao a fonte, e e
 * delas que o ecra le todos os NUMEROS. O que se calcula aqui e outra coisa:
 * o HISTORICO. Para desenhar "o valor original, depois cada correccao, e no
 * fim o que esta em vigor" e preciso ter a tabela em BRUTO -- que contem
 * tambem as versoes substituidas -- e saber percorre-la. `emVigor` existe para
 * que essa travessia use exactamente a mesma regra da vista, e nao uma
 * aproximacao: a linha em vigor e a que esta viva e que NENHUMA linha viva
 * corrige.
 *
 * A CADEIA E LINEAR, E ISSO E UM FACTO DA BASE
 * --------------------------------------------
 * Os indices unicos parciais `uq_picagem_um_corrector_vivo`,
 * `uq_realizado_um_corrector_vivo` e `uq_falta_um_corrector_vivo` garantem que
 * cada linha tem no maximo UM corrector vivo. Por isso a travessia e uma
 * lista, nao uma arvore, e tres correccoes empilhadas dao tres linhas na
 * tabela e UMA em vigor.
 *
 * A FALTA E SEMPRE UM PERIODO
 * ---------------------------
 * Nao ha caminho para "faltou o dia todo": o dia todo e o periodo do primeiro
 * ao ultimo minuto planeado. Faltar so a manha de um 09:00-18:00 e
 * 09:00-13:00, e sao os 240 minutos que a coluna gerada vai calcular.
 */
import { minutosDe, formatarDuracao } from "@/lib/hr/horario";

export { formatarDuracao };

/** Minutos entre duas horas `HH:MM` ou `HH:MM:SS`. Negativo se o fim recua. */
export function minutosEntre(
  horaInicio: string | null | undefined,
  horaFim: string | null | undefined,
): number | null {
  const inicio = minutosDe(horaInicio);
  const fim = minutosDe(horaFim);
  if (inicio === null || fim === null) return null;
  return fim - inicio;
}

/** Um periodo de um dia, na unidade em que TUDO neste modulo se apresenta. */
export interface Periodo {
  hora_inicio: string;
  hora_fim: string;
}

/**
 * Dois periodos tocam-se?
 *
 * Fronteira ABERTA: 09:00-13:00 e 13:00-18:00 NAO se sobrepoem. E a mesma
 * comparacao que a base faz (`a.inicio < b.fim AND b.inicio < a.fim`), e e o
 * caso normal de quem tem pausa ao almoco.
 */
export function sobrepoem(a: Periodo, b: Periodo): boolean {
  const aInicio = minutosDe(a.hora_inicio);
  const aFim = minutosDe(a.hora_fim);
  const bInicio = minutosDe(b.hora_inicio);
  const bFim = minutosDe(b.hora_fim);
  if (aInicio === null || aFim === null || bInicio === null || bFim === null) return false;
  return aInicio < bFim && bInicio < aFim;
}

/** Os minutos de `alvo` cobertos por algum dos `cobertores`, sem duplicar. */
export function minutosCobertos(alvo: Periodo, cobertores: readonly Periodo[]): number {
  const inicio = minutosDe(alvo.hora_inicio);
  const fim = minutosDe(alvo.hora_fim);
  if (inicio === null || fim === null || fim <= inicio) return 0;

  const pedacos = cobertores
    .map((c) => ({ de: minutosDe(c.hora_inicio), ate: minutosDe(c.hora_fim) }))
    .filter((c): c is { de: number; ate: number } => c.de !== null && c.ate !== null)
    .map((c) => ({ de: Math.max(c.de, inicio), ate: Math.min(c.ate, fim) }))
    .filter((c) => c.ate > c.de)
    .sort((x, y) => x.de - y.de);

  let total = 0;
  let cursor = inicio;
  for (const pedaco of pedacos) {
    if (pedaco.ate <= cursor) continue;
    total += pedaco.ate - Math.max(pedaco.de, cursor);
    cursor = Math.max(cursor, pedaco.ate);
  }
  return total;
}

/**
 * As chaves dos periodos que se sobrepoem entre si.
 *
 * E o espelho do que a base recusa, para o utilizador nunca ver um erro de
 * servidor por ter escrito duas linhas em cima uma da outra. Mesma ideia de
 * `chavesSobrepostas` do horario planeado, mas sobre periodos com hora e nao
 * sobre o rascunho de sete dias.
 */
export function chavesSobrepostas<T extends Periodo & { chave: string }>(
  periodos: readonly T[],
): Set<string> {
  const conflitos = new Set<string>();
  for (let i = 0; i < periodos.length; i += 1) {
    for (let j = i + 1; j < periodos.length; j += 1) {
      if (sobrepoem(periodos[i], periodos[j])) {
        conflitos.add(periodos[i].chave);
        conflitos.add(periodos[j].chave);
      }
    }
  }
  return conflitos;
}

// ---------------------------------------------------------------------------
// Valor em vigor e cadeia de correccoes
// ---------------------------------------------------------------------------

/** Como se le uma familia de linhas corrigiveis (picagens, horas, faltas). */
export interface LeitorDeCorreccoes<T> {
  idDe: (linha: T) => string;
  /** A linha que ESTA corrige, ou nulo se e um lancamento original. */
  corrigeDe: (linha: T) => string | null;
  /**
   * A linha conta como corrector? Uma correccao anulada nao substitui nada --
   * a linha antiga volta a estar em vigor, tal como na vista.
   */
  viva: (linha: T) => boolean;
}

/**
 * As linhas EM VIGOR: as vivas que nenhuma linha viva corrige.
 *
 * Exactamente a regra das vistas. Preserva a ordem de entrada.
 */
export function emVigor<T>(
  linhas: readonly T[],
  // `NoInfer` de proposito: o tipo sai das LINHAS e nunca do leitor. Sem isto,
  // `emVigor(picagens, LEITOR_PICAGENS)` estreitava tudo para os tres campos
  // que o leitor declara, e a lista devolvida perdia as colunas todas.
  leitor: LeitorDeCorreccoes<NoInfer<T>>,
): T[] {
  const corrigidos = new Set<string>();
  for (const linha of linhas) {
    if (!leitor.viva(linha)) continue;
    const alvo = leitor.corrigeDe(linha);
    if (alvo) corrigidos.add(alvo);
  }
  return linhas.filter((linha) => leitor.viva(linha) && !corrigidos.has(leitor.idDe(linha)));
}

/**
 * O historico de uma linha, do ORIGINAL ao valor em vigor.
 *
 * Sobe pelo ponteiro `corrige_*` ate a linha que nao corrige nada. Devolve
 * sempre pelo menos a propria linha. Uma cadeia com ciclo -- que a base nao
 * deixa criar, mas que uma leitura parcial poderia sugerir -- para em vez de
 * girar para sempre.
 */
export function cadeiaDeCorreccoes<T>(
  linhaEmVigor: T,
  linhas: readonly T[],
  leitor: LeitorDeCorreccoes<NoInfer<T>>,
): T[] {
  const porId = new Map<string, T>();
  for (const linha of linhas) porId.set(leitor.idDe(linha), linha);

  const historico: T[] = [];
  const vistos = new Set<string>();
  let actual: T | undefined = linhaEmVigor;

  while (actual) {
    const id = leitor.idDe(actual);
    if (vistos.has(id)) break;
    vistos.add(id);
    historico.push(actual);
    const anterior = leitor.corrigeDe(actual);
    actual = anterior ? porId.get(anterior) : undefined;
  }

  return historico.reverse();
}

/** Quantas correccoes ha por tras de uma linha em vigor. Zero = original. */
export function contarCorreccoes<T>(
  linhaEmVigor: T,
  linhas: readonly T[],
  leitor: LeitorDeCorreccoes<NoInfer<T>>,
): number {
  return Math.max(cadeiaDeCorreccoes(linhaEmVigor, linhas, leitor).length - 1, 0);
}

/** O leitor das picagens: a que conta e a nao anulada sem corrector vivo. */
export const LEITOR_PICAGENS: LeitorDeCorreccoes<{
  id: string;
  corrige_picagem_id: string | null;
  estado: string;
}> = {
  idDe: (linha) => linha.id,
  corrigeDe: (linha) => linha.corrige_picagem_id,
  viva: (linha) => linha.estado !== "anulada",
};

/** O leitor das faltas. Igual ao das picagens, com o ponteiro proprio. */
export const LEITOR_FALTAS: LeitorDeCorreccoes<{
  id: string;
  corrige_falta_id: string | null;
  estado: string;
}> = {
  idDe: (linha) => linha.id,
  corrigeDe: (linha) => linha.corrige_falta_id,
  viva: (linha) => linha.estado !== "anulada",
};

/** O leitor das horas realizadas: aqui a linha morta e a `rejeitado`. */
export const LEITOR_REALIZADO: LeitorDeCorreccoes<{
  id: string;
  corrige_realizado_id: string | null;
  estado: string;
}> = {
  idDe: (linha) => linha.id,
  corrigeDe: (linha) => linha.corrige_realizado_id,
  viva: (linha) => linha.estado !== "rejeitado",
};

// ---------------------------------------------------------------------------
// O planeado versus o que aconteceu
// ---------------------------------------------------------------------------

/**
 * O que aconteceu num intervalo planeado.
 *
 * `parcial` e a categoria que faz falta: sem ela, um turno de oito horas com
 * seis registadas ficaria "coberto" e ninguem repararia na diferenca.
 */
export type SituacaoDoPlaneado = "coberto" | "parcial" | "emFalta" | "semHoras";

/** A tolerancia abaixo da qual "parcial" e ruido e nao um desvio. */
export const TOLERANCIA_COBERTURA_MINUTOS = 5;

export interface SituacaoIntervalo {
  situacao: SituacaoDoPlaneado;
  minutosPlaneados: number;
  minutosRealizados: number;
  minutosEmFalta: number;
}

/**
 * Cruza um intervalo planeado com as horas em vigor e as faltas em vigor.
 *
 * A falta ganha ao silencio: um intervalo sem horas MAS com falta marcada nao
 * e "sem horas registadas" -- ja foi tratado, e dize-lo outra vez punha na
 * fila de trabalho o que ja saiu dela.
 */
export function situacaoDoIntervalo(
  planeado: Periodo,
  realizados: readonly Periodo[],
  faltas: readonly Periodo[],
): SituacaoIntervalo {
  const minutosPlaneados = Math.max(minutosEntre(planeado.hora_inicio, planeado.hora_fim) ?? 0, 0);
  const minutosRealizados = minutosCobertos(planeado, realizados);
  const minutosEmFalta = minutosCobertos(planeado, faltas);

  if (minutosPlaneados === 0) {
    return { situacao: "coberto", minutosPlaneados: 0, minutosRealizados, minutosEmFalta: 0 };
  }

  const porExplicar = minutosPlaneados - minutosRealizados - minutosEmFalta;

  let situacao: SituacaoDoPlaneado;
  if (
    minutosEmFalta > 0 &&
    minutosRealizados === 0 &&
    porExplicar <= TOLERANCIA_COBERTURA_MINUTOS
  ) {
    situacao = "emFalta";
  } else if (porExplicar <= TOLERANCIA_COBERTURA_MINUTOS) {
    situacao = "coberto";
  } else if (minutosRealizados > 0 || minutosEmFalta > 0) {
    situacao = "parcial";
  } else {
    situacao = "semHoras";
  }

  return { situacao, minutosPlaneados, minutosRealizados, minutosEmFalta };
}

/** Totais por local, para o rodape do dia. `null` = sem local atribuido. */
export function totaisPorLocal(
  intervalos: readonly (Periodo & { local_id: string | null })[],
): Map<string | null, number> {
  const totais = new Map<string | null, number>();
  for (const intervalo of intervalos) {
    const minutos = minutosEntre(intervalo.hora_inicio, intervalo.hora_fim);
    if (minutos === null || minutos <= 0) continue;
    totais.set(intervalo.local_id, (totais.get(intervalo.local_id) ?? 0) + minutos);
  }
  return totais;
}

/**
 * O sentido que o botao de picar vai gravar.
 *
 * Le a ULTIMA picagem em vigor do dia. Sem nenhuma, entra-se. E deliberado nao
 * haver aqui nenhuma regra mais esperta: quem pica ao serao depois da
 * meia-noite tem duas datas locais, e adivinhar seria pior do que o obvio.
 */
export function sentidoSeguinte(
  picagensDoDiaEmVigor: readonly { hora_local: string; sentido: "entrada" | "saida" }[],
): "entrada" | "saida" {
  const ordenadas = [...picagensDoDiaEmVigor].sort((a, b) =>
    a.hora_local.localeCompare(b.hora_local),
  );
  const ultima = ordenadas[ordenadas.length - 1];
  return ultima?.sentido === "entrada" ? "saida" : "entrada";
}

// ---------------------------------------------------------------------------
// Validacao previa da falta
// ---------------------------------------------------------------------------

export interface ProblemaFalta {
  campo: string;
  mensagemKey: string;
}

/**
 * O que se valida ANTES de chamar `rpc_hr_falta_marcar`.
 *
 * Nao se manda a base o que ela vai recusar: a mensagem de um `CHECK` nao diz
 * a ninguem qual o campo nem qual o limite. O que fica do lado da base sao as
 * duas guardas que dependem de dados que o ecra nao tem inteiros --
 * `falta_cruza_realizado` e `falta_coberta_por_ausencia` -- e essas
 * traduzem-se quando chegam.
 */
export function problemasDaFalta(args: {
  data: string;
  horaInicio: string;
  horaFim: string;
  motivoCodigo: string;
}): ProblemaFalta[] {
  const problemas: ProblemaFalta[] = [];

  if (!args.data) {
    problemas.push({ campo: "data", mensagemKey: "hr.assiduidade.erro.semData" });
  }
  if (!args.horaInicio) {
    problemas.push({ campo: "horaInicio", mensagemKey: "hr.assiduidade.erro.semHoraInicio" });
  }
  if (!args.horaFim) {
    problemas.push({ campo: "horaFim", mensagemKey: "hr.assiduidade.erro.semHoraFim" });
  }
  if (!args.motivoCodigo) {
    problemas.push({ campo: "motivoCodigo", mensagemKey: "hr.assiduidade.erro.semMotivoCodigo" });
  }

  const minutos = minutosEntre(args.horaInicio, args.horaFim);
  if (minutos !== null && minutos <= 0) {
    problemas.push({ campo: "horaFim", mensagemKey: "hr.assiduidade.erro.fimAntesDoInicio" });
  }

  return problemas;
}

/**
 * Meio dia de ausencia aprovada nao impede uma falta sobreposta.
 *
 * E uma frouxidao REAL da base: ela guarda fraccao de dia, nao horas, e por
 * isso nao consegue saber se as 09:00-13:00 caem na metade coberta. Aqui
 * AVISA-SE, e nao se bloqueia -- inventar no cliente um bloqueio que a base
 * nao tem faz o utilizador aprender uma regra que nao existe.
 */
export function avisoDeAusenciaParcial(fraccaoAprovadaNoDia: number | null): boolean {
  return fraccaoAprovadaNoDia !== null && fraccaoAprovadaNoDia > 0 && fraccaoAprovadaNoDia < 1;
}

/** Uma justificacao precisa de referencia OU texto: a RPC recusa sem ambos. */
export function justificacaoUtil(documentoRef: string, texto: string): boolean {
  return documentoRef.trim().length > 0 || texto.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Erros estaveis
// ---------------------------------------------------------------------------

/**
 * Os prefixos que as RPCs deste modulo levantam, traduzidos em chave.
 *
 * Devolve `null` quando nao reconhece -- e ai quem chama usa a mensagem
 * amigavel generica E reporta ao Sentry, para se saber que faltou uma chave.
 * Alguns vem de triggers e chegam embrulhados no texto do Postgres, por isso
 * procura-se no MEIO da mensagem e nao so no inicio.
 */
const PREFIXOS: ReadonlyArray<[string, string]> = [
  ["falta_cruza_realizado", "hr.assiduidade.erroRpc.faltaCruzaRealizado"],
  ["falta_coberta_por_ausencia", "hr.assiduidade.erroRpc.faltaCobertaPorAusencia"],
  ["realizado_estado_fora_da_rpc", "hr.assiduidade.erroRpc.estadoForaDaRpc"],
  ["realizado_autovalidacao", "hr.assiduidade.erroRpc.autovalidacao"],
  ["realizado_ja_rejeitado", "hr.assiduidade.erroRpc.jaRejeitado"],
  ["realizado_sem_duracao", "hr.assiduidade.erroRpc.semDuracao"],
  ["realizado_inexistente", "hr.assiduidade.erroRpc.realizadoInexistente"],
  ["realizado_apagado", "hr.assiduidade.erroRpc.realizadoApagado"],
  ["realizado_sem_sessao", "hr.assiduidade.erroRpc.semSessao"],
  ["picagem_sem_sessao", "hr.assiduidade.erroRpc.semSessao"],
  ["picagem_sem_permissao", "hr.assiduidade.erroRpc.semPermissao"],
  ["picagem_sentido_invalido", "hr.assiduidade.erroRpc.sentidoInvalido"],
  ["picagem_alvo_inexistente", "hr.assiduidade.erroRpc.picagemNaoCorrigivel"],
  ["picagem_inexistente", "hr.assiduidade.erroRpc.picagemInexistente"],
  ["picagem_ja_anulada", "hr.assiduidade.erroRpc.picagemJaAnulada"],
  ["picagem_corrige_a_si_mesma", "hr.assiduidade.erroRpc.picagemCorrigeASiMesma"],
  ["picagem_anulacao_sem_motivo", "hr.assiduidade.erroRpc.semMotivo"],
  ["picagem_pessoa_invalida", "hr.assiduidade.erroRpc.pessoaInvalida"],
  ["falta_sem_sessao", "hr.assiduidade.erroRpc.semSessao"],
  ["falta_horas_invalidas", "hr.assiduidade.erroRpc.horasInvalidas"],
  ["falta_inexistente", "hr.assiduidade.erroRpc.faltaInexistente"],
  ["falta_ja_anulada", "hr.assiduidade.erroRpc.faltaJaAnulada"],
  ["falta_correccao_sem_motivo", "hr.assiduidade.erroRpc.semMotivo"],
  ["falta_anulacao_sem_motivo", "hr.assiduidade.erroRpc.semMotivo"],
  ["falta_pessoa_invalida", "hr.assiduidade.erroRpc.pessoaInvalida"],
  ["ausencia_dia_inexistente", "hr.assiduidade.erroRpc.ausenciaDiaInexistente"],
  ["assiduidade_sem_sessao", "hr.assiduidade.erroRpc.semSessao"],
];

export function chaveDoErroDeAssiduidade(erro: unknown): string | null {
  const mensagem =
    typeof erro === "string"
      ? erro
      : typeof (erro as { message?: unknown } | null)?.message === "string"
        ? (erro as { message: string }).message
        : "";
  if (!mensagem) return null;
  const encontrado = PREFIXOS.find(([prefixo]) => mensagem.includes(prefixo));
  return encontrado ? encontrado[1] : null;
}

/** `YYYY-MM-DD` de hoje no fuso do browser, sem passar por UTC. */
export function hojeIso(agora: Date = new Date()): string {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** `HH:MM` de agora, para pre-preencher um lancamento manual. */
export function agoraHoraLocal(agora: Date = new Date()): string {
  const horas = String(agora.getHours()).padStart(2, "0");
  const minutos = String(agora.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

/** "09:00:00" -> "09:00". A base devolve segundos e ninguem os quer ler. */
export function horaCurta(hora: string | null | undefined): string {
  if (!hora) return "—";
  return hora.slice(0, 5);
}

/** O primeiro e o ultimo minuto planeado do dia: o "dia todo" de uma falta. */
export function envolventeDoDia(intervalos: readonly Periodo[]): Periodo | null {
  const validos = intervalos
    .map((i) => ({ inicio: minutosDe(i.hora_inicio), fim: minutosDe(i.hora_fim), bruto: i }))
    .filter((i) => i.inicio !== null && i.fim !== null);
  if (validos.length === 0) return null;
  const primeiro = validos.reduce((a, b) => ((a.inicio ?? 0) <= (b.inicio ?? 0) ? a : b));
  const ultimo = validos.reduce((a, b) => ((a.fim ?? 0) >= (b.fim ?? 0) ? a : b));
  return { hora_inicio: primeiro.bruto.hora_inicio, hora_fim: ultimo.bruto.hora_fim };
}
