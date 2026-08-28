import { describe, it, expect, vi } from "vitest";

// clientInfo importa ./supabase e ./names; mockamos supabase para evitar tocar
// na env real. Os testes focam-se nos mappers puros.
vi.mock("./supabase", () => ({ supabase: { from: vi.fn() } }));

import {
  prefillBlocksFromInfo,
  mergePrefill,
  prefillScopeItemsFromInfo,
  type ClientOlyviaInfo,
  type ScopeLine,
} from "./clientInfo";

function makeInfo(overrides: Partial<ClientOlyviaInfo> = {}): ClientOlyviaInfo {
  return {
    entityId: "ent-1",
    name: "Acme Lda",
    email: "geral@acme.pt",
    phone: "912345678",
    address: "Rua A 10, 1000-001 Lisboa",
    addressStreet: "Rua A",
    addressNumber: "10",
    addressPostal: "1000-001",
    addressCity: "Lisboa",
    nif: "123456789",
    responsavel: "Ana Comercial",
    dataAdjudicacao: "2026-01-15",
    dataFim: "2026-06-30",
    valor: "10.000,00 EUR",
    condicoes: "50% adjudicação, 50% entrega",
    contractNumber: "CT-2026-001",
    proposalId: "prop-1",
    scopeLines: [],
    ...overrides,
  };
}

describe("prefillBlocksFromInfo", () => {
  it("mapeia todos os campos comerciais quando presentes", () => {
    const { comercial } = prefillBlocksFromInfo(makeInfo());
    expect(comercial).toEqual({
      cliente_ref: "Acme Lda",
      contacto_nome: "Acme Lda",
      contacto_tel: "912345678",
      contacto_email: "geral@acme.pt",
      morada_obra: { street: "Rua A", number: "10", postal: "1000-001", city: "Lisboa", district: "" },
      comercial_responsavel: "Ana Comercial",
      data_adjudicacao: "2026-01-15",
      valor_mensal_anual: "10.000,00 EUR",
      num_contrato: "CT-2026-001",
    });
  });

  it("omite campos comerciais opcionais quando null", () => {
    const { comercial } = prefillBlocksFromInfo(
      makeInfo({
        phone: null,
        email: null,
        address: null,
        addressStreet: null,
        addressNumber: null,
        addressPostal: null,
        addressCity: null,
        responsavel: null,
        dataAdjudicacao: null,
        valor: null,
      })
    );
    // name-derivados mantêm-se sempre
    expect(comercial.cliente_ref).toBe("Acme Lda");
    expect(comercial.contacto_nome).toBe("Acme Lda");
    expect(comercial).not.toHaveProperty("contacto_tel");
    expect(comercial).not.toHaveProperty("contacto_email");
    expect(comercial).not.toHaveProperty("morada_obra");
    expect(comercial).not.toHaveProperty("comercial_responsavel");
    expect(comercial).not.toHaveProperty("data_adjudicacao");
    expect(comercial).not.toHaveProperty("valor_mensal_anual");
  });

  it("constrói nif_dados_faturacao com nome, NIF e morada", () => {
    const { financeiro } = prefillBlocksFromInfo(makeInfo());
    expect(financeiro.nif_dados_faturacao).toBe(
      "Acme Lda\nNIF: 123456789\nRua A 10, 1000-001 Lisboa"
    );
    expect(financeiro.condicoes_faseamento).toBe("50% adjudicação, 50% entrega");
  });

  it("nif_dados_faturacao omite a linha NIF quando não há nif", () => {
    const { financeiro } = prefillBlocksFromInfo(makeInfo({ nif: null }));
    expect(financeiro.nif_dados_faturacao).toBe("Acme Lda\nRua A 10, 1000-001 Lisboa");
  });

  it("omite condicoes_faseamento quando condicoes é null", () => {
    const { financeiro } = prefillBlocksFromInfo(makeInfo({ condicoes: null }));
    expect(financeiro).not.toHaveProperty("condicoes_faseamento");
  });

  it("nif_dados_faturacao só com o nome quando nif e address são null", () => {
    const { financeiro } = prefillBlocksFromInfo(
      makeInfo({ nif: null, address: null })
    );
    expect(financeiro.nif_dados_faturacao).toBe("Acme Lda");
  });

  it("mapeia o bloco entrega (cliente, morada, datas, obra_ref)", () => {
    const { entrega } = prefillBlocksFromInfo(makeInfo());
    expect(entrega).toEqual({
      cliente: "Acme Lda",
      morada: { street: "Rua A", number: "10", postal: "1000-001", city: "Lisboa", district: "" },
      data_inicio: "2026-01-15", // dataAdjudicacao
      data_entrega: "2026-06-30", // dataFim
      obra_ref: "CT-2026-001", // contractNumber
    });
  });

  it("bloco entrega omite campos opcionais em falta mas mantém cliente", () => {
    const { entrega } = prefillBlocksFromInfo(
      makeInfo({
        address: null,
        addressStreet: null,
        addressNumber: null,
        addressPostal: null,
        addressCity: null,
        dataAdjudicacao: null,
        dataFim: null,
        contractNumber: null,
      })
    );
    expect(entrega).toEqual({ cliente: "Acme Lda" });
  });

  it("devolve as três chaves de bloco esperadas", () => {
    const blocks = prefillBlocksFromInfo(makeInfo());
    expect(Object.keys(blocks).sort()).toEqual(["comercial", "entrega", "financeiro"]);
  });
});

