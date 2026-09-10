/**
 * Lista partilhada dos campos que a PROPRIA PESSOA tem de preencher no
 * convite de admissao para a ficha ficar utilizavel -- ver PLANO FECHADO,
 * seccao "1. A lista de campos obrigatorios".
 *
 * SO OS CAMPOS DE ORIGEM "pessoa". A autoridade vive na base, em
 * `hr_admissao_campos_obrigatorios()` (20261127030000), que declara tambem os
 * de origem "rh" -- hoje so `data_admissao`, que e o RH quem preenche e que
 * NUNCA trava a submissao do convite. Esta lista e o espelho do lado do ecra,
 * e `conviteAdmissaoContrato.test.ts` compara as duas: os codigos, e quais sao
 * condicionais.
 *
 * NAO E A UNICA BARREIRA, e essa e a diferenca que interessa: a mesma lista e
 * aplicada pela base no fim de `rpc_hr_convite_admissao_submeter`, sobre o
 * RESULTADO da escrita. Um POST directo a Edge Function com dados vazios ja
 * nao passa nem gasta o convite. Isto aqui e para a pessoa ver o que lhe falta
 * antes de submeter, nao para decidir se pode.
 *
 * FICA DE FORA, DE PROPOSITO
 * ---------------------------
 * - `iban`: a Edge Function `convite-admissao` nao grava a conta bancaria --
 *   ve-se no aviso `conta_nao_gravada` que ela propria devolve, e a decisao de
 *   produto que o desbloqueia esta por tomar. Exigi-lo aqui bloquearia
 *   submissoes validas por um campo que o servidor descarta.
 */
export type OrigemCampoAdmissao = "pessoa" | "rh";

/**
 * Os campos do rascunho de que esta lista precisa para decidir
 * obrigatoriedade -- um subconjunto estrutural do `Rascunho` de
 * `ConviteAdmissao.tsx`, nao uma copia dele.
 */
export interface RascunhoConviteObrigatorios {
  data_nascimento: string;
  nacionalidade: string;
  telefone_pessoal: string;
  email_pessoal: string;
  estado_civil: string;
  dependentes: string;
  nif: string;
  niss: string;
  tipo_documento: string;
  numero_documento: string;
  validade_documento: string;
  linha1: string;
  codigo_postal: string;
  localidade: string;
}

export type CodigoCampoObrigatorioAdmissao = keyof RascunhoConviteObrigatorios;

export interface CampoObrigatorioAdmissao {
  codigo: CodigoCampoObrigatorioAdmissao;
  origem: OrigemCampoAdmissao;
  /** Devolve true quando o campo E obrigatorio NESTE rascunho. */
  condicao: (rascunho: RascunhoConviteObrigatorios) => boolean;
}

const sempre = () => true;

/**
 * A validade so e obrigatoria quando o documento NAO e cartao de cidadao --
 * um cartao de cidadao portugues nao obriga a capturar a validade aqui. A
 * comparacao e sempre "diferente de", nunca "vazio E diferente de": um
 * `tipo_documento` ainda por escolher NAO torna a validade obrigatoria por
 * si so (essa pendencia ja aparece, e so uma, no proprio tipo_documento).
 */
function precisaDeValidadeDocumento(rascunho: RascunhoConviteObrigatorios): boolean {
  return rascunho.tipo_documento !== "" && rascunho.tipo_documento !== "cartao_cidadao";
}

export const CAMPOS_OBRIGATORIOS_ADMISSAO: readonly CampoObrigatorioAdmissao[] = [
  { codigo: "data_nascimento", origem: "pessoa", condicao: sempre },
  { codigo: "nacionalidade", origem: "pessoa", condicao: sempre },
  { codigo: "telefone_pessoal", origem: "pessoa", condicao: sempre },
  { codigo: "email_pessoal", origem: "pessoa", condicao: sempre },
  { codigo: "estado_civil", origem: "pessoa", condicao: sempre },
  { codigo: "dependentes", origem: "pessoa", condicao: sempre },
  { codigo: "nif", origem: "pessoa", condicao: sempre },
  { codigo: "niss", origem: "pessoa", condicao: sempre },
  { codigo: "tipo_documento", origem: "pessoa", condicao: sempre },
  { codigo: "numero_documento", origem: "pessoa", condicao: sempre },
  { codigo: "validade_documento", origem: "pessoa", condicao: precisaDeValidadeDocumento },
  { codigo: "linha1", origem: "pessoa", condicao: sempre },
  { codigo: "codigo_postal", origem: "pessoa", condicao: sempre },
  { codigo: "localidade", origem: "pessoa", condicao: sempre },
] as const;

/**
 * `dependentes` e `0` e resposta, `""` (por preencher) nao e -- o teste e
 * sempre sobre string vazia, nunca sobre o valor numerico.
 */
function estaPreenchido(
  rascunho: RascunhoConviteObrigatorios,
  codigo: CodigoCampoObrigatorioAdmissao,
): boolean {
  return rascunho[codigo].trim() !== "";
}

/** Verdadeiro quando ESTE campo, NESTE rascunho, e obrigatorio. */
export function campoEhObrigatorio(
  rascunho: RascunhoConviteObrigatorios,
  codigo: CodigoCampoObrigatorioAdmissao,
): boolean {
  const campo = CAMPOS_OBRIGATORIOS_ADMISSAO.find((c) => c.codigo === codigo);
  return campo ? campo.condicao(rascunho) : false;
}

/** Os codigos ainda por preencher, na ordem da lista acima. */
export function pendenciasDoRascunho(
  rascunho: RascunhoConviteObrigatorios,
): CodigoCampoObrigatorioAdmissao[] {
  return CAMPOS_OBRIGATORIOS_ADMISSAO.filter((campo) => campo.condicao(rascunho))
    .filter((campo) => !estaPreenchido(rascunho, campo.codigo))
    .map((campo) => campo.codigo);
}
