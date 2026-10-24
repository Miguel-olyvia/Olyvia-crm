import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import {
  DEFAULT_PHONE_COUNTRY_CODE,
  SUPPLIER_DATA_MESSAGES,
  isPortugal,
  joinCompanyNames,
  normalizeSupplierData,
  normalizeWebsite,
  toFormValues,
  toPayload,
  validateSupplierData,
  type SupplierDataFormValues,
} from "../supplierDataForm";

const base: SupplierDataFormValues = {
  name: "Fornecedor Exemplo, Lda",
  contact_person: "Ana Silva",
  email: "geral@fornecedor.pt",
  phone: "912 345 678",
  phone_country_code: "+351",
  address: "Rua das Flores, 12",
  postal_code: "1000-001",
  city: "Lisboa",
  country: "Portugal",
  website: "https://fornecedor.pt",
};

const errorsOf = (v: Partial<SupplierDataFormValues>) => {
  const r = validateSupplierData({ ...base, ...v }, base);
  return "errors" in r ? r.errors : {};
};

describe("toFormValues", () => {
  it("converte nulls em texto vazio e põe o indicativo por omissão", () => {
    const v = toFormValues({
      name: "  X  ",
      contact_person: null,
      email: null,
      phone: null,
      phone_country_code: null,
      tax_id: "500000000",
      address: null,
      city: null,
      postal_code: null,
      country: null,
      website: null,
    });
    expect(v.name).toBe("X");
    expect(v.email).toBe("");
    expect(v.phone_country_code).toBe(DEFAULT_PHONE_COUNTRY_CODE);
    expect(v).not.toHaveProperty("tax_id");
  });

  it("aguenta dados ausentes", () => {
    expect(toFormValues(null).name).toBe("");
  });
});

describe("isPortugal", () => {
  it.each(["", "  ", "Portugal", "portugal", "PT", "pt", "PRT"])("'%s' conta como Portugal", (c) => {
    expect(isPortugal(c)).toBe(true);
  });
  it.each(["Espanha", "ES", "France"])("'%s' não é Portugal", (c) => {
    expect(isPortugal(c)).toBe(false);
  });
});

describe("normalizeWebsite", () => {
  it("acrescenta https:// quando falta", () => {
    expect(normalizeWebsite("www.empresa.pt")).toBe("https://www.empresa.pt");
  });
  it("mantém http/https", () => {
    expect(normalizeWebsite("http://empresa.pt")).toBe("http://empresa.pt");
    expect(normalizeWebsite(" HTTPS://empresa.pt ")).toBe("HTTPS://empresa.pt");
  });
  it("vazio fica vazio", () => {
    expect(normalizeWebsite("   ")).toBe("");
  });
});

describe("normalizeSupplierData", () => {
  it("tira espaços, baixa o email e normaliza o código postal português", () => {
    const n = normalizeSupplierData({
      ...base,
      name: "  Fornecedor   Exemplo  ",
      email: " Geral@Fornecedor.PT ",
      postal_code: "1000 001",
      country: "",
    });
    expect(n.name).toBe("Fornecedor Exemplo");
    expect(n.email).toBe("geral@fornecedor.pt");
    expect(n.postal_code).toBe("1000-001");
  });

  it("não mexe no código postal estrangeiro", () => {
    expect(normalizeSupplierData({ ...base, country: "Espanha", postal_code: " 28001 " }).postal_code).toBe("28001");
  });
});

