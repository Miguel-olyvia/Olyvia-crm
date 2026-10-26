// 23505 de uq_anew_entities_org_email e uq_anew_entities_org_phone9: o email ou o telefone já existe nesta organização (mensagem clara, não o genérico).
import { describe, expect, it } from "vitest";
import { pessoasErrosTranslations } from "@/translations/pessoasErros";
import { CHAVE_EMAIL_DUPLICADO, CHAVE_ERRO_GENERICO, CHAVE_TELEFONE_DUPLICADO, chaveDoErro, codigoDoErro, duplicadoDoErro } from "./errosNeg";

const erro = (constraint: string, extra: Record<string, unknown> = {}) => ({
  code: "23505", message: `duplicate key value violates unique constraint "${constraint}"`, details: "Key (organization_id, x)=(a, b) already exists.", ...extra,
});

describe("duplicadoDoErro", () => {
  it("reconhece o email e o telefone repetidos pela constraint", () => {
    expect(duplicadoDoErro(erro("uq_anew_entities_org_email"))).toBe("email");
    expect(duplicadoDoErro(erro("uq_anew_entities_org_phone9"))).toBe("telefone");
  });

  it("lê a constraint também de details ou do campo constraint", () => {
    expect(duplicadoDoErro({ code: "23505", message: "x", details: 'violates "uq_anew_entities_org_email"' })).toBe("email");
    expect(duplicadoDoErro({ code: "23505", message: "x", constraint: "uq_anew_entities_org_phone9" })).toBe("telefone");
  });

  it("outro 23505, outro código ou lixo não contam", () => {
    expect(duplicadoDoErro(erro("outra_constraint"))).toBeNull();
    expect(duplicadoDoErro({ code: "NG009", message: "uq_anew_entities_org_email" })).toBeNull();
    expect(duplicadoDoErro(null)).toBeNull();
    expect(duplicadoDoErro("uq_anew_entities_org_email")).toBeNull();
  });
});

describe("chave e código do erro duplicado", () => {
  it("dá a chave própria e o código 23505 (esperado: não é avaria)", () => {
    expect(chaveDoErro(erro("uq_anew_entities_org_email"))).toBe(CHAVE_EMAIL_DUPLICADO);
    expect(chaveDoErro(erro("uq_anew_entities_org_phone9"))).toBe(CHAVE_TELEFONE_DUPLICADO);
    expect(codigoDoErro(erro("uq_anew_entities_org_email"))).toBe("23505");
  });

  it("um 23505 de outra constraint continua genérico e sem código", () => {
    expect(chaveDoErro(erro("outra"))).toBe(CHAVE_ERRO_GENERICO);
    expect(codigoDoErro(erro("outra"))).toBeNull();
  });

  it("as duas chaves têm texto em pt e en, a dizer que já existe nesta organização", () => {
    const { pt, en } = pessoasErrosTranslations;
    expect(pt[CHAVE_EMAIL_DUPLICADO]).toMatch(/email.*já existe.*organização/i);
    expect(pt[CHAVE_TELEFONE_DUPLICADO]).toMatch(/telefone.*já existe.*organização/i);
    expect(en[CHAVE_EMAIL_DUPLICADO]).toMatch(/email.*already exists/i);
    expect(en[CHAVE_TELEFONE_DUPLICADO]).toMatch(/phone.*already exists/i);
  });
});
