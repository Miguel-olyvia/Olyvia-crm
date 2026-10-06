/**
 * Quem pode abrir cada tipo de anexo da admissao, e o que isso obriga a fazer.
 * Modulo puro (sem Deno, sem rede): a decisao testa-se no vitest, e o index.ts
 * so lhe entrega os factos que leu da base.
 *
 * MATRIZ
 * ------
 *  fotografia         hr.pessoas.view  OU  a propria pessoa   sem auditoria   TTL 300 s
 *  cartao_cidadao     hr.pessoas.identificacao.reveal  OU  a propria pessoa
 *                                                      auditado (anexo_cartao_cidadao)    TTL 60 s
 *  comprovativo_iban  hr.pessoas.bancarios.edit  OU  a propria pessoa
 *                                                      auditado (anexo_comprovativo_iban) TTL 60 s
 *
 * "A propria pessoa" = tem hr.pessoas.view.own E `hr_pessoa_do_utilizador`
 * resolve para a pessoa do anexo (nunca um pessoa_id que o cliente envie).
 * Tudo se avalia contra a organizacao da PROPRIA linha do anexo.
 */

export const TIPOS_ANEXO = ["cartao_cidadao", "comprovativo_iban", "fotografia"] as const;
export type TipoAnexo = (typeof TIPOS_ANEXO)[number];

export type CampoAuditado = "anexo_cartao_cidadao" | "anexo_comprovativo_iban";

/**
 * A permissao que, sozinha, abre cada tipo.
 *
 * DECISAO DE PRODUTO EM ABERTO: o comprovativo de IBAN abre-se com
 * `bancarios.edit`, nao com `bancarios.view` (a que revela o IBAN auditado), por
 * isso quem so ve o IBAN nao abre o documento e quem so edita abre-o. Esta
 * escolha e a que esta em vigor; mudar o mapeamento e uma decisao do produto, nao
 * uma correccao (e obriga a alinhar a politica pessoas_anexos_select da base).
 */
export const PERMISSAO_POR_TIPO: Readonly<Record<TipoAnexo, string>> = {
  fotografia: "hr.pessoas.view",
  cartao_cidadao: "hr.pessoas.identificacao.reveal",
  comprovativo_iban: "hr.pessoas.bancarios.edit",
};

/** A permissao que, junto com ser a propria pessoa, abre qualquer tipo. */
export const PERMISSAO_PROPRIA = "hr.pessoas.view.own";

/** Curta de proposito: so o tempo de o browser abrir o separador. */
export const TTL_SEGUNDOS: Readonly<Record<TipoAnexo, number>> = {
  fotografia: 300,
  cartao_cidadao: 60,
  comprovativo_iban: 60,
};

/** Os campos de auditoria: so os dois ficheiros sensiveis; a fotografia nunca. */
export const CAMPO_AUDITADO: Readonly<Record<TipoAnexo, CampoAuditado | null>> = {
  fotografia: null,
  cartao_cidadao: "anexo_cartao_cidadao",
  comprovativo_iban: "anexo_comprovativo_iban",
};

export function eTipoAnexo(valor: unknown): valor is TipoAnexo {
  return typeof valor === "string" && (TIPOS_ANEXO as readonly string[]).includes(valor);
}

export interface FactosDeAcesso {
  /** Tem a permissao que abre ESTE tipo (ver PERMISSAO_POR_TIPO). */
  temPermissaoDoTipo: boolean;
  /** Tem hr.pessoas.view.own. */
  temPermissaoPropria: boolean;
  /** hr_pessoa_do_utilizador resolve para a pessoa do anexo. */
  eAPropriaPessoa: boolean;
}

export interface DecisaoDeAcesso {
  autorizado: boolean;
  /** Campo a registar em pessoas_acessos_sensiveis ANTES do URL; `null` = sem auditoria. */
  auditar: CampoAuditado | null;
  ttlSegundos: number;
}

/** A propria pessoa: com a permissao `.own` E a pessoa do anexo. Uma sem a outra nao basta. */
export function eAcessoPropria(f: Pick<FactosDeAcesso, "temPermissaoPropria" | "eAPropriaPessoa">): boolean {
  return f.temPermissaoPropria && f.eAPropriaPessoa;
}

export function decidirAcessoAnexo(tipo: TipoAnexo, factos: FactosDeAcesso): DecisaoDeAcesso {
  const autorizado = factos.temPermissaoDoTipo || eAcessoPropria(factos);
  return {
    autorizado,
    // Quem nao esta autorizado nunca chega a gerar auditoria nem URL.
    auditar: autorizado ? CAMPO_AUDITADO[tipo] : null,
    ttlSegundos: TTL_SEGUNDOS[tipo],
  };
}