describe("validateSupplierData", () => {
  it("aceita uma ficha completa", () => {
    const r = validateSupplierData(base, base);
    expect(r.ok).toBe(true);
  });

  it("aceita só o nome (resto opcional)", () => {
    const r = validateSupplierData(
      {
        ...toFormValues(null),
        name: "Só Nome",
      },
      toFormValues(null),
    );
    expect(r.ok).toBe(true);
  });

  it("nome obrigatório", () => {
    expect(errorsOf({ name: "   " }).name).toBe(SUPPLIER_DATA_MESSAGES.nameRequired);
  });

  it("nome com mais de 200 caracteres", () => {
    expect(errorsOf({ name: "a".repeat(201) }).name).toBe(SUPPLIER_DATA_MESSAGES.tooLong(200));
  });

  it("email inválido", () => {
    expect(errorsOf({ email: "nao-e-email" }).email).toBe(SUPPLIER_DATA_MESSAGES.emailInvalid);
  });

  it("código postal português inválido (país vazio ou Portugal)", () => {
    expect(errorsOf({ postal_code: "1000", country: "" }).postal_code).toBe(SUPPLIER_DATA_MESSAGES.postalCodeInvalid);
    expect(errorsOf({ postal_code: "0000-000" }).postal_code).toBe(SUPPLIER_DATA_MESSAGES.postalCodeInvalid);
  });

  it("aceita código postal português com 7 dígitos seguidos", () => {
    const r = validateSupplierData({ ...base, postal_code: "1000001" }, base);
    expect(r.ok && r.values.postal_code).toBe("1000-001");
  });

  it("código postal estrangeiro não segue o formato português", () => {
    expect(errorsOf({ postal_code: "28001", country: "Espanha" }).postal_code).toBeUndefined();
  });

  it("website opcional, mas tem de ser um endereço", () => {
    expect(errorsOf({ website: "" }).website).toBeUndefined();
    expect(errorsOf({ website: "www.empresa.pt" }).website).toBeUndefined();
    expect(errorsOf({ website: "empresa" }).website).toBe(SUPPLIER_DATA_MESSAGES.websiteInvalid);
  });

  it("telefone com letras é rejeitado", () => {
    expect(errorsOf({ phone: "91a234" }).phone).toBe(SUPPLIER_DATA_MESSAGES.phoneInvalid);
  });

  it("devolve só o primeiro erro de cada campo", () => {
    const e = errorsOf({ name: "", email: "x" });
    expect(Object.keys(e).sort()).toEqual(["email", "name"]);
  });
});

describe("toPayload (só o que mudou)", () => {
  it("sem alterações → {}", () => {
    expect(toPayload(base, base)).toEqual({});
  });

  it("só o email alterado → { email }", () => {
    expect(toPayload({ ...base, email: "novo@fornecedor.pt" }, base)).toEqual({ email: "novo@fornecedor.pt" });
  });

  it("a normalização não gera alterações falsas", () => {
    const initial: SupplierDataFormValues = {
      ...base,
      email: "Geral@Fornecedor.PT",
      website: "fornecedor.pt",
      name: "  Fornecedor   Exemplo, Lda ",
      postal_code: "1000001",
      city: " Lisboa ",
    };
    const edited: SupplierDataFormValues = {
      ...base,
      email: " geral@fornecedor.pt ",
      website: "https://fornecedor.pt",
      name: "Fornecedor Exemplo, Lda",
      postal_code: "1000-001",
      city: "Lisboa",
    };
    expect(toPayload(edited, initial)).toEqual({});
  });

  it("indicativo por omissão não vai se a ficha não tinha telefone e não se mexeu", () => {
    const initial = toFormValues({
      name: "X",
      contact_person: null,
      email: null,
      phone: null,
      phone_country_code: null,
      tax_id: null,
      address: null,
      city: null,
      postal_code: null,
      country: null,
      website: null,
    });
    expect(toPayload({ ...initial }, initial)).toEqual({});
    expect(toPayload({ ...initial, phone_country_code: "" }, initial)).toEqual({});
  });

  it("telefone alterado leva também o indicativo", () => {
    const initial = { ...base, phone: "", phone_country_code: DEFAULT_PHONE_COUNTRY_CODE };
    expect(toPayload({ ...initial, phone: "912 000 000" }, initial)).toEqual({
      phone: "912 000 000",
      phone_country_code: DEFAULT_PHONE_COUNTRY_CODE,
    });
  });

  it("campo apagado → null", () => {
    expect(toPayload({ ...base, website: "  " }, base)).toEqual({ website: null });
    expect(toPayload({ ...base, contact_person: "" }, base)).toEqual({ contact_person: null });
  });

  it("nome só vai se mudou, e nunca o NIF", () => {
    expect(toPayload(base, base)).not.toHaveProperty("name");
    const p = toPayload({ ...base, name: "Outro Nome" }, base);
    expect(p).toEqual({ name: "Outro Nome" });
    expect(p).not.toHaveProperty("tax_id");
  });

  it("o payload validado leva os valores normalizados e só os alterados", () => {
    const r = validateSupplierData({ ...base, website: "empresa.pt", email: "A@B.PT" }, base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({ website: "https://empresa.pt", email: "a@b.pt" });
    }
  });
});

describe("joinCompanyNames", () => {
  it("junta com vírgulas sem vazios nem repetidos", () => {
    expect(joinCompanyNames(["A", " B ", "", "A"])).toBe("A, B");
  });
  it("uma só empresa", () => {
    expect(joinCompanyNames(["A"])).toBe("A");
  });
});
