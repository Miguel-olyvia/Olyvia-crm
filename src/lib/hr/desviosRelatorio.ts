/**
 * Como o relatorio de assiduidade e o processamento respeitam a margem de tempo. Funcoes puras; a regra das medidas vive em
 * `desvios.ts` (a mesma da base) e aqui so se decide QUANTO CONTA cada dia.
 *
 * SEM MARGEM CONFIGURADA o resultado e IDENTICO ao de antes: conta o realizado (`contadoMinutos = realizadoMinutos`) e o
 * excesso sobre o planeado continua a ser o «extra» em bruto. COM margem (versao em vigor NESSE DIA):
 *  - dia sem planeado (feriado, descanso) ou sem realizado (falta), ausencia de dia inteiro: como antes;
 *  - dentro da margem: conta o planeado e nao ha extra;
 *  - com desvio (linha de `pessoas_desvios` ainda nao substituida): a_validar conta PROVISORIAMENTE o planeado e fica marcado;
 *    validado conta o que a decisao manda (`minutosQueContam`);
 *  - SEM linha: como antes. O cliente NAO mede desvios por conta propria (as regras da base tem excepcoes que ele nao conhece:
 *    ausencia parcial aprovada, isencao de horario, feriado, descanso). O fecho deteta na base e a releitura traz as linhas verdadeiras.
 * O `realizadoMinutos` do dia nunca se altera: e o que se picou.
 *
 * PONTO DE LIGACAO DAS HORAS EXTRA APROVADAS (tarefa a parte): quando as horas extra aprovadas (`pessoas_horas_extra`)
 * chegarem ao relatorio, entram por `EntradaContarDia.extraAprovadoMin` (minutos aprovados nesse dia); com margem, o extra que
 * conta e o maior entre o da decisao do desvio e o aprovado. Hoje quem chama passa 0.
 */
import { minutosQueContam, type DecisaoDesvio, type NaturezaDesvio } from "@/lib/hr/desvios";
import type { Periodo } from "@/lib/hr/assiduidade";

/** Uma versao de `hr_desvios_config` (a forma que `rpc_hr_desvios_config_ler` devolve). */
export interface VersaoMargem {
  id: string;
  /** Minutos 0..120; `null` = «sem margem» (funcionalidade desligada a partir de `valido_de`). */
  margem_min: number | null;
  /** AAAA-MM-DD, inclusivo. */
  valido_de: string;
  /** AAAA-MM-DD, inclusivo; `null` = sem fim. */
  valido_ate: string | null;
  substituida_em: string | null;
  created_at?: string;
}

/**
 * A margem em vigor num dia (as versoes substituidas nao contam); `null` = funcionalidade desligada nesse dia (sem versao
 * nenhuma, ou a versao em vigor e «sem margem»).
 */
export function margemDoDia(versoes: readonly VersaoMargem[], iso: string): number | null {
  let escolhida: VersaoMargem | null = null;
  for (const v of versoes) {
    if (v.substituida_em !== null) continue;
    if (v.valido_de > iso || (v.valido_ate !== null && v.valido_ate < iso)) continue;
    if (!escolhida || v.valido_de > escolhida.valido_de) escolhida = v;
  }
  return escolhida ? escolhida.margem_min : null;
}

/** O que o relatorio precisa de uma linha de `rpc_hr_desvios_listar` (so as versoes nao substituidas). */
export interface DesvioLido {
  id: string;
  estado: "a_validar" | "validado";
  natureza: NaturezaDesvio | null;
  decisao: "normal" | "hora_extra" | "aceitar_desvio" | null;
  planeado_min: number;
  realizado_min: number;
}

/** O desvio de um dia (uma linha de `pessoas_desvios` em vigor). */
export interface DesvioDoDia {
  id: string;
  estado: "a_validar" | "validado";
  decisao: DecisaoDesvio;
  natureza: NaturezaDesvio | null;
}

export interface EntradaContarDia {
  /** O estado do dia no relatorio (`normal`, `descanso`, `feriado`, `ausencia`, `sem_registo`). */
  estado: string;
  planeadoMinutos: number;
  realizadoMinutos: number;
  /** Ha uma falta registada neste dia. Sem linha de desvios conta como antes (a base mede o dia sem a falta). */
  temFalta?: boolean;
  planeadoIntervalos?: readonly Periodo[];
  realizadoIntervalos?: readonly Periodo[];
  /** A margem em vigor NESTE dia; `null` = sem margem (resultado identico ao de antes). */
  margemMin: number | null;
  /** A versao nao substituida de `pessoas_desvios` deste dia, se houver. */
  desvio: DesvioLido | null;
  /** Ponto de ligacao das horas extra aprovadas (ver o cabecalho). */
  extraAprovadoMin?: number;
}

export interface ContagemDoDia {
  contadoMinutos: number;
  extraValidadoMinutos: number;
  desvio: DesvioDoDia | null;
}

export function contarDia(entrada: EntradaContarDia): ContagemDoDia {
  const { planeadoMinutos, realizadoMinutos, margemMin } = entrada;
  const comoAntes: ContagemDoDia = {
    contadoMinutos: realizadoMinutos,
    extraValidadoMinutos: Math.max(realizadoMinutos - planeadoMinutos, 0),
    desvio: null,
  };
  if (margemMin === null) return comoAntes;
  if (entrada.estado === "ausencia" || planeadoMinutos <= 0 || realizadoMinutos <= 0) return comoAntes;

  const linha = entrada.desvio;
  // Sem linha (ou com uma falta registada sem linha): como antes. O desvio so existe se a base o gravou.
  if (!linha) return comoAntes;

  const aprovado = Math.max(entrada.extraAprovadoMin ?? 0, 0);
  const decisao: DecisaoDesvio = linha.estado === "a_validar" ? "a_validar" : (linha.decisao ?? "a_validar");
  const { contadoMin, extraMin } = minutosQueContam(
    { planeadoMin: linha.planeado_min, realizadoMin: linha.realizado_min, temDesvio: true },
    decisao,
  );
  const extra = Math.max(extraMin, aprovado);
  return {
    contadoMinutos: contadoMin + (extra - extraMin),
    extraValidadoMinutos: extra,
    desvio: { id: linha.id, estado: linha.estado, decisao, natureza: linha.natureza },
  };
}

/** Uma linha da chave de desvios de uma pessoa: o que identifica a versao em vigor e a decisao (substituir cria outro id). */
export const linhaDaChaveDeDesvios = (data: string, id: string, estado: string, decisao: string | null): string =>
  `${data}|${id}|${estado}|${decisao ?? ""}`;

/** A chave de um conjunto de linhas de desvios (ordenada): igual = nenhuma decisao nem deteccao mudou. Vazio = sem desvios. */
export const chaveDeDesvios = (linhas: readonly string[]): string => [...linhas].sort().join("\n");

/** Alguma versao com margem (nao «sem margem») cobre algum dia de `[de, ate]`? Sem ela nao ha desvios nem deteccao a fazer. */
export function margemLigadaNoPeriodo(versoes: readonly VersaoMargem[], de: string, ate: string): boolean {
  return versoes.some(
    (v) => v.substituida_em === null && v.margem_min !== null && v.valido_de <= ate && (v.valido_ate === null || v.valido_ate >= de),
  );
}