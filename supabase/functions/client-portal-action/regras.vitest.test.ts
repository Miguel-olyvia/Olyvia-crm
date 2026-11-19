/**
 * @vitest-environment node
 *
 * 19/11 (auditoria do portal do cliente): as regras de aceitar e assinar no portal (regras.ts), uma a uma.
 */
import { describe, expect, it } from "vitest";
import {
  orcamentosParaAceitar,
  podeAceitarOrcamento,
  podeAssinarContrato,
  podeSimularCliente,
  versaoMaisRecente,
  type VersaoDoOrcamento,
} from "./regras.ts";

describe("modo de teste: só o super admin", () => {
  it("o super admin (fn_super_admin_de = true) pode agir pelo cliente", () => {
    expect(podeSimularCliente(true)).toBeNull();
  });

  it("um membro normal recebe 403 com a frase clara", () => {
    for (const resposta of [false, null, undefined, "true", 1]) {
      const r = podeSimularCliente(resposta);
      expect(r).toEqual({
        status: 403,
        error: "Forbidden",
        message: "Só o super admin pode aceitar ou assinar pelo cliente no modo de teste.",
      });
    }
  });
});

describe("sign_contract: só um contrato enviado para assinatura", () => {
  it("assina em pending_signature e nos nomes antigos (pending, sent)", () => {
    expect(podeAssinarContrato({ status: "pending_signature" })).toBeNull();
    expect(podeAssinarContrato({ status: "pending" })).toBeNull();
    expect(podeAssinarContrato({ status: "sent" })).toBeNull();
  });

  it("recusa um rascunho", () => {
    expect(podeAssinarContrato({ status: "draft" })).toMatchObject({
      status: 409, error: "contract_not_sent", message: "Este contrato ainda não foi enviado para assinatura.",
    });
  });

  it("recusa um contrato anulado", () => {
    expect(podeAssinarContrato({ status: "cancelled" })).toMatchObject({
      status: 409, error: "contract_cancelled", message: "Este contrato foi anulado e já não pode ser assinado.",
    });
  });

  it("recusa um contrato já assinado", () => {
    for (const status of ["signed", "assinado", "active"]) {
      expect(podeAssinarContrato({ status })).toMatchObject({ status: 409, error: "contract_already_signed" });
    }
  });

  it("recusa os outros estados (alterações pedidas, recusado) e um contrato apagado ou inexistente", () => {
    expect(podeAssinarContrato({ status: "changes_requested" })).toMatchObject({ status: 409, error: "contract_not_signable" });
    expect(podeAssinarContrato({ status: "rejected" })).toMatchObject({ status: 409, error: "contract_not_signable" });
    expect(podeAssinarContrato({ status: "pending_signature", deleted_at: "2026-11-19T10:00:00Z" })).toMatchObject({ status: 404 });
    expect(podeAssinarContrato(null)).toMatchObject({ status: 404, message: "Este contrato já não está disponível." });
  });
});

describe("accept_quote: só um orçamento enviado, fora dos negócios", () => {
  it("aceita um orçamento enviado do CRM", () => {
    expect(podeAceitarOrcamento({ estado: "enviado", fluxo_emylia: false, negocio_id: null })).toBeNull();
  });

  it("recusa um rascunho", () => {
    expect(podeAceitarOrcamento({ estado: "rascunho" })).toMatchObject({
      status: 409, error: "quote_not_available", message: "Este orçamento já não está disponível para aceitar.",
    });
  });

  it("recusa um já aceite ou recusado", () => {
    expect(podeAceitarOrcamento({ estado: "aceite" })).toMatchObject({ status: 409, error: "quote_already_accepted" });
    expect(podeAceitarOrcamento({ estado: "rejeitado" })).toMatchObject({ status: 409, error: "quote_rejected" });
    expect(podeAceitarOrcamento({ estado: "recusado" })).toMatchObject({ status: 409, error: "quote_rejected" });
  });

  it("nos negócios recusa o caminho antigo e diz onde se aceita", () => {
    const nosNegocios = [
      { estado: "enviado", fluxo_emylia: true },
      { estado: "enviado", negocio_id: "n1" },
    ];
    for (const q of nosNegocios) {
      expect(podeAceitarOrcamento(q)).toMatchObject({
        status: 409,
        error: "quote_accept_in_proposal",
        message: "Este orçamento aceita-se na própria proposta, com o código enviado por SMS. Abra a proposta para a aceitar.",
      });
    }
  });

  it("recusa um orçamento apagado ou inexistente", () => {
    expect(podeAceitarOrcamento({ estado: "enviado", deleted_at: "2026-11-19T10:00:00Z" })).toMatchObject({ status: 404 });
    expect(podeAceitarOrcamento(undefined)).toMatchObject({ status: 404 });
  });
});

