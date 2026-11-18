// spErrorMessage: o ecrã escolhe a mensagem pelo `hint` (estável) e agora também pelo idioma do portal.
// As mensagens cruas do servidor (message em português) continuam como vêm nesta fase.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

// O cliente Supabase não é usado aqui, mas spRpc importa-o.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { SupplierPortalRpcError, spErrorMessage } from "../spRpc";

const erro = (raw: { message?: string; code?: string; hint?: string } | null) => new SupplierPortalRpcError(raw);

beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
});

describe("spErrorMessage por hint", () => {
  const casos: Array<[string, string, string]> = [
    [
      "no_supplier_access",
      "Sem acesso ativo ao portal do fornecedor. Contacte a empresa que o convidou.",
      "No active access to the supplier portal. Please contact the company that invited you.",
    ],
    [
      "not_owner",
      "Só o utilizador principal da conta pode alterar o catálogo.",
      "Only the primary user of the account can change the catalogue.",
    ],
    [
      "stale_revision",
      "A empresa atualizou esta encomenda entretanto. Reveja os dados atualizados e confirme de novo.",
      "The company has updated this order in the meantime. Review the updated details and confirm again.",
    ],
  ];

  it.each(casos)("%s", (hint, pt, en) => {
    expect(spErrorMessage(erro({ message: "x", hint }))).toBe(pt);
    definirIdioma("en");
    expect(spErrorMessage(erro({ message: "x", hint }))).toBe(en);
  });

  it("o idioma pode ser passado explicitamente e prevalece sobre o guardado", () => {
    definirIdioma("pt");
    expect(spErrorMessage(erro({ hint: "no_supplier_access" }), "en")).toMatch(/^No active access/);
  });
});

describe("mensagens cruas do servidor (por traduzir nesta fase)", () => {
  it.each(["not_found", "too_many_rows", "conflict", "validation", "order_closed"])(
    "%s: a mensagem do servidor fica como vem, em qualquer idioma",
    (hint) => {
      const e = erro({ message: "Texto do servidor em português.", hint });
      expect(spErrorMessage(e, "en")).toBe("Texto do servidor em português.");
      expect(spErrorMessage(e, "pt")).toBe("Texto do servidor em português.");
    },
  );

  it("sem mensagem do servidor o erro diz «Erro desconhecido» no idioma de quando foi criado", () => {
    expect(spErrorMessage(erro({ hint: "validation" }))).toBe("Erro desconhecido");
    definirIdioma("en");
    expect(spErrorMessage(erro({ hint: "validation" }))).toBe("Unknown error");
  });
});

describe("falhas sem hint", () => {
  it("rede, tempo esgotado, permissão e erro inesperado", () => {
    expect(spErrorMessage(new Error("Failed to fetch"))).toBe(
      "Sem ligação ao servidor. Verifique a ligação à internet e tente novamente.",
    );
    expect(spErrorMessage(new Error("Failed to fetch"), "en")).toBe(
      "Unable to reach the server. Check your internet connection and try again.",
    );
    expect(spErrorMessage(erro({ message: "boom", code: "57014" }), "en")).toBe(
      "The operation took too long. Try again or use a smaller file.",
    );
    expect(spErrorMessage(erro({ message: "boom", code: "57014" }))).toBe(
      "A operação demorou demasiado tempo. Tente novamente ou use um ficheiro mais pequeno.",
    );
    expect(spErrorMessage(erro({ message: "boom", code: "42501" }), "en")).toBe(
      "You do not have permission to perform this action.",
    );
    expect(spErrorMessage(erro({ message: "boom", code: "42501" }))).toBe("Sem permissão para esta operação.");
    expect(spErrorMessage("coisa estranha", "en")).toBe("An unexpected error occurred. Please try again.");
    expect(spErrorMessage("coisa estranha")).toBe("Ocorreu um erro inesperado. Tente novamente.");
  });

  it("uma mensagem de servidor sem hint conhecido fica como vem", () => {
    expect(spErrorMessage(erro({ message: "Algo correu mal no servidor" }), "en")).toBe("Algo correu mal no servidor");
  });
});

describe("mensagem própria da chamada (dados do fornecedor)", () => {
  it("not_owner com mensagem própria usa a versão do idioma", () => {
    const e = new SupplierPortalRpcError({ hint: "not_owner" }, { not_owner: "sp.erro.soPrincipalDados" });
    expect(spErrorMessage(e)).toBe("Só o responsável principal da conta pode fazer esta alteração.");
    expect(spErrorMessage(e, "en")).toBe("Only the primary user of the account can make this change.");
  });
});
