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
import { numeroDe } from "@/lib/hr/numeros";
import { TIPOS_CONTRATO, type HorasFrequencia, type TipoContrato } from "@/types/hr";

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

// -- O modelo do contrato: tipo, regime contratual e duracao -----------------

/**
 * Os tipos de contrato a mostrar no selector: a lista oferecida
 * (`TIPOS_CONTRATO`) e, se o contrato que se esta a ver tiver um tipo que ja
 * nao se oferece (`estagio`, `prestacao_servicos` em contratos antigos), esse tambem -- senao o selector mostrava outro valor ou nenhum, e
 * o proximo Gravar mudava o tipo sem ninguem o ter escolhido.
 */
export function tiposContratoParaMostrar(actual: TipoContrato | ""): readonly TipoContrato[] {
  if (actual === "" || TIPOS_CONTRATO.includes(actual)) return TIPOS_CONTRATO;
  return [...TIPOS_CONTRATO, actual];
}

/**
 * A duracao em meses so se pergunta no termo certo. O termo incerto nao tem
 * duracao em meses (acaba quando acaba a causa), o sem termo nao acaba, e a
 * duracao muito curta conta-se em dias.
 */
export function tipoTemDuracaoEmMeses(tipoContrato: TipoContrato | ""): boolean {
  return tipoContrato === "termo_certo";
}
