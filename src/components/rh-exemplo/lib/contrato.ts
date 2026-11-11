/**
 * Os numeros do contrato, validados NUM SO SITIO.
 *
 * PORQUE ISTO SAIU DE novaPessoa.ts
 * ---------------------------------
 * Os mesmos numeros -- horas e dias de periodo experimental -- sao editaveis
 * em dois ecras: o assistente de criacao e o separador Contratos da ficha.
 * Estavam validados apenas no primeiro; o segundo tinha `max` no atributo do
 * input e mais nada, e um atributo HTML nao impede colagem nem entrada
 * programatica. A unica barreira real nesse ecra era o CHECK da base.
 *
 * O MAXIMO SEMANAL E O FTE (`tempo_trabalho_pct`) SAIRAM DOS ECRAS por decisao
 * do RH: as colunas ficam na base, mas nada aqui as le, valida ou envia. O
 * CHECK cruzado da base (`pessoas_vinculos_maximo_acima_do_contratado`) so nao
 * tem o que comparar quando `horas_semanais_maximas` esta NULL (contratos novos).
 * Um contrato que JA tem maximo continua a ser comparado, e agora o ecra nao o
 * deixa mudar: subir as horas acima desse maximo e recusado pela base.
 *
 * Os limites vem dos CHECK e nao de opiniao:
 *   - horas: tecto de 80h no EQUIVALENTE SEMANAL
 *     (`pessoas_vinculos_horas_equivalentes_validas`, 20261120190000);
 *   - experimental: 0..1095 (`..._periodo_experimental_dias_valido`).
 *
 * Devolve campos abstractos, nao `id` de DOM: cada ecra tem os seus proprios
 * identificadores e e ele que os mapeia.
 */
import { equivalenteSemanal, TECTO_SEMANAL_EQUIVALENTE } from "@/components/rh-exemplo/lib/horas";
import { numeroDe } from "@/components/rh-exemplo/lib/numeros";
import { TIPOS_CONTRATO, type HorasFrequencia, type TipoContrato } from "@/components/rh-exemplo/tipos";

export type CampoNumericoContrato = "horas" | "experimental";

export interface ProblemaNumerico {
  campo: CampoNumericoContrato;
  mensagemKey: string;
}

/** Os valores como estao no ecra: texto, porque e o que um input devolve. */
export interface NumerosDoContrato {
  horas: string;
  horas_frequencia: HorasFrequencia;
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

  const experimental = numeroDe(valores.periodo_experimental_dias);
  if (
    valores.periodo_experimental_dias.trim() !== "" &&
    (experimental === null || experimental < 0 || experimental > 1095)
  ) {
    problemas.push({ campo: "experimental", mensagemKey: "hr.form.erroDias" });
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
