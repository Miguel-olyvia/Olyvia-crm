/**
 * Anexos que o RH carrega na ficha (cartao de cidadao, comprovativo de IBAN,
 * fotografia): permissoes de escrita por tipo e ponte para o texto de erro.
 *
 * AS PERMISSOES AQUI SO ESCONDEM OU DESACTIVAM NO ECRA
 * ----------------------------------------------------
 * A decisao real e do servidor (`hr_anexo_rh_autorizar`, dentro das RPCs); a
 * tabela abaixo tem de ser igual a `hr_anexo_rh_permissao_escrita`. Os limites e
 * a validacao local sao os do convite e reexportam-se de la.
 */
import { chaveDeErroAnexo, type TipoAnexoConvite } from "@/lib/hr/conviteAnexos";

export {
  LIMITES_ANEXOS,
  formatarTamanho,
  validarFicheiroLocal,
  verificarLimitesDeContagem,
} from "@/lib/hr/conviteAnexos";

export type TipoAnexoRh = TipoAnexoConvite;

/** O codigo de um envio que falhou sem motivo do servidor (rede, PUT). */
export const CODIGO_FALHA_ENVIO_RH = "anexo_falha_envio";

/** O PUT para a quarentena passou o tempo maximo (o ecra cai no texto generico de falha ate haver chave propria). */
export const CODIGO_FALHA_ENVIO_TEMPO_RH = "anexo_falha_envio_tempo";

export const PERMISSAO_ESCRITA_POR_TIPO: Readonly<Record<TipoAnexoRh, string>> = {
  cartao_cidadao: "hr.pessoas.identificacao.edit",
  comprovativo_iban: "hr.pessoas.bancarios.edit",
  fotografia: "hr.pessoas.pessoais.edit",
};

export interface PermissoesEscritaAnexos {
  identificacaoEdit: boolean;
  bancariosEdit: boolean;
  pessoaisEdit: boolean;
}

const CAMPO_POR_TIPO: Readonly<Record<TipoAnexoRh, keyof PermissoesEscritaAnexos>> = {
  cartao_cidadao: "identificacaoEdit",
  comprovativo_iban: "bancariosEdit",
  fotografia: "pessoaisEdit",
};

/** Pode quem tem estas permissoes anexar este tipo? Tipo desconhecido: nao. */
export function podeAnexarTipo(
  tipo: TipoAnexoRh,
  permissoes: PermissoesEscritaAnexos | null | undefined,
): boolean {
  const campo = CAMPO_POR_TIPO[tipo];
  if (!campo || !permissoes) return false;
  return permissoes[campo] === true;
}

const CHAVE_FALHA_ENVIO = "hr.anexos.erro.falhaEnvio";
const CHAVE_FALHA_CONVITE = "hr.convite.erro.anexoFalhaEnvio";

const CHAVES_PROPRIAS: Readonly<Record<string, string>> = {
  sem_permissao: "hr.anexos.erro.semPermissao",
  pessoa_nao_encontrada: "hr.anexos.erro.pessoaNaoEncontrada",
  anexo_substituto_invalido: "hr.anexos.erro.substitutoInvalido",
  anexo_limite_pessoa: "hr.anexos.erro.limitePessoa",
  demasiadas_tentativas: "hr.anexos.erro.demasiadasTentativas",
};

/** A chave de traducao do erro; nunca se mostra o codigo em bruto. */
export function chaveDeErroAnexoRh(codigo: string | null | undefined): string {
  if (!codigo) return CHAVE_FALHA_ENVIO;
  const propria = Object.prototype.hasOwnProperty.call(CHAVES_PROPRIAS, codigo)
    ? CHAVES_PROPRIAS[codigo]
    : undefined;
  if (propria) return propria;
  if (!codigo.startsWith("anexo_")) return CHAVE_FALHA_ENVIO;
  const delegada = chaveDeErroAnexo(codigo);
  // O convite cai na sua falha de envio para o que nao conhece; "anexo_falha_envio" e conhecido.
  if (delegada === CHAVE_FALHA_CONVITE && codigo !== "anexo_falha_envio") return CHAVE_FALHA_ENVIO;
  return delegada;
}
