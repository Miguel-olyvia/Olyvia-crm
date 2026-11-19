// Textos do Contrato do portal do fornecedor que seguem o idioma do portal: o estado, o tipo, as condições, o
// histórico e as mensagens de erro. Os helpers de `@/lib/supplierContracts` (tipos.ts, portal.ts, acoes.ts) são
// partilhados com o CRM e ficam em português; aqui há a versão por idioma, que não os altera.
//
// Fica sempre como vem: o que o servidor escreve (descrição de um evento do histórico, o motivo de uma recusa, o
// texto do contrato, `err.message` de um RAISE EXCEPTION). Os números e o dinheiro ficam em pt-PT nos dois idiomas
// e o dd/mm/aaaa numérico não muda (`fmtData`, `fmtDataHora`, `fmtEuros` de tipos.ts).
// As chaves estão aqui como literais (e não construídas) para o teste de uso das chaves as ver.
import { getSpHint, spErrorMessage } from "@/lib/supplierPortal/spRpc";
import {
  CONTRACT_ANNEX_MIME,
  CONTRACT_FILE_MAX_BYTES,
  CONTRACT_MAIN_MIME,
} from "@/lib/supplierContracts/acoes";
import {
  fmtEuros,
  type SupplierContractConditions,
  type SupplierContractEvent,
  type SupplierContractFile,
  type SupplierContractKind,
  type SupplierContractStatus,
} from "@/lib/supplierContracts/tipos";
import { mensagemDeChave, mensagemDeTexto, type MensagemDoPortal } from "@/portal-i18n/mensagem";
import { traduzir } from "@/portal-i18n/traduzir";
import type { ParamsDeTraducao } from "@/portal-i18n/tipos";

type Traduzir = (chave: string, params?: ParamsDeTraducao) => string;

/** Estado do contrato no ponto de vista do fornecedor (códigos da base → chave). */
export const CHAVE_ESTADO_CONTRATO: Readonly<Record<SupplierContractStatus, string>> = {
  proposed: "sp.contrato.estado.proposed",
  draft: "sp.contrato.estado.draft",
  sent: "sp.contrato.estado.sent",
  signed_supplier: "sp.contrato.estado.signed_supplier",
  signed: "sp.contrato.estado.signed",
  refused: "sp.contrato.estado.refused",
  cancelled: "sp.contrato.estado.cancelled",
  expired: "sp.contrato.estado.expired",
  superseded: "sp.contrato.estado.superseded",
};

/** Rótulo do estado no portal, afinado pelas propostas (retirada / recusada pela empresa), no idioma pedido. */
export function rotuloEstadoContrato(
  c: { status: SupplierContractStatus; proposal_state: string | null; refused_by: string | null },
  t: Traduzir,
): string {
  if (c.proposal_state === "withdrawn") return t("sp.contrato.estado.retirada");
  if (c.status === "refused" && c.refused_by === "empresa") return t("sp.contrato.estado.recusadaPelaEmpresa");
  return t(CHAVE_ESTADO_CONTRATO[c.status] ?? "sp.contrato.estado.draft");
}

const CHAVE_TIPO_CONTRATO: Readonly<Record<SupplierContractKind, string>> = {
  material: "sp.contrato.tipo.material",
  servico: "sp.contrato.tipo.servico",
};

export function rotuloTipoContrato(kind: SupplierContractKind, t: Traduzir): string {
  return t(CHAVE_TIPO_CONTRATO[kind] ?? CHAVE_TIPO_CONTRATO.material);
}

const CHAVE_METODO_PAGAMENTO: Readonly<Record<string, string>> = {
  transferencia: "sp.contrato.pagamento.transferencia",
  multibanco: "sp.contrato.pagamento.multibanco",
  debito_direto: "sp.contrato.pagamento.debito_direto",
  cheque: "sp.contrato.pagamento.cheque",
  numerario: "sp.contrato.pagamento.numerario",
  cartao: "sp.contrato.pagamento.cartao",
  outro: "sp.contrato.pagamento.outro",
};