describe("mergePrefill", () => {
  it("preenche campos undefined, null e string vazia", () => {
    const blocks = {
      comercial: { cliente_ref: undefined, contacto_nome: null, contacto_tel: "" },
    };
    const prefill = {
      comercial: {
        cliente_ref: "Novo",
        contacto_nome: "Nome",
        contacto_tel: "999",
      },
    };
    const merged = mergePrefill(blocks as never, prefill);
    expect(merged.comercial).toEqual({
      cliente_ref: "Novo",
      contacto_nome: "Nome",
      contacto_tel: "999",
    });
  });

  it("NÃO sobrepõe valores existentes não vazios", () => {
    const blocks = {
      comercial: { cliente_ref: "Cliente Existente", contacto_tel: "111" },
    };
    const prefill = {
      comercial: { cliente_ref: "Prefill", contacto_tel: "999", contacto_email: "x@y.pt" },
    };
    const merged = mergePrefill(blocks, prefill);
    // existentes mantêm-se
    expect(merged.comercial.cliente_ref).toBe("Cliente Existente");
    expect(merged.comercial.contacto_tel).toBe("111");
    // ausente é preenchido
    expect(merged.comercial.contacto_email).toBe("x@y.pt");
  });

  it("cria o bloco quando ainda não existe em blocks", () => {
    const merged = mergePrefill({}, { financeiro: { condicoes_faseamento: "X" } });
    expect(merged.financeiro).toEqual({ condicoes_faseamento: "X" });
  });

  it("preserva blocos existentes não mencionados no prefill", () => {
    const blocks = { rh: { num_pessoas: "3" } };
    const merged = mergePrefill(blocks, { comercial: { cliente_ref: "A" } });
    expect(merged.rh).toEqual({ num_pessoas: "3" });
    expect(merged.comercial).toEqual({ cliente_ref: "A" });
  });

  it("não muta os blocos de entrada (retorna novas referências)", () => {
    const blocks = { comercial: { cliente_ref: "" } };
    const merged = mergePrefill(blocks, { comercial: { cliente_ref: "Novo" } });
    expect(blocks.comercial.cliente_ref).toBe(""); // original intacto
    expect(merged).not.toBe(blocks);
    expect(merged.comercial).not.toBe(blocks.comercial);
  });

  it("trata 0 e false como valores existentes (não os sobrepõe)", () => {
    const blocks = { s: { a: 0, b: false } };
    const merged = mergePrefill(blocks as never, {
      s: { a: "x", b: "y" } as never,
    });
    expect(merged.s.a).toBe(0);
    expect(merged.s.b).toBe(false);
  });

  it("integra-se com prefillBlocksFromInfo respeitando dados já editados", () => {
    const info = makeInfo();
    const prefill = prefillBlocksFromInfo(info);
    const existing = {
      comercial: { contacto_nome: "Contacto manual" },
    };
    const merged = mergePrefill(existing, prefill);
    // valor editado manualmente mantém-se
    expect(merged.comercial.contacto_nome).toBe("Contacto manual");
    // restantes vêm do prefill
    expect(merged.comercial.cliente_ref).toBe("Acme Lda");
    expect(merged.financeiro.condicoes_faseamento).toBe(info.condicoes);
  });
});

describe("prefillScopeItemsFromInfo", () => {
  it("devolve as scopeLines do info", () => {
    const lines: ScopeLine[] = [
      { label: "Cozinha", description: "Montagem", qty: "1", unit: "un" },
    ];
    expect(prefillScopeItemsFromInfo(makeInfo({ scopeLines: lines }))).toBe(lines);
  });

  it("devolve array vazio quando não há linhas", () => {
    expect(prefillScopeItemsFromInfo(makeInfo({ scopeLines: [] }))).toEqual([]);
  });
});
