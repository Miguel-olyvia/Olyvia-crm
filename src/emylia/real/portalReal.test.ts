// O portal do cliente real a partir do /negocios (28/10): o documento real do negócio, o email da ficha no contacto e a conta pela
// create-client-portal-access (conta nova na 1.ª proposta, email único).
import { describe, expect, it, vi } from "vitest";
import { enviarAoPortal, resultadoDaFuncao, tipoDoEnvio } from "./portalReal";

const ORG = "11111111-1111-4111-a111-111111111111";
const REF = { id: "22222222-2222-4222-a222-222222222222", entityId: "33333333-3333-4333-a333-333333333333" };

function base(o: { emailAtual?: string | null; docs?: { proposta_id: string | null; contrato_id: string | null }; funcao?: { data?: unknown; error?: unknown } } = {}) {
  const escritas: { op: string; args: unknown }[] = [];
  const emails = () => ({
    select: () => ({ eq: () => ({ eq: async () => ({ data: o.emailAtual ? [{ email: o.emailAtual }] : [], error: null }) }) }),
    delete: () => ({ eq: (_c: string, v: unknown) => ({ eq: async () => { escritas.push({ op: "delete", args: v }); return { error: null }; } }) }),
    insert: async (r: unknown) => { escritas.push({ op: "insert", args: r }); return { error: null }; },
  });
  const invoke = vi.fn(async () => o.funcao ?? { data: { success: true, is_new_account: true, email: "ana@cliente.pt" }, error: null });
  const sb = {
    rpc: vi.fn(async () => ({ data: o.docs ?? { proposta_id: "prop-1", contrato_id: null }, error: null })),
    from: vi.fn(() => emails()),
    functions: { invoke },
  };
  return { sb: sb as never, invoke, escritas };
}

describe("portal real", () => {
  it("só a proposta e o contrato vão ao portal real (a adenda, a fatura e o auto ainda não)", () => {
    expect(tipoDoEnvio("proposta")).toBe("proposal");
    expect(tipoDoEnvio("contrato")).toBe("contract");
    expect(tipoDoEnvio("adenda")).toBeNull();
    expect(tipoDoEnvio("fatura")).toBeNull();
  });

  it("1.ª proposta: o email da ficha passa a ser o do contacto e a função cria a conta e manda o email", async () => {
    const { sb, invoke, escritas } = base({ emailAtual: null });
    const r = await enviarAoPortal(sb, ORG, REF, "ana@cliente.pt", { doc: "proposta" }, "https://olyvia.test");
    expect(escritas.map((x) => x.op)).toEqual(["delete", "insert"]);
    expect(escritas[1].args).toMatchObject({ entity_id: REF.entityId, email: "ana@cliente.pt", is_primary: true });
    expect(invoke).toHaveBeenCalledWith("create-client-portal-access", { body: {
      document_type: "proposal", document_id: "prop-1", organization_id: ORG, login_url: "https://olyvia.test/auth", force_new_password: false } });
    expect(r).toEqual({ fase: "pronta", nova: true, email: { enviado: true, para: "ana@cliente.pt" } });
  });

  it("o contacto já tem esse email: não se reescreve; o contrato vai com o id do contrato real", async () => {
    const { sb, invoke, escritas } = base({ emailAtual: "Ana@Cliente.pt", docs: { proposta_id: "prop-1", contrato_id: "cont-9" } });
    await enviarAoPortal(sb, ORG, REF, "ana@cliente.pt", { doc: "contrato" }, "https://x");
    expect(escritas).toEqual([]);
    expect((invoke.mock.calls[0] as unknown as [string, { body: { document_type: string; document_id: string } }])[1].body).toMatchObject({ document_type: "contract", document_id: "cont-9" });
  });

  it("sem o documento na base, não chama a função e diz porquê", async () => {
    const { sb, invoke } = base({ docs: { proposta_id: null, contrato_id: null } });
    const r = await enviarAoPortal(sb, ORG, REF, "ana@cliente.pt", { doc: "contrato" });
    expect(invoke).not.toHaveBeenCalled();
    expect(r).toMatchObject({ fase: "erro", msg: expect.stringContaining("contrato ainda não está gravado") });
  });

  it("email de outro cliente ou de um utilizador do CRM: a recusa da função em português", async () => {
    const erro = { context: { json: async () => ({ error: "portal_email_used_by_other_entity" }) }, message: "Edge Function returned a non-2xx status code" };
    const { sb } = base({ funcao: { data: null, error: erro } });
    expect(await enviarAoPortal(sb, ORG, REF, "ana@cliente.pt", { doc: "proposta" })).toEqual({ fase: "erro", msg: "Este email já está associado a outro cliente nesta organização. Use outro email." });
    expect(resultadoDaFuncao({ error: "portal_email_is_crm_user" })).toMatchObject({ fase: "erro", msg: expect.stringContaining("utilizador do CRM") });
  });

  it("o email não seguiu (SMTP): o cartão mostra a password temporária para entregar", () => {
    expect(resultadoDaFuncao({ success: true, is_new_account: true, email: "a@b.pt", smtp_warning: true, smtp_error_safe: "SMTP recusou", temp_password: "Xy7" }))
      .toEqual({ fase: "pronta", nova: true, password: "Xy7", email: { enviado: false, para: "a@b.pt", motivo: "SMTP recusou" } });
  });
});