const CHAVE_PORTES: Readonly<Record<string, string>> = {
  incluidos: "sp.contrato.portes.incluidos",
  a_cargo_comprador: "sp.contrato.portes.a_cargo_comprador",
  gratis_acima_minimo: "sp.contrato.portes.gratis_acima_minimo",
  a_combinar: "sp.contrato.portes.a_combinar",
};

/** Resumo das condições em linhas (rótulo, valor), como `conditionsRows` de tipos.ts, no idioma pedido. */
export function linhasDeCondicoes(c: SupplierContractConditions, t: Traduzir): { label: string; value: string }[] {
  const semValor = "—";
  // O português mantém «1 dias» como sempre; o inglês distingue «1 day» de «2 days».
  const dias = (n: number) => t(n === 1 ? "sp.contrato.dias.um" : "sp.contrato.dias.varios", { n });
  const portes =
    c.shipping_terms === "gratis_acima_minimo"
      ? t("sp.contrato.portes.gratisAPartirDe", { valor: fmtEuros(c.shipping_free_from) })
      : c.shipping_terms
        ? t(CHAVE_PORTES[c.shipping_terms] ?? "sp.contrato.portes.a_combinar")
        : semValor;
  const devolucao =
    c.returns_accepted === null
      ? semValor
      : `${c.returns_accepted ? t("sp.contrato.devolucoes.sim") : t("sp.contrato.devolucoes.nao")}${
          c.returns_days !== null ? ` (${dias(c.returns_days)})` : ""
        }${c.returns_notes ? ` — ${c.returns_notes}` : ""}`;
  return [
    {
      label: t("sp.contrato.cond.prazoPagamento"),
      value: c.payment_terms_days === null ? semValor : dias(c.payment_terms_days),
    },
    {
      label: t("sp.contrato.cond.formaPagamento"),
      value: c.payment_method ? t(CHAVE_METODO_PAGAMENTO[c.payment_method] ?? "sp.contrato.pagamento.outro") : semValor,
    },
    {
      label: t("sp.contrato.cond.prazoEntrega"),
      value: c.delivery_sla_days === null ? semValor : dias(c.delivery_sla_days),
    },
    { label: t("sp.contrato.cond.portes"), value: portes },
    {
      label: t("sp.contrato.cond.desconto"),
      value: c.discount_percent === null ? semValor : `${String(c.discount_percent).replace(".", ",")} %`,
    },
    { label: t("sp.contrato.cond.encomendaMinima"), value: fmtEuros(c.min_order_value) },
    { label: t("sp.contrato.cond.devolucoes"), value: devolucao },
    { label: t("sp.contrato.cond.observacoes"), value: c.conditions_notes || semValor },
  ];
}

const CHAVE_EVENTO: Readonly<Record<string, string>> = {
  created: "sp.contrato.evento.created",
  updated: "sp.contrato.evento.updated",
  conditions_updated: "sp.contrato.evento.conditions_updated",
  sent: "sp.contrato.evento.sent",
  file_added: "sp.contrato.evento.file_added",
  supplier_signed: "sp.contrato.evento.supplier_signed",
  company_signed: "sp.contrato.evento.company_signed",
  refused: "sp.contrato.evento.refused",
  cancelled: "sp.contrato.evento.cancelled",
  superseded: "sp.contrato.evento.superseded",
  expired: "sp.contrato.evento.expired",
  new_version: "sp.contrato.evento.new_version",
  signature_request_resent: "sp.contrato.evento.signature_request_resent",
  proposed: "sp.contrato.evento.proposed",
  proposal_accepted: "sp.contrato.evento.proposal_accepted",
  proposal_refused: "sp.contrato.evento.proposal_refused",
  proposal_withdrawn: "sp.contrato.evento.proposal_withdrawn",
};

/**
 * Texto de uma linha do histórico: a descrição do servidor (fica como vem), senão o rótulo do tipo no idioma;
 * um tipo que não se conhece volta como veio.
 */
export function textoDoEvento(e: Pick<SupplierContractEvent, "event_type" | "description">, t: Traduzir): string {
  if (e.description) return e.description;
  const chave = CHAVE_EVENTO[e.event_type];
  return chave ? t(chave) : e.event_type;
}

