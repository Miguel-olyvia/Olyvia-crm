import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Editar a minuta partilhada nao pode mudar o documento de um contrato que ja
 * foi feito. Cada contrato guarda, em `template_snapshot`, uma copia da minuta
 * que usou; e essa copia que monta o documento. A minuta viva so e consultada
 * quando nao ha copia -- contratos anteriores, ou sem minuta.
 */

// Tabelas visitadas e o que cada uma devolve, controlado por teste.
const tabelasLidas: string[] = [];
let respostas: Record<string, any> = {};

function builder(table: string) {
  tabelasLidas.push(table);
  const result = { data: respostas[table] ?? null, error: null };
  const b: any = {
    then: (ok: any, ko: any) => Promise.resolve(result).then(ok, ko),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
  };
  for (const m of ["select", "eq", "neq", "is", "in", "not", "order", "limit", "update", "insert"]) {
    b[m] = () => b;
  }
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));

import { gatherContractData, resolveContractDocument, templateSnapshotAsTemplate } from "../contractDocument";

const MINUTA_VIVA = { body_html: "<p>TEXTO VIVO</p>", doc_settings: { primary_color: "#00ff00" } };

const contratoBase = {
  id: "contrato-1",
  contract_number: "CC-2026-0220",
  status: "draft",
  contract_template_id: "minuta-1",
  contract_body_html: null,
  contract_body_frozen_html: null,
  created_at: "2026-01-05T10:00:00Z",
};

beforeEach(() => {
  tabelasLidas.length = 0;
  respostas = {
    anew_organizations: { name: "Nike" },
    client_contract_templates: MINUTA_VIVA,
  };
});

describe("o documento e montado a partir da minuta congelada no contrato", () => {
  it("havendo copia congelada, e o texto dela que sai -- e a minuta viva nem chega a ser lida", async () => {
    const resolved = await resolveContractDocument(
      {
        ...contratoBase,
        template_snapshot: {
          id: "minuta-1",
          body_html: "<p>TEXTO CONGELADO {{contrato_numero}}</p>",
          doc_settings: { primary_color: "#ff0000" },
        },
      },
      "org-1",
    );

    expect(resolved).not.toBeNull();
    expect(resolved!.bodyHtml).toContain("TEXTO CONGELADO");
    expect(resolved!.bodyHtml).toContain("CC-2026-0220");
    expect(resolved!.bodyHtml).not.toContain("TEXTO VIVO");
    // As definicoes de aspecto tambem vem da copia.
    expect(resolved!.settings.primary_color).toBe("#ff0000");
    // E o essencial: a minuta partilhada nao foi sequer consultada, por isso
    // edita-la nao pode mudar este documento.
    expect(tabelasLidas).not.toContain("client_contract_templates");
  });

  it("sem copia congelada, continua a ler a minuta viva como antes", async () => {
    const resolved = await resolveContractDocument({ ...contratoBase, template_snapshot: null }, "org-1");

    expect(resolved!.bodyHtml).toContain("TEXTO VIVO");
    expect(resolved!.settings.primary_color).toBe("#00ff00");
    expect(tabelasLidas).toContain("client_contract_templates");
  });

  it("uma copia vazia ou invalida nao conta como copia", async () => {
    expect(templateSnapshotAsTemplate({ template_snapshot: null })).toBeNull();
    expect(templateSnapshotAsTemplate({})).toBeNull();
    expect(templateSnapshotAsTemplate({ template_snapshot: "nao e um objecto" })).toBeNull();
    expect(templateSnapshotAsTemplate({ template_snapshot: [] })).toBeNull();

    const resolved = await resolveContractDocument({ ...contratoBase, template_snapshot: "lixo" }, "org-1");
    expect(resolved!.bodyHtml).toContain("TEXTO VIVO");
  });

  it("o corpo proprio do contrato continua a mandar sobre a minuta, congelada ou nao", async () => {
    const resolved = await resolveContractDocument(
      {
        ...contratoBase,
        contract_body_html: "<p>CORPO PROPRIO</p>",
        template_snapshot: { body_html: "<p>TEXTO CONGELADO</p>", doc_settings: {} },
      },
      "org-1",
    );

    expect(resolved!.bodyHtml).toContain("CORPO PROPRIO");
    expect(resolved!.bodyHtml).not.toContain("TEXTO CONGELADO");
  });

  it("o documento ja congelado do contrato assinado manda sobre tudo", async () => {
    const resolved = await resolveContractDocument(
      {
        ...contratoBase,
        status: "signed",
        contract_body_frozen_html: "<p>DOCUMENTO ASSINADO</p>",
        contract_body_html: "<p>CORPO PROPRIO</p>",
        template_snapshot: { body_html: "<p>TEXTO CONGELADO</p>", doc_settings: { primary_color: "#0000ff" } },
      },
      "org-1",
    );

    expect(resolved!.bodyHtml).toBe("<p>DOCUMENTO ASSINADO</p>");
    expect(tabelasLidas).not.toContain("client_contract_templates");
  });

  it("o signatario da empresa tambem vem da copia -- troca-lo na minuta nao mexe no contrato", async () => {
    respostas.anew_users = { name: "Quem assinava em Janeiro" };
    respostas.anew_roles = { name: "Gerente" };

    const data = await gatherContractData(
      {
        ...contratoBase,
        template_snapshot: { body_html: "<p>x</p>", signatory_user_id: "user-antigo", signatory_role_id: "role-1" },
      },
      "org-1",
    );

    expect(data.signatario_nome).toBe("Quem assinava em Janeiro");
    expect(data.signatario_cargo).toBe("Gerente");
    expect(tabelasLidas).not.toContain("client_contract_templates");
  });
});
