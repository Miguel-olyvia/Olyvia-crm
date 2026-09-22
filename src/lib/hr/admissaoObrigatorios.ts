/**
 * Lista partilhada dos campos que a PROPRIA PESSOA tem de preencher no
 * convite de admissao para a ficha ficar utilizavel -- as DUAS paginas da
 * folha de cadastro em papel, nao so a primeira.
 *
 * SO OS CAMPOS DE ORIGEM "pessoa". A autoridade vive na base, em
 * `hr_admissao_campos_obrigatorios()` (20261128010000), que declara tambem os
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
 * - a CARTA DE CONDUCAO (numero, categorias, validade): nem toda a gente tem
 *   carta, e exigi-la impedia essas pessoas de submeter o convite. Continua a
 *   ser capturada e gravada quando existe.
 * - `conta_formato`: o convite so sabe gravar IBAN (e o unico ramo que a RPC
 *   tem), por isso o formato nao e uma escolha a fazer aqui.
 *
 * Desde 20261201060000 (decisao 38): `nif` e `niss` deixaram de ser os dois
 * incondicionalmente obrigatorios -- basta um dos dois (ver `precisaDeNif` /
 * `precisaDeNiss` mais abaixo, e a mesma excepcao em `hr_admissao_pendencias`).
 */
export type OrigemCampoAdmissao = "pessoa" | "rh";

/**
 * Os campos do rascunho de que esta lista precisa para decidir
 * obrigatoriedade -- um subconjunto estrutural do `Rascunho` de
 * `ConviteAdmissao.tsx`, nao uma copia dele.
 */
