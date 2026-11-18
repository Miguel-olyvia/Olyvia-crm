// As mensagens de validação do formulário de dados do fornecedor seguem o idioma do portal.
// Em português ficam IDÊNTICAS às de sempre (texto literal aqui, não derivado do dicionário).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { traduzir } from "@/portal-i18n/traduzir";
import {
  SUPPLIER_DATA_MESSAGES,
  supplierDataMessages,
  validateSupplierData,
  type SupplierDataFormValues,
} from "../supplierDataForm";

const base: SupplierDataFormValues = {
  name: "Supplier Ltd",
  contact_person: "Ana",
  email: "info@supplier.com",
  phone: "912 345 678",
  phone_country_code: "+351",
  address: "Rua das Flores, 12",
  postal_code: "1000-001",
  city: "Lisboa",
  country: "Portugal",
  website: "https://supplier.com",
};

const msgsEn = supplierDataMessages((k, p) => traduzir("en", k, p));
const errosEn = (v: Partial<SupplierDataFormValues>) => {
  const r = validateSupplierData({ ...base, ...v }, base, msgsEn);
  return "errors" in r ? r.errors : {};
};

describe("mensagens em português (por omissão): texto idêntico ao de hoje", () => {
  it("as seis mensagens", () => {
    expect(SUPPLIER_DATA_MESSAGES.nameRequired).toBe("O nome da empresa é obrigatório.");
    expect(SUPPLIER_DATA_MESSAGES.emailInvalid).toBe("Formato de email inválido.");
    expect(SUPPLIER_DATA_MESSAGES.phoneInvalid).toBe("O telefone só pode ter números, espaços e os sinais + ( ) - . /");
    expect(SUPPLIER_DATA_MESSAGES.postalCodeInvalid).toBe("Código postal inválido (formato 0000-000).");
    expect(SUPPLIER_DATA_MESSAGES.websiteInvalid).toBe("Endereço do website inválido (ex.: www.empresa.pt).");
    expect(SUPPLIER_DATA_MESSAGES.tooLong(200)).toBe("Máximo de 200 caracteres.");
  });

  it("validateSupplierData sem terceiro argumento devolve as mensagens em português", () => {
    const r = validateSupplierData({ ...base, name: "  " }, base);
    expect("errors" in r && r.errors.name).toBe("O nome da empresa é obrigatório.");
  });
});

describe("mensagens em inglês", () => {
  it("nenhuma das seis é igual à portuguesa e todas existem", () => {
    expect(msgsEn.nameRequired).toBe("The company name is required.");
    expect(msgsEn.emailInvalid).toBe("Invalid email format.");
    expect(msgsEn.phoneInvalid).toMatch(/phone number can only contain/i);
    expect(msgsEn.postalCodeInvalid).toMatch(/postal code/i);
    expect(msgsEn.websiteInvalid).toMatch(/website address/i);
    expect(msgsEn.tooLong(200)).toBe("Maximum 200 characters.");
  });

  it("a validação devolve as mensagens em inglês, campo a campo", () => {
    expect(errosEn({ name: "" }).name).toBe(msgsEn.nameRequired);
    expect(errosEn({ name: "a".repeat(201) }).name).toBe(msgsEn.tooLong(200));
    expect(errosEn({ email: "x" }).email).toBe(msgsEn.emailInvalid);
    expect(errosEn({ phone: "91a" }).phone).toBe(msgsEn.phoneInvalid);
    expect(errosEn({ postal_code: "1000", country: "" }).postal_code).toBe(msgsEn.postalCodeInvalid);
    expect(errosEn({ website: "empresa" }).website).toBe(msgsEn.websiteInvalid);
  });

  it("não deixa português nas mensagens inglesas", () => {
    const todas = [msgsEn.nameRequired, msgsEn.emailInvalid, msgsEn.phoneInvalid, msgsEn.postalCodeInvalid, msgsEn.websiteInvalid];
    for (const m of todas) expect(m).not.toMatch(/obrigat|inválid|Máximo|telefone|empresa/i);
  });
});
