/**
 * Os erros das RPCs do custo do RH (equipamentos, definicoes e excecoes de taxa), do lado do ecra.
 *
 * As RPCs (`rpc_hr_custo_*`, `rpc_hr_equipamento_*`) recusam com MESSAGE = codigo e SQLSTATE `HRA..`. Aqui o erro do
 * PostgREST passa a um codigo conhecido e o codigo a um texto na lingua do ecra (`hr.custo.erro.*` em translations/index.ts).
 * Nunca sobe o texto cru da base. Os codigos de VALIDACAO de um campo (HRA65 a HRA72) tambem tem o nome do erro que o
 * formulario ja sabe mostrar junto ao campo (`ERRO_DE_CAMPO`), para que o ecra os trate como os erros da validacao local.
 *
 * Este ficheiro e puro (nao importa o cliente da base): `recusaPorPermissao` repete a regra de `isPermissionError` de hrDb.
 */

/** O SQLSTATE (ERRCODE) que a RPC levanta, e o codigo que ele quer dizer. */
const CODIGO_POR_SQLSTATE: Readonly<Record<string, string>> = {
  HRA10: "pedido_invalido",
  HRA31: "nao_encontrado",
  HRA33: "organizacao_nao_empregadora",
  HRA38: "estado_invalido",
  HRA41: "limite_excedido",
  HRA65: "descricao_invalida",
  HRA66: "valor_invalido",
  HRA67: "data_invalida",
  HRA68: "meses_invalidos",
  HRA69: "conta_sem_inicio",
  HRA70: "conta_fim_antes_inicio",
  HRA71: "devolucao_antes_entrega",
  HRA72: "estado_devolucao_invalido",
  HRA73: "taxa_invalida",
  HRA74: "valor_unitario_invalido",
};

/** A chave de traducao do texto de cada codigo. */
const CHAVE_POR_CODIGO: Readonly<Record<string, string>> = {
  insufficient_privilege: "hr.custo.erro.semPermissao",
  pedido_invalido: "hr.custo.erro.pedidoInvalido",
  nao_encontrado: "hr.custo.erro.naoEncontrado",
  organizacao_nao_empregadora: "hr.custo.erro.organizacaoNaoEmpregadora",
  estado_invalido: "hr.custo.erro.estadoInvalido",
  limite_excedido: "hr.custo.erro.limiteExcedido",
  descricao_invalida: "hr.custo.erro.descricaoInvalida",
  valor_invalido: "hr.custo.erro.valorInvalido",
  data_invalida: "hr.custo.erro.dataInvalida",
  meses_invalidos: "hr.custo.erro.mesesInvalidos",
  conta_sem_inicio: "hr.custo.erro.contaSemInicio",
  conta_fim_antes_inicio: "hr.custo.erro.contaFimAntesInicio",
  devolucao_antes_entrega: "hr.custo.erro.devolucaoAntesEntrega",
  estado_devolucao_invalido: "hr.custo.erro.estadoDevolucaoInvalido",
  taxa_invalida: "hr.custo.erro.taxaInvalida",
  valor_unitario_invalido: "hr.custo.erro.valorUnitarioInvalido",
};

/** O texto quando nao ha codigo legivel (rede, timeout, defeito). */
export const CHAVE_ERRO_GENERICO_CUSTO = "hr.custo.erro.generico";

/**
 * Os codigos que o formulario ja sabe mostrar junto do campo, com o nome do erro da validacao local
 * (`ErroEquipamento`, `ErroDevolucao`, `ErroConta`): um erro destes nao precisa de texto novo.
 */
export const ERRO_DE_CAMPO: Readonly<Record<string, string>> = {
  descricao_invalida: "semDescricao",
  valor_invalido: "valorZero",
  data_invalida: "semData",
  meses_invalidos: "mesesInvalidos",
  conta_sem_inicio: "semInicio",
  conta_fim_antes_inicio: "fimAntesInicio",
  devolucao_antes_entrega: "antesDaEntrega",
  estado_devolucao_invalido: "semEstado",
};

/** Recusa por permissao (42501, ou o PostgREST a recusar antes de chegar ao Postgres). */
function recusaPorPermissao(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (typeof code === "string" && ["42501", "PGRST301", "401", "403"].includes(code)) return true;
  return typeof message === "string" && /permission denied|insufficient_privilege/i.test(message);
}

/**
 * O codigo de um erro de uma destas RPCs, ou `null` quando e um defeito (rede, timeout, sintaxe). So devolve codigos
 * que o ecra sabe traduzir: o texto cru da base (`message`, `details`) nunca sobe.
 */
export function codigoDeErroCusto(erro: unknown): string | null {
  if (recusaPorPermissao(erro)) return "insufficient_privilege";
  if (!erro || typeof erro !== "object") return null;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (typeof code === "string" && CODIGO_POR_SQLSTATE[code]) return CODIGO_POR_SQLSTATE[code];
  return typeof message === "string" && CHAVE_POR_CODIGO[message] ? message : null;
}

/** A chave de traducao do texto de um codigo; a generica quando nao ha texto proprio. */
export function chaveDoErroCusto(codigo: string | null): string {
  return (codigo && CHAVE_POR_CODIGO[codigo]) || CHAVE_ERRO_GENERICO_CUSTO;
}
