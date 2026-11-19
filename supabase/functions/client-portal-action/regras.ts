// 19/11 (auditoria do portal do cliente): as regras de aceitar e assinar, sem acesso à base, para se poderem testar no vitest
// (regras.vitest.test.ts). O index.ts lê o documento, pergunta aqui se a ação pode seguir e só depois consome o código por SMS.
//
// Os estados reais:
//   · quotes.estado: rascunho, enviado, aceite, rejeitado (CRM), recusado e substituido (negócios), anulado
//   · proposals.status: draft, sent, accepted, rejected (proposals_status_check)
//   · client_contracts.status: draft, pending_signature (enviado para assinatura), changes_requested, signed, rejected, cancelled;
//     "pending" e "sent" só em contratos antigos (o portal ainda os trata como «por assinar»)

/** Uma ação recusada: o estado HTTP, o código e a frase que o cliente lê. */
export interface Recusa {
  status: number;
  error: string;
  message: string;
}

const recusa = (status: number, error: string, message: string): Recusa => ({ status, error, message });

// ── Modo de teste («simular_cliente») ──────────────────────────────────────────────────────────────────────────────────────

/** Só o super admin age pelo cliente. `superAdmin` é a resposta de fn_super_admin_de (super admin da organização do documento,
 *  ou de uma acima dela, ou o administrador de sistema). Um membro normal da organização já não chega. */
export function podeSimularCliente(superAdmin: unknown): Recusa | null {
  if (superAdmin === true) return null;
  return recusa(403, "Forbidden", "Só o super admin pode aceitar ou assinar pelo cliente no modo de teste.");
}

// ── Contrato (sign_contract) ───────────────────────────────────────────────────────────────────────────────────────────────

/** Os estados de um contrato enviado ao cliente para assinar. */
export const ESTADOS_CONTRATO_POR_ASSINAR = ["pending_signature", "pending", "sent"] as const;

export interface ContratoParaAssinar {
  status: string | null;
  deleted_at?: string | null;
}

export function podeAssinarContrato(c: ContratoParaAssinar | null | undefined): Recusa | null {
  if (!c || c.deleted_at) return recusa(404, "contract_unavailable", "Este contrato já não está disponível.");
  const s = String(c.status ?? "");
  if ((ESTADOS_CONTRATO_POR_ASSINAR as readonly string[]).includes(s)) return null;
  if (s === "signed" || s === "assinado" || s === "active") {
    return recusa(409, "contract_already_signed", "Este contrato já está assinado.");
  }
  if (s === "draft") {
    return recusa(409, "contract_not_sent", "Este contrato ainda não foi enviado para assinatura.");
  }
  if (s === "cancelled" || s === "anulado") {
    return recusa(409, "contract_cancelled", "Este contrato foi anulado e já não pode ser assinado.");
  }
  return recusa(409, "contract_not_signable", "Este contrato já não está disponível para assinar.");
}

// ── Orçamento sozinho (accept_quote) ───────────────────────────────────────────────────────────────────────────────────────

export interface OrcamentoParaAceitar {
  estado: string | null;
  deleted_at?: string | null;
  fluxo_emylia?: boolean | null;
  negocio_id?: string | null;
}

/** accept_quote é o caminho antigo do CRM (um orçamento sozinho, que cria uma proposta nova). Nos negócios a proposta aceita-se
 *  no próprio documento (sign_proposal), por isso aqui recusa-se. Fora deles, só um orçamento enviado. */
export function podeAceitarOrcamento(q: OrcamentoParaAceitar | null | undefined): Recusa | null {
  if (!q || q.deleted_at) return recusa(404, "quote_unavailable", "Este orçamento já não está disponível.");
  if (q.fluxo_emylia === true || q.negocio_id) {
    return recusa(
      409,
      "quote_accept_in_proposal",
      "Este orçamento aceita-se na própria proposta, com o código enviado por SMS. Abra a proposta para a aceitar.",
    );
  }
  const e = String(q.estado ?? "");
  if (e === "enviado") return null;
  if (e === "aceite") return recusa(409, "quote_already_accepted", "Este orçamento já foi aceite.");
  if (e === "rejeitado" || e === "recusado") {
    return recusa(409, "quote_rejected", "Este orçamento foi recusado e já não pode ser aceite.");
  }
  return recusa(409, "quote_not_available", "Este orçamento já não está disponível para aceitar.");
}

// ── Proposta (sign_proposal) ───────────────────────────────────────────────────────────────────────────────────────────────

export interface PropostaParaAceitar {
  status: string | null;
  negocio_id?: string | null;
  is_deleted?: boolean | null;
}