describe("sign_proposal nos negócios: só a versão enviada mais recente", () => {
  const v = (id: string, versao: number, estado: string): VersaoDoOrcamento => ({ id, versao, estado, fluxo_emylia: true });
  const proposta = { status: "sent", negocio_id: "n1" };

  it("aceita a versão enviada mais recente", () => {
    const v1 = v("q1", 1, "substituido"), v2 = v("q2", 2, "enviado");
    expect(orcamentosParaAceitar(proposta, [v2], [v1, v2], ["q2"])).toEqual({ ok: true, ids: ["q2"] });
  });

  it("sem seleção, vale a versão enviada mais recente (modo de teste)", () => {
    const v2 = v("q2", 2, "enviado");
    expect(orcamentosParaAceitar(proposta, [v2], [v("q1", 1, "substituido"), v2], [])).toEqual({ ok: true, ids: ["q2"] });
  });

  it("recusa quando há uma versão nova ainda em rascunho", () => {
    const v1 = v("q1", 1, "enviado"), v2 = v("q2", 2, "rascunho");
    const r = orcamentosParaAceitar({ status: "draft", negocio_id: "n1" }, [v2], [v1, v2], ["q2"]);
    expect(r).toMatchObject({ ok: false, recusa: { status: 409, error: "proposal_new_version" } });
  });

  it("recusa a versão nova em rascunho mesmo que ainda ligada com a antiga", () => {
    const v1 = v("q1", 1, "enviado"), v2 = v("q2", 2, "rascunho");
    expect(orcamentosParaAceitar(proposta, [v1, v2], [v1, v2], ["q1"])).toMatchObject({ ok: false, recusa: { error: "proposal_new_version" } });
  });

  it("recusa uma versão antiga", () => {
    const v1 = v("q1", 1, "enviado"), v2 = v("q2", 2, "enviado");
    expect(orcamentosParaAceitar(proposta, [v1, v2], [v1, v2], ["q1"])).toMatchObject({
      ok: false,
      recusa: { status: 409, error: "proposal_old_version" },
    });
  });

  it("recusa quando a versão mais recente já não está ligada à proposta", () => {
    const v1 = v("q1", 1, "enviado"), v2 = v("q2", 2, "enviado");
    expect(orcamentosParaAceitar(proposta, [v1], [v1, v2], ["q1"])).toMatchObject({
      ok: false,
      recusa: { status: 409, message: "Esta proposta já não está disponível para aceitar." },
    });
  });

  it("recusa quando a versão mais recente já foi aceite", () => {
    const v1 = v("q1", 1, "aceite");
    expect(orcamentosParaAceitar(proposta, [v1], [v1], ["q1"])).toMatchObject({
      ok: false,
      recusa: { status: 409, error: "proposal_not_available" },
    });
  });

  it("um orçamento de outra proposta continua a dar Forbidden", () => {
    const v1 = v("q1", 1, "enviado");
    expect(orcamentosParaAceitar(proposta, [v1], [v1], ["q-de-outro"])).toMatchObject({ ok: false, recusa: { status: 403 } });
  });

  it("a versão vem do número, não da ordem da lista", () => {
    expect(versaoMaisRecente([v("a", 3, "enviado"), v("b", 1, "substituido"), v("c", 2, "substituido")])?.id).toBe("a");
    expect(versaoMaisRecente([])).toBeNull();
  });
});

describe("sign_proposal: a proposta já decidida", () => {
  it("recusa uma proposta já aceite, recusada, apagada ou inexistente", () => {
    expect(orcamentosParaAceitar({ status: "accepted" }, [], [], [])).toMatchObject({ ok: false, recusa: { status: 409, message: "Esta proposta já foi aceite." } });
    expect(orcamentosParaAceitar({ status: "rejected" }, [], [], [])).toMatchObject({ ok: false, recusa: { status: 409, error: "proposal_rejected" } });
    expect(orcamentosParaAceitar({ status: "sent", is_deleted: true }, [], [], [])).toMatchObject({ ok: false, recusa: { status: 404 } });
    expect(orcamentosParaAceitar(null, [], [], [])).toMatchObject({ ok: false, recusa: { status: 404 } });
  });
});

describe("sign_proposal no CRM antigo (sem versões)", () => {
  const q = (id: string, estado: string): VersaoDoOrcamento => ({ id, estado, fluxo_emylia: false });

  it("aceita os orçamentos da proposta publicada (o caminho normal já os pôs «aceite»)", () => {
    expect(orcamentosParaAceitar({ status: "draft" }, [q("a", "aceite"), q("b", "enviado")], [], ["a", "b"])).toEqual({ ok: true, ids: ["a", "b"] });
    expect(orcamentosParaAceitar({ status: "sent" }, [q("a", "rascunho")], [], ["a"])).toEqual({ ok: true, ids: ["a"] });
  });

  it("recusa um orçamento substituído ou anulado", () => {
    expect(orcamentosParaAceitar({ status: "sent" }, [q("a", "substituido")], [], ["a"])).toMatchObject({ ok: false, recusa: { status: 409 } });
    expect(orcamentosParaAceitar({ status: "sent" }, [q("a", "anulado")], [], ["a"])).toMatchObject({ ok: false, recusa: { status: 409 } });
  });

  it("sem orçamentos escolhidos, assina só a proposta (como antes)", () => {
    expect(orcamentosParaAceitar({ status: "draft" }, [], [], [])).toEqual({ ok: true, ids: [] });
  });

  it("um orçamento de outra proposta continua a dar Forbidden", () => {
    expect(orcamentosParaAceitar({ status: "sent" }, [q("a", "enviado")], [], ["x"])).toMatchObject({ ok: false, recusa: { status: 403, error: "Forbidden" } });
  });
});