/**
 * Erros de uma ação sobre o contrato, como `describeSpContractError` de portal.ts: a mensagem que o servidor
 * manda (`err.message`) fica como vem; só os textos de reserva se traduzem.
 */
export function descreverErroContrato(err: unknown, t: Traduzir): string {
  const hint = getSpHint(err);
  const raw = err instanceof Error ? err.message : "";
  switch (hint) {
    case "not_owner":
      return raw || t("sp.contrato.erro.soResponsavel");
    case "not_found":
      return t("sp.contrato.erro.naoEncontrado");
    case "document_changed":
      return t("sp.contrato.erro.documentoMudou");
    case "otp_required":
      return raw || t("sp.contrato.erro.codigoSms");
    case "open_contract_exists":
    case "supplier_required":
    case "invalid_state":
    case "expired":
    case "no_phone":
    case "validation":
      return raw || spErrorMessage(err);
    default:
      return spErrorMessage(err);
  }
}

/** Erros de sp_supplier_contract_withdraw, como `describeSpWithdrawError` de portal.ts. */
export function descreverErroRetirar(err: unknown, t: Traduzir): string {
  const hint = getSpHint(err);
  if (hint === "invalid_state") return t("sp.contrato.erro.retirarEstado");
  if (hint === "not_owner") return t("sp.contrato.erro.retirarSoResponsavel");
  return descreverErroContrato(err, t);
}

/** Código do erro das ações de ficheiros → chave da mensagem fixa (a que se mostra quando a Edge não manda texto). */
export const CHAVE_ERRO_FICHEIRO_CONTRATO: Readonly<Record<string, string>> = {
  file_too_large: "sp.contrato.ficheiro.erro.file_too_large",
  file_type_not_allowed: "sp.contrato.ficheiro.erro.file_type_not_allowed",
  invalid_state: "sp.contrato.ficheiro.erro.invalid_state",
  not_found: "sp.contrato.ficheiro.erro.not_found",
  no_permission: "sp.contrato.ficheiro.erro.no_permission",
  not_owner: "sp.contrato.ficheiro.erro.not_owner",
  validation: "sp.contrato.ficheiro.erro.validation",
  no_portal_owner: "sp.contrato.ficheiro.erro.no_portal_owner",
  rate_limited: "sp.contrato.ficheiro.erro.rate_limited",
  unauthorized: "sp.contrato.ficheiro.erro.unauthorized",
  upload_failed: "sp.contrato.ficheiro.erro.upload_failed",
  internal_error: "sp.contrato.ficheiro.erro.internal_error",
  not_deployed: "sp.contrato.ficheiro.erro.not_deployed",
};

/**
 * Mensagem de um erro de `uploadContractFile` / `downloadContractFile`: o texto fixo (o que a biblioteca escreve
 * quando a Edge não manda mensagem) traduz-se; o que a Edge manda fica como vem.
 */
export function mensagemErroFicheiroContrato(e: { error: string; message: string }): MensagemDoPortal {
  const chave = CHAVE_ERRO_FICHEIRO_CONTRATO[e.error];
  if (chave && (!e.message || e.message === traduzir("pt", chave))) return mensagemDeChave(chave);
  return e.message ? mensagemDeTexto(e.message) : mensagemDeChave("sp.contrato.ficheiro.erro.generico");
}

/** Validação no cliente de um ficheiro do contrato (as regras de `validateContractFile`). null = válido. */
export function validarFicheiroContrato(file: File, kind: SupplierContractFile["kind"]): MensagemDoPortal | null {
  const allowed: readonly string[] = kind === "contrato_fornecedor" ? CONTRACT_MAIN_MIME : CONTRACT_ANNEX_MIME;
  if (!allowed.includes(file.type)) {
    return mensagemDeChave(
      kind === "contrato_fornecedor" ? "sp.contrato.ficheiro.soPdf" : "sp.contrato.ficheiro.soAnexos",
    );
  }
  if (file.size <= 0) return mensagemDeChave("sp.contrato.ficheiro.vazio");
  if (file.size > CONTRACT_FILE_MAX_BYTES) return mensagemDeChave(CHAVE_ERRO_FICHEIRO_CONTRATO.file_too_large);
  return null;
}