export interface VersaoDoOrcamento {
  id: string;
  estado: string | null;
  versao?: number | null;
  fluxo_emylia?: boolean | null;
  created_at?: string | null;
}

/** Estados de um orçamento que nunca se aceitam, em nenhum caminho. */
const ORCAMENTO_FORA = ["substituido", "anulado"];

const naoDisponivel = () =>
  recusa(409, "proposal_not_available", "Esta proposta já não está disponível para aceitar.");

/** A versão mais recente: o número de versão maior; sem número, a mais recente a nascer. */
export function versaoMaisRecente(vs: VersaoDoOrcamento[]): VersaoDoOrcamento | null {
  let melhor: VersaoDoOrcamento | null = null;
  for (const v of vs) {
    if (!melhor) { melhor = v; continue; }
    const a = Number(v.versao ?? -1), b = Number(melhor.versao ?? -1);
    if (a > b || (a === b && String(v.created_at ?? "") > String(melhor.created_at ?? ""))) melhor = v;
  }
  return melhor;
}

/**
 * Que orçamentos o cliente aceita ao assinar a proposta.
 *
 * - `daProposta`: os orçamentos ligados à proposta (quotes.proposal_id), não apagados.
 * - `doNegocio`: as versões do negócio (quotes do fluxo dos negócios, não apagadas); vazio fora dos negócios.
 * - `selecionados`: o que o portal mandou em selected_quote_ids.
 *
 * Nos negócios (versões): só a versão mais recente do negócio, e só se estiver enviada. Uma versão nova ainda em rascunho
 * fecha a proposta até ser enviada. Sem seleção, vale essa versão (o modo de teste e o portal com um só orçamento).
 *
 * No CRM antigo (sem versões): a proposta publicada é o documento enviado e os orçamentos não mudam de estado ao publicar (o
 * caminho normal até os põe «aceite» antes de criar a proposta), por isso aqui só se recusam os orçamentos apagados,
 * substituídos ou anulados, e a proposta já decidida.
 */
export function orcamentosParaAceitar(
  proposta: PropostaParaAceitar | null | undefined,
  daProposta: VersaoDoOrcamento[],
  doNegocio: VersaoDoOrcamento[],
  selecionados: string[],
): { ok: true; ids: string[] } | { ok: false; recusa: Recusa } {
  if (!proposta || proposta.is_deleted) {
    return { ok: false, recusa: recusa(404, "proposal_unavailable", "Esta proposta já não está disponível.") };
  }
  if (proposta.status === "accepted") {
    return { ok: false, recusa: recusa(409, "proposal_already_accepted", "Esta proposta já foi aceite.") };
  }
  if (proposta.status === "rejected") {
    return { ok: false, recusa: recusa(409, "proposal_rejected", "Esta proposta foi recusada e já não pode ser aceite.") };
  }

  const ligados = new Set(daProposta.map((q) => q.id));
  // um orçamento que não é desta proposta: é o mesmo «Forbidden» de antes (não se diz ao cliente que existe)
  if (selecionados.some((id) => !ligados.has(id))) {
    return { ok: false, recusa: recusa(403, "Forbidden", "Forbidden") };
  }

  const negocio = doNegocio.length > 0 || daProposta.some((q) => q.fluxo_emylia === true);
  if (negocio) {
    const ultima = versaoMaisRecente(doNegocio.length > 0 ? doNegocio : daProposta);
    if (!ultima || !ligados.has(ultima.id)) return { ok: false, recusa: naoDisponivel() };
    if (ultima.estado === "rascunho") {
      return {
        ok: false,
        recusa: recusa(409, "proposal_new_version", "Esta proposta está a ser revista e ainda não pode ser aceite. Vai receber a versão nova."),
      };
    }
    if (ultima.estado !== "enviado") return { ok: false, recusa: naoDisponivel() };
    if (selecionados.length > 0 && (selecionados.length !== 1 || selecionados[0] !== ultima.id)) {
      return {
        ok: false,
        recusa: recusa(409, "proposal_old_version", "Esta versão da proposta já não está disponível para aceitar. Atualize a página para ver a mais recente."),
      };
    }
    return { ok: true, ids: [ultima.id] };
  }

  const porId = new Map(daProposta.map((q) => [q.id, q]));
  if (selecionados.some((id) => ORCAMENTO_FORA.includes(String(porId.get(id)?.estado ?? "")))) {
    return { ok: false, recusa: naoDisponivel() };
  }
  return { ok: true, ids: [...new Set(selecionados)] };
}
