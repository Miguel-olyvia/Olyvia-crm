/**
 * A duracao LEGAL do periodo experimental, em codigo -- nunca em constraint.
 *
 * PORQUE EM CODIGO E NAO NA BASE
 * -------------------------------
 * Este numero e lei, e muda por diploma -- nao por organizacao, nem por
 * decisao de produto. Em codigo tem teste unitario e revisao em PR; numa
 * migration ficaria a espera do proximo `db push` para uma correccao que nao
 * tem nada a ver com schema.
 *
 * PORQUE E SO UMA SUGESTAO
 * ------------------------
 * A lei permite reducao por IRCT ou por acordo escrito, e permite EXCLUSAO
 * total quando a pessoa ja exerceu a mesma funcao para o mesmo empregador. Uma
 * tabela fechada nao sabe nada disto -- so quem esta a preencher o contrato
 * sabe. Por isso esta funcao devolve uma sugestao que o ecra oferece num
 * clique, nunca um valor que se escreve sozinho, e nunca uma validacao que
 * bloqueia um valor diferente do calculado aqui. O mesmo raciocinio que ja fez
 * este repositorio recusar um CHECK cruzado que rejeitava o registo mais
 * obvio -- ver `lib/hr/contrato.ts`.
 *
 * PORQUE ALGUNS TIPOS NAO TEM SUGESTAO NENHUMA
 * ---------------------------------------------
 * A tabela legal cobre sem_termo, termo_certo/temporario, termo_incerto e
 * estagio -- `prestacao_servicos` nao tem periodo experimental de todo.
 * `duracao_muito_curta` nao corresponde a nenhuma categoria do diploma:
 * inventar um numero para eles seria apresentar como lei o que e suposicao.
 * Devolve-se `null`, e o ecra fica com os dois campos so preenchiveis a mao --
 * o que ja acontecia antes desta funcao existir.
 */
import { dataFimPorDuracaoMeses } from "@/lib/hr/novaPessoaDatas";
import type { CategoriaFuncao, TipoContrato } from "@/types/hr";

export interface SugestaoPeriodoExperimental {
  dias: number;
  /** Chave de traducao que explica de onde veio o numero, para a ajuda do campo. */
  motivoKey: string;
}

const DIAS_SEM_TERMO: Record<CategoriaFuncao, number> = {
  geral: 90,
  tecnica_confianca: 180,
  direcao_quadro_superior: 240,
};

const DIAS_TERMO_CURTO = 30;
const DIAS_TERMO_LONGO = 15;
const LIMIAR_MESES_TERMO = 6;
const DIAS_TERMO_INCERTO = 30;
const DIAS_ESTAGIO = 30;

/**
 * `true` quando o contrato dura pelo menos `meses` meses completos, com a MESMA
 * regra com que o ecra calcula a data de fim por meses (`dataFimPorDuracaoMeses`,
 * a vespera do dia correspondente): um contrato de 6 meses a partir de 01/03
 * acaba a 31/08, e essa data ja conta como "6 meses". Datas invalidas contam
 * como "menos de" -- e so uma sugestao.
 */
function duracaoAoMenos(dataInicio: string, dataFim: string, meses: number): boolean {
  const fimMinimo = dataFimPorDuracaoMeses(dataInicio, meses);
  // Datas ISO (AAAA-MM-DD) comparam-se bem como texto.
  return fimMinimo !== null && dataFim >= fimMinimo;
}

export interface ParametrosSugestaoPeriodoExperimental {
  tipoContrato: TipoContrato;
  categoriaFuncao: CategoriaFuncao;
  /** Necessaria so para `termo_certo` e `temporario` -- decide 15 ou 30 dias. */
  dataInicio?: string | null;
  dataFim?: string | null;
}

/**
 * A sugestao legal, ou `null` quando o tipo de contrato nao tem periodo
 * experimental (`prestacao_servicos`) ou nao corresponde a nenhuma categoria
 * do diploma (`duracao_muito_curta`) ou quando falta a data
 * de fim de um contrato a termo (nao ha como saber se chega aos 6 meses).
 *
 * NUNCA lanca e NUNCA escreve nada -- e uma leitura pura. Quem chama decide o
 * que fazer com o resultado.
 */
export function sugerirPeriodoExperimentalDias(
  params: ParametrosSugestaoPeriodoExperimental,
): SugestaoPeriodoExperimental | null {
  const { tipoContrato, categoriaFuncao, dataInicio, dataFim } = params;

  if (tipoContrato === "sem_termo") {
    return { dias: DIAS_SEM_TERMO[categoriaFuncao], motivoKey: "hr.periodoExperimental.motivoSemTermo" };
  }

  if (tipoContrato === "termo_certo" || tipoContrato === "temporario") {
    if (!dataInicio || !dataFim) return null;
    const longo = duracaoAoMenos(dataInicio, dataFim, LIMIAR_MESES_TERMO);
    return longo
      ? { dias: DIAS_TERMO_CURTO, motivoKey: "hr.periodoExperimental.motivoTermoLongo" }
      : { dias: DIAS_TERMO_LONGO, motivoKey: "hr.periodoExperimental.motivoTermoCurto" };
  }

  if (tipoContrato === "termo_incerto") {
    return { dias: DIAS_TERMO_INCERTO, motivoKey: "hr.periodoExperimental.motivoTermoIncerto" };
  }

  if (tipoContrato === "estagio") {
    return { dias: DIAS_ESTAGIO, motivoKey: "hr.periodoExperimental.motivoEstagio" };
  }

  // prestacao_servicos, duracao_muito_curta: sem sugestao.
  return null;
}
