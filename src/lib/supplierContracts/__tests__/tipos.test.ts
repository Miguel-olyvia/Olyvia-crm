import { describe, expect, it } from "vitest";
import {
  conditionsToForm,
  fmtData,
  formToConditions,
  hojeLisboa,
  missingForSend,
  parseNumero,
  type SupplierContractConditions,
} from "../tipos";
import { BASE_SUPPLIER_TEMPLATES } from "../modelosBase";

const vazio: SupplierContractConditions = {
  payment_terms_days: null,
  payment_method: null,
  delivery_sla_days: null,
  shipping_terms: null,
  shipping_free_from: null,
  discount_percent: null,
  min_order_value: null,
  returns_accepted: null,
  returns_days: null,
  returns_notes: null,
  conditions_notes: null,
};

describe("condições do contrato de fornecedor", () => {
  it("ida e volta formulário ↔ condições (vírgula decimal, nulos)", () => {
    const f = conditionsToForm(
      { ...vazio, payment_terms_days: 30, payment_method: "transferencia", discount_percent: 2.5, returns_accepted: true, returns_days: 15 },
      "2027-01-01",
      null,
    );
    expect(f.payment_terms_days).toBe("30");
    expect(f.returns_accepted).toBe("sim");
    const r = formToConditions({ ...f, discount_percent: "2,5", min_order_value: "100,456" });
    expect(r.errors).toEqual({});
    expect(r.conditions.payment_terms_days).toBe(30);
    expect(r.conditions.discount_percent).toBe(2.5);
    expect(r.conditions.min_order_value).toBe(100.46);
    expect(r.conditions.returns_days).toBe(15);
    expect(r.valid_from).toBe("2027-01-01");
    expect(r.valid_until).toBeNull();
  });

  it("recusa como o servidor: inteiros 0–365, desconto até 100, validade invertida", () => {
    const f = conditionsToForm(vazio, null, null);
    const r = formToConditions({
      ...f,
      payment_terms_days: "30,5",
      delivery_sla_days: "400",
      discount_percent: "101",
      valid_from: "2027-02-01",
      valid_until: "2027-01-01",
    });
    expect(Object.keys(r.errors).sort()).toEqual(["delivery_sla_days", "discount_percent", "payment_terms_days", "valid_until"]);
  });

  it("campos escondidos não seguem e portes grátis exigem valor", () => {
    const f = conditionsToForm(vazio, null, null);
    const semDevolucoes = formToConditions({ ...f, returns_accepted: "nao", returns_days: "10", returns_notes: "x" });
    expect(semDevolucoes.conditions.returns_accepted).toBe(false);
    expect(semDevolucoes.conditions.returns_days).toBeNull();
    expect(semDevolucoes.conditions.returns_notes).toBeNull();

    const outrosPortes = formToConditions({ ...f, shipping_terms: "incluidos", shipping_free_from: "50" });
    expect(outrosPortes.conditions.shipping_free_from).toBeNull();

    const gratis = formToConditions({ ...f, shipping_terms: "gratis_acima_minimo", shipping_free_from: "" });
    expect(gratis.errors.shipping_free_from).toBeTruthy();
  });

  it("o que falta para enviar (rpc_supplier_contract_send)", () => {
    const base = { conditions: vazio, origin: "modelo" as const, body_html: null, main_file_id: null, valid_until: "2020-01-01" };
    expect(missingForSend(base, "2026-11-02")).toEqual([
      "prazo de pagamento",
      "forma de pagamento",
      "fim da validade no futuro",
      "texto do contrato (escolha um modelo)",
    ]);
    expect(
      missingForSend(
        { ...base, conditions: { ...vazio, payment_terms_days: 30, payment_method: "cheque" }, origin: "pdf_fornecedor", valid_until: null },
        "2026-11-02",
      ),
    ).toEqual(["PDF do contrato do fornecedor"]);
  });

  it("formatação", () => {
    expect(parseNumero("")).toBeNull();
    expect(Number.isNaN(parseNumero("abc"))).toBe(true);
    expect(fmtData("2027-03-09")).toBe("09/03/2027");
    expect(hojeLisboa(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-02");
  });
});

describe("modelos base", () => {
  // As mesmas regras de fn_sc_validar_corpo / fn_sc_variaveis.
  const conhecidas = new Set([
    "empresa_nome", "fornecedor_nome", "fornecedor_nif", "fornecedor_morada", "fornecedor_codigo_postal",
    "fornecedor_localidade", "fornecedor_email", "numero_contrato", "versao", "titulo", "data_envio",
    "prazo_pagamento_dias", "forma_pagamento", "prazo_entrega_dias", "portes", "portes_gratis_a_partir",
    "desconto_percentagem", "encomenda_minima", "devolucoes", "devolucoes_dias", "devolucoes_condicoes",
    "observacoes", "validade_inicio", "validade_fim", "tabela_condicoes",
  ]);

  it.each(BASE_SUPPLIER_TEMPLATES.map((t) => [t.name, t] as const))("%s passa a validação do servidor", (_n, t) => {
    expect(t.body_html).not.toMatch(/<\s*\/?\s*(script|iframe|object|embed|form|base|meta)\b/i);
    expect(t.body_html).not.toMatch(/<[^>]*[\s/]on[a-z]+\s*=/i);
    expect(t.body_html).not.toMatch(/javascript\s*:/i);
    const semVars = t.body_html.replace(/\{\{\s*[a-z_]+\s*\}\}/g, "");
    expect(semVars).not.toMatch(/\{\{|\}\}/);
    const usadas = [...t.body_html.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
    expect(usadas.filter((k) => !conhecidas.has(k))).toEqual([]);
  });

  it("um modelo por tipo", () => {
    expect(BASE_SUPPLIER_TEMPLATES.map((t) => t.kind).sort()).toEqual(["material", "servico"]);
  });
});
