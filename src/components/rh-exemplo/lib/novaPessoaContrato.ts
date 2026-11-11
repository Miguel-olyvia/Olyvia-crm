/**
 * O contrato e o cargo sao OPCIONAIS na admissao ("Nova pessoa"): a pessoa pode ainda nao ter passado, e quando passa atribui-se
 * entao o cargo e a retribuicao. Estas duas funcoes puras decidem o que se exige e o que se grava:
 *
 *  - `contratoPreenchido`: algum campo do contrato foi escrito. Se sim, o vinculo cria-se e o tipo de contrato e a data de
 *    inicio passam a obrigatorios JUNTOS (nunca fica um contrato a meio). Se nao, NAO se cria vinculo, nem horas, nem retribuicao,
 *    nem afectacao, e a contratacao provisoria (`pessoas.data_admissao`) fica a `null`: nao ha "hoje" por omissao.
 *  - `retribuicaoADefinir`: so com cargo E contrato. O salario base vem do cargo (sem cargo a RPC recusa com HRC11) e a
 *    retribuicao pendura no vinculo; por isso os duodecimos so contam, e so se exigem, nestas condicoes.
 *
 * Os valores por omissao do contrato (regime, regime contratual, feriados) nao contam: so contam se forem mudados.
 * Estruturais de proposito: servem os valores do formulario e os do payload sem importar um do outro.
 */
export interface ValoresParaContrato {
  laborais: { cargo_id: string };
  contrato: {
    tipo_contrato: string;
    regime: string;
    regime_contratual: string;
    data_inicio: string;
    data_antiguidade: string;
    data_fim: string;
    tem_periodo_experimental: boolean;
    periodo_experimental_dias: string;
    tipo_trabalho: string;
    horas_trabalho: string;
    dias_uteis: readonly unknown[];
    politica_feriados: string;
    horario_variavel: boolean;
  };
  extra: {
    categoria_funcao: string;
    categoria_profissional: string;
    renovavel: string;
    isencao_horario: boolean;
  };
}

/** Os valores com que o contrato nasce: so um valor diferente conta como escolha de quem preenche. */
const REGIME_POR_OMISSAO = "tempo_inteiro";
const REGIME_CONTRATUAL_POR_OMISSAO = "individual";
const POLITICA_FERIADOS_POR_OMISSAO = "nao_laboral";

const escrito = (valor: string): boolean => valor.trim() !== "";

/** Algum campo do contrato foi preenchido (o cargo e o local nao sao do contrato). */
export function contratoPreenchido(v: ValoresParaContrato): boolean {
  const c = v.contrato;
  const e = v.extra;
  return (
    escrito(c.tipo_contrato) ||
    escrito(c.data_inicio) ||
    escrito(c.data_antiguidade) ||
    escrito(c.data_fim) ||
    c.tem_periodo_experimental ||
    escrito(c.periodo_experimental_dias) ||
    escrito(c.tipo_trabalho) ||
    escrito(c.horas_trabalho) ||
    c.dias_uteis.length > 0 ||
    c.horario_variavel ||
    c.regime !== REGIME_POR_OMISSAO ||
    c.regime_contratual !== REGIME_CONTRATUAL_POR_OMISSAO ||
    c.politica_feriados !== POLITICA_FERIADOS_POR_OMISSAO ||
    escrito(e.categoria_funcao) ||
    escrito(e.categoria_profissional) ||
    escrito(e.renovavel) ||
    e.isencao_horario
  );
}

/**
 * O contrato esta completo: tem o tipo e a data de inicio (o minimo para haver vinculo). A validacao nunca deixa passar um
 * contrato preenchido sem eles; o payload usa isto como defesa em profundidade: um contrato a meio nao cria vinculo parcial.
 */
export function contratoCompleto(v: ValoresParaContrato): boolean {
  return escrito(v.contrato.tipo_contrato) && escrito(v.contrato.data_inicio);
}

/** Ha retribuicao a definir: um cargo escolhido E um contrato preenchido. */
export function retribuicaoADefinir(v: ValoresParaContrato): boolean {
  return escrito(v.laborais.cargo_id) && contratoPreenchido(v);
}
