/**
 * Os numeros do contrato, validados NUM SO SITIO.
 *
 * PORQUE ISTO SAIU DE novaPessoa.ts
 * ---------------------------------
 * Os mesmos cinco numeros -- horas, maximo semanal, maximo anual, FTE e dias
 * de periodo experimental -- sao editaveis em dois ecras: o assistente de
 * criacao e o separador Contratos da ficha. Estavam validados apenas no
 * primeiro; o segundo tinha `max=80` no atributo do input e mais nada, e um
 * atributo HTML nao impede colagem nem entrada programatica. A unica barreira
 * real nesse ecra era o CHECK da base.
 *
 * Os limites vem dos CHECK e nao de opiniao:
 *   - horas: tecto de 80h no EQUIVALENTE SEMANAL
 *     (`pessoas_vinculos_horas_equivalentes_validas`, 20261120190000);
 *   - maximo semanal: 0..80 (`..._horas_semanais_maximas_validas`);
 *   - maximo anual: 0..4000 (`..._horas_anuais_maximas_validas`);
 *   - FTE: 0..100 (`..._tempo_trabalho_pct_valido`);
 *   - experimental: 0..1095 (`..._periodo_experimental_dias_valido`);
 *   - e o cruzamento maximo semanal >= equivalente semanal
 *     (`..._maximo_acima_do_contratado`).
 *
 * Devolve campos abstractos, nao `id` de DOM: cada ecra tem os seus proprios
 * identificadores e e ele que os mapeia.
 */
import { equivalenteSemanal, TECTO_SEMANAL_EQUIVALENTE } from "@/lib/hr/horas";
import type { HorasFrequencia, RegimeTrabalho, TipoContrato } from "@/types/hr";

export type CampoNumericoContrato =
  | "horas"
  | "maximoSemanal"
  | "maximoAnual"
  | "fte"
  | "experimental";

export interface ProblemaNumerico {
  campo: CampoNumericoContrato;
  mensagemKey: string;
}

/** Os valores como estao no ecra: texto, porque e o que um input devolve. */
export interface NumerosDoContrato {
  horas: string;
  horas_frequencia: HorasFrequencia;
  horas_semanais_maximas: string;
  horas_anuais_maximas: string;
  tempo_trabalho_pct: string;
  /** Vazio quando o contrato nao tem periodo experimental. */
  periodo_experimental_dias: string;
}

/** Texto -> numero. Vazio e ausencia, nao zero; ilegivel e `NaN` controlado. */
function numeroDe(valor: string): number | null {
  const limpo = valor.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export function problemasDosNumerosDoContrato(
  valores: NumerosDoContrato,
): ProblemaNumerico[] {
  const problemas: ProblemaNumerico[] = [];

  const horas = numeroDe(valores.horas);
  const equivalente = equivalenteSemanal(horas, valores.horas_frequencia);
  if (
    valores.horas.trim() !== "" &&
    (horas === null ||
      horas < 0 ||
      equivalente === null ||
      equivalente > TECTO_SEMANAL_EQUIVALENTE)
  ) {
    problemas.push({ campo: "horas", mensagemKey: "hr.form.erroHoras" });
  }

  const maxSemanal = numeroDe(valores.horas_semanais_maximas);
  if (
    valores.horas_semanais_maximas.trim() !== "" &&
    (maxSemanal === null || maxSemanal < 0 || maxSemanal > 80)
  ) {
    problemas.push({ campo: "maximoSemanal", mensagemKey: "hr.form.erroHoras" });
  }

  const maxAnual = numeroDe(valores.horas_anuais_maximas);
  if (
    valores.horas_anuais_maximas.trim() !== "" &&
    (maxAnual === null || maxAnual < 0 || maxAnual > 4000)
  ) {
    problemas.push({ campo: "maximoAnual", mensagemKey: "hr.form.erroNumero" });
  }

  const pct = numeroDe(valores.tempo_trabalho_pct);
  if (
    valores.tempo_trabalho_pct.trim() !== "" &&
    (pct === null || pct < 0 || pct > 100)
  ) {
    problemas.push({ campo: "fte", mensagemKey: "hr.form.erroPercentagem" });
  }

  const experimental = numeroDe(valores.periodo_experimental_dias);
  if (
    valores.periodo_experimental_dias.trim() !== "" &&
    (experimental === null || experimental < 0 || experimental > 1095)
  ) {
    problemas.push({ campo: "experimental", mensagemKey: "hr.form.erroDias" });
  }

  // O maximo semanal nao tem frequencia propria -- e sempre semanal -- por isso
  // compara-se com o equivalente e nunca com a quantidade crua.
  if (maxSemanal !== null && equivalente !== null && maxSemanal < equivalente) {
    problemas.push({
      campo: "maximoSemanal",
      mensagemKey: "hr.form.erroMaximoSemanal",
    });
  }

  return problemas;
}

// -- Tipo de contrato "tempo parcial" vs. regime -----------------------------

/**
 * "Tempo parcial" e ao mesmo tempo um TIPO DE CONTRATO (decisao do utilizador,
 * 20261120200000) e um dos dois valores de `regime`, o "Tipo de trabalho". Os
 * dois campos podem por isso contradizer-se: tipo `tempo_parcial` com regime
 * `tempo_inteiro`.
 *
 * A base NAO impede a contradicao, e a migration explica porque: `regime` e
 * NOT NULL DEFAULT 'tempo_inteiro' e a base nao distingue um regime ESCOLHIDO
 * de um que veio por omissao -- um CHECK cruzado recusaria justamente o caso
 * mais comum, escolher "Tempo parcial" e nao mexer no regime. Resolve-se no
 * caminho de ESCRITA, e o ecra sabe o que a base nao sabe: se alguem mexeu no
 * regime a mao.
 *
 * A regra, em tres partes:
 *   1. o regime SEGUE para `tempo_parcial` quando o tipo passa a tempo parcial
 *      -- mas so enquanto ninguem lhe tiver tocado;
 *   2. um regime escolhido A MAO nao se sobrepoe, nunca: em vez de silenciar a
 *      escolha mostra-se o aviso de `regimeContradizTipoContrato`;
 *   3. so segue para a frente. Sair de `tempo_parcial` para outro tipo NAO
 *      repoe `tempo_inteiro`: nao ha contradicao nenhuma num contrato sem termo
 *      a tempo parcial, e desfazer o valor seria mexer sozinho num campo que ja
 *      nao esta em causa.
 */
export function regimeAoMudarTipoContrato(
  tipoContrato: TipoContrato | "",
  regimeActual: RegimeTrabalho,
  regimeEscolhidoAMao: boolean,
): RegimeTrabalho {
  if (tipoContrato !== "tempo_parcial") return regimeActual;
  if (regimeEscolhidoAMao) return regimeActual;
  return "tempo_parcial";
}

/**
 * O que se mostra junto ao regime: o tipo de contrato diz tempo parcial e o
 * regime diz outra coisa. Acontece quando a escolha do regime foi deliberada, e
 * tambem em fichas gravadas antes desta regra existir.
 */
export function regimeContradizTipoContrato(
  tipoContrato: TipoContrato | "",
  regime: RegimeTrabalho,
): boolean {
  return tipoContrato === "tempo_parcial" && regime !== "tempo_parcial";
}