export interface RascunhoConviteObrigatorios {
  // Pagina 1 -- dados pessoais
  data_nascimento: string;
  genero: string;
  nacionalidade: string;
  telefone_pessoal: string;
  email_pessoal: string;
  estado_civil: string;
  dependentes: string;
  dependentes_deficientes: string;
  conjuge_situacao_profissional: string;
  naturalidade_freguesia: string;
  naturalidade_concelho: string;
  naturalidade_pais: string;
  habilitacao_academica: string;
  habilitacao_data_conclusao: string;
  // Pagina 1 -- documento e morada
  nif: string;
  niss: string;
  tipo_documento: string;
  numero_documento: string;
  validade_documento: string;
  linha1: string;
  codigo_postal: string;
  localidade: string;
  // Pagina 2 -- fardamento e conta bancaria
  tamanho_cima: string;
  tamanho_baixo: string;
  tamanho_calcado: string;
  conta_numero: string;
  conta_titular: string;
  conta_banco: string;
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

/**
 * A situacao profissional do conjuge so se pergunta a quem tem conjuge. A
 * quem e solteiro, viuvo ou divorciado nao se pede a profissao de alguem que
 * nao existe -- e um estado civil ainda por escolher tambem nao a arrasta.
 */
function precisaDeSituacaoDoConjuge(rascunho: RascunhoConviteObrigatorios): boolean {
  return rascunho.estado_civil === "casado" || rascunho.estado_civil === "uniao_de_facto";
}

/**
 * Decisao 38 (mapa do modulo RH): NIF e NISS deixam de ser os dois
 * incondicionalmente obrigatorios -- um dos dois basta. `nif` so e exigido
 * quando `niss` ainda nao esta preenchido.
 */
function precisaDeNif(rascunho: RascunhoConviteObrigatorios): boolean {
  return !estaPreenchido(rascunho, "niss");
}

/** Espelho de `precisaDeNif`: `niss` so e exigido quando `nif` ainda nao esta preenchido. */
function precisaDeNiss(rascunho: RascunhoConviteObrigatorios): boolean {
  return !estaPreenchido(rascunho, "nif");
}

export const CAMPOS_OBRIGATORIOS_ADMISSAO: readonly CampoObrigatorioAdmissao[] = [
  { codigo: "data_nascimento", origem: "pessoa", condicao: sempre },
  { codigo: "genero", origem: "pessoa", condicao: sempre },
  { codigo: "nacionalidade", origem: "pessoa", condicao: sempre },
  { codigo: "telefone_pessoal", origem: "pessoa", condicao: sempre },
  { codigo: "email_pessoal", origem: "pessoa", condicao: sempre },
  { codigo: "estado_civil", origem: "pessoa", condicao: sempre },
  { codigo: "dependentes", origem: "pessoa", condicao: sempre },
  { codigo: "dependentes_deficientes", origem: "pessoa", condicao: sempre },
  {
    codigo: "conjuge_situacao_profissional",
    origem: "pessoa",
    condicao: precisaDeSituacaoDoConjuge,
  },
  { codigo: "naturalidade_freguesia", origem: "pessoa", condicao: sempre },
  { codigo: "naturalidade_concelho", origem: "pessoa", condicao: sempre },
  { codigo: "naturalidade_pais", origem: "pessoa", condicao: sempre },
  { codigo: "habilitacao_academica", origem: "pessoa", condicao: sempre },
  { codigo: "habilitacao_data_conclusao", origem: "pessoa", condicao: sempre },
  { codigo: "nif", origem: "pessoa", condicao: precisaDeNif },
  { codigo: "niss", origem: "pessoa", condicao: precisaDeNiss },
  { codigo: "tipo_documento", origem: "pessoa", condicao: sempre },
  { codigo: "numero_documento", origem: "pessoa", condicao: sempre },
  { codigo: "validade_documento", origem: "pessoa", condicao: precisaDeValidadeDocumento },
  { codigo: "linha1", origem: "pessoa", condicao: sempre },
  { codigo: "codigo_postal", origem: "pessoa", condicao: sempre },
  { codigo: "localidade", origem: "pessoa", condicao: sempre },
  { codigo: "tamanho_cima", origem: "pessoa", condicao: sempre },
  { codigo: "tamanho_baixo", origem: "pessoa", condicao: sempre },
  { codigo: "tamanho_calcado", origem: "pessoa", condicao: sempre },
  { codigo: "conta_numero", origem: "pessoa", condicao: sempre },
  { codigo: "conta_titular", origem: "pessoa", condicao: sempre },
  { codigo: "conta_banco", origem: "pessoa", condicao: sempre },
] as const;

/**
 * `dependentes` e `0` e resposta, `""` (por preencher) nao e -- o teste e
 * sempre sobre string vazia, nunca sobre o valor numerico.
 */
function estaPreenchido(
  rascunho: RascunhoConviteObrigatorios,
  codigo: CodigoCampoObrigatorioAdmissao,
): boolean {
  const valor = rascunho[codigo];
  if (typeof valor === "boolean") return true;
  return valor.trim() !== "";
}

/**
 * O codigo, tal como a RPC `rpc_hr_convite_admissao_estado` o devolve na
 * chave `campos_obrigatorios` (20261201050000): so o codigo e se e
 * condicional -- a decisao de QUANDO um condicional se aplica continua no
 * lado do ecra, em `CAMPOS_OBRIGATORIOS_ADMISSAO.condicao`.
 */
export interface CodigoObrigatorioDoServidor {
  codigo: string;
  condicional: boolean;
}

/**
 * A lista de campos EFECTIVAMENTE obrigatoria, depois de cruzar a lista fixa
 * do ecra com o que o servidor diz para ESTA organizacao
 * (`organization_admissao_settings`, via `hr_admissao_campos_obrigatorios_org`).
 *
 * Um codigo so fica de fora quando o servidor o excluiu explicitamente -- por
 * isso `null`/`undefined` (convites antigos que a RPC ainda nao anotava, ou
 * uma falha a carregar o estado) devolve `CAMPOS_OBRIGATORIOS_ADMISSAO` por
 * inteiro: o comportamento de sempre, nunca uma regressao para "nada e
 * obrigatorio".
 *
 * A condicionalidade (validade do documento, situacao do conjuge) continua a
 * ser decidida pela `condicao` de cada campo, aplicada pelos chamadores
 * (`pendenciasDoRascunho`, `campoEhObrigatorio`) -- esta funcao so filtra
 * QUAIS codigos entram em jogo, nunca decide se se aplicam a este rascunho.
 */
export function obrigatoriosResolvidos(
  codigosObrigatoriosDoServidor?: readonly CodigoObrigatorioDoServidor[] | null,
): readonly CampoObrigatorioAdmissao[] {
  if (!codigosObrigatoriosDoServidor) return CAMPOS_OBRIGATORIOS_ADMISSAO;
  const permitidos = new Set(codigosObrigatoriosDoServidor.map((c) => c.codigo));
  return CAMPOS_OBRIGATORIOS_ADMISSAO.filter((campo) => permitidos.has(campo.codigo));
}

/** Verdadeiro quando ESTE campo, NESTE rascunho, e obrigatorio. */
export function campoEhObrigatorio(
  rascunho: RascunhoConviteObrigatorios,
  codigo: CodigoCampoObrigatorioAdmissao,
  campos: readonly CampoObrigatorioAdmissao[] = CAMPOS_OBRIGATORIOS_ADMISSAO,
): boolean {
  const campo = campos.find((c) => c.codigo === codigo);
  return campo ? campo.condicao(rascunho) : false;
}

/** Os codigos ainda por preencher, na ordem da lista acima. */
export function pendenciasDoRascunho(
  rascunho: RascunhoConviteObrigatorios,
  campos: readonly CampoObrigatorioAdmissao[] = CAMPOS_OBRIGATORIOS_ADMISSAO,
): CodigoCampoObrigatorioAdmissao[] {
  return campos
    .filter((campo) => campo.condicao(rascunho))
    .filter((campo) => !estaPreenchido(rascunho, campo.codigo))
    .map((campo) => campo.codigo);
}

/**
 * Os codigos que vivem na SEGUNDA pagina do formulario. O ecra usa isto para
 * nao mandar de volta a pagina 1 quem so tem pendencias na 2 (e vice-versa);
 * a base nao distingue paginas nenhumas.
 */
export const CODIGOS_PAGINA_2: ReadonlySet<CodigoCampoObrigatorioAdmissao> = new Set([
  "tamanho_cima",
  "tamanho_baixo",
  "tamanho_calcado",
  "conta_numero",
  "conta_titular",
  "conta_banco",
]);
